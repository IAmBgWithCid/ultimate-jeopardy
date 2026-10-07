import os
import asyncio
import pytest

# Ensure clean test DB
os.environ["DATABASE_PATH"] = "./data/test_jeopardy.db"

from database import init_db, get_db
from game_manager import game_manager

@pytest.mark.asyncio
async def test_session_lifecycle_and_teams():
    await init_db()
    session_id = await game_manager.create_session()
    assert session_id.startswith("JEOP-")

    # Join 4 players -> should form 2 secret teams of 2
    p1 = await game_manager.join_player(session_id, "Alice")
    p2 = await game_manager.join_player(session_id, "Bob")
    p3 = await game_manager.join_player(session_id, "Charlie")
    p4 = await game_manager.join_player(session_id, "Diana")

    assert p1["secret_team_id"] == 1
    assert p2["secret_team_id"] == 1
    assert p3["secret_team_id"] == 2
    assert p4["secret_team_id"] == 2

    state = await game_manager.get_session_state(session_id)
    assert len(state["players"]) == 4
    assert state["state"] == "LOBBY"

@pytest.mark.asyncio
async def test_bingo_line_detector():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "BingoPlayer")
    pid = p1["player_id"]

    async with get_db() as db:
        # Insert a mock round and category first to satisfy foreign keys
        await db.execute("INSERT OR REPLACE INTO template_rounds (id, template_id, round_number, round_name, board_type) VALUES ('mock-r3', 'default-ultimate-jeopardy', 3, 'Bingo', 'bingo_5x5')")
        await db.execute("INSERT OR REPLACE INTO categories (id, round_id, name, display_order) VALUES ('mock-cat', 'mock-r3', 'Mock Bingo', 0)")
        for c in range(5):
            clue_id = f"mock-bingo-r0-c{c}"
            await db.execute("""
            INSERT OR REPLACE INTO clues (id, category_id, clue_markdown, correct_answer, base_points, row_idx, col_idx)
            VALUES (?, 'mock-cat', 'Q', 'A', 300, 0, ?)
            """, (clue_id, c))
            await db.execute("""
            INSERT OR REPLACE INTO session_tiles_claimed (session_id, clue_id, claimed_by_player_id)
            VALUES (?, ?, ?)
            """, (session_id, clue_id, pid))
        await db.commit()

    lines = await game_manager._check_bingo_lines(session_id, pid)
    assert lines == 1

    # Verify $1000 score bonus was added
    state = await game_manager.get_session_state(session_id)
    player = next(p for p in state["players"] if p["id"] == pid)
    assert player["score"] >= 1000

@pytest.mark.asyncio
async def test_bingo_communal_line_completion():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "P1")
    p2 = await game_manager.join_player(session_id, "P2")
    pid1 = p1["player_id"]
    pid2 = p2["player_id"]

    async with get_db() as db:
        await db.execute("INSERT OR REPLACE INTO template_rounds (id, template_id, round_number, round_name, board_type) VALUES ('mock-r3-comm', 'default-ultimate-jeopardy', 3, 'Bingo', 'bingo_5x5')")
        await db.execute("INSERT OR REPLACE INTO categories (id, round_id, name, display_order) VALUES ('mock-cat-comm', 'mock-r3-comm', 'Mock Bingo Comm', 0)")
        # Tiles 0..3 claimed by P1
        for c in range(4):
            clue_id = f"mock-bingo-comm-r0-c{c}"
            await db.execute("""
            INSERT OR REPLACE INTO clues (id, category_id, clue_markdown, correct_answer, base_points, row_idx, col_idx)
            VALUES (?, 'mock-cat-comm', 'Q', 'A', 300, 0, ?)
            """, (clue_id, c))
            await db.execute("""
            INSERT OR REPLACE INTO session_tiles_claimed (session_id, clue_id, claimed_by_player_id)
            VALUES (?, ?, ?)
            """, (session_id, clue_id, pid1))

        # 5th tile (col 4) claimed by P2
        clue_5 = "mock-bingo-comm-r0-c4"
        await db.execute("""
        INSERT OR REPLACE INTO clues (id, category_id, clue_markdown, correct_answer, base_points, row_idx, col_idx)
        VALUES (?, 'mock-cat-comm', 'Q', 'A', 300, 0, 4)
        """, (clue_5,))
        await db.execute("""
        INSERT OR REPLACE INTO session_tiles_claimed (session_id, clue_id, claimed_by_player_id)
        VALUES (?, ?, ?)
        """, (session_id, clue_5, pid2))
        await db.commit()

    # P2 completed the 5th tile -> P2 gets the line completed bonus!
    lines = await game_manager._check_bingo_lines(session_id, pid2)
    assert lines == 1

    p2_state = await game_manager.get_session_state(session_id)
    p2_data = next(p for p in p2_state["players"] if p["id"] == pid2)
    assert p2_data["score"] >= 1000

@pytest.mark.asyncio
async def test_turn_based_selection_and_reveal():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "Picker1")
    p2 = await game_manager.join_player(session_id, "Picker2")

    # Start game
    res = await game_manager.start_game(session_id)
    assert res["success"] is True
    state = await game_manager.get_session_state(session_id)
    assert state["state"] == "BOARD"
    assert state["active_picker_id"] in [p1["player_id"], p2["player_id"]]

    # Pick a tile from default template
    clue_id = state["categories"][0]["clues"][0]["id"]
    pick_res = await game_manager.pick_tile(session_id, clue_id, p1["player_id"])
    assert pick_res["success"] is True

    state_picked = await game_manager.get_session_state(session_id)
    assert state_picked["selected_tile_id"] == clue_id

    # Reveal selected tile
    rev_res = await game_manager.reveal_selected_tile(session_id)
    assert rev_res["success"] is True

    state_rev = await game_manager.get_session_state(session_id)
    assert state_rev["state"] in ("BUZZ_OPEN", "BONUS_MINE_EXPLODE")
    assert state_rev["active_clue_id"] == clue_id
    assert state_rev["selected_tile_id"] is None
    assert state_rev["buzzer"]["is_unlocked"] is True

@pytest.mark.asyncio
async def test_bingo_deduplication():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "BingoPlayer2")
    pid = p1["player_id"]

    async with get_db() as db:
        await db.execute("INSERT OR REPLACE INTO template_rounds (id, template_id, round_number, round_name, board_type) VALUES ('mock-r3b', 'default-ultimate-jeopardy', 3, 'Bingo', 'bingo_5x5')")
        await db.execute("INSERT OR REPLACE INTO categories (id, round_id, name, display_order) VALUES ('mock-catb', 'mock-r3b', 'Mock Bingo B', 0)")
        for c in range(5):
            clue_id = f"mock-bingo-r1-c{c}"
            await db.execute("""
            INSERT OR REPLACE INTO clues (id, category_id, clue_markdown, correct_answer, base_points, row_idx, col_idx)
            VALUES (?, 'mock-catb', 'Q', 'A', 300, 1, ?)
            """, (clue_id, c))
            await db.execute("""
            INSERT OR REPLACE INTO session_tiles_claimed (session_id, clue_id, claimed_by_player_id)
            VALUES (?, ?, ?)
            """, (session_id, clue_id, pid))
        await db.commit()

    # First check: completes 1 new line
    lines1 = await game_manager._check_bingo_lines(session_id, pid)
    assert lines1 == 1

    # Second check with same tiles: should return 0 new lines (no duplicate bonus!)
    lines2 = await game_manager._check_bingo_lines(session_id, pid)
    assert lines2 == 0

@pytest.mark.asyncio
async def test_judge_answer_and_return_to_board():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "Alice")
    pid = p1["player_id"]
    await game_manager.start_game(session_id)

    # Pick a tile
    state = await game_manager.get_session_state(session_id)
    first_clue_id = state["categories"][0]["clues"][0]["id"]
    await game_manager.pick_tile(session_id, first_clue_id, pid)
    await game_manager.reveal_selected_tile(session_id)

    revealed_state = await game_manager.get_session_state(session_id)
    assert revealed_state["state"] in ("BUZZ_OPEN", "BONUS_MINE_EXPLODE")
    assert revealed_state["active_clue_id"] == first_clue_id

    # Award points directly to Alice
    res = await game_manager.judge_answer(session_id, passed=True, player_id=pid)
    assert res["success"] is True

    # Check state transitioned back to BOARD and Alice is now the active picker
    final_state = await game_manager.get_session_state(session_id)
    assert final_state["state"] == "BOARD"
    assert final_state["active_clue_id"] is None
    assert final_state["active_picker_id"] == pid
    assert final_state["selected_tile_id"] is None
    assert final_state["buzzer"]["winner"] is None

@pytest.mark.asyncio
async def test_reconnect_player_no_duplicates():
    await init_db()
    session_id = await game_manager.create_session()
    # First join
    p1 = await game_manager.join_player(session_id, "Charlie", "#3B82F6")
    pid1 = p1["player_id"]

    # Second join with same name (e.g. Charlie left and rejoined)
    p2 = await game_manager.join_player(session_id, "charlie", "#EF4444")
    pid2 = p2["player_id"]

    # Must be the exact same player ID
    assert pid1 == pid2
    assert p2.get("reconnected") is True

    # Must only be 1 player in the session
    state = await game_manager.get_session_state(session_id)
    charlie_players = [p for p in state["players"] if p["display_name"].lower() == "charlie"]
    assert len(charlie_players) == 1

@pytest.mark.asyncio
async def test_duplicate_template_and_active_sessions():
    await init_db()
    from main import duplicate_template, list_active_sessions, save_session_progress, TemplateDuplicateRequest

    # Test duplicating default template
    dup_req = TemplateDuplicateRequest(
        source_template_id="default-ultimate-jeopardy",
        new_title="Duplicate Custom Board"
    )
    dup_res = await duplicate_template(dup_req)
    assert dup_res["success"] is True
    assert dup_res["title"] == "Duplicate Custom Board"
    assert dup_res["template_id"].startswith("template-")

    # Test creating a session and saving progress
    session_id = await game_manager.create_session(dup_res["template_id"])
    await game_manager.join_player(session_id, "Tester1", "#EC4899")
    save_res = await save_session_progress(session_id)
    assert save_res["success"] is True

    # Test active sessions listing contains our session
    active_res = await list_active_sessions()
    sessions = active_res["sessions"]
    matching = [s for s in sessions if s["id"] == session_id]
    assert len(matching) == 1
    assert matching[0]["template_title"] == "Duplicate Custom Board"
    assert matching[0]["player_count"] == 1

@pytest.mark.asyncio
async def test_bonus_board_flow_and_multipliers():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "Alex")  # Author of bonus clues
    p2 = await game_manager.join_player(session_id, "Elena")
    await game_manager.start_game(session_id)

    # Pick an event tile on Round 1
    state = await game_manager.get_session_state(session_id)
    # Find an event tile (mine) in round 1
    event_clue = None
    for cat in state["categories"]:
        for c in cat["clues"]:
            if c.get("is_bonus_mine"):
                event_clue = c
                break
        if event_clue:
            break

    assert event_clue is not None

    # Pick & select event tile
    await game_manager.pick_tile(session_id, event_clue["id"], p1["player_id"])
    await game_manager.reveal_selected_tile(session_id)
    await game_manager.arm_buzzers(session_id)

    # Player 1 answers correctly -> should transition to BONUS_BOARD!
    judge_res = await game_manager.judge_answer(session_id, passed=True, player_id=p1["player_id"])
    assert judge_res["success"] is True

    bb_state = await game_manager.get_session_state(session_id)
    assert bb_state["state"] == "BONUS_BOARD"
    assert bb_state["is_bonus_board"] is True
    assert bb_state["active_picker_id"] == p1["player_id"]
    # Categories should now be Bonus Board categories (round_type = bonus_board)
    assert len(bb_state["categories"]) == 4

    # Pick a clue from Bonus Board
    bonus_clue = bb_state["categories"][0]["clues"][0]
    assert 400 <= bonus_clue["base_points"] <= 600

    await game_manager.pick_tile(session_id, bonus_clue["id"], p1["player_id"])
    await game_manager.reveal_selected_tile(session_id)
    await game_manager.arm_buzzers(session_id)

    # Test WRONG answer on bonus board -> ZERO deduction penalty!
    score_before = next(p["score"] for p in (await game_manager.get_session_state(session_id))["players"] if p["id"] == p2["player_id"])
    wrong_res = await game_manager.judge_answer(session_id, passed=False, player_id=p2["player_id"])
    score_after = next(p["score"] for p in (await game_manager.get_session_state(session_id))["players"] if p["id"] == p2["player_id"])
    assert score_before == score_after  # $0 deduction!

    # Test CORRECT answer by opponent (Elena) on Alex's authored bonus clue -> 1.5x steal multiplier!
    correct_res = await game_manager.judge_answer(session_id, passed=True, player_id=p2["player_id"])
    assert correct_res["points_delta"] == int(bonus_clue["base_points"] * 1.5)

    # After 1 bonus question, state returns to BOARD on main board!
    returned_state = await game_manager.get_session_state(session_id)
    assert returned_state["state"] == "BOARD"
    assert returned_state["is_bonus_board"] is False

    # Bonus tile remains claimed in DB (half-used persistence!)
    async with get_db() as db:
        cur = await db.execute("SELECT 1 FROM session_tiles_claimed WHERE session_id = ? AND clue_id = ?", (session_id, bonus_clue["id"]))
        assert await cur.fetchone() is not None

@pytest.mark.asyncio
async def test_buzzer_queue_and_shop_resumption():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "FastPlayer")
    p2 = await game_manager.join_player(session_id, "SecondPlayer")
    await game_manager.start_game(session_id)

    # Test shop intermission & close_shop
    await game_manager.set_state_shop(session_id)
    shop_state = await game_manager.get_session_state(session_id)
    assert shop_state["state"] == "SHOP"

    await game_manager.close_shop(session_id)
    resumed_state = await game_manager.get_session_state(session_id)
    assert resumed_state["state"] == "BOARD"

    # Test host selecting specific buzzer winner from queue
    select_res = await game_manager.select_buzzer_winner(session_id, p2["player_id"])
    assert select_res["success"] is True
    assert select_res["winner_id"] == p2["player_id"]

    # Test activity logging
    state = await game_manager.get_session_state(session_id)
    assert len(state["activity_log"]) > 0
    event_types = [entry["event_type"] for entry in state["activity_log"]]
    assert "BUZZ" in event_types

@pytest.mark.asyncio
async def test_buzzer_queue_promotion_on_wrong_answer():
    await init_db()
    session_id = await game_manager.create_session()
    p1 = await game_manager.join_player(session_id, "Buzzer1")
    p2 = await game_manager.join_player(session_id, "Buzzer2")
    pid1 = p1["player_id"]
    pid2 = p2["player_id"]

    await game_manager.start_game(session_id)
    state = await game_manager.get_session_state(session_id)
    clue_id = state["categories"][0]["clues"][0]["id"]
    await game_manager.pick_tile(session_id, clue_id, pid1)
    await game_manager.reveal_selected_tile(session_id)

    # Buzzers should automatically be unlocked!
    rev_state = await game_manager.get_session_state(session_id)
    assert rev_state["buzzer"]["is_unlocked"] is True

    # P1 buzzes with 120ms reaction
    r1 = game_manager.handle_buzz(session_id, pid1, "Buzzer1", 120)
    assert r1["accepted"] is True

    # Resolve arbitration window
    arbitrator = game_manager.arbitrators[session_id]
    await asyncio.sleep(0.3)
    assert arbitrator.winner is not None
    assert arbitrator.winner.player_id == pid1
    # Buzzers must remain unlocked for other players to queue!
    assert arbitrator.is_unlocked is True

    # P2 buzzes after P1 is winner -> P2 is queued!
    r2 = game_manager.handle_buzz(session_id, pid2, "Buzzer2", 250)
    assert r2["accepted"] is True
    assert r2.get("queued") is True
    assert r2.get("position") == 2

    # Judge P1 wrong -> P2 must be automatically promoted to winner!
    wrong_res = await game_manager.judge_answer(session_id, passed=False, player_id=pid1)
    assert wrong_res["success"] is True
    assert wrong_res["promoted_next"] is True
    assert wrong_res["next_winner_id"] == pid2

    # Verify arbitrator state: P2 is now winner, P1 is locked out
    assert arbitrator.winner.player_id == pid2
    assert pid1 in arbitrator.locked_out_player_ids
    # Buzzers still unlocked for any 3rd contestant
    assert arbitrator.is_unlocked is True

    # Judge P2 correct -> game awards points and returns to BOARD
    right_res = await game_manager.judge_answer(session_id, passed=True, player_id=pid2)
    assert right_res["success"] is True
    final_state = await game_manager.get_session_state(session_id)
    assert final_state["state"] == "BOARD"




