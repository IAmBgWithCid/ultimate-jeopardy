import asyncio
import json
from typing import Dict, List, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect
from game_manager import game_manager

class ClientConnection:
    def __init__(self, websocket: WebSocket, role: str, player_id: Optional[str] = None):
        self.websocket = websocket
        self.role = role  # 'host', 'tv', 'player'
        self.player_id = player_id

class ConnectionManager:
    def __init__(self):
        # session_id -> list of ClientConnection
        self.active_connections: Dict[str, List[ClientConnection]] = {}

    def ensure_session(self, session_id: str):
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
            # Hook game_manager callbacks
            game_manager.register_callbacks(
                session_id=session_id,
                broadcast_cb=lambda event, data: self.broadcast(session_id, event, data),
                targeted_cb=lambda pid, event, data: self.send_to_player(session_id, pid, event, data)
            )

    async def connect(self, session_id: str, websocket: WebSocket, role: str, player_id: Optional[str] = None) -> ClientConnection:
        await websocket.accept()
        self.ensure_session(session_id)
        client = ClientConnection(websocket, role, player_id)
        self.active_connections[session_id].append(client)
        return client

    def disconnect(self, session_id: str, client: ClientConnection):
        if session_id in self.active_connections:
            if client in self.active_connections[session_id]:
                self.active_connections[session_id].remove(client)

    async def broadcast(self, session_id: str, event_type: str, data: Dict[str, Any]):
        if session_id not in self.active_connections:
            return
        payload = json.dumps({"type": event_type, "data": data})
        stale_clients = []
        for client in self.active_connections[session_id]:
            try:
                await client.websocket.send_text(payload)
            except Exception:
                stale_clients.append(client)

        for sc in stale_clients:
            self.disconnect(session_id, sc)

    async def send_to_player(self, session_id: str, player_id: str, event_type: str, data: Dict[str, Any]):
        if session_id not in self.active_connections:
            return
        payload = json.dumps({"type": event_type, "data": data})
        stale_clients = []
        for client in self.active_connections[session_id]:
            if client.player_id == player_id:
                try:
                    await client.websocket.send_text(payload)
                except Exception:
                    stale_clients.append(client)

        for sc in stale_clients:
            self.disconnect(session_id, sc)

ws_manager = ConnectionManager()

async def handle_websocket_message(session_id: str, client: ClientConnection, raw_message: str):
    try:
        msg = json.loads(raw_message)
    except Exception:
        return

    msg_type = msg.get("type")
    data = msg.get("data", {})

    if msg_type == "ping":
        await client.websocket.send_text(json.dumps({"type": "pong", "data": {"timestamp": data.get("timestamp")}}))
        return

    if msg_type == "host:start_game":
        await game_manager.start_game(session_id)

    elif msg_type == "tile:pick":
        clue_id = data.get("clue_id")
        if clue_id:
            await game_manager.pick_tile(session_id, clue_id, client.player_id)

    elif msg_type == "host:reveal_selected":
        await game_manager.reveal_selected_tile(session_id)

    elif msg_type == "host:set_picker":
        target_pid = data.get("player_id")
        await game_manager.set_picker(session_id, target_pid)

    elif msg_type == "clue:select":
        clue_id = data.get("clue_id")
        if clue_id:
            await game_manager.select_clue(session_id, clue_id)

    elif msg_type == "host:reveal_clue":
        await game_manager.reveal_clue(session_id)

    elif msg_type == "host:arm_buzzers":
        await game_manager.arm_buzzers(session_id)

    elif msg_type == "buzzer:buzz":
        delta_ms = data.get("reactionDeltaMs", 0)
        is_quickdraw = data.get("is_quickdraw", False)
        # Fetch display name from session players
        state = await game_manager.get_session_state(session_id)
        display_name = "Player"
        if state and client.player_id:
            for p in state["players"]:
                if p["id"] == client.player_id:
                    display_name = p["display_name"]
                    break

        if client.player_id:
            res = game_manager.handle_buzz(
                session_id=session_id,
                player_id=client.player_id,
                display_name=display_name,
                reaction_delta_ms=int(delta_ms),
                is_quickdraw=bool(is_quickdraw)
            )
            await client.websocket.send_text(json.dumps({"type": "buzzer:buzz_ack", "data": res}))

    elif msg_type == "host:judge":
        passed = bool(data.get("pass", False))
        player_id = data.get("player_id")
        await game_manager.judge_answer(session_id, passed, player_id=player_id)

    elif msg_type == "host:close_clue":
        await game_manager.close_clue(session_id)

    elif msg_type == "host:advance_round":
        round_idx = data.get("round_idx")
        await game_manager.advance_round(session_id, round_idx)

    elif msg_type == "host:override_score":
        pid = data.get("player_id")
        s_delta = int(data.get("score_delta", 0))
        t_delta = int(data.get("token_delta", 0))
        if pid:
            await game_manager.update_player_score_tokens(session_id, pid, s_delta, t_delta)

    elif msg_type == "host:select_buzzer":
        target_pid = data.get("player_id")
        if target_pid:
            await game_manager.select_buzzer_winner(session_id, target_pid)

    elif msg_type == "host:switch_board":
        is_bonus = bool(data.get("is_bonus_board", False))
        await game_manager.switch_board(session_id, is_bonus)

    elif msg_type == "host:media_control":
        action = data.get("action", "play")
        media_src = data.get("media_src", "")
        current_time = float(data.get("current_time", 0.0))
        await ws_manager.broadcast(session_id, "media:sync", {
            "action": action,
            "media_src": media_src,
            "current_time": current_time,
            "timestamp": data.get("timestamp")
        })
        if action == "play":
            await game_manager.log_activity(session_id, "MEDIA_PLAY", f"Host broadcast media playback ({action})")
