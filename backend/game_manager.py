import asyncio
import random
import time
import uuid
from typing import Dict, List, Optional, Any, Tuple
from database import get_db
from arbitration import BuzzerArbitrator, BuzzCandidate

class GameManager:
    def __init__(self):
        # session_id -> BuzzerArbitrator
        self.arbitrators: Dict[str, BuzzerArbitrator] = {}
        # session_id -> background tasks
        self.session_tasks: Dict[str, List[asyncio.Task]] = {}
        # broadcast callbacks: session_id -> callback(event_type, payload)
        self.broadcast_callbacks: Dict[str, Any] = {}
        # targeted callbacks: session_id -> callback(player_id, event_type, payload)
        self.targeted_callbacks: Dict[str, Any] = {}

    def _get_or_create_arbitrator(self, session_id: str) -> BuzzerArbitrator:
        if session_id not in self.arbitrators:
            self.arbitrators[session_id] = BuzzerArbitrator(
                on_arbitration_complete=lambda winner, candidates: self._on_buzz_winner_resolved(session_id, winner, candidates)
            )
        return self.arbitrators[session_id]

    def register_callbacks(self, session_id: str, broadcast_cb, targeted_cb):
        self.broadcast_callbacks[session_id] = broadcast_cb
        self.targeted_callbacks[session_id] = targeted_cb

    async def broadcast(self, session_id: str, event_type: str, data: Dict[str, Any]):
        cb = self.broadcast_callbacks.get(session_id)
        if cb:
            await cb(event_type, data)

    async def send_to_player(self, session_id: str, player_id: str, event_type: str, data: Dict[str, Any]):
        cb = self.targeted_callbacks.get(session_id)
        if cb:
            await cb(player_id, event_type, data)

    async def log_activity(self, session_id: str, event_type: str, message: str, details: Optional[str] = None):
        """Persists a formatted event to the session activity log."""
        log_id = str(uuid.uuid4())
        try:
            async with get_db() as db:
                await db.execute("""
                INSERT INTO session_activity_logs (id, session_id, event_type, message, details)
                VALUES (?, ?, ?, ?, ?)
                """, (log_id, session_id, event_type, message, details))
                await db.commit()
        except Exception as e:
            print(f"Log activity error: {e}")

    async def create_session(self, template_id: str = "default-ultimate-jeopardy") -> str:
        async with get_db() as db:
            while True:
                session_id = f"JEOP-{random.randint(1000, 9999)}"
                cur = await db.execute("SELECT 1 FROM game_sessions WHERE id = ?", (session_id,))
                if not await cur.fetchone():
                    break

            await db.execute("""
            INSERT INTO game_sessions (id, template_id, state, current_round_idx)
            VALUES (?, ?, 'LOBBY', 1)
            """, (session_id, template_id))
            await db.commit()

        # Initialize arbitrator
        self._get_or_create_arbitrator(session_id)
        return session_id

    async def close_clue(self, session_id: str) -> Dict[str, Any]:
        """Immediately ends the current clue and returns all participants back to the board."""
        was_bonus = False
        async with get_db() as db:
            s_cur = await db.execute("SELECT is_bonus_board, state FROM game_sessions WHERE id = ?", (session_id,))
            s_row = await s_cur.fetchone()
            if s_row:
                was_bonus = bool(s_row["is_bonus_board"]) or s_row["state"] == "BONUS_BOARD"

            await db.execute("""
            UPDATE game_sessions
            SET state = 'BOARD', is_bonus_board = 0, active_clue_id = NULL, selected_tile_id = NULL
            WHERE id = ?
            """, (session_id,))
            await db.commit()

        arbitrator = self._get_or_create_arbitrator(session_id)
        arbitrator.reset()

        if was_bonus:
            await self.log_activity(session_id, "BONUS_BOARD", "Bonus question closed. Returned to Main Board.")
        else:
            await self.log_activity(session_id, "CLUE", "Clue closed. Returned to Board.")

        await self.broadcast_state(session_id)
        return {"success": True, "state": "BOARD"}

    async def get_session_state(self, session_id: str) -> Optional[Dict[str, Any]]:
        async with get_db() as db:
            cursor = await db.execute("SELECT * FROM game_sessions WHERE id = ?", (session_id,))
            session_row = await cursor.fetchone()
            if not session_row:
                return None
            session = dict(session_row)

            # Get players
            p_cursor = await db.execute("""
            SELECT id, session_id, display_name, color_hex, secret_team_id, score, token_balance, is_connected, is_hot_potato_eligible
            FROM session_players WHERE session_id = ? ORDER BY score DESC
            """, (session_id,))
            players = [dict(r) for r in await p_cursor.fetchall()]

            # Get player inventories
            for p in players:
                inv_cursor = await db.execute("""
                SELECT item_key, is_consumed FROM session_inventory WHERE player_id = ? AND is_consumed = 0
                """, (p["id"],))
                p["inventory"] = [r["item_key"] for r in await inv_cursor.fetchall()]

            # Get round details
            r_cursor = await db.execute("""
            SELECT tr.* FROM template_rounds tr
            JOIN game_sessions gs ON gs.template_id = tr.template_id
            WHERE gs.id = ? AND tr.round_number = ?
            """, (session_id, session["current_round_idx"]))
            current_round = await r_cursor.fetchone()
            current_round_dict = dict(current_round) if current_round else None

            # Check if current state is on Bonus Board
            is_bonus_board = bool(session.get("is_bonus_board", 0)) or session["state"] == "BONUS_BOARD"

            # Fetch Bonus Board round details
            bonus_round_cursor = await db.execute("""
            SELECT tr.* FROM template_rounds tr
            JOIN game_sessions gs ON gs.template_id = tr.template_id
            WHERE gs.id = ? AND tr.board_type = 'bonus_board'
            LIMIT 1
            """, (session_id,))
            bonus_round = await bonus_round_cursor.fetchone()
            bonus_round_dict = dict(bonus_round) if bonus_round else None

            active_round = bonus_round_dict if (is_bonus_board and bonus_round_dict) else current_round_dict

            # Get categories & clues for active round (Bonus Board or Main Round)
            categories = []
            if active_round:
                c_cursor = await db.execute("""
                SELECT * FROM categories WHERE round_id = ? ORDER BY display_order ASC
                """, (active_round["id"],))
                for cat in await c_cursor.fetchall():
                    cat_dict = dict(cat)
                    clues_cursor = await db.execute("""
                    SELECT c.*, stc.claimed_by_player_id, sp.color_hex as claimed_color
                    FROM clues c
                    LEFT JOIN session_tiles_claimed stc ON stc.clue_id = c.id AND stc.session_id = ?
                    LEFT JOIN session_players sp ON sp.id = stc.claimed_by_player_id
                    WHERE c.category_id = ?
                    ORDER BY c.row_idx ASC
                    """, (session_id, cat["id"]))
                    raw_clues = [dict(c) for c in await clues_cursor.fetchall()]

                    # If Bonus Board, enforce randomized points between 400 and 600
                    if is_bonus_board or active_round.get("board_type") == "bonus_board":
                        for rc in raw_clues:
                            if rc.get("base_points", 0) < 400 or rc.get("base_points", 0) > 600:
                                rc["base_points"] = 400 + (abs(hash(rc["id"])) % 5) * 50

                    cat_dict["clues"] = raw_clues
                    categories.append(cat_dict)

            # Active clue details
            active_clue = None
            if session["active_clue_id"]:
                ac_cursor = await db.execute("""
                SELECT c.*, cat.name as category_name
                FROM clues c
                JOIN categories cat ON cat.id = c.category_id
                WHERE c.id = ?
                """, (session["active_clue_id"],))
                ac_row = await ac_cursor.fetchone()
                if ac_row:
                    active_clue = dict(ac_row)
                    if is_bonus_board and (active_clue.get("base_points", 0) < 400 or active_clue.get("base_points", 0) > 600):
                        active_clue["base_points"] = 400 + (abs(hash(active_clue["id"])) % 5) * 50

            # Active item casts for this clue
            active_casts = []
            if session["active_clue_id"]:
                casts_cursor = await db.execute("""
                SELECT ac.*, sp.display_name as caster_name, tp.display_name as target_name, si.name as item_name
                FROM session_active_casts ac
                JOIN session_players sp ON sp.id = ac.player_id
                LEFT JOIN session_players tp ON tp.id = ac.target_player_id
                JOIN shop_items si ON si.item_key = ac.item_key
                WHERE ac.session_id = ? AND ac.clue_id = ?
                """, (session_id, session["active_clue_id"]))
                active_casts = [dict(r) for r in await casts_cursor.fetchall()]

            # Completed bingo lines
            bingo_lines = []
            if current_round_dict and current_round_dict.get("board_type") == "bingo_5x5":
                bl_cursor = await db.execute("SELECT * FROM session_bingo_lines WHERE session_id = ?", (session_id,))
                bingo_lines = [dict(r) for r in await bl_cursor.fetchall()]

            # Fetch recent activity / item logs (for Host item feed)
            log_cur = await db.execute("""
            SELECT event_type, message, details, created_at
            FROM session_activity_logs
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT 30
            """, (session_id,))
            activity_log = [dict(r) for r in await log_cur.fetchall()]

            arbitrator = self.arbitrators.get(session_id)
            buzz_winner = arbitrator.winner.model_dump() if (arbitrator and arbitrator.winner) else None
            buzz_candidates = [c.model_dump() for c in arbitrator.candidates] if (arbitrator and arbitrator.candidates) else []
            # Order buzz queue by reaction_delta_ms ascending
            sorted_queue = sorted(arbitrator.candidates, key=lambda c: (c.reaction_delta_ms, c.received_at_monotonic)) if arbitrator else []

            return {
                "session_id": session_id,
                "state": session["state"],
                "current_round_idx": session["current_round_idx"],
                "current_round": active_round,
                "is_bonus_board": is_bonus_board,
                "categories": categories,
                "active_clue_id": session["active_clue_id"],
                "active_clue": active_clue,
                "active_casts": active_casts,
                "active_picker_id": session["active_picker_id"],
                "selected_tile_id": session["selected_tile_id"],
                "bingo_lines": bingo_lines,
                "players": players,
                "activity_log": activity_log,
                "hot_potato": None,
                "buzzer": {
                    "is_unlocked": arbitrator.is_unlocked if arbitrator else False,
                    "winner": buzz_winner,
                    "candidates": buzz_candidates,
                    "queue": [c.model_dump() for c in sorted_queue],
                    "locked_out_player_ids": list(arbitrator.locked_out_player_ids) if arbitrator else []
                }
            }

    async def join_player(self, session_id: str, display_name: str, color_hex: Optional[str] = None) -> Dict[str, Any]:
        player_colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"]
        clean_name = display_name.strip()
        async with get_db() as db:
            # Check if player with same display name already exists in this session
            existing_cur = await db.execute("""
            SELECT * FROM session_players
            WHERE session_id = ? AND LOWER(TRIM(display_name)) = LOWER(?)
            LIMIT 1
            """, (session_id, clean_name))
            existing = await existing_cur.fetchone()

            if existing:
                pid = existing["id"]
                chosen_color = color_hex or existing["color_hex"]
                await db.execute("""
                UPDATE session_players
                SET is_connected = 1, color_hex = ?
                WHERE id = ?
                """, (chosen_color, pid))
                await db.commit()
                await self.broadcast_state(session_id)
                return {
                    "player_id": pid,
                    "display_name": existing["display_name"],
                    "color_hex": chosen_color,
                    "secret_team_id": existing["secret_team_id"],
                    "reconnected": True
                }

            cursor = await db.execute("SELECT COUNT(*) as count FROM session_players WHERE session_id = ?", (session_id,))
            row = await cursor.fetchone()
            count = row["count"] if row else 0

            chosen_color = color_hex or player_colors[count % len(player_colors)]
            # Secret team pairing (pairs of 2)
            secret_team_id = (count // 2) + 1
            player_id = str(uuid.uuid4())

            await db.execute("""
            INSERT INTO session_players (id, session_id, display_name, color_hex, secret_team_id, score, token_balance, is_connected, is_hot_potato_eligible)
            VALUES (?, ?, ?, ?, ?, 0, 3, 1, 1)
            """, (player_id, session_id, clean_name, chosen_color, secret_team_id))
            await db.commit()

        await self.broadcast_state(session_id)
        return {"player_id": player_id, "display_name": clean_name, "color_hex": chosen_color, "secret_team_id": secret_team_id}

    async def broadcast_state(self, session_id: str):
        state = await self.get_session_state(session_id)
        if state:
            await self.broadcast(session_id, "state:update", state)

    # -------------------------------------------------------------
    # GAME STARTUP & RANDOM SECRET TEAMS
    # -------------------------------------------------------------
    async def start_game(self, session_id: str) -> Dict[str, Any]:
        """Randomly shuffles players into secret teams of 2 and starts Round 1 board."""
        async with get_db() as db:
            p_cursor = await db.execute("SELECT id FROM session_players WHERE session_id = ?", (session_id,))
            players = [r["id"] for r in await p_cursor.fetchall()]
            if not players:
                return {"success": False, "error": "No players in lobby"}

            # Randomize order
            shuffled = list(players)
            random.shuffle(shuffled)

            # Assign secret teams (pairs of 2)
            for idx, pid in enumerate(shuffled):
                secret_team_id = (idx // 2) + 1
                await db.execute("UPDATE session_players SET secret_team_id = ? WHERE id = ?", (secret_team_id, pid))

            first_picker_id = shuffled[0]

            await db.execute("""
            UPDATE game_sessions
            SET state = 'BOARD', current_round_idx = 1, active_picker_id = ?, selected_tile_id = NULL, active_clue_id = NULL
            WHERE id = ?
            """, (first_picker_id, session_id))
            await db.commit()

        await self.broadcast(session_id, "game:started", {
            "first_picker_id": first_picker_id
        })
        await self.broadcast_state(session_id)
        return {"success": True, "first_picker_id": first_picker_id}

    # -------------------------------------------------------------
    # TILE SELECTION & HOST REVEAL
    # -------------------------------------------------------------
    async def pick_tile(self, session_id: str, clue_id: str, picker_id: Optional[str] = None) -> Dict[str, Any]:
        """Called when a player (or host) clicks a tile on the board."""
        async with get_db() as db:
            s_cur = await db.execute("SELECT state, active_picker_id FROM game_sessions WHERE id = ?", (session_id,))
            session = await s_cur.fetchone()
            if not session or session["state"] not in ("BOARD", "BONUS_BOARD"):
                return {"success": False, "error": "Cannot pick tile outside BOARD phase"}

            # Validate tile exists and not claimed
            clue_cur = await db.execute("SELECT * FROM clues WHERE id = ?", (clue_id,))
            clue = await clue_cur.fetchone()
            if not clue:
                return {"success": False, "error": "Clue not found"}

            claim_cur = await db.execute("SELECT 1 FROM session_tiles_claimed WHERE session_id = ? AND clue_id = ?", (session_id, clue_id))
            if await claim_cur.fetchone():
                return {"success": False, "error": "Tile has already been claimed"}

            actual_picker = picker_id or session["active_picker_id"]
            picker_name = "Host"
            picker_color = "#EC4899"
            if actual_picker:
                p_cur = await db.execute("SELECT display_name, color_hex FROM session_players WHERE id = ?", (actual_picker,))
                p_row = await p_cur.fetchone()
                if p_row:
                    picker_name = p_row["display_name"]
                    picker_color = p_row["color_hex"]

            await db.execute("""
            UPDATE game_sessions
            SET selected_tile_id = ?, active_picker_id = ?
            WHERE id = ?
            """, (clue_id, actual_picker, session_id))
            await db.commit()

        await self.broadcast(session_id, "tile:selected", {
            "clue_id": clue_id,
            "picker_id": actual_picker,
            "picker_name": picker_name,
            "picker_color": picker_color,
            "base_points": clue["base_points"]
        })
        await self.broadcast_state(session_id)
        return {"success": True, "clue_id": clue_id, "picker_name": picker_name}

    async def reveal_selected_tile(self, session_id: str) -> Dict[str, Any]:
        """Triggered by Host to reveal the currently selected tile to everyone simultaneously."""
        async with get_db() as db:
            s_cur = await db.execute("SELECT selected_tile_id FROM game_sessions WHERE id = ?", (session_id,))
            session = await s_cur.fetchone()
            if not session or not session["selected_tile_id"]:
                return {"success": False, "error": "No tile currently selected"}

            clue_id = session["selected_tile_id"]
            await db.execute("UPDATE game_sessions SET selected_tile_id = NULL WHERE id = ?", (session_id,))
            await db.commit()

        await self.select_clue(session_id, clue_id)
        return {"success": True, "clue_id": clue_id}

    async def set_picker(self, session_id: str, player_id: Optional[str]) -> Dict[str, Any]:
        """Host manually assigns who gets board control to pick the next tile."""
        async with get_db() as db:
            await db.execute("""
            UPDATE game_sessions
            SET active_picker_id = ?, selected_tile_id = NULL
            WHERE id = ?
            """, (player_id, session_id))
            await db.commit()

            picker_name = "Host"
            picker_color = "#EC4899"
            if player_id:
                p_cur = await db.execute("SELECT display_name, color_hex FROM session_players WHERE id = ?", (player_id,))
                p_row = await p_cur.fetchone()
                if p_row:
                    picker_name = p_row["display_name"]
                    picker_color = p_row["color_hex"]

        await self.broadcast(session_id, "picker:assigned", {
            "player_id": player_id,
            "picker_name": picker_name,
            "picker_color": picker_color
        })
        await self.broadcast_state(session_id)
        return {"success": True, "player_id": player_id, "picker_name": picker_name}

    # -------------------------------------------------------------
    # CLUE SELECTION, REVEAL & BUZZER ARBITRATION
    # -------------------------------------------------------------
    async def select_clue(self, session_id: str, clue_id: str):
        async with get_db() as db:
            clue_cur = await db.execute("SELECT * FROM clues WHERE id = ?", (clue_id,))
            clue = await clue_cur.fetchone()
            if not clue:
                return

            is_bonus_mine = bool(clue["is_bonus_mine"])

            # If Bonus Mine / Event Tile:
            if is_bonus_mine:
                await db.execute("""
                UPDATE game_sessions
                SET state = 'BONUS_MINE_EXPLODE', active_clue_id = ?, selected_tile_id = NULL
                WHERE id = ?
                """, (clue_id, session_id))
                await db.commit()
                # Broadcast explosion event with cutscene
                await self.broadcast(session_id, "bonus:explode", {
                    "clue_id": clue_id,
                    "author_name": clue["author_name"],
                    "points": clue["base_points"]
                })
                # Automatically arm buzzers!
                await self.arm_buzzers(session_id)
                return

            # Standard Tile: Immediately transition to CLUE_REVEAL and arm buzzers
            await db.execute("""
            UPDATE game_sessions
            SET state = 'CLUE_REVEAL', active_clue_id = ?, selected_tile_id = NULL
            WHERE id = ?
            """, (clue_id, session_id))
            await db.commit()

        # Arm buzzers automatically when clue is revealed
        await self.arm_buzzers(session_id)

    async def reveal_clue(self, session_id: str):
        async with get_db() as db:
            await db.execute("""
            UPDATE game_sessions
            SET state = 'CLUE_REVEAL'
            WHERE id = ?
            """, (session_id,))
            await db.commit()

        await self.arm_buzzers(session_id)

    async def arm_buzzers(self, session_id: str):
        state = await self.get_session_state(session_id)
        if not state or not state["active_clue"]:
            return

        clue = state["active_clue"]
        is_bonus_mine = bool(clue.get("is_bonus_mine"))
        author_name = clue.get("author_name")

        # Determine locked out players (e.g. static jammer)
        locked_out_ids = set()
        for cast in state.get("active_casts", []):
            if cast["item_key"] == "static_jammer" and cast.get("target_player_id"):
                locked_out_ids.add(cast["target_player_id"])

        # Determine author player id if bonus mine or authored clue
        author_id = None
        if author_name:
            for p in state["players"]:
                if p["display_name"].strip().lower() == author_name.strip().lower():
                    author_id = p["id"]
                    break

        async with get_db() as db:
            await db.execute("""
            UPDATE game_sessions
            SET state = 'BUZZ_OPEN'
            WHERE id = ?
            """, (session_id,))
            await db.commit()

        arbitrator = self.arbitrators.get(session_id)
        if arbitrator:
            arbitrator.unlock(locked_out_ids=locked_out_ids, author_id=author_id, author_delay_seconds=1.5)

        # Broadcast BUZZER_UNLOCKED to all clients with synchronized server timestamp
        server_ts = time.time() * 1000
        await self.broadcast(session_id, "buzzer:unlock", {
            "server_timestamp": server_ts,
            "locked_out_ids": list(locked_out_ids),
            "author_id": author_id,
            "author_delay_seconds": 1.5 if author_id else 0.0
        })
        await self.broadcast_state(session_id)

    def handle_buzz(self, session_id: str, player_id: str, display_name: str, reaction_delta_ms: int, is_quickdraw: bool = False) -> Dict[str, Any]:
        arbitrator = self.arbitrators.get(session_id)
        if not arbitrator:
            return {"accepted": False, "reason": "No active session"}

        result = arbitrator.validate_and_register_buzz(
            player_id=player_id,
            display_name=display_name,
            reaction_delta_ms=reaction_delta_ms,
            is_quickdraw=is_quickdraw
        )
        return result

    async def _on_buzz_winner_resolved(self, session_id: str, winner: Optional[BuzzCandidate], candidates: List[BuzzCandidate]):
        if not winner:
            return

        async with get_db() as db:
            await db.execute("""
            UPDATE game_sessions
            SET state = 'BUZZ_LOCKED'
            WHERE id = ?
            """, (session_id,))
            await db.commit()

        await self.log_activity(session_id, "BUZZ", f"{winner.display_name} won buzzer race (+{winner.reaction_delta_ms}ms)")
        await self.broadcast(session_id, "buzzer:winner", {
            "winner_id": winner.player_id,
            "winner_name": winner.display_name,
            "reaction_delta_ms": winner.reaction_delta_ms,
            "candidates": [c.model_dump() for c in candidates]
        })
        await self.broadcast_state(session_id)

    # -------------------------------------------------------------
    # JUDGING & SCORING LOGIC
    # -------------------------------------------------------------
    async def judge_answer(self, session_id: str, passed: bool, player_id: Optional[str] = None) -> Dict[str, Any]:
        state = await self.get_session_state(session_id)
        if not state or not state["active_clue"]:
            return {"success": False, "error": "No active clue"}

        arbitrator = self._get_or_create_arbitrator(session_id)

        # If no player provided and no buzz winner resolved
        if not player_id and not arbitrator.winner:
            if not passed:
                return await self.close_clue(session_id)
            return {"success": False, "error": "No contestant specified to award points"}

        # Target player being judged
        target_pid = player_id or arbitrator.winner.player_id
        target_name = "Player"
        if arbitrator.winner and arbitrator.winner.player_id == target_pid:
            target_name = arbitrator.winner.display_name
        else:
            for p in state.get("players", []):
                if p["id"] == target_pid:
                    target_name = p["display_name"]
                    break

        clue = state["active_clue"]
        base_points = clue["base_points"]
        is_on_bonus_board = bool(state.get("is_bonus_board", False)) or state.get("state") == "BONUS_BOARD" or state.get("current_round", {}).get("board_type") == "bonus_board"
        is_event_tile = bool(clue.get("is_bonus_mine"))
        author_name = clue.get("author_name")
        is_author = bool(author_name and target_name.strip().lower() == author_name.strip().lower())

        points_delta = 0

        if passed:
            multiplier = 1.0
            if is_on_bonus_board or is_event_tile:
                multiplier = 0.5 if is_author else 1.5
            points_delta = int(base_points * multiplier)
        else:
            # Wrong answer: zero penalty on bonus board / event tile
            if is_on_bonus_board or is_event_tile:
                points_delta = 0
            else:
                points_delta = -int(base_points)

        # Apply score update
        async with get_db() as db:
            await db.execute("""
            UPDATE session_players
            SET score = score + ?
            WHERE id = ?
            """, (points_delta, target_pid))

            # If passed, claim the tile (persists permanently in session_tiles_claimed!)
            if passed:
                await db.execute("""
                INSERT OR REPLACE INTO session_tiles_claimed (session_id, clue_id, claimed_by_player_id)
                VALUES (?, ?, ?)
                """, (session_id, clue["id"], target_pid))

            await db.commit()

        # Check Round 3 5x5 Bingo Lines if passed
        bingo_lines_completed = 0
        if passed and state.get("current_round", {}).get("board_type") == "bingo_5x5":
            bingo_lines_completed = await self._check_bingo_lines(session_id, target_pid)

        # -------------------------------------------------------------
        # STATE TRANSITIONS & QUEUE HANDLING
        # -------------------------------------------------------------
        if passed:
            # Winner scored: determine next board state
            if is_on_bonus_board:
                # 1 question on Bonus Board is complete -> return to Main Board!
                next_state = "BOARD"
                next_bonus_flag = 0
                await self.log_activity(session_id, "BONUS_BOARD", f"{target_name} scored on Bonus Board (+{points_delta} pts)! Returning to Main Board.")
            elif is_event_tile:
                # Event tile answered -> switch into dedicated Bonus Board for 1 question!
                next_state = "BONUS_BOARD"
                next_bonus_flag = 1
                await self.log_activity(session_id, "BONUS_BOARD", f"Event Tile completed by {target_name}! Board switched to Bonus Vault.")
            else:
                next_state = "BOARD"
                next_bonus_flag = 0
                await self.log_activity(session_id, "JUDGE", f"{target_name} answered CORRECTLY (+{points_delta} pts)")

            async with get_db() as db:
                await db.execute("""
                UPDATE game_sessions
                SET state = ?, is_bonus_board = ?, active_clue_id = NULL, active_picker_id = ?, selected_tile_id = NULL
                WHERE id = ?
                """, (next_state, next_bonus_flag, target_pid, session_id))
                await db.commit()

            arbitrator.reset()

            await self.broadcast(session_id, "judge:result", {
                "passed": True,
                "player_id": target_pid,
                "player_name": target_name,
                "points_delta": points_delta,
                "bingo_lines": bingo_lines_completed
            })
            await self.broadcast_state(session_id)
            return {"success": True, "passed": True, "player_id": target_pid, "points_delta": points_delta}

        else:
            # Wrong answer: target player is locked out
            await self.log_activity(session_id, "JUDGE", f"{target_name} answered INCORRECTLY ({points_delta} pts)")
            arbitrator.remove_candidate(target_pid)

            # Check if there is a next candidate in the buzzer queue
            next_candidate = arbitrator.promote_next_candidate()
            if next_candidate:
                # Promote next candidate in queue to active answerer!
                # Buzzers remain unlocked for any remaining unbuzzed players to continue queuing!
                arbitrator.is_unlocked = True

                async with get_db() as db:
                    await db.execute("UPDATE game_sessions SET state = 'BUZZ_LOCKED' WHERE id = ?", (session_id,))
                    await db.commit()

                await self.log_activity(session_id, "BUZZ", f"Passed to next buzzer in queue: {next_candidate.display_name} (+{next_candidate.reaction_delta_ms}ms)")
                await self.broadcast(session_id, "buzzer:winner", {
                    "winner_id": next_candidate.player_id,
                    "winner_name": next_candidate.display_name,
                    "reaction_delta_ms": next_candidate.reaction_delta_ms,
                    "candidates": [c.model_dump() for c in arbitrator.candidates]
                })
                await self.broadcast(session_id, "judge:result", {
                    "passed": False,
                    "player_id": target_pid,
                    "player_name": target_name,
                    "points_delta": points_delta,
                    "bingo_lines": 0
                })
                await self.broadcast_state(session_id)
                return {"success": True, "passed": False, "player_id": target_pid, "promoted_next": True, "next_winner_id": next_candidate.player_id}
            else:
                # No other candidates currently in queue
                # Buzzers remain open for any remaining contestants who want to buzz in!
                arbitrator.winner = None
                arbitrator.is_unlocked = True

                async with get_db() as db:
                    await db.execute("UPDATE game_sessions SET state = 'BUZZ_OPEN' WHERE id = ?", (session_id,))
                    await db.commit()

                await self.broadcast(session_id, "judge:result", {
                    "passed": False,
                    "player_id": target_pid,
                    "player_name": target_name,
                    "points_delta": points_delta,
                    "bingo_lines": 0
                })
                await self.broadcast_state(session_id)
                return {"success": True, "passed": False, "player_id": target_pid, "queue_empty": True}

    # -------------------------------------------------------------
    # ROUND 3: 5x5 BINGO LINE DETECTOR ($1,000 BONUS)
    # -------------------------------------------------------------
    async def _check_bingo_lines(self, session_id: str, player_id: str) -> int:
        """
        Checks if player just completed any 5-in-a-row line (row, col, diagonal).
        All claimed tiles on the 5x5 board contribute towards forming lines.
        The contestant who answers the completing (5th) tile gets the $1,000 bonus.
        Broadcasts winning tile coordinates so animated glowing lines render.
        """
        async with get_db() as db:
            cursor = await db.execute("""
            SELECT c.row_idx, c.col_idx
            FROM session_tiles_claimed stc
            JOIN clues c ON c.id = stc.clue_id
            WHERE stc.session_id = ?
            """, (session_id,))
            claimed_tiles = {(r["row_idx"], r["col_idx"]) for r in await cursor.fetchall()}

            # Check lines already awarded in this session (by anyone)
            bl_cur = await db.execute("""
            SELECT line_key FROM session_bingo_lines
            WHERE session_id = ?
            """, (session_id,))
            existing_lines = {r["line_key"] for r in await bl_cur.fetchall()}

            p_cur = await db.execute("SELECT display_name FROM session_players WHERE id = ?", (player_id,))
            p_row = await p_cur.fetchone()
            player_name = p_row["display_name"] if p_row else "Contestant"

            new_lines = []

            # Check rows (0..4)
            for r in range(5):
                line_key = f"row_{r}"
                if line_key not in existing_lines and all((r, c) in claimed_tiles for c in range(5)):
                    coords = [{"row_idx": r, "col_idx": c} for c in range(5)]
                    new_lines.append((line_key, coords))

            # Check columns (0..4)
            for c in range(5):
                line_key = f"col_{c}"
                if line_key not in existing_lines and all((r, c) in claimed_tiles for r in range(5)):
                    coords = [{"row_idx": r, "col_idx": c} for c in range(5)]
                    new_lines.append((line_key, coords))

            # Check main diagonal
            diag_main_key = "diag_main"
            if diag_main_key not in existing_lines and all((i, i) in claimed_tiles for i in range(5)):
                coords = [{"row_idx": i, "col_idx": i} for i in range(5)]
                new_lines.append((diag_main_key, coords))

            # Check anti diagonal
            diag_anti_key = "diag_anti"
            if diag_anti_key not in existing_lines and all((i, 4 - i) in claimed_tiles for i in range(5)):
                coords = [{"row_idx": i, "col_idx": 4 - i} for i in range(5)]
                new_lines.append((diag_anti_key, coords))

            total_bonus = 0
            for line_key, coords in new_lines:
                await db.execute("""
                INSERT OR IGNORE INTO session_bingo_lines (session_id, player_id, line_key)
                VALUES (?, ?, ?)
                """, (session_id, player_id, line_key))
                total_bonus += 1000

                await self.broadcast(session_id, "bingo:bonus", {
                    "player_id": player_id,
                    "player_name": player_name,
                    "bonus": 1000,
                    "line_key": line_key,
                    "winning_tiles": coords
                })

            if total_bonus > 0:
                await db.execute("""
                UPDATE session_players
                SET score = score + ?
                WHERE id = ?
                """, (total_bonus, player_id))

            await db.commit()

        return len(new_lines)

    # -------------------------------------------------------------
    # ROUND 4: HOT POTATO GAUNTLET (90s MASTER TIMER + QUEUE)
    # -------------------------------------------------------------
    def _group_teams(self, players: List[Dict[str, Any]]) -> Dict[int, List[Dict[str, Any]]]:
        teams: Dict[int, List[Dict[str, Any]]] = {}
        for p in players:
            tid = p["secret_team_id"]
            if tid not in teams:
                teams[tid] = []
            teams[tid].append(p)
        return teams

    # -------------------------------------------------------------
    # SHOP INTERMISSION & PURCHASES
    # -------------------------------------------------------------
    async def set_state_shop(self, session_id: str):
        async with get_db() as db:
            await db.execute("UPDATE game_sessions SET state = 'SHOP' WHERE id = ?", (session_id,))
            await db.commit()
        await self.broadcast_state(session_id)

    async def buy_shop_item(self, session_id: str, player_id: str, item_key: str) -> Dict[str, Any]:
        async with get_db() as db:
            item_cur = await db.execute("SELECT * FROM shop_items WHERE item_key = ?", (item_key,))
            item = await item_cur.fetchone()
            if not item:
                return {"success": False, "error": "Invalid item"}

            cost = item["cost_tokens"]

            player_cur = await db.execute("SELECT token_balance, secret_team_id FROM session_players WHERE id = ?", (player_id,))
            player = await player_cur.fetchone()
            if not player or player["token_balance"] < cost:
                return {"success": False, "error": "Insufficient Bounty Tokens"}

            # Deduct tokens
            await db.execute("UPDATE session_players SET token_balance = token_balance - ? WHERE id = ?", (cost, player_id))

            # Handle Intel Items (Classified Dossier & Two-Way Radio)
            secret_partner_name = None
            if item_key in ("classified_dossier", "two_way_radio"):
                partner_cur = await db.execute("""
                SELECT id, display_name FROM session_players
                WHERE session_id = ? AND secret_team_id = ? AND id != ?
                LIMIT 1
                """, (session_id, player["secret_team_id"], player_id))
                partner = await partner_cur.fetchone()
                if partner:
                    secret_partner_name = partner["display_name"]
                    partner_id = partner["id"]

                    if item_key == "classified_dossier":
                        # Dossier Reveal Animation (Adjustment 2): private to purchaser
                        await self.send_to_player(session_id, player_id, "intel:dossier_reveal", {
                            "partner_name": secret_partner_name
                        })
                    elif item_key == "two_way_radio":
                        # Two-way radio: notify both players privately
                        await self.send_to_player(session_id, player_id, "intel:radio_reveal", {
                            "partner_name": secret_partner_name
                        })
                        player_name_cur = await db.execute("SELECT display_name FROM session_players WHERE id = ?", (player_id,))
                        pn = await player_name_cur.fetchone()
                        await self.send_to_player(session_id, partner_id, "intel:radio_reveal", {
                            "partner_name": pn["display_name"] if pn else "Partner"
                        })
            else:
                # Add to player inventory
                inv_id = str(uuid.uuid4())
                await db.execute("""
                INSERT INTO session_inventory (id, player_id, item_key, is_consumed)
                VALUES (?, ?, ?, 0)
                """, (inv_id, player_id, item_key))

            # Fetch player name for log
            pname_cur = await db.execute("SELECT display_name FROM session_players WHERE id = ?", (player_id,))
            pname_row = await pname_cur.fetchone()
            player_display_name = pname_row["display_name"] if pname_row else "Contestant"

            await db.commit()

        await self.log_activity(session_id, "ITEM_BUY", f"{player_display_name} purchased {item['name']}")
        await self.broadcast_state(session_id)
        return {"success": True, "item_key": item_key, "partner_revealed": secret_partner_name}

    async def close_shop(self, session_id: str) -> Dict[str, Any]:
        """Host action to close the intermission shop and return everyone to the board."""
        async with get_db() as db:
            await db.execute("UPDATE game_sessions SET state = 'BOARD' WHERE id = ?", (session_id,))
            await db.commit()
        await self.log_activity(session_id, "SHOP", "Shop intermission closed. Resumed Main Board.")
        await self.broadcast_state(session_id)
        return {"success": True, "state": "BOARD"}

    async def switch_board(self, session_id: str, is_bonus_board: bool) -> Dict[str, Any]:
        """Allows host to switch view between Main Board and the Bonus Board Vault."""
        new_state = "BONUS_BOARD" if is_bonus_board else "BOARD"
        async with get_db() as db:
            await db.execute("""
            UPDATE game_sessions
            SET state = ?, is_bonus_board = ?, active_clue_id = NULL, selected_tile_id = NULL
            WHERE id = ?
            """, (new_state, 1 if is_bonus_board else 0, session_id))
            await db.commit()
        label = "Bonus Vault" if is_bonus_board else "Main Board"
        await self.log_activity(session_id, "BONUS_BOARD", f"Host switched view to {label}.")
        await self.broadcast_state(session_id)
        return {"success": True, "is_bonus_board": is_bonus_board, "state": new_state}

    async def select_buzzer_winner(self, session_id: str, player_id: str) -> Dict[str, Any]:
        """Allows host to pick any player from buzzer queue (or roster) as the active contestant."""
        arbitrator = self._get_or_create_arbitrator(session_id)
        candidate = next((c for c in arbitrator.candidates if c.player_id == player_id), None)
        if not candidate:
            async with get_db() as db:
                p_cur = await db.execute("SELECT display_name FROM session_players WHERE id = ?", (player_id,))
                p_row = await p_cur.fetchone()
                name = p_row["display_name"] if p_row else "Contestant"
            candidate = BuzzCandidate(
                player_id=player_id,
                display_name=name,
                reaction_delta_ms=0,
                received_at_monotonic=time.monotonic()
            )
            arbitrator.candidates.append(candidate)

        arbitrator.winner = candidate
        arbitrator.is_unlocked = True

        async with get_db() as db:
            await db.execute("UPDATE game_sessions SET state = 'BUZZ_LOCKED' WHERE id = ?", (session_id,))
            await db.commit()

        await self.log_activity(session_id, "BUZZ", f"Host selected {candidate.display_name} to answer (+{candidate.reaction_delta_ms}ms)")
        await self.broadcast(session_id, "buzzer:winner", {
            "winner_id": candidate.player_id,
            "winner_name": candidate.display_name,
            "reaction_delta_ms": candidate.reaction_delta_ms,
            "candidates": [c.model_dump() for c in arbitrator.candidates]
        })
        await self.broadcast_state(session_id)
        return {"success": True, "winner_id": candidate.player_id, "winner_name": candidate.display_name}

    # -------------------------------------------------------------
    # ROUND ADVANCEMENT & HOST OVERRIDES
    # -------------------------------------------------------------
    async def advance_round(self, session_id: str, target_round_idx: Optional[int] = None):
        async with get_db() as db:
            s_cur = await db.execute("SELECT current_round_idx FROM game_sessions WHERE id = ?", (session_id,))
            s_row = await s_cur.fetchone()
            current = s_row["current_round_idx"] if s_row else 1
            next_idx = target_round_idx if target_round_idx is not None else current + 1

            await db.execute("""
            UPDATE game_sessions
            SET current_round_idx = ?, state = 'BOARD', active_clue_id = NULL
            WHERE id = ?
            """, (next_idx, session_id))
            await db.commit()

        await self.broadcast_state(session_id)

    async def update_player_score_tokens(self, session_id: str, player_id: str, score_delta: int, token_delta: int):
        async with get_db() as db:
            await db.execute("""
            UPDATE session_players
            SET score = score + ?, token_balance = token_balance + ?
            WHERE id = ?
            """, (score_delta, token_delta, player_id))
            await db.commit()
        await self.broadcast_state(session_id)

game_manager = GameManager()
