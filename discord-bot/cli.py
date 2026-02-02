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
    apply_forfeit_result,
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


def parse_forfeit_input(input_str):
    """
    Parse forfeit input string.

    Formats:
      "player1 Vs player2 forfeit player1"      - player1 forfeited (player2 wins)
      "player1 Vs player2 forfeit player2"      - player2 forfeited (player1 wins)
      "player1 Vs player2 double-forfeit"       - both forfeited (both lose)

    Returns: (player1_name, player2_name, forfeit_type, forfeiting_player_name_or_none)
    Raises ValueError if parsing fails.
    """
    import re

    # Check for double forfeit first
    double_forfeit_match = re.search(r'\s+double[_-]?forfeit\s*$', input_str, re.IGNORECASE)
    if double_forfeit_match:
        # Extract player names
        prefix = input_str[:double_forfeit_match.start()]
        parts = re.split(r'\s+[Vv][Ss]\s+', prefix, maxsplit=1)
        if len(parts) != 2:
            raise ValueError("Input must contain 'Vs' separator between player names")
        player1_name = parts[0].strip()
        player2_name = parts[1].strip()
        return player1_name, player2_name, "double", None

    # Check for single forfeit
    single_forfeit_match = re.search(r'\s+forfeit\s+(.+?)\s*$', input_str, re.IGNORECASE)
    if single_forfeit_match:
        forfeiting_name = single_forfeit_match.group(1).strip()
        prefix = input_str[:single_forfeit_match.start()]
        parts = re.split(r'\s+[Vv][Ss]\s+', prefix, maxsplit=1)
        if len(parts) != 2:
            raise ValueError("Input must contain 'Vs' separator between player names")
        player1_name = parts[0].strip()
        player2_name = parts[1].strip()
        return player1_name, player2_name, "single", forfeiting_name

    raise ValueError("Could not parse forfeit format. Use 'forfeit <player>' or 'double-forfeit'")


def is_forfeit_input(input_str):
    """Check if input string is a forfeit command."""
    import re
    return bool(re.search(r'\s+(forfeit|double[_-]?forfeit)\b', input_str, re.IGNORECASE))


def format_forfeit_preview(match_info, forfeit_type, forfeiting_player_name=None):
    """Format a preview of the forfeit match."""
    match = match_info["match"]
    player1 = match_info["player1"]
    player2 = match_info["player2"]

    lines = []
    lines.append("\n" + "=" * 60)
    lines.append(f"League: {match_info['league_name']}")
    lines.append(f"Round: {match_info['round_number']}")
    lines.append(f"Match ID: {match['id']}")
    lines.append("-" * 60)
    lines.append(f"Match: {player1['name']} vs {player2['name']}")
    lines.append("-" * 60)

    if forfeit_type == "double":
        lines.append("DOUBLE FORFEIT")
        lines.append(f"  Both players forfeit")
        lines.append(f"  {player1['name']}: 0 points (loss)")
        lines.append(f"  {player2['name']}: 0 points (loss)")
        lines.append(f"  No frames recorded")
    else:
        # Single forfeit - determine winner
        if forfeiting_player_name.lower() == player1['name'].lower():
            forfeiter = player1
            winner = player2
        else:
            forfeiter = player2
            winner = player1
        lines.append("SINGLE FORFEIT")
        lines.append(f"  {forfeiter['name']} forfeits")
        lines.append(f"  {winner['name']}: 1 point (win by forfeit)")
        lines.append(f"  {forfeiter['name']}: 0 points (loss by forfeit)")
        lines.append(f"  No frames recorded")

    lines.append("-" * 60)
    lines.append("NOTE: Forfeits are excluded from SOS and Buchholz calculations")
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
        print("\nFormats:")
        print("  Regular match:   player1 Vs player2 frames1-frames2 score1-score2 score1-score2 ...")
        print("  Single forfeit:  player1 Vs player2 forfeit <forfeiting_player>")
        print("  Double forfeit:  player1 Vs player2 double-forfeit")
        print("\nFlags:")
        print("  --dev    Skip git commit (for testing)")
        print("\nExamples:")
        print('  python cli.py "john Vs jane 2-1 63-40 42-66 60-63"')
        print('  python cli.py "john Vs jane forfeit john"        # john forfeits, jane wins')
        print('  python cli.py "john Vs jane double-forfeit"      # both forfeit, both lose')
        sys.exit(1)

    if dev_mode:
        print("[DEV MODE] Git commit will be skipped\n")

    input_str = args[0]

    # Check if this is a forfeit command
    if is_forfeit_input(input_str):
        handle_forfeit(input_str, dev_mode)
    else:
        handle_regular_result(input_str, dev_mode)


def handle_forfeit(input_str, dev_mode):
    """Handle forfeit match result."""
    # Parse forfeit input
    try:
        player1_name, player2_name, forfeit_type, forfeiting_name = parse_forfeit_input(input_str)
    except ValueError as e:
        print(f"Error parsing forfeit input: {e}")
        sys.exit(1)

    print(f"\nParsed forfeit input:")
    print(f"  Player 1: {player1_name}")
    print(f"  Player 2: {player2_name}")
    print(f"  Forfeit type: {forfeit_type}")
    if forfeiting_name:
        print(f"  Forfeiting player: {forfeiting_name}")

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

    # For single forfeit, verify the forfeiting player name matches one of the players
    forfeiting_player_id = None
    if forfeit_type == "single":
        p1 = selected_match["player1"]
        p2 = selected_match["player2"]

        # Check if forfeiting_name matches either player
        if forfeiting_name.lower() == p1["name"].lower():
            forfeiting_player_id = p1["id"]
        elif forfeiting_name.lower() == p2["name"].lower():
            forfeiting_player_id = p2["id"]
        else:
            # Try fuzzy match
            from league import fuzzy_match_score
            score1 = fuzzy_match_score(forfeiting_name, p1["name"])
            score2 = fuzzy_match_score(forfeiting_name, p2["name"])

            if score1 > score2 and score1 >= 0.6:
                forfeiting_player_id = p1["id"]
                print(f"  Note: '{forfeiting_name}' matched to '{p1['name']}' (score: {score1:.2f})")
            elif score2 > score1 and score2 >= 0.6:
                forfeiting_player_id = p2["id"]
                print(f"  Note: '{forfeiting_name}' matched to '{p2['name']}' (score: {score2:.2f})")
            else:
                print(f"\nError: Could not match forfeiting player '{forfeiting_name}'")
                print(f"  Expected one of: {p1['name']}, {p2['name']}")
                sys.exit(1)

    # Show preview
    forfeiting_display_name = None
    if forfeit_type == "single":
        forfeiting_display_name = (selected_match["player1"]["name"]
                                   if forfeiting_player_id == selected_match["player1"]["id"]
                                   else selected_match["player2"]["name"])

    preview = format_forfeit_preview(selected_match, forfeit_type, forfeiting_display_name)
    print(preview)

    # Confirm
    confirm = input("\nApply this forfeit result? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Cancelled")
        sys.exit(0)

    # Apply forfeit
    league_id = selected_match["league_id"]
    league_data = data["leagues"][league_id]

    league_data = apply_forfeit_result(
        league_data,
        selected_match["match"],
        forfeit_type,
        forfeiting_player_id
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


def handle_regular_result(input_str, dev_mode):
    """Handle regular (non-forfeit) match result."""
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
