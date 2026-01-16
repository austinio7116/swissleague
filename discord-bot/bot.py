import discord
from discord import app_commands
import aiohttp
import base64
import json
import os
import re
from datetime import datetime

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
    """Handle GitHub API interactions"""

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
        """Fetch current league.json from GitHub"""
        async with aiohttp.ClientSession() as session:
            async with session.get(self.base_url, headers=self.headers) as resp:
                if resp.status != 200:
                    raise Exception(f'GitHub API error: {resp.status}')
                data = await resp.json()
                content = base64.b64decode(data['content']).decode('utf-8')
                return json.loads(content), data['sha']

    async def commit_league_data(self, league_data, sha, message):
        """Commit updated league.json to GitHub"""
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


def find_player_by_name(league_data, name):
    """Find a player by their name (case-insensitive)"""
    name_lower = name.lower()
    for player in league_data.get('players', []):
        if player['name'].lower() == name_lower:
            return player
    return None


def find_pending_match(league_data, player1_id, player2_id):
    """Find a pending match between two players"""
    for round_data in league_data.get('rounds', []):
        for match in round_data.get('matches', []):
            if match.get('status') != 'pending':
                continue
            if match.get('isBye'):
                continue
            # Check if these two players are in this match
            match_players = {match.get('player1Id'), match.get('player2Id')}
            if {player1_id, player2_id} == match_players:
                return match, round_data['roundNumber']
    return None, None


def parse_frame_scores(frame_str):
    """Parse frame scores like '63-45' into (score1, score2)"""
    match = re.match(r'(\d+)-(\d+)', frame_str.strip())
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def update_match_result(league_data, match, player1_id, player2_id, frames):
    """
    Update a match with the result.
    frames: list of (submitter_score, opponent_score) tuples
    player1_id: the player who submitted (their scores are first in each tuple)
    player2_id: opponent
    """
    # Determine which player is player1 in the match data
    match_p1_id = match['player1Id']
    match_p2_id = match['player2Id']

    # Map submitted scores to match player order
    if player1_id == match_p1_id:
        # Submitter is player1 in match
        frame_data = [
            {
                'frameNumber': i + 1,
                'player1Score': f[0],
                'player2Score': f[1],
                'winnerId': match_p1_id if f[0] > f[1] else match_p2_id
            }
            for i, f in enumerate(frames)
        ]
        p1_frames_won = sum(1 for f in frames if f[0] > f[1])
        p2_frames_won = sum(1 for f in frames if f[1] > f[0])
    else:
        # Submitter is player2 in match, swap scores
        frame_data = [
            {
                'frameNumber': i + 1,
                'player1Score': f[1],
                'player2Score': f[0],
                'winnerId': match_p1_id if f[1] > f[0] else match_p2_id
            }
            for i, f in enumerate(frames)
        ]
        p1_frames_won = sum(1 for f in frames if f[1] > f[0])
        p2_frames_won = sum(1 for f in frames if f[0] > f[1])

    # Update match
    match['frames'] = frame_data
    match['player1FramesWon'] = p1_frames_won
    match['player2FramesWon'] = p2_frames_won
    match['winnerId'] = match_p1_id if p1_frames_won > p2_frames_won else match_p2_id
    match['status'] = 'completed'
    match['completedAt'] = datetime.utcnow().isoformat() + 'Z'

    return match


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
        league_data, sha = await github.get_league_data()

        # Find submitter by Discord display name
        submitter_name = interaction.user.display_name
        submitter = find_player_by_name(league_data, submitter_name)
        if not submitter:
            await interaction.followup.send(
                f"Could not find player '{submitter_name}' in the league. "
                f"Your Discord display name must match your league name exactly."
            )
            return

        # Find opponent
        opponent_player = find_player_by_name(league_data, opponent)
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
            parsed = parse_frame_scores(fs)
            if not parsed:
                await interaction.followup.send(
                    f"Invalid frame {i+1} score format: '{fs}'. Use format like '63-45'."
                )
                return
            frames.append(parsed)

        # Update the match
        update_match_result(
            league_data, match,
            submitter['id'], opponent_player['id'],
            frames
        )

        # Calculate result summary
        submitter_frames = sum(1 for f in frames if f[0] > f[1])
        opponent_frames = sum(1 for f in frames if f[1] > f[0])
        winner = submitter['name'] if submitter_frames > opponent_frames else opponent_player['name']

        # Commit to GitHub
        commit_msg = f"{submitter['name']} vs {opponent_player['name']} {submitter_frames}-{opponent_frames}"
        await github.commit_league_data(league_data, sha, commit_msg)

        # Send confirmation
        frame_summary = ' '.join(frame_strs)
        await interaction.followup.send(
            f"**Match Result Recorded**\n"
            f"Round {round_num}: **{submitter['name']}** vs **{opponent_player['name']}**\n"
            f"Frames: {frame_summary}\n"
            f"Result: **{submitter_frames}-{opponent_frames}** - {winner} wins!"
        )

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


@tree.command(name='standings', description='Show current league standings')
async def standings(interaction: discord.Interaction):
    await interaction.response.defer()

    try:
        league_data, _ = await github.get_league_data()

        # Sort players by points, then by wins
        players = sorted(
            league_data.get('players', []),
            key=lambda p: (p['stats']['points'], p['stats']['matchesWon']),
            reverse=True
        )

        # Build standings message
        lines = ['**League Standings**\n']
        for i, player in enumerate(players[:10], 1):
            stats = player['stats']
            lines.append(
                f"{i}. **{player['name']}** - {stats['points']} pts "
                f"({stats['matchesWon']}-{stats['matchesLost']})"
            )

        await interaction.followup.send('\n'.join(lines))

    except Exception as e:
        await interaction.followup.send(f"Error: {str(e)}")


@tree.command(name='matches', description='Show your pending matches')
async def my_matches(interaction: discord.Interaction):
    await interaction.response.defer()

    try:
        league_data, _ = await github.get_league_data()

        # Find player
        player_name = interaction.user.display_name
        player = find_player_by_name(league_data, player_name)
        if not player:
            await interaction.followup.send(
                f"Could not find player '{player_name}' in the league."
            )
            return

        # Find pending matches
        pending = []
        for round_data in league_data.get('rounds', []):
            for match in round_data.get('matches', []):
                if match.get('status') != 'pending':
                    continue
                if match.get('isBye'):
                    continue
                if player['id'] in [match.get('player1Id'), match.get('player2Id')]:
                    opponent_id = (
                        match['player2Id']
                        if match['player1Id'] == player['id']
                        else match['player1Id']
                    )
                    opponent = next(
                        (p for p in league_data['players'] if p['id'] == opponent_id),
                        None
                    )
                    if opponent:
                        pending.append({
                            'round': round_data['roundNumber'],
                            'opponent': opponent['name']
                        })

        if not pending:
            await interaction.followup.send(f"No pending matches for {player['name']}.")
            return

        lines = [f"**Pending matches for {player['name']}**\n"]
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
