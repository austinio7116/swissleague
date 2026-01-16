"""
Discord bot for Swiss League result submission.
Allows players to submit match results via slash commands.
"""

import discord
from discord import app_commands
import aiohttp
import base64
import json
import os

from league import (
    find_player_by_name,
    find_pending_match,
    find_pending_matches_for_player,
    apply_match_result,
    get_standings,
    parse_frame_score,
    validate_frame_scores,
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


@tree.command(name='result', description='Submit a match result')
@app_commands.describe(
    opponent='Your opponent (their Discord username or display name)',
    frame1='Frame 1 score (your-score-opponent-score, e.g. 63-45)',
    frame2='Frame 2 score (e.g. 52-60)',
    frame3='Frame 3 score (e.g. 71-38)',
    frame4='Frame 4 score (optional)',
    frame5='Frame 5 score (optional)'
)
async def submit_result(
    interaction: discord.Interaction,
    opponent: str,
    frame1: str,
    frame2: str,
    frame3: str,
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

        # Find submitter by Discord display name
        submitter_name = interaction.user.name
        submitter, _ = find_player_by_name(players, submitter_name)
        if not submitter:
            await interaction.followup.send(
                f"Could not find player '{submitter_name}' in the league. "
                f"Your Discord display name must match your league name exactly."
            )
            return

        # Find opponent
        opponent_player, _ = find_player_by_name(players, opponent)
        if not opponent_player:
            await interaction.followup.send(
                f"Could not find opponent '{opponent}' in the league."
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
        frame_strs = [frame1, frame2, frame3]
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

        # Validate frame scores
        is_valid, error = validate_frame_scores(frames)
        if not is_valid:
            await interaction.followup.send(f"Invalid frame scores: {error}")
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

        # Find max name length for padding
        max_name = max(len(p['name']) for p in players) if players else 10

        # Build table
        header = f"{'#':<3} {'Player':<{max_name}}  {'Pts':>3}  {'W-L':>5}  {'Frames':>7}  {'+/-':>4}"
        separator = "-" * len(header)

        lines = [
            f"**{league_name} Standings**",
            f"```",
            header,
            separator
        ]

        for i, player in enumerate(players, 1):
            stats = player['stats']
            wl = f"{stats['matchesWon']}-{stats['matchesLost']}"
            frames = f"{stats['framesWon']}-{stats['framesLost']}"
            diff = stats['frameDifference']
            diff_str = f"+{diff}" if diff > 0 else str(diff)

            lines.append(
                f"{i:<3} {player['name']:<{max_name}}  {stats['points']:>3}  {wl:>5}  {frames:>7}  {diff_str:>4}"
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

        # Find player
        username = interaction.user.name
        display_name = interaction.user.display_name
        player, _ = find_player_by_name(players, username)
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
            lines.append(f"Round {m['round']}: vs **{m['opponent']}**")

        await interaction.followup.send('\n'.join(lines))

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


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
