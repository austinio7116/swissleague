#!/usr/bin/env python3
"""
Tests for the Best-of-2 tiered league format.

Best of 2 plays a fixed 2 frames per match and may end in a draw (1-1).
Scoring: win = 2 points, draw = 1 point, loss = 0 points (bye = 2).
"""

from league import (
    allows_draws,
    get_match_points,
    apply_match_result,
    validate_match_completion,
)


def make_league(best_of=2):
    return {
        "league": {"format": "tiered-round-robin", "bestOfFrames": best_of},
        "players": [
            {"id": "a", "name": "A", "active": True, "tier": "Gold", "stats": {}},
            {"id": "b", "name": "B", "active": True, "tier": "Gold", "stats": {}},
        ],
        "rounds": [{
            "roundNumber": 1,
            "status": "pending",
            "matches": [{
                "id": "m1", "player1Id": "a", "player2Id": "b",
                "status": "pending", "frames": [],
                "player1FramesWon": 0, "player2FramesWon": 0,
                "winnerId": None, "isBye": False,
            }],
        }],
    }


def stats(data, pid):
    return next(p for p in data["players"] if p["id"] == pid)["stats"]


def run():
    # Points scheme
    assert allows_draws(2) and not allows_draws(3)
    assert get_match_points(2) == {"win": 2, "draw": 1, "loss": 0, "bye": 2}
    assert get_match_points(3) == {"win": 1, "draw": 0, "loss": 0, "bye": 1}

    # Win 2-0
    d = make_league()
    m = d["rounds"][0]["matches"][0]
    d = apply_match_result(d, m, "a", "b", [(60, 40), (70, 30)])
    assert m["winnerId"] == "a"
    assert stats(d, "a")["points"] == 2 and stats(d, "a")["matchesWon"] == 1
    assert stats(d, "b")["points"] == 0 and stats(d, "b")["matchesLost"] == 1

    # Draw 1-1
    d = make_league()
    m = d["rounds"][0]["matches"][0]
    d = apply_match_result(d, m, "a", "b", [(60, 40), (30, 70)])
    assert m["winnerId"] is None
    assert stats(d, "a")["points"] == 1 and stats(d, "a")["matchesDrawn"] == 1
    assert stats(d, "b")["points"] == 1 and stats(d, "b")["matchesDrawn"] == 1

    # Loss 0-2 (submitter b view swapped)
    d = make_league()
    m = d["rounds"][0]["matches"][0]
    d = apply_match_result(d, m, "a", "b", [(20, 80), (10, 90)])
    assert m["winnerId"] == "b"
    assert stats(d, "b")["points"] == 2

    # Validation: best-of-2 requires exactly 2 frames, draws allowed
    assert validate_match_completion([(60, 40), (30, 70)], 2) == (True, None)
    assert validate_match_completion([(60, 40), (70, 30)], 2) == (True, None)
    ok, _ = validate_match_completion([(1, 0), (0, 1), (1, 0)], 2)
    assert ok is False

    print("All best-of-2 tests passed!")


if __name__ == "__main__":
    run()
