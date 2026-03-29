"""
Discord bot for Swiss League result submission.
Allows players to submit match results via slash commands.
"""

import asyncio
import discord
from discord import app_commands
import aiohttp
import base64
import glob
import json
import os
import random
import re
import secrets
import time

from league import (
    find_player_by_name_exact,
    find_pending_match,
    find_pending_matches_for_player,
    find_all_pending_matches,
    apply_match_result,
    get_standings,
    get_all_tier_standings,
    get_tier_for_player,
    is_tiered_league,
    tracks_frame_scores,
    make_frames_from_score,
    parse_frame_score,
    validate_frame_scores,
    validate_match_completion,
)

# Configuration from environment variables
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
DISCORD_TOKEN = os.environ.get('DISCORD_TOKEN')
REPO = os.environ.get('GITHUB_REPO', 'austinio7116/swissleague')
FILE_PATH = os.environ.get('LEAGUE_FILE_PATH', 'data/league.json')

# Discord bot setup
intents = discord.Intents.default()
intents.members = True  # Needed to look up members by name
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)


class GitHubAPI:
    """Handle GitHub API interactions."""

    def __init__(self, token, repo, file_path):
        self.token = token
        self.repo = repo
        self.file_path = file_path
        self.base_url = f'https://api.github.com/repos/{repo}/contents/{file_path}'
        self.headers = {
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github.v3+json'
        }

    async def get_league_data(self):
        """Fetch current league.json from GitHub."""
        async with aiohttp.ClientSession() as session:
            async with session.get(self.base_url, headers=self.headers) as resp:
                if resp.status != 200:
                    raise Exception(f'GitHub API error: {resp.status}')
                data = await resp.json()
                content = base64.b64decode(data['content']).decode('utf-8')
                return json.loads(content), data['sha']

    async def commit_league_data(self, league_data, sha, message):
        """Commit updated league.json to GitHub."""
        content = base64.b64encode(
            json.dumps(league_data, indent=2).encode('utf-8')
        ).decode('utf-8')

        payload = {
            'message': message,
            'content': content,
            'sha': sha
        }

        async with aiohttp.ClientSession() as session:
            async with session.put(self.base_url, headers=self.headers, json=payload) as resp:
                if resp.status not in [200, 201]:
                    error = await resp.text()
                    raise Exception(f'GitHub commit failed: {error}')
                return True


github = GitHubAPI(GITHUB_TOKEN, REPO, FILE_PATH)


def get_active_league(data):
    """Get the active league from the data, using currentLeagueId if set."""
    # Use currentLeagueId if available
    current_id = data.get("currentLeagueId")
    if current_id and current_id in data.get("leagues", {}):
        return current_id, data["leagues"][current_id]
    # Fallback: look for a league with status "active"
    for league_id, league_data in data.get("leagues", {}).items():
        if league_data.get("league", {}).get("status") == "active":
            return league_id, league_data
    # Fallback to first league
    for league_id, league_data in data.get("leagues", {}).items():
        return league_id, league_data
    return None, None


def get_display_name(guild, username):
    """
    Look up a Discord member's display name from their username.
    Returns display name if different from username, otherwise None.
    """
    if not guild:
        return None
    # Find member by username (case-insensitive)
    member = discord.utils.find(
        lambda m: m.name.lower() == username.lower(),
        guild.members
    )
    if member and member.display_name != member.name:
        return member.display_name
    return None


def format_player_name(guild, username):
    """Format player name with display name in brackets if different."""
    display = get_display_name(guild, username)
    if display:
        return f"{username} ({display})"
    return username


async def resolve_opponent_to_username(guild, opponent_input):
    """
    Resolve opponent input to a Discord username.
    Handles: user mentions (<@ID>), display names, and usernames.
    Returns username if found, otherwise None.
    """
    if not guild:
        return None

    # Check if it's a user mention like <@1013422262436774039>
    mention_match = re.match(r'<@!?(\d+)>', opponent_input)
    if mention_match:
        user_id = int(mention_match.group(1))
        try:
            member = await guild.fetch_member(user_id)
            if member:
                return member.name
        except discord.NotFound:
            pass
        return None

    # Otherwise try to match by display name
    async for member in guild.fetch_members(limit=None):
        if member.display_name.lower() == opponent_input.lower():
            return member.name
    return None


@tree.command(name='result', description='Submit a match result')
@app_commands.describe(
    opponent='Your opponent (their Discord username or display name)',
    score='Overall match score (e.g. 2-1) - required for leagues without frame tracking',
    frame1='Frame 1 score (your-score-opponent-score, e.g. 63-45)',
    frame2='Frame 2 score (e.g. 52-60)',
    frame3='Frame 3 score (optional, e.g. 71-38)',
    frame4='Frame 4 score (optional)',
    frame5='Frame 5 score (optional)'
)
async def submit_result(
    interaction: discord.Interaction,
    opponent: str,
    score: str = None,
    frame1: str = None,
    frame2: str = None,
    frame3: str = None,
    frame4: str = None,
    frame5: str = None
):
    await interaction.response.defer()

    try:
        # Get current league data
        data, sha = await github.get_league_data()
        league_id, league_data = get_active_league(data)

        if not league_data:
            await interaction.followup.send("No active league found.")
            return

        players = league_data.get("players", [])
        track_scores = tracks_frame_scores(league_data)

        # Find submitter by Discord username (exact match only for security)
        submitter_name = interaction.user.name
        submitter = find_player_by_name_exact(players, submitter_name)
        if not submitter:
            await interaction.followup.send(
                f"Could not find player '{submitter_name}' in the league. "
                f"Your Discord username must match your league name exactly."
            )
            return

        # Find opponent - resolve mention/display name to username (more secure)
        # This ensures opponent is an actual guild member, not arbitrary input
        resolved_username = await resolve_opponent_to_username(interaction.guild, opponent)
        if resolved_username:
            opponent_player = find_player_by_name_exact(players, resolved_username)
        else:
            # Fallback: try direct match (in case input is already a username)
            opponent_player = find_player_by_name_exact(players, opponent)

        if not opponent_player:
            await interaction.followup.send(
                f"Could not find opponent '{opponent}' in the league. "
                f"Make sure they are a member of this server and in the league."
            )
            return

        # Find pending match between these players
        match, round_num = find_pending_match(
            league_data, submitter['id'], opponent_player['id']
        )
        if not match:
            await interaction.followup.send(
                f"No pending match found between {submitter['name']} and {opponent_player['name']}."
            )
            return

        best_of_frames = league_data.get("league", {}).get("bestOfFrames", 3)

        if track_scores:
            # Full frame score tracking mode - require individual frame scores
            if not frame1 or not frame2:
                await interaction.followup.send(
                    "This league tracks individual frame scores. "
                    "Please provide frame1 and frame2 parameters (e.g. frame1: 63-45 frame2: 52-60)."
                )
                return

            frame_strs = [frame1, frame2]
            if frame3:
                frame_strs.append(frame3)
            if frame4:
                frame_strs.append(frame4)
            if frame5:
                frame_strs.append(frame5)

            frames = []
            for i, fs in enumerate(frame_strs):
                parsed = parse_frame_score(fs)
                if not parsed:
                    await interaction.followup.send(
                        f"Invalid frame {i+1} score format: '{fs}'. Use format like '63-45'."
                    )
                    return
                frames.append(parsed)

            # Validate individual frame scores (ties, bounds)
            is_valid, error = validate_frame_scores(frames)
            if not is_valid:
                await interaction.followup.send(f"Invalid frame scores: {error}")
                return

            # Validate match completion (not over too early, not incomplete)
            is_valid, error = validate_match_completion(frames, best_of_frames)
            if not is_valid:
                await interaction.followup.send(f"Invalid match result: {error}")
                return

            submitter_frames = sum(1 for f in frames if f[0] > f[1])
            opponent_frames = sum(1 for f in frames if f[1] > f[0])
            frame_summary = ' '.join(frame_strs)
        else:
            # Frames-only mode - just need overall score
            if not score:
                # Try to use frame1 as score if provided (common mistake)
                if frame1 and parse_frame_score(frame1):
                    score = frame1
                else:
                    await interaction.followup.send(
                        "This league uses frames-only scoring. "
                        "Please provide the score parameter with the overall match result (e.g. score: 2-1)."
                    )
                    return

            parsed_score = parse_frame_score(score)
            if not parsed_score:
                await interaction.followup.send(
                    f"Invalid score format: '{score}'. Use format like '2-1'."
                )
                return

            submitter_frames, opponent_frames = parsed_score
            total_frames = submitter_frames + opponent_frames
            frames_to_win = (best_of_frames // 2) + 1

            if submitter_frames == opponent_frames:
                await interaction.followup.send("Match cannot be a draw - one player must win more frames.")
                return
            if max(submitter_frames, opponent_frames) < frames_to_win:
                await interaction.followup.send(
                    f"Match not complete: need {frames_to_win} frames to win (best of {best_of_frames}). "
                    f"Score {submitter_frames}-{opponent_frames} doesn't have a winner."
                )
                return
            if min(submitter_frames, opponent_frames) >= frames_to_win:
                await interaction.followup.send(
                    f"Invalid score: both players can't reach {frames_to_win} frames."
                )
                return
            if total_frames > best_of_frames:
                await interaction.followup.send(
                    f"Too many frames: {total_frames} exceeds best of {best_of_frames}."
                )
                return

            frames = make_frames_from_score(submitter_frames, opponent_frames)
            frame_summary = f"{submitter_frames}-{opponent_frames}"

        winner = submitter['name'] if submitter_frames > opponent_frames else opponent_player['name']

        # Apply the match result (this also recalculates all stats)
        league_data = apply_match_result(
            league_data, match,
            submitter['id'], opponent_player['id'],
            frames
        )

        # Update the data structure
        data["leagues"][league_id] = league_data

        # Commit to GitHub
        commit_msg = f"{submitter['name']} vs {opponent_player['name']} {submitter_frames}-{opponent_frames}"
        await github.commit_league_data(data, sha, commit_msg)

        # Send confirmation
        tier_info = ""
        if is_tiered_league(league_data):
            player_tier = submitter.get("tier", "")
            if player_tier:
                tier_info = f" [{player_tier}]"

        await interaction.followup.send(
            f"**Match Result Recorded**{tier_info}\n"
            f"Round {round_num}: **{submitter['name']}** vs **{opponent_player['name']}**\n"
            f"Result: **{submitter_frames}-{opponent_frames}** - {winner} wins!\n\n"
            f"Stats have been updated."
        )

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


def are_players_tied(a, b):
    """Check if two players are tied on all tiebreakers (excluding name)."""
    a_stats = a.get('stats', {})
    b_stats = b.get('stats', {})
    return (
        a_stats.get('points', 0) == b_stats.get('points', 0) and
        a_stats.get('buchholzScore', 0) == b_stats.get('buchholzScore', 0) and
        a_stats.get('strengthOfSchedule', 0) == b_stats.get('strengthOfSchedule', 0) and
        a_stats.get('frameDifference', 0) == b_stats.get('frameDifference', 0) and
        a_stats.get('framesWon', 0) == b_stats.get('framesWon', 0)
    )


@tree.command(name='standings', description='Show current league standings')
@app_commands.describe(tier='Tier to show (for tiered leagues only)')
async def standings(interaction: discord.Interaction, tier: str = None):
    await interaction.response.defer()

    try:
        data, _ = await github.get_league_data()
        _, league_data = get_active_league(data)

        if not league_data:
            await interaction.followup.send("No active league found.")
            return

        league_name = league_data.get("league", {}).get("name", "League")

        if is_tiered_league(league_data):
            await send_tiered_standings(interaction, league_data, league_name, tier)
        else:
            await send_swiss_standings(interaction, league_data, league_name)

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


async def send_swiss_standings(interaction, league_data, league_name):
    """Send Swiss format standings."""
    players = get_standings(league_data)

    ranks = []
    current_rank = 1
    for i, player in enumerate(players):
        if i == 0:
            ranks.append(current_rank)
        elif are_players_tied(players[i - 1], player):
            ranks.append(current_rank)
        else:
            current_rank = i + 1
            ranks.append(current_rank)

    formatted_names = [
        format_player_name(interaction.guild, p['name'])
        for p in players
    ]

    max_name = max(len(n) for n in formatted_names) if formatted_names else 10

    header = f"{'#':<4} {'Player':<{max_name}}  {'Pts':>3}  {'W-L':>5}  {'Frames':>7}"
    separator = "-" * len(header)

    lines = [
        f"**{league_name} Standings**",
        f"```",
        header,
        separator
    ]

    for i, player in enumerate(players):
        stats = player['stats']
        rank = ranks[i]
        name = formatted_names[i]
        is_tied = (
            (i > 0 and ranks[i - 1] == rank) or
            (i < len(ranks) - 1 and ranks[i + 1] == rank)
        )
        rank_str = f"T{rank}" if is_tied else str(rank)
        wl = f"{stats['matchesWon']}-{stats['matchesLost']}"
        frames = f"{stats['framesWon']}-{stats['framesLost']}"

        lines.append(
            f"{rank_str:<4} {name:<{max_name}}  {stats['points']:>3}  {wl:>5}  {frames:>7}"
        )

    lines.append("```")
    lines.append("\nFull standings: https://austinio7116.github.io/swissleague/display/")
    await interaction.followup.send('\n'.join(lines))


async def send_tiered_standings(interaction, league_data, league_name, tier_filter=None):
    """Send tiered round-robin standings."""
    tier_config = league_data.get("league", {}).get("tierConfig", {})
    tiers = tier_config.get("tiers", [])
    promotion_count = tier_config.get("promotionCount", 2)
    season = league_data.get("league", {}).get("currentSeason", 1)

    all_standings = get_all_tier_standings(league_data)

    # Filter to specific tier if requested
    if tier_filter:
        matching = [t for t in tiers if t.lower() == tier_filter.lower()]
        if not matching:
            await interaction.followup.send(
                f"Tier '{tier_filter}' not found. Available tiers: {', '.join(tiers)}"
            )
            return
        tiers = matching

    lines = [f"**{league_name} - Season {season} Standings**\n"]

    for t_idx, tier_name in enumerate(tiers):
        players = all_standings.get(tier_name, [])
        if not players:
            continue

        formatted_names = [
            format_player_name(interaction.guild, p['name'])
            for p in players
        ]
        max_name = max(len(n) for n in formatted_names) if formatted_names else 10

        header = f"{'#':<4} {'Player':<{max_name}}  {'Pts':>3}  {'W-L':>5}  {'F+/-':>4}"
        separator = "-" * len(header)

        lines.append(f"**{tier_name}**")
        lines.append("```")
        lines.append(header)
        lines.append(separator)

        is_top_tier = tier_name == tier_config.get("tiers", [None])[0]
        is_bottom_tier = tier_name == tier_config.get("tiers", [None])[-1]

        for i, player in enumerate(players):
            stats = player['stats']
            name = formatted_names[i]
            wl = f"{stats['matchesWon']}-{stats['matchesLost']}"
            diff = stats['frameDifference']
            diff_str = f"+{diff}" if diff > 0 else str(diff)

            # Mark promotion/relegation zones
            marker = " "
            if not is_top_tier and i < promotion_count:
                marker = "^"  # promotion
            elif not is_bottom_tier and i >= len(players) - promotion_count:
                marker = "v"  # relegation

            lines.append(
                f"{i+1:<4} {name:<{max_name}}  {stats['points']:>3}  {wl:>5}  {diff_str:>4} {marker}"
            )

        lines.append("```")

    lines.append("^ = promotion zone, v = relegation zone")
    lines.append("\nFull standings: https://austinio7116.github.io/swissleague/display/")
    await interaction.followup.send('\n'.join(lines))


@tree.command(name='matches', description='Show your pending matches')
async def my_matches(interaction: discord.Interaction):
    await interaction.response.defer()

    try:
        data, _ = await github.get_league_data()
        _, league_data = get_active_league(data)

        if not league_data:
            await interaction.followup.send("No active league found.")
            return

        players = league_data.get("players", [])

        # Find player (exact match only)
        username = interaction.user.name
        display_name = interaction.user.display_name
        player = find_player_by_name_exact(players, username)
        if not player:
            await interaction.followup.send(
                f"Could not find player '{username}' in the league.\n"
                f"(Your display name: {display_name})"
            )
            return

        # Find pending matches
        pending = find_pending_matches_for_player(league_data, player['id'])

        # Show both username and display name for clarity
        name_display = f"{player['name']}"
        if display_name != username:
            name_display += f" ({display_name})"

        if not pending:
            await interaction.followup.send(f"No pending matches for {name_display}.")
            return

        tiered = is_tiered_league(league_data)
        player_tier = player.get("tier") if tiered else None
        tier_label = f" [{player_tier}]" if player_tier else ""

        lines = [f"**Pending matches for {name_display}{tier_label}**\n"]
        for m in pending:
            opponent_display = format_player_name(interaction.guild, m['opponent'])
            lines.append(f"Round {m['round']}: vs **{opponent_display}**")

        await interaction.followup.send('\n'.join(lines))

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


@tree.command(name='fixtures', description='Show all outstanding fixtures')
async def fixtures(interaction: discord.Interaction):
    await interaction.response.defer()

    try:
        data, _ = await github.get_league_data()
        _, league_data = get_active_league(data)

        if not league_data:
            await interaction.followup.send("No active league found.")
            return

        pending = find_all_pending_matches(league_data)

        if not pending:
            await interaction.followup.send("No outstanding fixtures.")
            return

        league_name = league_data.get("league", {}).get("name", "League")
        tiered = is_tiered_league(league_data)

        # Group by round
        rounds = {}
        for m in pending:
            rounds.setdefault(m["round"], []).append(m)

        lines = [f"**{league_name} - Outstanding Fixtures**\n"]

        for round_num in sorted(rounds.keys()):
            matches = rounds[round_num]
            lines.append(f"**Round {round_num}**")

            if tiered:
                # Group by tier within each round
                by_tier = {}
                for m in matches:
                    tier = m.get("player1_tier") or "Unknown"
                    by_tier.setdefault(tier, []).append(m)
                for tier_name in sorted(by_tier.keys()):
                    lines.append(f"  *{tier_name}*")
                    for m in by_tier[tier_name]:
                        p1 = format_player_name(interaction.guild, m["player1"])
                        if m.get("is_bye"):
                            lines.append(f"    {p1} - BYE")
                        else:
                            p2 = format_player_name(interaction.guild, m["player2"])
                            lines.append(f"    {p1} vs {p2}")
            else:
                for m in matches:
                    p1 = format_player_name(interaction.guild, m["player1"])
                    if m.get("is_bye"):
                        lines.append(f"  {p1} - BYE")
                    else:
                        p2 = format_player_name(interaction.guild, m["player2"])
                        lines.append(f"  {p1} vs {p2}")

            lines.append("")

        await interaction.followup.send('\n'.join(lines))

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


@tree.command(name='pizza', description='Get a random pizza image')
async def pizza(interaction: discord.Interaction):
    # Find all pizza images in the images folder
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pattern = os.path.join(script_dir, 'images', 'pizza*.png')
    pizza_images = glob.glob(pattern)

    if not pizza_images:
        await interaction.response.send_message("No pizza images found!")
        return

    # Select a random pizza image
    chosen_pizza = random.choice(pizza_images)
    await interaction.response.send_message(file=discord.File(chosen_pizza))


@tree.command(name='cointoss', description='Flip a coin and call it!')
@app_commands.describe(call='Your call - heads or tails')
@app_commands.choices(call=[
    app_commands.Choice(name='heads', value='heads'),
    app_commands.Choice(name='tails', value='tails'),
])
async def cointoss(interaction: discord.Interaction, call: app_commands.Choice[str]):
    # Flip the coin (using secrets for true randomness)
    result = secrets.choice(['heads', 'tails'])
    user_call = call.value
    won = (user_call == result)

    # Get the appropriate image
    script_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(script_dir, 'images', f'{result}.png')

    if not os.path.exists(image_path):
        await interaction.response.send_message(f"Image not found for {result}!")
        return

    # Build result message
    outcome = "You win!" if won else "You lose!"

    # Create embed with thumbnail for smaller image
    embed = discord.Embed(
        title=f"You called {user_call}...",
        description=f"**{result.capitalize()} - {outcome}**",
        color=discord.Color.green() if won else discord.Color.red()
    )
    embed.set_thumbnail(url=f"attachment://{result}.png")

    await interaction.response.send_message(embed=embed, file=discord.File(image_path, filename=f"{result}.png"))


@client.event
async def on_ready():
    print(f'Bot is ready! Logged in as {client.user}')
    # Sync commands with Discord
    await tree.sync()
    print('Commands synced!')


def main():
    if not DISCORD_TOKEN:
        print('Error: DISCORD_TOKEN environment variable not set')
        return
    if not GITHUB_TOKEN:
        print('Error: GITHUB_TOKEN environment variable not set')
        return

    max_retries = 5
    base_delay = 10  # seconds
    for attempt in range(max_retries):
        try:
            client.run(DISCORD_TOKEN)
            break  # Clean shutdown
        except discord.errors.HTTPException as e:
            if e.status == 429:
                delay = base_delay * (2 ** attempt)
                print(f'Rate limited by Discord (attempt {attempt + 1}/{max_retries}). Retrying in {delay}s...')
                time.sleep(delay)
            else:
                raise
    else:
        print(f'Failed to connect after {max_retries} attempts. Exiting.')


if __name__ == '__main__':
    main()
