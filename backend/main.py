import os
import json
import uuid
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import init_db, get_db
from game_manager import game_manager
from ws_manager import ws_manager, handle_websocket_message

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="Ultimate Jeopardy Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# REST MODELS
# -------------------------------------------------------------
class ClueModel(BaseModel):
    id: Optional[str] = None
    clue_markdown: str
    correct_answer: str
    topic_preview: Optional[str] = None
    base_points: int = 200
    row_idx: int = 0
    col_idx: int = 0
    is_bonus_mine: bool = False
    author_name: Optional[str] = None

class CategoryModel(BaseModel):
    id: Optional[str] = None
    name: str
    display_order: int = 0
    clues: List[ClueModel] = []

class RoundModel(BaseModel):
    id: Optional[str] = None
    round_number: int
    round_name: str
    board_type: str = "standard"  # 'standard', 'bonus_minefield', 'bingo_5x5', 'hot_potato'
    round_timer_seconds: int = 0
    shop_follows: bool = True
    categories: List[CategoryModel] = []

class TemplateModel(BaseModel):
    id: Optional[str] = None
    title: str
    status: str = "DRAFT"
    rounds: List[RoundModel] = []

class SessionCreateRequest(BaseModel):
    template_id: str = "default-ultimate-jeopardy"

class PlayerJoinRequest(BaseModel):
    display_name: str
    color_hex: Optional[str] = None

class TemplateDuplicateRequest(BaseModel):
    source_template_id: str
    new_title: str

# -------------------------------------------------------------
# REST ROUTES: HEALTH & SHOP
# -------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Ultimate Jeopardy Engine"}

@app.get("/api/shop/items")
async def get_shop_items():
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM shop_items ORDER BY cost_tokens ASC")
        items = [dict(r) for r in await cursor.fetchall()]
        return {"items": items}

# -------------------------------------------------------------
# REST ROUTES: GAME TEMPLATES (CMS / BUILDER)
# -------------------------------------------------------------
@app.get("/api/templates")
async def list_templates():
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM game_templates ORDER BY updated_at DESC")
        templates = [dict(r) for r in await cursor.fetchall()]
        return {"templates": templates}

@app.get("/api/templates/{template_id}")
async def get_template(template_id: str):
    async with get_db() as db:
        t_cur = await db.execute("SELECT * FROM game_templates WHERE id = ?", (template_id,))
        template = await t_cur.fetchone()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        template_dict = dict(template)

        # Get rounds
        r_cur = await db.execute("SELECT * FROM template_rounds WHERE template_id = ? ORDER BY round_number ASC", (template_id,))
        rounds = []
        for r_row in await r_cur.fetchall():
            round_dict = dict(r_row)
            # Get categories
            c_cur = await db.execute("SELECT * FROM categories WHERE round_id = ? ORDER BY display_order ASC", (round_dict["id"],))
            categories = []
            for c_row in await c_cur.fetchall():
                cat_dict = dict(c_row)
                clue_cur = await db.execute("SELECT * FROM clues WHERE category_id = ? ORDER BY row_idx ASC", (cat_dict["id"],))
                cat_dict["clues"] = [dict(clue) for clue in await clue_cur.fetchall()]
                categories.append(cat_dict)
            round_dict["categories"] = categories
            rounds.append(round_dict)

        template_dict["rounds"] = rounds
        return {"template": template_dict}

@app.post("/api/templates")
async def create_template(payload: TemplateModel):
    tid = payload.id or f"template-{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        await db.execute("""
        INSERT INTO game_templates (id, title, status)
        VALUES (?, ?, ?)
        """, (tid, payload.title, payload.status))
        await db.commit()
    return await save_full_template_data(tid, payload)

@app.put("/api/templates/{template_id}")
async def update_template(template_id: str, payload: TemplateModel):
    return await save_full_template_data(template_id, payload)

async def save_full_template_data(template_id: str, payload: TemplateModel):
    async with get_db() as db:
        await db.execute("""
        INSERT OR REPLACE INTO game_templates (id, title, status, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        """, (template_id, payload.title, payload.status))

        # Clear existing categories and clues for this template's rounds
        cur = await db.execute("SELECT id FROM template_rounds WHERE template_id = ?", (template_id,))
        old_rids = [r["id"] for r in await cur.fetchall()]
        for orid in old_rids:
            cat_cur = await db.execute("SELECT id FROM categories WHERE round_id = ?", (orid,))
            old_cids = [c["id"] for c in await cat_cur.fetchall()]
            for ocid in old_cids:
                await db.execute("DELETE FROM clues WHERE category_id = ?", (ocid,))
            await db.execute("DELETE FROM categories WHERE round_id = ?", (orid,))
        await db.execute("DELETE FROM template_rounds WHERE template_id = ?", (template_id,))

        for r_idx, rnd in enumerate(payload.rounds):
            rid = rnd.id if rnd.id and rnd.id.startswith(f"{template_id}-") else f"{template_id}-r{r_idx + 1}"
            await db.execute("""
            INSERT INTO template_rounds (id, template_id, round_number, round_name, board_type, round_timer_seconds, shop_follows)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (rid, template_id, rnd.round_number, rnd.round_name, rnd.board_type, rnd.round_timer_seconds, 1 if rnd.shop_follows else 0))

            for c_idx, cat in enumerate(rnd.categories):
                cid = cat.id if cat.id and cat.id.startswith(f"{rid}-") else f"{rid}-c{c_idx + 1}"
                await db.execute("""
                INSERT INTO categories (id, round_id, name, display_order)
                VALUES (?, ?, ?, ?)
                """, (cid, rid, cat.name, c_idx))

                for row_idx, clue in enumerate(cat.clues):
                    clue_id = clue.id if clue.id and clue.id.startswith(f"{cid}-") else f"{cid}-clue{row_idx + 1}"
                    await db.execute("""
                    INSERT INTO clues (id, category_id, clue_markdown, correct_answer, topic_preview, base_points, row_idx, col_idx, is_bonus_mine, author_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (clue_id, cid, clue.clue_markdown, clue.correct_answer, clue.topic_preview, clue.base_points, clue.row_idx, clue.col_idx, 1 if clue.is_bonus_mine else 0, clue.author_name))

        await db.commit()
    return {"success": True, "template_id": template_id}

@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: str):
    async with get_db() as db:
        await db.execute("DELETE FROM game_templates WHERE id = ?", (template_id,))
        await db.commit()
    return {"success": True}

@app.post("/api/templates/{template_id}/export")
async def export_template(template_id: str):
    res = await get_template(template_id)
    return res["template"]

@app.post("/api/templates/duplicate")
async def duplicate_template(payload: TemplateDuplicateRequest):
    src = await get_template(payload.source_template_id)
    template_data = src["template"]
    new_id = f"template-{uuid.uuid4().hex[:8]}"

    duplicated_rounds = []
    for r_idx, rnd in enumerate(template_data.get("rounds", [])):
        new_rid = f"{new_id}-r{r_idx + 1}"
        new_cats = []
        for c_idx, cat in enumerate(rnd.get("categories", [])):
            new_cid = f"{new_rid}-c{c_idx + 1}"
            new_clues = []
            for row_idx, clue in enumerate(cat.get("clues", [])):
                new_clue = dict(clue)
                new_clue["id"] = f"{new_cid}-clue{row_idx + 1}"
                new_clues.append(new_clue)
            new_cat = dict(cat)
            new_cat["id"] = new_cid
            new_cat["clues"] = new_clues
            new_cats.append(new_cat)
        new_rnd = dict(rnd)
        new_rnd["id"] = new_rid
        new_rnd["categories"] = new_cats
        duplicated_rounds.append(new_rnd)

    model = TemplateModel(
        id=new_id,
        title=payload.new_title,
        status="DRAFT",
        rounds=duplicated_rounds
    )
    await save_full_template_data(new_id, model)
    return {"success": True, "template_id": new_id, "title": payload.new_title}

@app.post("/api/templates/import")
async def import_template(data: Dict[str, Any]):
    new_id = f"import-{uuid.uuid4().hex[:8]}"
    title = data.get("title", "Imported Jeopardy Template")
    rounds_data = data.get("rounds", [])
    model = TemplateModel(id=new_id, title=title, status="DRAFT", rounds=rounds_data)
    await save_full_template_data(new_id, model)
    return {"success": True, "template_id": new_id}

# -------------------------------------------------------------
# REST ROUTES: SESSIONS
# -------------------------------------------------------------
@app.get("/api/sessions/active")
async def list_active_sessions():
    """Returns recent game sessions so host can view and resume games."""
    async with get_db() as db:
        cur = await db.execute("""
        SELECT gs.id, gs.template_id, gs.state, gs.current_round_idx, gs.created_at, gs.updated_at,
               gt.title as template_title,
               COUNT(sp.id) as player_count
        FROM game_sessions gs
        LEFT JOIN game_templates gt ON gt.id = gs.template_id
        LEFT JOIN session_players sp ON sp.session_id = gs.id
        GROUP BY gs.id
        ORDER BY gs.updated_at DESC
        LIMIT 10
        """)
        rows = [dict(r) for r in await cur.fetchall()]
        return {"sessions": rows}

@app.post("/api/sessions/{session_id}/save")
async def save_session_progress(session_id: str):
    """Saves the current session progress and state timestamp."""
    async with get_db() as db:
        await db.execute("""
        UPDATE game_sessions
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """, (session_id,))
        await db.commit()
    await game_manager.broadcast_state(session_id)
    return {"success": True, "session_id": session_id}

@app.post("/api/sessions")
async def create_session_endpoint(payload: SessionCreateRequest):
    session_id = await game_manager.create_session(payload.template_id)
    return {"session_id": session_id}

@app.get("/api/sessions/{session_id}")
async def get_session_endpoint(session_id: str):
    state = await game_manager.get_session_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return state

@app.post("/api/sessions/{session_id}/join")
async def join_session_endpoint(session_id: str, payload: PlayerJoinRequest):
    state = await game_manager.get_session_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await game_manager.join_player(session_id, payload.display_name, payload.color_hex)
    return result

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.post("/api/upload")
async def upload_media_endpoint(file: UploadFile = File(...)):
    """Uploads an image, audio, or video file and returns a markdown embed tag."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    base_name = os.path.splitext(file.filename)[0]
    safe_name = "".join(c for c in base_name if c.isalnum() or c in ('_', '-'))
    safe_name = safe_name[:40] if safe_name else "media"
    unique_filename = f"{uuid.uuid4().hex[:8]}_{safe_name}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, unique_filename)

    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    content_type = (file.content_type or "").lower()
    if content_type.startswith("image/") or ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"]:
        media_type = "image"
        markdown_tag = f"![{file.filename}](/uploads/{unique_filename})"
    elif content_type.startswith("audio/") or ext in [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"]:
        media_type = "audio"
        markdown_tag = f"[audio: /uploads/{unique_filename}]"
    elif content_type.startswith("video/") or ext in [".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]:
        media_type = "video"
        markdown_tag = f"[video: /uploads/{unique_filename}]"
    else:
        media_type = "file"
        markdown_tag = f"[{file.filename}](/uploads/{unique_filename})"

    return {
        "url": f"/uploads/{unique_filename}",
        "filename": unique_filename,
        "original_name": file.filename,
        "media_type": media_type,
        "markdown_tag": markdown_tag,
        "size_bytes": len(contents)
    }

# -------------------------------------------------------------
# WEBSOCKET ENDPOINT
# -------------------------------------------------------------
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    role: str = Query("player"),
    player_id: Optional[str] = Query(None)
):
    client = await ws_manager.connect(session_id, websocket, role, player_id)
    if player_id:
        async with get_db() as db:
            await db.execute("UPDATE session_players SET is_connected = 1 WHERE id = ?", (player_id,))
            await db.commit()
    try:
        # Send initial state immediately
        state = await game_manager.get_session_state(session_id)
        if state:
            await client.websocket.send_text(json.dumps({"type": "state:update", "data": state}))

        while True:
            raw = await websocket.receive_text()
            await handle_websocket_message(session_id, client, raw)
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, client)
        if player_id:
            async with get_db() as db:
                await db.execute("UPDATE session_players SET is_connected = 0 WHERE id = ?", (player_id,))
                await db.commit()
            await game_manager.broadcast_state(session_id)
    except Exception:
        ws_manager.disconnect(session_id, client)
        if player_id:
            async with get_db() as db:
                await db.execute("UPDATE session_players SET is_connected = 0 WHERE id = ?", (player_id,))
                await db.commit()
            await game_manager.broadcast_state(session_id)

STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public")

if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if os.path.exists(PUBLIC_DIR) and full_path:
            pub_path = os.path.join(PUBLIC_DIR, full_path)
            if os.path.isfile(pub_path):
                return FileResponse(pub_path)
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend not built yet. Run npm run build in frontend."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 9420))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
