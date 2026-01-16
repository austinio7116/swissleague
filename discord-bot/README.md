# Swiss League Tools

This folder contains both the Discord bot and CLI tool for managing league results.
Both tools share the same core logic in `league.py` for consistent stats calculation.

## Files

- `bot.py` - Discord bot for player self-service result submission
- `cli.py` - Command line tool for manual result entry
- `league.py` - Shared logic (stats calculation, match updates, validation)

## Discord Bot Commands

- `/result @opponent 63-45 52-60 71-38` - Submit a match result (your scores first)
- `/standings` - View current league standings
- `/matches` - View your pending matches

## Setup Guide

### Step 1: Create a Discord Application & Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name (e.g., "Swiss League Bot")
3. Go to the **Bot** section in the left sidebar
4. Click **Reset Token** and copy the token - save this as `DISCORD_TOKEN`
5. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** (needed to look up member names)
6. Click **Save Changes**

### Step 2: Generate Bot Invite Link

1. Go to **OAuth2 > URL Generator** in the left sidebar
2. Under **Scopes**, select:
   - `bot`
   - `applications.commands`
3. Under **Bot Permissions**, select:
   - Send Messages
   - Use Slash Commands
4. Copy the generated URL at the bottom

### Step 3: Invite Bot to Your Server

1. **You need to be the server owner or have "Manage Server" permission**
2. Open the URL from Step 2 in your browser
3. Select your Discord server from the dropdown
4. Click **Authorize**

### Step 4: Create GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token**
3. Give it a name (e.g., "Swiss League Bot")
4. Set expiration (recommend 90 days, you'll need to renew)
5. Under **Repository access**, select **Only select repositories** and choose `austinio7116/swissleague`
6. Under **Permissions > Repository permissions**:
   - **Contents**: Read and write
7. Click **Generate token** and copy it - save this as `GITHUB_TOKEN`

### Step 5: Deploy the Bot

#### Option A: Railway.app (Recommended - Free Tier)

1. Go to [Railway.app](https://railway.app/) and sign in with GitHub
2. Click **New Project > Deploy from GitHub repo**
3. Select this repository
4. Railway will auto-detect Python - set the **Root Directory** to `discord-bot`
5. Go to **Variables** tab and add:
   - `DISCORD_TOKEN` = your Discord bot token
   - `GITHUB_TOKEN` = your GitHub PAT
   - `GITHUB_REPO` = `austinio7116/swissleague`
   - `LEAGUE_FILE_PATH` = `data/league.json`
6. Deploy! Railway will keep the bot running 24/7

#### Option B: Fly.io (Free Tier)

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. Run `fly auth login`
3. In the `discord-bot` directory, run:
   ```bash
   fly launch --no-deploy
   ```
4. Set secrets:
   ```bash
   fly secrets set DISCORD_TOKEN=your_token
   fly secrets set GITHUB_TOKEN=your_token
   fly secrets set GITHUB_REPO=austinio7116/swissleague
   fly secrets set LEAGUE_FILE_PATH=data/league.json
   ```
5. Create a `fly.toml` if not auto-generated:
   ```toml
   app = "swissleague-bot"
   primary_region = "lhr"

   [build]
     builder = "paketobuildpacks/builder:base"

   [env]
     PORT = "8080"
   ```
6. Deploy: `fly deploy`

#### Option C: Run Locally (for testing)

1. Clone this repo
2. Create a `.env` file from `.env.example` and fill in your tokens
3. Install dependencies:
   ```bash
   cd discord-bot
   pip install -r requirements.txt
   ```
4. Run:
   ```bash
   python bot.py
   ```
   Or with env file:
   ```bash
   export $(cat .env | xargs) && python bot.py
   ```

## How It Works

1. Player uses `/result` command with their opponent and frame scores
2. Bot validates:
   - Submitter's Discord display name matches a player in the league
   - Opponent exists in the league
   - A pending match exists between them
3. Bot fetches `league.json` from GitHub via API
4. Bot updates the match data with results
5. Bot commits the change to GitHub
6. GitHub Pages automatically rebuilds with new data

## Important Notes

- **Player names must match Discord display names exactly** (case-insensitive)
- Frame scores are entered as `your-score-opponent-score` (e.g., `63-45` means you scored 63, opponent scored 45)
- Only pending matches can have results submitted
- The bot commits directly to the main branch

## Troubleshooting

**"Could not find player in the league"**
- Your Discord display name (nickname in the server, or username if no nickname) must match your player name in the league exactly

**"No pending match found"**
- The match may already be completed, or there's no scheduled match between you and that opponent

**Commands not showing up**
- Wait a few minutes for Discord to sync slash commands
- Try kicking and re-inviting the bot

## CLI Tool Usage

For manual result entry (run from the repo root):

```bash
cd discord-bot
python cli.py "player1 Vs player2 2-1 63-45 52-60 71-38"
```

Options:
- `--dev` - Skip git commit (for testing)

The CLI uses fuzzy matching for player names, shows a preview, and asks for confirmation before applying.

## Security

- GitHub token is stored only on the bot host as an environment variable
- Token has minimal permissions (only Contents write on this specific repo)
- Bot validates that the command user is a participant in the match
