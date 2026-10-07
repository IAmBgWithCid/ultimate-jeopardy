import asyncio
import pytest
from arbitration import BuzzerArbitrator

@pytest.mark.asyncio
async def test_anti_macro_filter():
    """Validates that reactionDeltaMs < 80ms is rejected."""
    arbitrator = BuzzerArbitrator()
    arbitrator.unlock()

    # Attempt with 50ms (inhuman / bot macro)
    res = arbitrator.validate_and_register_buzz("p1", "BotPlayer", 50)
    assert res["accepted"] is False
    assert "Inhuman" in res["reason"]
    assert len(arbitrator.candidates) == 0

    # Attempt with 120ms (valid human reaction)
    res2 = arbitrator.validate_and_register_buzz("p2", "HumanPlayer", 120)
    assert res2["accepted"] is True
    assert len(arbitrator.candidates) == 1

@pytest.mark.asyncio
async def test_arbitration_window_lowest_delta_wins():
    """
    Simulates remote network conditions:
    Player B (low ping) packet arrives first with reaction delta 280ms.
    Player A (higher ping) packet arrives shortly after with reaction delta 190ms.
    Arbitrator must award buzz to Player A (faster human reaction: 190ms < 280ms).
    """
    resolved_winner = None
    resolved_candidates = []

    async def on_complete(winner, candidates):
        nonlocal resolved_winner, resolved_candidates
        resolved_winner = winner
        resolved_candidates = candidates

    arbitrator = BuzzerArbitrator(on_arbitration_complete=on_complete)
    arbitrator.unlock()

    # Player B arrives first at T+0ms with 280ms reaction time
    res_b = arbitrator.validate_and_register_buzz("player_b", "Player B", 280)
    assert res_b["accepted"] is True

    # Sleep 30ms (simulating latency difference)
    await asyncio.sleep(0.030)

    # Player A arrives second with 190ms reaction time
    res_a = arbitrator.validate_and_register_buzz("player_a", "Player A", 190)
    assert res_a["accepted"] is True

    # Wait for the 250ms arbitration window to complete
    await asyncio.sleep(0.300)

    assert resolved_winner is not None
    assert resolved_winner.player_id == "player_a"
    assert resolved_winner.reaction_delta_ms == 190

@pytest.mark.asyncio
async def test_static_jammer_lockout():
    """Player locked out by Static Jammer cannot buzz."""
    arbitrator = BuzzerArbitrator()
    arbitrator.unlock(locked_out_ids={"player_jammed"})

    res = arbitrator.validate_and_register_buzz("player_jammed", "Jammed Player", 200)
    assert res["accepted"] is False
    assert "locked out" in res["reason"]

@pytest.mark.asyncio
async def test_author_lockout_delay():
    """Author of bonus mine is locked out for 3.5s."""
    arbitrator = BuzzerArbitrator()
    arbitrator.unlock(author_id="author_p", author_delay_seconds=0.2)  # 200ms for fast test

    # Buzz immediately
    res = arbitrator.validate_and_register_buzz("author_p", "Author Player", 150)
    assert res["accepted"] is False
    assert "Author lockout active" in res["reason"]

    # Wait for delay to expire
    await asyncio.sleep(0.25)
    res2 = arbitrator.validate_and_register_buzz("author_p", "Author Player", 250)
    assert res2["accepted"] is True
