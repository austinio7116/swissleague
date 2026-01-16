"""
Shared league management logic for both CLI and Discord bot.
Handles match results, player stats calculation, and data validation.
"""

import re
from datetime import datetime, timezone
from difflib import SequenceMatcher


def fuzzy_match_score(name1, name2):
    """Return similarity score between two names (0-1)."""
    return SequenceMatcher(None, name1.lower(), name2.lower()).ratio()


def find_player_by_name(players, search_name, threshold=0.6):
    """
    Find a player by name with fuzzy matching.
    Returns (player, score) tuple or (None, 0) if not found.
    """
    best_match = None
    best_score = 0

    for player in players:
        # Exact match (case-insensitive)
        if player["name"].lower() == search_name.lower():
            return player, 1.0

        # Fuzzy match
        score = fuzzy_match_score(player["name"], search_name)
        if score > best_score and score >= threshold:
            best_score = score
            best_match = player

    return best_match, best_score


def find_pending_match(league_data, player1_id, player2_id):
    """
    Find a pending match between two players.
    Returns (match, round_number) or (None, None) if not found.
    """
    for round_data in league_data.get("rounds", []):
        for match in round_data.get("matches", []):
            if match.get("status") == "completed":
                continue
            if match.get("isBye"):
                continue

            match_players = {match.get("player1Id"), match.get("player2Id")}
            if {player1_id, player2_id} == match_players:
                return match, round_data["roundNumber"]

    return None, None


def find_pending_matches_for_player(league_data, player_id):
    """Find all pending matches for a specific player."""
    pending = []
    players_map = {p["id"]: p for p in league_data.get("players", [])}

    for round_data in league_data.get("rounds", []):
        for match in round_data.get("matches", []):
            if match.get("status") != "pending":
                continue
            if match.get("isBye"):
                continue

            if player_id in [match.get("player1Id"), match.get("player2Id")]:
                opponent_id = (
                    match["player2Id"]
                    if match["player1Id"] == player_id
                    else match["player1Id"]
                )
                opponent = players_map.get(opponent_id)
                if opponent:
                    pending.append({
                        "round": round_data["roundNumber"],
                        "opponent": opponent["name"],
                        "match": match
                    })

    return pending


def parse_frame_score(frame_str):
    """
    Parse a frame score string like '63-45' into (score1, score2).
    Returns None if invalid format.
    """
    match = re.match(r'^(\d+)-(\d+)$', frame_str.strip())
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def parse_input_string(input_str):
    """
    Parse CLI input string in format: "player1 Vs player2 1-2 63-40 42-66 60-63"
    Returns: (player1_name, player2_name, overall_score, frame_scores)
    Raises ValueError if parsing fails.
    """
    # Split by "Vs" (case-insensitive)
    parts = re.split(r'\s+[Vv][Ss]\s+', input_str, maxsplit=1)
    if len(parts) != 2:
        raise ValueError("Input must contain 'Vs' separator between player names")

    player1_name = parts[0].strip()
    rest = parts[1].strip()

    # Split the rest by whitespace
    tokens = rest.split()
    if len(tokens) < 2:
        raise ValueError("Must have at least player2 name and overall score")

    # Find the overall score (first token matching X-X pattern)
    overall_score_idx = None
    for i, token in enumerate(tokens):
        if re.match(r'^\d+-\d+$', token):
            overall_score_idx = i
            break

    if overall_score_idx is None:
        raise ValueError("Could not find overall score in format X-X")

    # Everything before overall score is player2 name
    player2_name = " ".join(tokens[:overall_score_idx])
    if not player2_name:
        raise ValueError("Player 2 name is empty")

    overall_score = tokens[overall_score_idx]
    p1_frames, p2_frames = map(int, overall_score.split('-'))

    # Remaining tokens are frame scores
    frame_scores = []
    for token in tokens[overall_score_idx + 1:]:
        parsed = parse_frame_score(token)
        if parsed:
            frame_scores.append(parsed)

    return player1_name, player2_name, (p1_frames, p2_frames), frame_scores


def recalculate_all_player_stats(league_data):
    """
    Recalculate all player stats from match history using a two-pass approach.

    Pass 1: Calculate basic stats (matches, frames, points) for all players
    Pass 2: Calculate SOS and Buchholz using the freshly computed basic stats

    This ensures we never rely on stale/existing player stats.
    """
    players = league_data.get("players", [])

    # Initialize fresh stats for all players
    fresh_stats = {}
    opponent_map = {}  # Track opponents for each player

    for player in players:
        fresh_stats[player["id"]] = {
            "matchesPlayed": 0,
            "matchesWon": 0,
            "matchesLost": 0,
            "framesWon": 0,
            "framesLost": 0,
            "points": 0,
            "frameDifference": 0,
            "byesReceived": 0,
            "strengthOfSchedule": 0,
            "buchholzScore": 0
        }
        opponent_map[player["id"]] = []

    # Pass 1: Calculate basic stats from match history
    for round_data in league_data.get("rounds", []):
        for match in round_data.get("matches", []):
            if match.get("status") != "completed":
                continue

            player1_id = match.get("player1Id")
            player2_id = match.get("player2Id")
            winner_id = match.get("winnerId")
            is_bye = match.get("isBye", False)

            # Handle bye matches
            if is_bye:
                if player1_id in fresh_stats:
                    fresh_stats[player1_id]["matchesPlayed"] += 1
                    fresh_stats[player1_id]["matchesWon"] += 1
                    fresh_stats[player1_id]["points"] += 1
                    fresh_stats[player1_id]["byesReceived"] += 1
                continue

            # Regular match - update both players
            if player1_id in fresh_stats:
                fresh_stats[player1_id]["matchesPlayed"] += 1
                fresh_stats[player1_id]["framesWon"] += match.get("player1FramesWon", 0)
                fresh_stats[player1_id]["framesLost"] += match.get("player2FramesWon", 0)
                opponent_map[player1_id].append(player2_id)
                if winner_id == player1_id:
                    fresh_stats[player1_id]["matchesWon"] += 1
                    fresh_stats[player1_id]["points"] += 1
                else:
                    fresh_stats[player1_id]["matchesLost"] += 1

            if player2_id in fresh_stats:
                fresh_stats[player2_id]["matchesPlayed"] += 1
                fresh_stats[player2_id]["framesWon"] += match.get("player2FramesWon", 0)
                fresh_stats[player2_id]["framesLost"] += match.get("player1FramesWon", 0)
                opponent_map[player2_id].append(player1_id)
                if winner_id == player2_id:
                    fresh_stats[player2_id]["matchesWon"] += 1
                    fresh_stats[player2_id]["points"] += 1
                else:
                    fresh_stats[player2_id]["matchesLost"] += 1

    # Calculate frame difference for all players
    for player_id in fresh_stats:
        stats = fresh_stats[player_id]
        stats["frameDifference"] = stats["framesWon"] - stats["framesLost"]

    # Pass 2: Calculate SOS and Buchholz using freshly computed stats
    for player_id in fresh_stats:
        opponents = opponent_map[player_id]
        if not opponents:
            continue

        opponent_win_rates = []
        buchholz_total = 0

        for opp_id in opponents:
            if opp_id not in fresh_stats:
                continue
            opp_stats = fresh_stats[opp_id]
            opp_played = opp_stats["matchesPlayed"]
            if opp_played > 0:
                opp_win_rate = opp_stats["matchesWon"] / opp_played
                opponent_win_rates.append(opp_win_rate)
            buchholz_total += opp_stats["points"]

        if opponent_win_rates:
            fresh_stats[player_id]["strengthOfSchedule"] = sum(opponent_win_rates) / len(opponent_win_rates)
        fresh_stats[player_id]["buchholzScore"] = buchholz_total

    # Apply fresh stats to all players
    for player in players:
        player["stats"] = fresh_stats[player["id"]]

    return league_data


def apply_match_result(league_data, match, submitter_id, opponent_id, frame_scores):
    """
    Apply a match result to the league data.

    Args:
        league_data: The league data dict
        match: The match dict to update
        submitter_id: ID of player who submitted (their scores are first in frame_scores)
        opponent_id: ID of opponent
        frame_scores: List of (submitter_score, opponent_score) tuples

    Returns:
        Updated league_data with recalculated stats
    """
    match_p1_id = match["player1Id"]
    match_p2_id = match["player2Id"]

    # Determine if we need to swap scores based on match player order
    if submitter_id == match_p1_id:
        # Submitter is player1 in match - scores are in correct order
        frames_data = frame_scores
    else:
        # Submitter is player2 in match - swap scores
        frames_data = [(s2, s1) for s1, s2 in frame_scores]

    # Build frames array
    frames = []
    p1_frames_won = 0
    p2_frames_won = 0

    for idx, (p1_score, p2_score) in enumerate(frames_data):
        winner_id = match_p1_id if p1_score > p2_score else match_p2_id
        if p1_score > p2_score:
            p1_frames_won += 1
        else:
            p2_frames_won += 1

        frames.append({
            "frameNumber": idx + 1,
            "player1Score": p1_score,
            "player2Score": p2_score,
            "winnerId": winner_id
        })

    # Determine match winner
    match_winner_id = match_p1_id if p1_frames_won > p2_frames_won else match_p2_id

    # Update match
    match["frames"] = frames
    match["player1FramesWon"] = p1_frames_won
    match["player2FramesWon"] = p2_frames_won
    match["status"] = "completed"
    match["winnerId"] = match_winner_id
    match["completedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Update round status if all matches complete
    for round_data in league_data.get("rounds", []):
        if match in round_data.get("matches", []):
            all_complete = all(
                m.get("status") == "completed"
                for m in round_data.get("matches", [])
            )
            if all_complete:
                round_data["status"] = "completed"
            break

    # Update league timestamp
    if "league" in league_data:
        league_data["league"]["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Recalculate all player stats
    league_data = recalculate_all_player_stats(league_data)

    return league_data


def get_standings(league_data, limit=None):
    """
    Get sorted standings for the league.

    Sorting matches display page:
    1. Points (desc)
    2. Buchholz Score (desc)
    3. Strength of Schedule (desc)
    4. Frame difference (desc)
    5. Frames won (desc)
    6. Name (alphabetical)
    """
    def sort_key(p):
        stats = p.get("stats", {})
        return (
            -stats.get("points", 0),
            -stats.get("buchholzScore", 0),
            -stats.get("strengthOfSchedule", 0),
            -stats.get("frameDifference", 0),
            -stats.get("framesWon", 0),
            p.get("name", "").lower()
        )

    # Only include active players
    active_players = [p for p in league_data.get("players", []) if p.get("active", True)]
    players = sorted(active_players, key=sort_key)

    if limit:
        players = players[:limit]

    return players


def validate_frame_scores(frame_scores, expected_total=None):
    """
    Validate frame scores.

    Args:
        frame_scores: List of (score1, score2) tuples
        expected_total: Optional expected total number of frames

    Returns:
        (is_valid, error_message)
    """
    if not frame_scores:
        return False, "No frame scores provided"

    if expected_total and len(frame_scores) != expected_total:
        return False, f"Expected {expected_total} frames but got {len(frame_scores)}"

    for i, (s1, s2) in enumerate(frame_scores):
        if s1 == s2:
            return False, f"Frame {i+1} is a tie ({s1}-{s2}), which is not allowed"

    return True, None
