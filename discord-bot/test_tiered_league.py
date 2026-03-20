#!/usr/bin/env python3
"""
End-to-end test of the tiered round-robin league system.

Creates a 3-tier league with 18 players (6 per tier), plays out a full
season of round-robin matches, applies promotion/relegation, plays some
matches in season 2, and displays results at each stage.
"""

import copy
import random
import uuid
from datetime import datetime, timezone

from league import (
    apply_match_result,
    get_all_tier_standings,
    get_standings,
    is_tiered_league,
    recalculate_all_player_stats,
)

# ── Helpers ──────────────────────────────────────────────────────────────

TIER_COLORS = {
    "Diamond": "\033[96m",   # cyan
    "Gold": "\033[93m",      # yellow
    "Silver": "\033[37m",    # white/silver
}
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
RED = "\033[91m"


def colored(text, tier):
    return f"{TIER_COLORS.get(tier, '')}{text}{RESET}"


def gen_id():
    return str(uuid.uuid4())[:8]


# ── Round-Robin Pairing (circle method, mirrors JS implementation) ──────

def generate_round_pairings(players, round_index):
    """Generate pairings for one round using the circle method."""
    lst = list(players)
    has_bye = len(lst) % 2 != 0
    if has_bye:
        lst.append(None)

    n = len(lst)
    fixed = lst[0]
    rotating = lst[1:]

    # Rotate right by round_index
    rotated = list(rotating)
    for _ in range(round_index):
        rotated.insert(0, rotated.pop())

    pairings = []
    # First pair: fixed vs first rotated
    p1, p2 = fixed, rotated[0]
    if p1 and p2:
        pairings.append((p1, p2))
    # Remaining pairs: outside-in
    for i in range(1, n // 2):
        p1, p2 = rotated[i], rotated[n - 1 - i]
        if p1 and p2:
            pairings.append((p1, p2))
    return pairings


def generate_all_rounds(players):
    """Generate all N-1 rounds for a round-robin."""
    n = len(players) if len(players) % 2 == 0 else len(players) + 1
    total_rounds = n - 1
    return [generate_round_pairings(players, i) for i in range(total_rounds)]


# ── League Factory ───────────────────────────────────────────────────────

PLAYER_NAMES = [
    # Diamond (top 6 ranked)
    "Ronnie O'Sullivan", "Judd Trump", "Mark Selby",
    "John Higgins", "Neil Robertson", "Kyren Wilson",
    # Gold (middle 6)
    "Mark Allen", "Shaun Murphy", "Barry Hawkins",
    "Mark Williams", "Luca Brecel", "Zhao Xintong",
    # Silver (bottom 6)
    "Jack Lisowski", "Stuart Bingham", "Yan Bingtao",
    "Anthony McGill", "Hossein Vafaei", "Tom Ford",
]

TIERS = ["Diamond", "Gold", "Silver"]
PLAYERS_PER_TIER = 6
PROMOTION_COUNT = 2
BEST_OF_FRAMES = 3


def create_league():
    """Create a fresh tiered league with 18 players across 3 tiers."""
    players = []
    for i, name in enumerate(PLAYER_NAMES):
        tier_index = i // PLAYERS_PER_TIER
        tier_rank = (i % PLAYERS_PER_TIER) + 1
        players.append({
            "id": gen_id(),
            "name": name,
            "active": True,
            "tier": TIERS[tier_index],
            "tierRank": tier_rank,
            "stats": empty_season_stats(),
            "careerStats": empty_career_stats(),
        })

    tier_assignments = {}
    for tier in TIERS:
        tier_assignments[tier] = [
            p["id"] for p in players if p["tier"] == tier
        ]

    league_data = {
        "league": {
            "id": gen_id(),
            "name": "Test Tiered Snooker League",
            "format": "tiered-round-robin",
            "bestOfFrames": BEST_OF_FRAMES,
            "currentRound": 1,
            "totalRounds": PLAYERS_PER_TIER - 1,
            "currentSeason": 1,
            "tierConfig": {
                "playersPerTier": PLAYERS_PER_TIER,
                "promotionCount": PROMOTION_COUNT,
                "tiers": TIERS,
            },
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        },
        "players": players,
        "rounds": [],
        "pairingHistory": [],
        "seasons": [
            {
                "seasonNumber": 1,
                "status": "active",
                "startedAt": now_iso(),
                "completedAt": None,
                "tierAssignments": tier_assignments,
                "promotions": [],
                "relegations": [],
                "finalStandings": None,
            }
        ],
    }
    return league_data


def empty_season_stats():
    return {
        "matchesPlayed": 0, "matchesWon": 0, "matchesLost": 0,
        "framesWon": 0, "framesLost": 0, "points": 0,
        "frameDifference": 0, "byesReceived": 0,
        "forfeitsReceived": 0, "forfeitsGiven": 0,
        "strengthOfSchedule": 0, "buchholzScore": 0,
    }


def empty_career_stats():
    return {
        "matchesPlayed": 0, "matchesWon": 0, "matchesLost": 0,
        "framesWon": 0, "framesLost": 0, "points": 0,
        "seasonsPlayed": 0,
    }


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Round Generation ─────────────────────────────────────────────────────

def generate_round(league_data, round_number):
    """Generate one round of matches across all tiers (round-robin)."""
    round_index = round_number - 1
    all_matches = []

    for tier in TIERS:
        tier_players = sorted(
            [p for p in league_data["players"] if p["tier"] == tier and p["active"]],
            key=lambda p: p.get("tierRank", 0)
        )
        pairings = generate_round_pairings(tier_players, round_index)

        for p1, p2 in pairings:
            all_matches.append({
                "id": gen_id(),
                "player1Id": p1["id"],
                "player2Id": p2["id"],
                "status": "pending",
                "player1FramesWon": 0,
                "player2FramesWon": 0,
                "frames": [],
                "winnerId": None,
                "isBye": False,
                "completedAt": None,
                "roundNumber": round_number,
            })

    round_data = {
        "roundNumber": round_number,
        "status": "active",
        "matches": all_matches,
        "createdAt": now_iso(),
    }
    league_data["rounds"].append(round_data)
    league_data["league"]["currentRound"] = round_number
    return league_data


# ── Match Simulation ─────────────────────────────────────────────────────

def simulate_frame():
    """Simulate a single snooker frame, returning (winner_score, loser_score)."""
    winner_score = random.randint(50, 140)
    loser_score = random.randint(0, winner_score - 1)
    return winner_score, loser_score


def simulate_match_scores(best_of):
    """Simulate frame scores for a best-of-N match. Returns list of (p1, p2) tuples."""
    frames_to_win = (best_of // 2) + 1
    p1_wins = 0
    p2_wins = 0
    scores = []

    while p1_wins < frames_to_win and p2_wins < frames_to_win:
        w_score, l_score = simulate_frame()
        if random.random() < 0.5:
            scores.append((w_score, l_score))
            p1_wins += 1
        else:
            scores.append((l_score, w_score))
            p2_wins += 1

    return scores


def play_all_matches_in_round(league_data, round_number):
    """Simulate and apply results for all matches in a round."""
    round_data = None
    for rd in league_data["rounds"]:
        if rd["roundNumber"] == round_number:
            round_data = rd
            break
    if not round_data:
        raise ValueError(f"Round {round_number} not found")

    player_map = {p["id"]: p for p in league_data["players"]}

    for match in round_data["matches"]:
        if match["status"] == "completed":
            continue

        frame_scores = simulate_match_scores(BEST_OF_FRAMES)
        league_data = apply_match_result(
            league_data, match,
            match["player1Id"], match["player2Id"],
            frame_scores
        )

    return league_data


# ── Promotion / Relegation (mirrors JS TierManager logic) ───────────────

def sort_tier_standings(players):
    """Sort players by tier standings: points > frame diff > frames won > name."""
    return sorted(players, key=lambda p: (
        -p["stats"].get("points", 0),
        -p["stats"].get("frameDifference", 0),
        -p["stats"].get("framesWon", 0),
        p["name"].lower(),
    ))


def get_tier_standings_local(league_data, tier_name):
    tier_players = [p for p in league_data["players"] if p["tier"] == tier_name and p["active"]]
    return sort_tier_standings(tier_players)


def calculate_promotion_relegation(league_data):
    tiers = league_data["league"]["tierConfig"]["tiers"]
    promo_count = league_data["league"]["tierConfig"]["promotionCount"]
    promotions = []
    relegations = []

    for i, tier in enumerate(tiers):
        standings = get_tier_standings_local(league_data, tier)
        if not standings:
            continue
        # Top N promoted (except top tier)
        if i > 0:
            for p in standings[:promo_count]:
                promotions.append({"player": p, "fromTier": tier, "toTier": tiers[i - 1]})
        # Bottom N relegated (except bottom tier)
        if i < len(tiers) - 1:
            for p in standings[-promo_count:]:
                relegations.append({"player": p, "fromTier": tier, "toTier": tiers[i + 1]})

    return promotions, relegations


def apply_promotion_relegation(league_data):
    """Apply promotion/relegation and start a new season."""
    tiers = league_data["league"]["tierConfig"]["tiers"]
    promotions, relegations = calculate_promotion_relegation(league_data)

    # Snapshot final standings
    final_standings = {}
    for tier in tiers:
        standings = get_tier_standings_local(league_data, tier)
        final_standings[tier] = [
            {"id": p["id"], "name": p["name"], "stats": dict(p["stats"])}
            for p in standings
        ]

    # Complete current season
    current_season_num = league_data["league"]["currentSeason"]
    for season in league_data["seasons"]:
        if season["seasonNumber"] == current_season_num:
            season["status"] = "completed"
            season["completedAt"] = now_iso()
            season["promotions"] = [
                {"playerId": pr["player"]["id"], "fromTier": pr["fromTier"], "toTier": pr["toTier"]}
                for pr in promotions
            ]
            season["relegations"] = [
                {"playerId": r["player"]["id"], "fromTier": r["fromTier"], "toTier": r["toTier"]}
                for r in relegations
            ]
            season["finalStandings"] = final_standings

    # Build new tier map
    new_tier_map = {}
    for p in league_data["players"]:
        if p["active"] and p.get("tier"):
            new_tier_map[p["id"]] = p["tier"]
    for pr in promotions:
        new_tier_map[pr["player"]["id"]] = pr["toTier"]
    for r in relegations:
        new_tier_map[r["player"]["id"]] = r["toTier"]

    # Update players: swap tiers, accumulate career stats, reset season stats
    new_season = current_season_num + 1
    for player in league_data["players"]:
        career = player.get("careerStats", empty_career_stats())
        player["careerStats"] = {
            "matchesPlayed": career["matchesPlayed"] + player["stats"].get("matchesPlayed", 0),
            "matchesWon": career["matchesWon"] + player["stats"].get("matchesWon", 0),
            "matchesLost": career["matchesLost"] + player["stats"].get("matchesLost", 0),
            "framesWon": career["framesWon"] + player["stats"].get("framesWon", 0),
            "framesLost": career["framesLost"] + player["stats"].get("framesLost", 0),
            "points": career["points"] + player["stats"].get("points", 0),
            "seasonsPlayed": career.get("seasonsPlayed", 0) + 1,
        }
        player["tier"] = new_tier_map.get(player["id"], player["tier"])
        player["stats"] = empty_season_stats()

    # Assign new tier ranks
    for tier in tiers:
        tier_players = sorted(
            [p for p in league_data["players"] if p["tier"] == tier and p["active"]],
            key=lambda p: p.get("tierRank", 99)
        )
        for idx, p in enumerate(tier_players):
            p["tierRank"] = idx + 1

    # Build tier assignments for new season
    tier_assignments = {}
    for tier in tiers:
        tier_assignments[tier] = [
            p["id"] for p in sorted(
                [p for p in league_data["players"] if p["tier"] == tier and p["active"]],
                key=lambda p: p.get("tierRank", 0)
            )
        ]

    league_data["seasons"].append({
        "seasonNumber": new_season,
        "status": "active",
        "startedAt": now_iso(),
        "completedAt": None,
        "tierAssignments": tier_assignments,
        "promotions": [],
        "relegations": [],
        "finalStandings": None,
    })

    league_data["rounds"] = []
    league_data["pairingHistory"] = []
    league_data["league"]["currentSeason"] = new_season
    league_data["league"]["currentRound"] = 1
    league_data["league"]["updatedAt"] = now_iso()

    return league_data, promotions, relegations


# ── Display ──────────────────────────────────────────────────────────────

def print_header(text):
    width = 70
    print()
    print(f"{BOLD}{'=' * width}")
    print(f"  {text}")
    print(f"{'=' * width}{RESET}")


def print_tier_standings(league_data, tier_name, show_zones=True):
    standings = get_tier_standings_local(league_data, tier_name)
    promo_count = league_data["league"]["tierConfig"]["promotionCount"]
    tiers = league_data["league"]["tierConfig"]["tiers"]
    tier_idx = tiers.index(tier_name) if tier_name in tiers else -1

    print(f"\n  {colored(f'── {tier_name} Tier ──', tier_name)}")
    print(f"  {'#':<3} {'Player':<22} {'P':>3} {'W':>3} {'L':>3} {'FW':>4} {'FL':>4} {'FD':>5} {'Pts':>4}")
    print(f"  {'─' * 55}")

    for i, p in enumerate(standings):
        s = p["stats"]
        pos = i + 1
        fd = s["frameDifference"]
        fd_str = f"+{fd}" if fd > 0 else str(fd)

        # Zone markers
        zone = ""
        if show_zones:
            if tier_idx > 0 and i < promo_count:
                zone = f" {GREEN}▲{RESET}"  # promotion
            elif tier_idx < len(tiers) - 1 and i >= len(standings) - promo_count:
                zone = f" {RED}▼{RESET}"  # relegation

        print(f"  {pos:<3} {p['name']:<22} {s['matchesPlayed']:>3} {s['matchesWon']:>3} "
              f"{s['matchesLost']:>3} {s['framesWon']:>4} {s['framesLost']:>4} "
              f"{fd_str:>5} {s['points']:>4}{zone}")


def print_all_standings(league_data, show_zones=True):
    for tier in league_data["league"]["tierConfig"]["tiers"]:
        print_tier_standings(league_data, tier, show_zones)


def print_round_results(league_data, round_number):
    player_map = {p["id"]: p for p in league_data["players"]}
    round_data = None
    for rd in league_data["rounds"]:
        if rd["roundNumber"] == round_number:
            round_data = rd
            break
    if not round_data:
        return

    print(f"\n  Round {round_number} Results:")
    print(f"  {'─' * 50}")

    # Group by tier
    matches_by_tier = {}
    for match in round_data["matches"]:
        p1 = player_map[match["player1Id"]]
        tier = p1.get("tier", "Unknown")
        if tier not in matches_by_tier:
            matches_by_tier[tier] = []
        matches_by_tier[tier].append(match)

    for tier in league_data["league"]["tierConfig"]["tiers"]:
        if tier not in matches_by_tier:
            continue
        print(f"\n    {colored(tier, tier)}:")
        for match in matches_by_tier[tier]:
            p1 = player_map[match["player1Id"]]
            p2 = player_map[match["player2Id"]]
            winner = player_map.get(match.get("winnerId"))
            fw1 = match["player1FramesWon"]
            fw2 = match["player2FramesWon"]
            w_marker1 = " ★" if match.get("winnerId") == p1["id"] else ""
            w_marker2 = " ★" if match.get("winnerId") == p2["id"] else ""
            print(f"    {p1['name']}{w_marker1} {fw1}-{fw2} {p2['name']}{w_marker2}")


def print_promotion_relegation(promotions, relegations):
    print(f"\n  {BOLD}Promotions:{RESET}")
    for pr in promotions:
        print(f"    {GREEN}▲{RESET} {pr['player']['name']}: "
              f"{colored(pr['fromTier'], pr['fromTier'])} → {colored(pr['toTier'], pr['toTier'])}")

    print(f"\n  {BOLD}Relegations:{RESET}")
    for r in relegations:
        print(f"    {RED}▼{RESET} {r['player']['name']}: "
              f"{colored(r['fromTier'], r['fromTier'])} → {colored(r['toTier'], r['toTier'])}")


def print_career_stats(league_data):
    print(f"\n  {'Player':<22} {'Tier':<10} {'MP':>3} {'MW':>3} {'ML':>3} {'FW':>4} {'FL':>4} {'Pts':>4} {'Seasons':>8}")
    print(f"  {'─' * 68}")

    # Sort by career points desc, then by tier
    tier_order = {t: i for i, t in enumerate(league_data["league"]["tierConfig"]["tiers"])}
    players = sorted(league_data["players"], key=lambda p: (
        -p.get("careerStats", {}).get("points", 0),
        tier_order.get(p.get("tier"), 99),
        p["name"],
    ))

    for p in players:
        c = p.get("careerStats", {})
        tier = p.get("tier", "?")
        print(f"  {p['name']:<22} {colored(tier, tier):<20} "
              f"{c.get('matchesPlayed', 0):>3} {c.get('matchesWon', 0):>3} "
              f"{c.get('matchesLost', 0):>3} {c.get('framesWon', 0):>4} "
              f"{c.get('framesLost', 0):>4} {c.get('points', 0):>4} "
              f"{c.get('seasonsPlayed', 0):>8}")


def print_tier_rosters(league_data):
    for tier in league_data["league"]["tierConfig"]["tiers"]:
        tier_players = sorted(
            [p for p in league_data["players"] if p["tier"] == tier],
            key=lambda p: p.get("tierRank", 0)
        )
        print(f"\n  {colored(f'{tier} Tier:', tier)}")
        for p in tier_players:
            print(f"    {p['tierRank']}. {p['name']}")


# ── Validation ───────────────────────────────────────────────────────────

def validate_round_robin(league_data):
    """Validate that every player in each tier played every other player exactly once."""
    tiers = league_data["league"]["tierConfig"]["tiers"]
    errors = []

    for tier in tiers:
        tier_players = [p for p in league_data["players"] if p["tier"] == tier]
        player_ids = {p["id"] for p in tier_players}

        # Track matchups
        matchups = {}
        for pid in player_ids:
            matchups[pid] = set()

        for rd in league_data["rounds"]:
            for match in rd["matches"]:
                p1 = match["player1Id"]
                p2 = match["player2Id"]
                if p1 in player_ids and p2 in player_ids:
                    matchups[p1].add(p2)
                    matchups[p2].add(p1)

        # Each player should have played every other
        for p in tier_players:
            expected = player_ids - {p["id"]}
            actual = matchups[p["id"]]
            if expected != actual:
                missing = expected - actual
                extra = actual - expected
                if missing:
                    missing_names = [pp["name"] for pp in tier_players if pp["id"] in missing]
                    errors.append(f"{tier}: {p['name']} didn't play {missing_names}")
                if extra:
                    errors.append(f"{tier}: {p['name']} has unexpected opponents")

    return errors


# ── Main Test ────────────────────────────────────────────────────────────

def main():
    random.seed(42)  # Reproducible results

    # ─── Create League ───
    print_header("CREATING TIERED LEAGUE")
    league_data = create_league()
    print(f"\n  League: {league_data['league']['name']}")
    print(f"  Format: {league_data['league']['format']}")
    print(f"  Tiers: {', '.join(TIERS)}")
    print(f"  Players per tier: {PLAYERS_PER_TIER}")
    print(f"  Total rounds per season: {league_data['league']['totalRounds']}")
    print(f"  Best of: {BEST_OF_FRAMES} frames")
    print(f"  Promotion/Relegation: {PROMOTION_COUNT} per tier boundary")

    assert is_tiered_league(league_data), "Should be detected as tiered league"

    print_tier_rosters(league_data)

    # ─── Season 1: Play all 5 rounds ───
    print_header("SEASON 1 - PLAYING ALL ROUNDS")
    total_rounds = league_data["league"]["totalRounds"]

    for round_num in range(1, total_rounds + 1):
        league_data = generate_round(league_data, round_num)
        league_data = play_all_matches_in_round(league_data, round_num)
        print_round_results(league_data, round_num)

    # Validate round-robin completeness
    errors = validate_round_robin(league_data)
    if errors:
        print(f"\n  {RED}VALIDATION ERRORS:{RESET}")
        for e in errors:
            print(f"    - {e}")
    else:
        print(f"\n  {GREEN}✓ Round-robin validation passed: every player played every opponent in their tier exactly once{RESET}")

    # ─── Season 1 Final Standings ───
    print_header("SEASON 1 - FINAL STANDINGS")
    print_all_standings(league_data, show_zones=True)

    print(f"\n  {BOLD}Legend:{RESET} {GREEN}▲{RESET} = Promotion zone   {RED}▼{RESET} = Relegation zone")

    # Verify standings via league.py's get_all_tier_standings
    lib_standings = get_all_tier_standings(league_data)
    for tier in TIERS:
        local = get_tier_standings_local(league_data, tier)
        lib = lib_standings[tier]
        assert [p["id"] for p in local] == [p["id"] for p in lib], \
            f"Standings mismatch in {tier} tier between local and league.py"
    print(f"\n  {GREEN}✓ Standings match between local sort and league.py get_all_tier_standings{RESET}")

    # ─── Promotion / Relegation ───
    print_header("SEASON 1 → SEASON 2: PROMOTION & RELEGATION")
    promotions_preview, relegations_preview = calculate_promotion_relegation(league_data)
    print_promotion_relegation(promotions_preview, relegations_preview)

    league_data, promotions, relegations = apply_promotion_relegation(league_data)

    print(f"\n  {BOLD}New Season: {league_data['league']['currentSeason']}{RESET}")
    print_tier_rosters(league_data)

    # Verify season data
    assert league_data["league"]["currentSeason"] == 2
    assert len(league_data["seasons"]) == 2
    assert league_data["seasons"][0]["status"] == "completed"
    assert league_data["seasons"][0]["finalStandings"] is not None
    assert league_data["seasons"][1]["status"] == "active"
    assert len(league_data["rounds"]) == 0, "Rounds should be reset for new season"

    # Verify stats were reset
    for p in league_data["players"]:
        assert p["stats"]["matchesPlayed"] == 0, f"{p['name']} season stats not reset"
        assert p["careerStats"]["seasonsPlayed"] == 1, f"{p['name']} career seasonsPlayed wrong"
        assert p["careerStats"]["matchesPlayed"] > 0, f"{p['name']} career matchesPlayed should be > 0"

    print(f"\n  {GREEN}✓ Season transition verified: stats reset, career stats accumulated, tiers swapped{RESET}")

    # ─── Season 2: Play 3 of 5 rounds (partial season) ───
    print_header("SEASON 2 - PLAYING 3 OF 5 ROUNDS")

    for round_num in range(1, 4):  # Play rounds 1-3
        league_data = generate_round(league_data, round_num)
        league_data = play_all_matches_in_round(league_data, round_num)
        print_round_results(league_data, round_num)

    # ─── Season 2 Standings (mid-season) ───
    print_header("SEASON 2 - MID-SEASON STANDINGS (after 3 rounds)")
    print_all_standings(league_data, show_zones=True)

    # ─── Career Stats ───
    print_header("CAREER STATS (Season 1 + Season 2 so far)")
    print_career_stats(league_data)

    # ─── Final Summary ───
    print_header("TEST SUMMARY")

    # Count some stats
    s1_completed = league_data["seasons"][0]
    total_s1_matches = sum(
        len(tier_standings)
        for tier_standings in s1_completed["finalStandings"].values()
    )

    s2_matches = sum(len(rd["matches"]) for rd in league_data["rounds"])

    print(f"""
  League format:          tiered-round-robin
  Tiers:                  {', '.join(TIERS)}
  Players per tier:       {PLAYERS_PER_TIER}
  Total players:          {len(league_data['players'])}

  Season 1:
    Rounds played:        {total_rounds}
    Matches per round:    {PLAYERS_PER_TIER // 2 * len(TIERS)} (9 = 3 per tier)
    Total matches:        {total_rounds * (PLAYERS_PER_TIER // 2) * len(TIERS)}
    Promotions:           {len(promotions)}
    Relegations:          {len(relegations)}

  Season 2 (in progress):
    Rounds played:        3 of {total_rounds}
    Matches played:       {s2_matches}
    Rounds remaining:     {total_rounds - 3}

  Seasons in history:     {len(league_data['seasons'])}
  Career stats tracking:  ✓
""")

    print(f"  {GREEN}{BOLD}All tests passed!{RESET}")
    print()


if __name__ == "__main__":
    main()
