import pytest
import io
import json
import os
from httpx import AsyncClient, ASGITransport
from main import app, UPLOAD_DIR
from ws_manager import ws_manager, ClientConnection

class DummyWebSocket:
    def __init__(self):
        self.sent_messages = []

    async def accept(self):
        pass

    async def send_text(self, text: str):
        self.sent_messages.append(text)

@pytest.mark.asyncio
async def test_upload_image_audio_video():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test 1: Upload image
        img_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        res_img = await client.post(
            "/api/upload",
            files={"file": ("album_cover.png", io.BytesIO(img_content), "image/png")}
        )
        assert res_img.status_code == 200
        data_img = res_img.json()
        assert data_img["media_type"] == "image"
        assert data_img["markdown_tag"].startswith("![album_cover.png](/uploads/")
        assert os.path.exists(os.path.join(UPLOAD_DIR, data_img["filename"]))

        # Clean up
        os.remove(os.path.join(UPLOAD_DIR, data_img["filename"]))

        # Test 2: Upload audio
        audio_content = b"ID3\x03\x00\x00\x00\x00\x00\x00"
        res_audio = await client.post(
            "/api/upload",
            files={"file": ("theme_song.mp3", io.BytesIO(audio_content), "audio/mpeg")}
        )
        assert res_audio.status_code == 200
        data_audio = res_audio.json()
        assert data_audio["media_type"] == "audio"
        assert data_audio["markdown_tag"].startswith("[audio: /uploads/")
        assert os.path.exists(os.path.join(UPLOAD_DIR, data_audio["filename"]))

        # Clean up
        os.remove(os.path.join(UPLOAD_DIR, data_audio["filename"]))

        # Test 3: Upload video
        video_content = b"\x00\x00\x00\x18ftypmp42"
        res_video = await client.post(
            "/api/upload",
            files={"file": ("intro_clip.mp4", io.BytesIO(video_content), "video/mp4")}
        )
        assert res_video.status_code == 200
        data_video = res_video.json()
        assert data_video["media_type"] == "video"
        assert data_video["markdown_tag"].startswith("[video: /uploads/")
        assert os.path.exists(os.path.join(UPLOAD_DIR, data_video["filename"]))

        # Clean up
        os.remove(os.path.join(UPLOAD_DIR, data_video["filename"]))

@pytest.mark.asyncio
async def test_websocket_media_sync():
    from ws_manager import handle_websocket_message
    session_id = "TEST-MEDIA-ROOM"

    dummy_host_ws = DummyWebSocket()
    dummy_player_ws = DummyWebSocket()

    host_client = await ws_manager.connect(session_id, dummy_host_ws, role="host")
    player_client = await ws_manager.connect(session_id, dummy_player_ws, role="player", player_id="p-123")

    # Host sends media control event
    media_msg = json.dumps({
        "type": "host:media_control",
        "data": {
            "action": "play",
            "media_src": "/uploads/test_song.mp3",
            "current_time": 24.5,
            "timestamp": 123456789
        }
    })

    await handle_websocket_message(session_id, host_client, media_msg)

    # Check that player received media:sync
    sync_msgs = [
        json.loads(m) for m in dummy_player_ws.sent_messages
        if "media:sync" in m
    ]
    assert len(sync_msgs) >= 1
    sync_data = sync_msgs[0]["data"]
    assert sync_data["action"] == "play"
    assert sync_data["media_src"] == "/uploads/test_song.mp3"
    assert sync_data["current_time"] == 24.5

    # Host sends pause
    pause_msg = json.dumps({
        "type": "host:media_control",
        "data": {
            "action": "pause",
            "media_src": "/uploads/test_song.mp3",
            "current_time": 30.0
        }
    })
    await handle_websocket_message(session_id, host_client, pause_msg)

    pause_syncs = [
        json.loads(m) for m in dummy_player_ws.sent_messages
        if "media:sync" in m and json.loads(m)["data"]["action"] == "pause"
    ]
    assert len(pause_syncs) >= 1
    assert pause_syncs[0]["data"]["action"] == "pause"

    ws_manager.disconnect(session_id, host_client)
    ws_manager.disconnect(session_id, player_client)
