"""
Discord bot for Swiss League result submission.
Allows players to submit match results via slash commands.
"""

import discord
from discord import app_commands
import aiohttp
import base64
import glob
import json
import os
import random
import secrets

from league import (
    find_player_by_name_exact,
    find_pending_match,
    find_pending_matches_for_player,
    apply_match_result,
    get_standings,
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
    """Get the first active league from the data."""
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


async def get_username_from_display_name(guild, display_name):
    """
    Look up a Discord member's username from their display name.
    Returns username if found, otherwise None.
    """
    if not guild:
        return None
    # Fetch all members to ensure cache is populated
    async for member in guild.fetch_members(limit=None):
        if member.display_name.lower() == display_name.lower():
            return member.name
    return None


@tree.command(name='result', description='Submit a match result')
@app_commands.describe(
    opponent='Your opponent (their Discord username or display name)',
    frame1='Frame 1 score (your-score-opponent-score, e.g. 63-45)',
    frame2='Frame 2 score (e.g. 52-60)',
    frame3='Frame 3 score (optional, e.g. 71-38)',
    frame4='Frame 4 score (optional)',
    frame5='Frame 5 score (optional)'
)
async def submit_result(
    interaction: discord.Interaction,
    opponent: str,
    frame1: str,
    frame2: str,
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

        # Find submitter by Discord username (exact match only for security)
        submitter_name = interaction.user.name
        submitter = find_player_by_name_exact(players, submitter_name)
        if not submitter:
            await interaction.followup.send(
                f"Could not find player '{submitter_name}' in the league. "
                f"Your Discord username must match your league name exactly."
            )
            return

        # Find opponent - resolve display name to username first (more secure)
        # This ensures opponent is an actual guild member, not arbitrary input
        resolved_username = await get_username_from_display_name(interaction.guild, opponent)

        # Debug logging
        debug_lines = [
            f"**Debug Info:**",
            f"- Opponent input: `{opponent}`",
            f"- Resolved username: `{resolved_username}`",
        ]

        # Show guild members for debugging
        if interaction.guild:
            members_info = []
            async for member in interaction.guild.fetch_members(limit=None):
                members_info.append(f"`{member.name}` (display: `{member.display_name}`)")
            debug_lines.append(f"- Guild members ({len(members_info)}): {', '.join(members_info)}")

        # Show league players
        player_names = [p['name'] for p in players]
        debug_lines.append(f"- League players ({len(player_names)}): {', '.join(f'`{n}`' for n in player_names)}")

        if resolved_username:
            opponent_player = find_player_by_name_exact(players, resolved_username)
            debug_lines.append(f"- Found by resolved username: `{opponent_player['name'] if opponent_player else None}`")
        else:
            # Fallback: try direct match (in case input is already a username)
            opponent_player = find_player_by_name_exact(players, opponent)
            debug_lines.append(f"- Found by direct match: `{opponent_player['name'] if opponent_player else None}`")

        if not opponent_player:
            await interaction.followup.send(
                f"Could not find opponent '{opponent}' in the league.\n\n" +
                "\n".join(debug_lines)
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

        # Parse frame scores
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
        best_of_frames = league_data.get("league", {}).get("bestOfFrames", 3)
        is_valid, error = validate_match_completion(frames, best_of_frames)
        if not is_valid:
            await interaction.followup.send(f"Invalid match result: {error}")
            return

        # Apply the match result (this also recalculates all stats)
        league_data = apply_match_result(
            league_data, match,
            submitter['id'], opponent_player['id'],
            frames
        )

        # Update the data structure
        data["leagues"][league_id] = league_data

        # Calculate result summary for display
        submitter_frames = sum(1 for f in frames if f[0] > f[1])
        opponent_frames = sum(1 for f in frames if f[1] > f[0])
        winner = submitter['name'] if submitter_frames > opponent_frames else opponent_player['name']

        # Commit to GitHub
        commit_msg = f"{submitter['name']} vs {opponent_player['name']} {submitter_frames}-{opponent_frames}"
        await github.commit_league_data(data, sha, commit_msg)

        # Send confirmation
        frame_summary = ' '.join(frame_strs)
        await interaction.followup.send(
            f"**Match Result Recorded**\n"
            f"Round {round_num}: **{submitter['name']}** vs **{opponent_player['name']}**\n"
            f"Frames: {frame_summary}\n"
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
async def standings(interaction: discord.Interaction):
    await interaction.response.defer()

    try:
        data, _ = await github.get_league_data()
        _, league_data = get_active_league(data)

        if not league_data:
            await interaction.followup.send("No active league found.")
            return

        players = get_standings(league_data)  # Full league, no limit
        league_name = league_data.get("league", {}).get("name", "League")

        # Calculate ranks with ties (matching display page logic)
        ranks = []
        current_rank = 1
        for i, player in enumerate(players):
            if i == 0:
                ranks.append(current_rank)
            elif are_players_tied(players[i - 1], player):
                ranks.append(current_rank)  # Tied, same rank
            else:
                current_rank = i + 1  # Not tied, rank = position
                ranks.append(current_rank)

        # Build formatted names with display names
        formatted_names = [
            format_player_name(interaction.guild, p['name'])
            for p in players
        ]

        # Find max name length for padding
        max_name = max(len(n) for n in formatted_names) if formatted_names else 10

        # Build table
        header = f"{'#':<4} {'Player':<{max_name}}  {'Pts':>3}  {'W-L':>5}  {'Frames':>7}  {'+/-':>4}"
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

            # Show "T" prefix for tied ranks
            is_tied = (
                (i > 0 and ranks[i - 1] == rank) or
                (i < len(ranks) - 1 and ranks[i + 1] == rank)
            )
            rank_str = f"T{rank}" if is_tied else str(rank)

            wl = f"{stats['matchesWon']}-{stats['matchesLost']}"
            frames = f"{stats['framesWon']}-{stats['framesLost']}"
            diff = stats['frameDifference']
            diff_str = f"+{diff}" if diff > 0 else str(diff)

            lines.append(
                f"{rank_str:<4} {name:<{max_name}}  {stats['points']:>3}  {wl:>5}  {frames:>7}  {diff_str:>4}"
            )

        lines.append("```")
        lines.append("\nFull standings: https://austinio7116.github.io/swissleague/display/")
        await interaction.followup.send('\n'.join(lines))

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


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

        lines = [f"**Pending matches for {name_display}**\n"]
        for m in pending:
            opponent_display = format_player_name(interaction.guild, m['opponent'])
            lines.append(f"Round {m['round']}: vs **{opponent_display}**")

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

    client.run(DISCORD_TOKEN)


if __name__ == '__main__':
    main()
