# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Swiss-format Snooker league management system with three components:
1. **Admin Interface** (`admin/`) - Browser-based league management (vanilla JS)
2. **Display Interface** (`display/`) - Public viewing of standings/matches (vanilla JS)
3. **Discord Bot & CLI** (`discord-bot/`) - Player self-service result submission (Python)

## Development Commands

### Discord Bot (Python)
```bash
cd discord-bot
pip install -r requirements.txt
python bot.py                    # Run Discord bot (requires env vars)
python cli.py "Player1 Vs Player2 2-1 63-45 52-60 71-38"  # Enter result via CLI
python cli.py "..." --dev        # Skip git commit (testing)
```

### Web Interfaces (No build step)
Open `admin/index.html` or `display/index.html` directly in browser.

### Environment Variables (Discord Bot)
- `DISCORD_TOKEN` - Discord bot token
- `GITHUB_TOKEN` - GitHub PAT with Contents write access
- `GITHUB_REPO` - Repository (default: `austinio7116/swissleague`)
- `LEAGUE_FILE_PATH` - Data file path (default: `data/league.json`)

## Architecture

### Data Flow
- Admin creates leagues/rounds via browser UI -> saves to localStorage
- Admin exports JSON -> commits to `data/league.json` in GitHub
- Display fetches from GitHub raw URL or localStorage
- Discord bot reads/writes directly to GitHub via API

### Multi-League Data Format
```json
{
  "leagues": { "league-id": { "league": {...}, "players": [...], "rounds": [...] } },
  "currentLeagueId": "...",
  "metadata": { "version": "2.0" }
}
```

### Key Modules

**Admin JS Modules** (`admin/modules/`):
- `swiss-pairing.js` - Core pairing algorithm: sorts by standings, avoids repeat matchups, assigns byes to lowest-ranked players
- `scoring.js` - Frame-by-frame score entry with match completion detection
- `storage.js` - localStorage management with multi-league support
- `rounds.js` - Round generation and advancement

**Discord Bot Python** (`discord-bot/`):
- `league.py` - Shared logic: `apply_match_result()` recalculates all player stats from scratch using two-pass approach (basic stats, then SOS/Buchholz)
- `bot.py` - Discord slash commands: `/result`, `/standings`, `/matches`
- `cli.py` - Interactive CLI with fuzzy player name matching

### Shared Constants (`shared/constants.js`)
- `STORAGE_KEYS` - localStorage keys for leagues, settings, backups
- `MAX_FRAME_SCORE` - 147 (maximum snooker break)
- `POINTS` - WIN: 1, LOSS: 0, BYE: 1

### Stats Calculation
Player stats are recalculated from match history on every result submission:
- Pass 1: matchesPlayed/Won/Lost, framesWon/Lost, points
- Pass 2: Strength of Schedule (opponent win rates), Buchholz Score (opponent points sum)

### Standings Sort Order
1. Points (desc)
2. Buchholz Score (desc)
3. Strength of Schedule (desc)
4. Frame difference (desc)
5. Frames won (desc)
6. Name (alphabetical)

## Critical: Production Data

**`data/league.json` is production data.** Changes committed to main branch are immediately live:
- The Display interface fetches directly from GitHub raw URL
- The Discord bot reads/writes via GitHub API
- There is no staging environment

Exercise extreme caution when modifying this file. Always verify changes before committing.

## Important Constraints

- Discord bot uses **exact name matching** only (security) - player Discord username must match league name exactly
- Frame scores validated: 0-147 range, no ties allowed
- Swiss pairing avoids repeat matchups when possible, allows them if necessary
- Bye goes to lowest-ranked player who hasn't had one
