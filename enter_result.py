#!/usr/bin/env python3
"""
Script to enter match results from command line.
Usage: python enter_result.py "player1 Vs player2 1-2 63-40 42-66 60-63"

The format is: "player1 Vs player2 frames1-frames2 score1-score2 score1-score2 ..."
"""

import json
import re
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from difflib import SequenceMatcher

DATA_FILE = Path(__file__).parent / "data" / "league.json"


def load_league_data():
    """Load the league.json file."""
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_league_data(data):
    """Save the league.json file."""
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


def fuzzy_match_score(name1, name2):
    """Return similarity score between two names (0-1)."""
    return SequenceMatcher(None, name1.lower(), name2.lower()).ratio()


def find_player_by_name(players, search_name, threshold=0.6):
    """Find a player by name with fuzzy matching."""
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


def parse_input(input_str):
    """
    Parse input string in format: "player1 Vs player2 1-2 63-40 42-66 60-63"
    Returns: player1_name, player2_name, overall_score, list of frame scores
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
        if re.match(r'^\d+-\d+$', token):
            p1, p2 = map(int, token.split('-'))
            frame_scores.append((p1, p2))

    return player1_name, player2_name, (p1_frames, p2_frames), frame_scores


def find_pending_matches(league_data, player1_id, player2_id):
    """Find pending or in-progress matches between two players."""
    matches = []
    for round_data in league_data.get("rounds", []):
        for match in round_data.get("matches", []):
            if match.get("status") == "completed":
                continue
            if match.get("isBye"):
                continue

            # Check if this match is between our two players (in either order)
            match_players = {match.get("player1Id"), match.get("player2Id")}
            if {player1_id, player2_id} == match_players:
                matches.append({
                    "match": match,
                    "round": round_data,
                    "league_data": league_data
                })
    return matches


def find_all_matching_matches(data, player1_name, player2_name):
    """Find all pending matches across all leagues that match the players."""
    results = []

    for league_id, league_data in data.get("leagues", {}).items():
        players = league_data.get("players", [])

        # Find player 1
        player1, score1 = find_player_by_name(players, player1_name)
        if not player1:
            continue

        # Find player 2
        player2, score2 = find_player_by_name(players, player2_name)
        if not player2:
            continue

        # Find pending matches between them
        matches = find_pending_matches(league_data, player1["id"], player2["id"])

        for match_info in matches:
            results.append({
                "league_id": league_id,
                "league_name": league_data.get("league", {}).get("name", "Unknown"),
                "player1": player1,
                "player2": player2,
                "player1_match_score": score1,
                "player2_match_score": score2,
                "match": match_info["match"],
                "round": match_info["round"],
            })

    return results


def recalculate_all_player_stats(league_data):
    """
    Recalculate all player stats from match history using a two-pass approach.

    Pass 1: Calculate basic stats (matches, frames, points) for all players
    Pass 2: Calculate SOS and Buchholz using the freshly computed basic stats

    This ensures we never rely on stale/existing player stats.
    """
    players = league_data.get("players", [])
    player_map = {p["id"]: p for p in players}

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


def apply_match_result(data, league_id, match_id, player1_id, player2_id,
                       frame_scores, overall_frames):
    """Apply the match result to the league data."""
    league_data = data["leagues"][league_id]
    best_of_frames = league_data.get("league", {}).get("bestOfFrames", 3)
    frames_to_win = (best_of_frames // 2) + 1

    # Find and update the match
    for round_data in league_data.get("rounds", []):
        for i, match in enumerate(round_data.get("matches", [])):
            if match["id"] != match_id:
                continue

            # Determine which player is which in the match
            if match["player1Id"] == player1_id:
                # Input order matches match order
                pass
            else:
                # Input order is reversed from match order, swap frame scores
                frame_scores = [(p2, p1) for p1, p2 in frame_scores]
                overall_frames = (overall_frames[1], overall_frames[0])

            # Build frames array
            frames = []
            p1_frames_won = 0
            p2_frames_won = 0

            for idx, (p1_score, p2_score) in enumerate(frame_scores):
                winner_id = match["player1Id"] if p1_score > p2_score else match["player2Id"]
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
            if p1_frames_won >= frames_to_win:
                match_winner_id = match["player1Id"]
            else:
                match_winner_id = match["player2Id"]

            # Update match
            match["frames"] = frames
            match["player1FramesWon"] = p1_frames_won
            match["player2FramesWon"] = p2_frames_won
            match["status"] = "completed"
            match["winnerId"] = match_winner_id
            match["completedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

            # Update round status if all matches complete
            all_complete = all(m.get("status") == "completed"
                             for m in round_data.get("matches", []))
            if all_complete:
                round_data["status"] = "completed"

            break

    # Update league timestamp
    league_data["league"]["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Recalculate all player stats to ensure SOS/Buchholz are accurate
    league_data = recalculate_all_player_stats(league_data)

    data["leagues"][league_id] = league_data
    return data


def create_git_commit(message):
    """Create a git commit with the data file changes."""
    try:
        # Stage the data file
        subprocess.run(["git", "add", str(DATA_FILE)], check=True, capture_output=True)

        # Create commit
        result = subprocess.run(
            ["git", "commit", "-m", message],
            check=True,
            capture_output=True,
            text=True
        )
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        return False, e.stderr


def format_match_preview(match_info, frame_scores, overall_frames, input_player1, input_player2):
    """Format a preview of the match changes."""
    match = match_info["match"]
    player1 = match_info["player1"]
    player2 = match_info["player2"]

    # Determine display order based on match player order
    if match["player1Id"] == player1["id"]:
        display_p1 = player1
        display_p2 = player2
        display_frames = frame_scores
        display_overall = overall_frames
    else:
        display_p1 = player2
        display_p2 = player1
        display_frames = [(p2, p1) for p1, p2 in frame_scores]
        display_overall = (overall_frames[1], overall_frames[0])

    lines = []
    lines.append("\n" + "=" * 60)
    lines.append(f"League: {match_info['league_name']}")
    lines.append(f"Round: {match_info['round']['roundNumber']}")
    lines.append(f"Match ID: {match['id']}")
    lines.append("-" * 60)

    # Show player name matching
    lines.append("Player Matching:")
    lines.append(f"  '{input_player1}' -> {player1['name']} (score: {match_info['player1_match_score']:.2f})")
    lines.append(f"  '{input_player2}' -> {player2['name']} (score: {match_info['player2_match_score']:.2f})")
    lines.append("-" * 60)

    # Show result
    lines.append(f"Result: {display_p1['name']} vs {display_p2['name']}")
    lines.append(f"Overall: {display_overall[0]}-{display_overall[1]}")
    lines.append("\nFrames:")
    for i, (p1_score, p2_score) in enumerate(display_frames, 1):
        winner = display_p1['name'] if p1_score > p2_score else display_p2['name']
        lines.append(f"  Frame {i}: {p1_score}-{p2_score} ({winner})")

    # Show winner
    if display_overall[0] > display_overall[1]:
        winner_name = display_p1['name']
    else:
        winner_name = display_p2['name']
    lines.append(f"\nMatch Winner: {winner_name}")
    lines.append("=" * 60)

    return "\n".join(lines)


def main():
    # Check for --dev flag
    dev_mode = '--dev' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--dev']

    if len(args) < 1:
        print("Usage: python enter_result.py \"player1 Vs player2 1-2 63-40 42-66 60-63\" [--dev]")
        print("\nFormat: player1 Vs player2 frames1-frames2 score1-score2 score1-score2 ...")
        print("\nFlags:")
        print("  --dev    Skip git commit (for testing)")
        sys.exit(1)

    if dev_mode:
        print("[DEV MODE] Git commit will be skipped\n")

    input_str = args[0]

    # Parse input
    try:
        player1_name, player2_name, overall_frames, frame_scores = parse_input(input_str)
    except ValueError as e:
        print(f"Error parsing input: {e}")
        sys.exit(1)

    print(f"\nParsed input:")
    print(f"  Player 1: {player1_name}")
    print(f"  Player 2: {player2_name}")
    print(f"  Overall: {overall_frames[0]}-{overall_frames[1]}")
    print(f"  Frames: {frame_scores}")

    # Validate frame count matches overall score
    expected_frames = overall_frames[0] + overall_frames[1]
    if len(frame_scores) != expected_frames:
        print(f"\nWarning: Expected {expected_frames} frame scores but got {len(frame_scores)}")

    # Validate frame scores match overall
    p1_wins = sum(1 for p1, p2 in frame_scores if p1 > p2)
    p2_wins = sum(1 for p1, p2 in frame_scores if p2 > p1)
    if (p1_wins, p2_wins) != overall_frames:
        print(f"\nError: Frame scores ({p1_wins}-{p2_wins}) don't match overall score ({overall_frames[0]}-{overall_frames[1]})")
        sys.exit(1)

    # Load data
    try:
        data = load_league_data()
    except FileNotFoundError:
        print(f"Error: Could not find {DATA_FILE}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {DATA_FILE}: {e}")
        sys.exit(1)

    # Find matching matches
    matches = find_all_matching_matches(data, player1_name, player2_name)

    if not matches:
        print(f"\nError: No pending matches found between '{player1_name}' and '{player2_name}'")
        print("\nPossible reasons:")
        print("  - Player names don't match (check spelling)")
        print("  - Match is already completed")
        print("  - Match doesn't exist in any active round")
        sys.exit(1)

    # Select match if multiple
    selected_match = None
    if len(matches) == 1:
        selected_match = matches[0]
    else:
        print(f"\nFound {len(matches)} matches for these players:")
        for i, m in enumerate(matches, 1):
            print(f"  {i}. {m['league_name']} - Round {m['round']['roundNumber']}")

        while selected_match is None:
            try:
                choice = input("\nSelect match number (or 'q' to quit): ").strip()
                if choice.lower() == 'q':
                    sys.exit(0)
                idx = int(choice) - 1
                if 0 <= idx < len(matches):
                    selected_match = matches[idx]
                else:
                    print("Invalid selection")
            except ValueError:
                print("Please enter a number")

    # Show preview
    preview = format_match_preview(selected_match, frame_scores, overall_frames,
                                   player1_name, player2_name)
    print(preview)

    # Confirm
    confirm = input("\nApply this result? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Cancelled")
        sys.exit(0)

    # Apply changes
    data = apply_match_result(
        data,
        selected_match["league_id"],
        selected_match["match"]["id"],
        selected_match["player1"]["id"],
        selected_match["player2"]["id"],
        frame_scores,
        overall_frames
    )

    # Save
    save_league_data(data)
    print("\nData saved successfully!")

    # Git commit (skip in dev mode)
    if dev_mode:
        print("[DEV MODE] Skipping git commit")
    else:
        commit_confirm = input("Create git commit? (y/n): ").strip().lower()
        if commit_confirm == 'y':
            success, output = create_git_commit(input_str)
            if success:
                print(f"Git commit created: {input_str}")
            else:
                print(f"Git commit failed: {output}")

    print("\nDone!")


if __name__ == "__main__":
    main()
