#!/usr/bin/env python3
"""
CLI tool to enter match results.
Usage: python cli.py "player1 Vs player2 1-2 63-40 42-66 60-63"

The format is: "player1 Vs player2 frames1-frames2 score1-score2 score1-score2 ..."
"""

import json
import sys
import subprocess
from pathlib import Path

from league import (
    find_player_by_name,
    find_pending_match,
    apply_match_result,
    parse_input_string,
    recalculate_all_player_stats,
    validate_frame_scores,
    validate_match_completion,
)

# Default data file path (relative to this script's parent directory)
DATA_FILE = Path(__file__).parent.parent / "data" / "league.json"


def load_league_data(file_path=None):
    """Load the league.json file."""
    path = file_path or DATA_FILE
    with open(path, "r") as f:
        return json.load(f)


def save_league_data(data, file_path=None):
    """Save the league.json file."""
    path = file_path or DATA_FILE
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


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

        # Find pending match between them
        match, round_num = find_pending_match(league_data, player1["id"], player2["id"])
        if not match:
            continue

        # Find the round data
        round_data = None
        for rd in league_data.get("rounds", []):
            if rd["roundNumber"] == round_num:
                round_data = rd
                break

        results.append({
            "league_id": league_id,
            "league_name": league_data.get("league", {}).get("name", "Unknown"),
            "player1": player1,
            "player2": player2,
            "player1_match_score": score1,
            "player2_match_score": score2,
            "match": match,
            "round": round_data,
            "round_number": round_num,
        })

    return results


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
    lines.append(f"Round: {match_info['round_number']}")
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


def main():
    # Check for --dev flag
    dev_mode = '--dev' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--dev']

    if len(args) < 1:
        print("Usage: python cli.py \"player1 Vs player2 1-2 63-40 42-66 60-63\" [--dev]")
        print("\nFormat: player1 Vs player2 frames1-frames2 score1-score2 score1-score2 ...")
        print("\nFlags:")
        print("  --dev    Skip git commit (for testing)")
        sys.exit(1)

    if dev_mode:
        print("[DEV MODE] Git commit will be skipped\n")

    input_str = args[0]

    # Parse input
    try:
        player1_name, player2_name, overall_frames, frame_scores = parse_input_string(input_str)
    except ValueError as e:
        print(f"Error parsing input: {e}")
        sys.exit(1)

    print(f"\nParsed input:")
    print(f"  Player 1: {player1_name}")
    print(f"  Player 2: {player2_name}")
    print(f"  Overall: {overall_frames[0]}-{overall_frames[1]}")
    print(f"  Frames: {frame_scores}")

    # Validate individual frame scores (ties, bounds)
    is_valid, error = validate_frame_scores(frame_scores)
    if not is_valid:
        print(f"\nError: {error}")
        sys.exit(1)

    # Validate frame scores match claimed overall score
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
            print(f"  {i}. {m['league_name']} - Round {m['round_number']}")

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

    # Get best_of_frames from the league to validate match completion
    league_id = selected_match["league_id"]
    league_data = data["leagues"][league_id]
    best_of_frames = league_data.get("league", {}).get("bestOfFrames", 3)

    # Validate match completion (not over too early, not incomplete)
    is_valid, error = validate_match_completion(frame_scores, best_of_frames)
    if not is_valid:
        print(f"\nError: {error}")
        sys.exit(1)

    # Show preview
    preview = format_match_preview(selected_match, frame_scores, overall_frames,
                                   player1_name, player2_name)
    print(preview)

    # Confirm
    confirm = input("\nApply this result? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Cancelled")
        sys.exit(0)

    # Apply changes using shared module
    league_data = apply_match_result(
        league_data,
        selected_match["match"],
        selected_match["player1"]["id"],
        selected_match["player2"]["id"],
        frame_scores
    )

    data["leagues"][league_id] = league_data

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
