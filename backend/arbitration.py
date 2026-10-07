import asyncio
import time
from typing import Dict, List, Optional, Callable, Awaitable, Any
from pydantic import BaseModel

MIN_HUMAN_REACTION_MS = 80
ARBITRATION_WINDOW_SECONDS = 0.250  # 250ms buffer timer

class BuzzCandidate(BaseModel):
    player_id: str
    display_name: str
    reaction_delta_ms: int
    received_at_monotonic: float
    is_quickdraw: bool = False
    is_author: bool = False

class BuzzerArbitrator:
    def __init__(self, on_arbitration_complete: Optional[Callable[[Optional[BuzzCandidate], List[BuzzCandidate]], Awaitable[None]]] = None):
        self.on_arbitration_complete = on_arbitration_complete
        self.is_unlocked: bool = False
        self.unlock_timestamp_monotonic: float = 0.0
        self.candidates: List[BuzzCandidate] = []
        self.arbitration_task: Optional[asyncio.Task] = None
        self.winner: Optional[BuzzCandidate] = None
        self.locked_out_player_ids: set = set()
        self.author_lockout: Optional[Dict[str, float]] = None  # {player_id: unlock_monotonic}

    def unlock(self, locked_out_ids: Optional[set] = None, author_id: Optional[str] = None, author_delay_seconds: float = 1.5):
        self.is_unlocked = True
        self.unlock_timestamp_monotonic = time.monotonic()
        self.candidates = []
        self.winner = None
        self.locked_out_player_ids = set(locked_out_ids or [])
        if self.arbitration_task and not self.arbitration_task.done():
            self.arbitration_task.cancel()
        self.arbitration_task = None

        if author_id:
            self.author_lockout = {author_id: self.unlock_timestamp_monotonic + author_delay_seconds}
        else:
            self.author_lockout = None

    def lock(self):
        self.is_unlocked = False
        if self.arbitration_task and not self.arbitration_task.done():
            self.arbitration_task.cancel()
        self.arbitration_task = None

    def reset(self):
        """Completely resets buzzer state, winners, and candidates for next clue."""
        self.is_unlocked = False
        self.winner = None
        self.candidates = []
        self.locked_out_player_ids = set()
        self.author_lockout = None
        if self.arbitration_task and not self.arbitration_task.done():
            self.arbitration_task.cancel()
        self.arbitration_task = None

    def validate_and_register_buzz(
        self,
        player_id: str,
        display_name: str,
        reaction_delta_ms: int,
        is_quickdraw: bool = False
    ) -> Dict[str, Any]:
        """
        Validates buzz packet:
        1. Checks if arbitrator is unlocked (unless quickdraw allowed)
        2. Checks if player is jammed / locked out
        3. Checks author lockout window (1.5s)
        4. Validates reaction_delta_ms >= 80ms (anti-macro bot check)
        5. Enqueues into candidate pool and starts 250ms window if first buzz
        """
        now = time.monotonic()

        if not self.is_unlocked and not is_quickdraw:
            return {"accepted": False, "reason": "Buzzer is currently locked"}

        if player_id in self.locked_out_player_ids:
            return {"accepted": False, "reason": "You are locked out for this clue"}

        if self.author_lockout and player_id in self.author_lockout:
            unlock_time = self.author_lockout[player_id]
            if now < unlock_time:
                remaining = max(0.0, unlock_time - now)
                return {"accepted": False, "reason": f"Author lockout active: {remaining:.1f}s remaining"}

        # Anti-cheat filter (Section 5.5: reactionDeltaMs < 80 rejected)
        if reaction_delta_ms < MIN_HUMAN_REACTION_MS:
            return {
                "accepted": False,
                "reason": f"Inhuman reaction time ({reaction_delta_ms}ms < {MIN_HUMAN_REACTION_MS}ms threshold)"
            }

        # Prevent duplicate buzz from same player
        if any(c.player_id == player_id for c in self.candidates):
            return {"accepted": False, "reason": "Buzz already registered"}

        is_author = bool(self.author_lockout and player_id in self.author_lockout)

        candidate = BuzzCandidate(
            player_id=player_id,
            display_name=display_name,
            reaction_delta_ms=reaction_delta_ms,
            received_at_monotonic=now,
            is_quickdraw=is_quickdraw,
            is_author=is_author
        )
        self.candidates.append(candidate)

        # If winner already chosen, immediately notify queue update
        if self.winner is not None:
            if self.on_arbitration_complete:
                asyncio.create_task(self.on_arbitration_complete(self.winner, self.candidates))
            return {
                "accepted": True,
                "reaction_delta_ms": reaction_delta_ms,
                "queued": True,
                "position": len(self.candidates)
            }

        # Start 250ms arbitration buffer window on first valid buzz
        if self.arbitration_task is None or self.arbitration_task.done():
            self.arbitration_task = asyncio.create_task(self._run_arbitration_window())

        return {"accepted": True, "reaction_delta_ms": reaction_delta_ms}

    async def _run_arbitration_window(self):
        try:
            await asyncio.sleep(ARBITRATION_WINDOW_SECONDS)
            self._resolve_winner()
        except asyncio.CancelledError:
            pass

    def _resolve_winner(self):
        if not self.candidates:
            return

        # Lowest reactionDeltaMs wins
        # Secondary tie-breaker: received_at_monotonic
        sorted_candidates = sorted(
            self.candidates,
            key=lambda c: (c.reaction_delta_ms, c.received_at_monotonic)
        )
        self.winner = sorted_candidates[0]
        # Keep buzzers unlocked for remaining contestants who want to queue!
        self.is_unlocked = True

        if self.on_arbitration_complete:
            asyncio.create_task(self.on_arbitration_complete(self.winner, self.candidates))

    def remove_candidate(self, player_id: str):
        """Removes a player from the candidate pool and locks them out for this clue."""
        self.locked_out_player_ids.add(player_id)
        self.candidates = [c for c in self.candidates if c.player_id != player_id]
        if self.winner and self.winner.player_id == player_id:
            self.winner = None

    def get_sorted_queue(self) -> List[BuzzCandidate]:
        """Returns all candidates ordered by reaction time ascending."""
        return sorted(self.candidates, key=lambda c: (c.reaction_delta_ms, c.received_at_monotonic))

    def promote_next_candidate(self) -> Optional[BuzzCandidate]:
        """Promotes the next fastest candidate in queue as winner."""
        valid_candidates = [c for c in self.get_sorted_queue() if c.player_id not in self.locked_out_player_ids]
        if valid_candidates:
            self.winner = valid_candidates[0]
            return self.winner
        self.winner = None
        return None
