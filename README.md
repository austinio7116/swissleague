# Snooker League Management System

A lightweight, browser-based system for managing Snooker leagues. Supports **Tiered Round-Robin** (with promotion/relegation across seasons) and **Swiss** tournament formats. Features separate admin and display interfaces, a Discord bot for player self-service, and data persistence via GitHub.

## League Formats

### Tiered Round-Robin

Players are divided into tiers (e.g. Diamond, Gold, Silver). Each tier plays a full round-robin independently. At the end of each season, top players promote up a tier and bottom players relegate down.

- **Auto-balanced tiers**: If players don't divide evenly, extra players are assigned to top tiers first (e.g. 16 players across 3 tiers = 6, 5, 5)
- **Seasons**: Each season is a complete round-robin within tiers, followed by promotion/relegation
- **Career stats**: Accumulated across seasons
- **Configurable**: Number of tiers, tier names, promotion/relegation count, best-of-N frames

#### Tiered Standings

Players within each tier are ranked by:

| Priority | Criterion | Description |
|----------|-----------|-------------|
| 1st | **Match Points** | 1 for a win, 0 for a loss, 1 for a bye |
| 2nd | **Frame Difference** | Frames won minus frames lost |
| 3rd | **Frames Won** | Total frames won |
| 4th | **Alphabetical** | Name, for display only |

#### Promotion & Relegation

At season end:
- Top N players in each tier (except the highest) promote up one tier
- Bottom N players in each tier (except the lowest) relegate down one tier
- N is configurable (default: 2)

#### Odd-Sized Tiers

When a tier has an odd number of players, one player receives a bye each round (automatic win). The round-robin still covers all matchups — an odd tier of 5 players plays 5 rounds (with one bye per round), while an even tier of 6 plays 5 rounds (no byes).

### Swiss Format

Traditional Swiss-system pairing where players with similar records face each other each round.

- Pairs players by current standings (top vs second, third vs fourth, etc.)
- Avoids repeat matchups when possible (allows them if necessary)
- Bye goes to lowest-ranked player who hasn't had one
- Configurable number of rounds and best-of-N frames

#### Swiss Standings

| Priority | Criterion | Description |
|----------|-----------|-------------|
| 1st | **Match Points** | 1 for a win, 0 for a loss |
| 2nd | **Buchholz Score** | Sum of all opponents' match points — higher means tougher opposition |
| 3rd | **Strength of Schedule** | Average win rate of opponents (shown as %) |
| 4th | **Frame Difference** | Frames won minus frames lost |
| 5th | **Frames Won** | Total frames won |
| 6th | **Alphabetical** | Name, for display only |

**Tied Rankings:** When players are equal on all statistical criteria, they share the same rank (shown as "T1", "T2", etc.).

## Components

### Admin Interface (`admin/`)
- Create and configure leagues (tiered or Swiss)
- Manage players, generate rounds, enter results
- Drag-and-drop player ranking for tier distribution
- Season management with promotion/relegation preview
- JSON export/import, local storage persistence

### Display Interface (`display/`)
- Public standings, matches, and statistics
- Tier-grouped views for tiered leagues
- Loads data from GitHub raw URL or local storage
- Responsive design, print-friendly

### Discord Bot (`discord-bot/`)
- `/result` — Players submit their own match results
- `/standings` — View current standings (with optional tier filter)
- `/matches` — View outstanding matches
- Reads/writes directly to GitHub via API
- CLI tool for admin result entry with fuzzy name matching

## Quick Start

### 1. Clone

```bash
git clone https://github.com/austinio7116/swissleague.git
cd swissleague
```

### 2. Web Interfaces

No build step — open `admin/index.html` or `display/index.html` directly in a browser.

For public access, deploy to GitHub Pages:
1. Enable GitHub Pages in repository settings
2. Select `main` branch and `/ (root)` folder

### 3. Discord Bot

```bash
cd discord-bot
pip install -r requirements.txt
python bot.py                    # Run Discord bot (requires env vars)
python cli.py "Player1 Vs Player2 2-1 63-45 52-60 71-38"  # CLI result entry
python cli.py "..." --dev        # Skip git commit (testing)
```

**Environment variables:**
- `DISCORD_TOKEN` — Discord bot token
- `GITHUB_TOKEN` — GitHub PAT with Contents write access
- `GITHUB_REPO` — Repository (default: `austinio7116/swissleague`)
- `LEAGUE_FILE_PATH` — Data file path (default: `data/league.json`)

## Usage Workflow

### Tiered Round-Robin

1. **Create league** — Choose tiered format, set number of tiers, tier names, players per tier, promotion count
2. **Add players** — Add all players, rank them by skill (drag to reorder)
3. **Distribute to tiers** — Click distribute; tiers auto-balance if players don't divide evenly
4. **Play season** — Generate rounds, enter results (or players submit via Discord)
5. **End season** — Review promotion/relegation preview, start new season
6. **Repeat** — Players move between tiers, career stats accumulate

### Swiss

1. **Create league** — Choose Swiss format, set rounds and best-of frames
2. **Add players**
3. **Generate rounds** — System pairs players by standings each round
4. **Enter results** — Frame-by-frame or match scores
5. **Publish** — Export JSON and commit to GitHub

## Data Model

Multi-league format stored in `data/league.json`:

```json
{
  "leagues": {
    "league-id": {
      "league": {
        "id": "league-id",
        "name": "League Name",
        "format": "tiered-round-robin",
        "bestOfFrames": 3,
        "currentRound": 1,
        "totalRounds": 5,
        "currentSeason": 1,
        "tierConfig": {
          "tiers": ["Diamond", "Gold", "Silver"],
          "tierSizes": [6, 5, 5],
          "playersPerTier": 6,
          "promotionCount": 2
        }
      },
      "players": [...],
      "rounds": [...],
      "seasons": [...]
    }
  },
  "currentLeagueId": "league-id",
  "metadata": { "version": "2.0" }
}
```

**Important:** `data/league.json` is production data. Changes committed to main are immediately live — the display interface and Discord bot read from it directly.

## Project Structure

```
swissleague/
├── admin/                      # Admin interface
│   ├── index.html
│   ├── app.js
│   ├── modules/
│   │   ├── league.js           # League creation (Swiss + Tiered)
│   │   ├── tier-manager.js     # Tier distribution, promotion/relegation
│   │   ├── tiered-views.js     # Tiered league UI components
│   │   ├── round-robin-pairing.js  # Circle-method round-robin
│   │   ├── swiss-pairing.js    # Swiss pairing algorithm
│   │   ├── rounds.js           # Round generation
│   │   ├── scoring.js          # Score entry
│   │   ├── players.js          # Player management
│   │   └── storage.js          # Local storage
│   └── utils/
├── display/                    # Public display interface
│   ├── index.html
│   ├── app.js
│   └── modules/
│       ├── standings.js        # Standings (Swiss + Tiered)
│       ├── matches.js          # Match display
│       ├── player-modal.js     # Player detail modal
│       └── data-loader.js      # GitHub data fetching
├── discord-bot/                # Discord bot + CLI
│   ├── bot.py                  # Discord slash commands
│   ├── cli.py                  # CLI result entry
│   └── league.py               # Shared league logic
├── shared/
│   └── constants.js            # Shared constants
├── data/
│   └── league.json             # Production league data
└── README.md
```

## Configuration

### Scoring

- **Match Win**: 1 point
- **Match Loss**: 0 points
- **Bye**: 1 point (automatic win)
- **Best-of-N**: Configurable (3, 5, 7, 9, 11 frames)
- **Frame scores**: Optionally track individual frame point scores (0-147 range)

### Tiered League Defaults

- Players per tier: 6
- Promotion/relegation count: 2
- Minimum players per tier: 3
- Maximum tiers: 6

## Backup and Recovery

- Admin auto-saves to browser local storage
- Export JSON after each round for manual backup
- Import JSON to restore state
- Discord bot commits results directly to GitHub

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Display shows old data | Hard refresh (`Ctrl+F5` / `Cmd+Shift+R`) |
| Admin data lost | Import most recent JSON backup |
| Round generation fails | Ensure all current round matches are completed |
| GitHub Pages not updating | Wait 1-5 minutes, then clear browser cache |
| Discord bot wrong league | Check `currentLeagueId` in `data/league.json` |

## License

This project is provided as-is for personal and recreational use.
