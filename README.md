# Swiss-Format Snooker League Management System

A lightweight, browser-based system for managing Snooker leagues using the Swiss tournament format. Features separate admin and display interfaces, with data persistence via local storage and GitHub Pages deployment.

## ✨ New in Version 2.0

- **🎱 Snooker Score Points**: Main standings table now includes Points For, Points Against, and Points +/- columns
- **🏆 Multiple League Support**: Create and manage multiple independent leagues simultaneously
- **📊 Cross-League Statistics**: Track player performance across all leagues
- **🔄 League Selector**: Easy switching between active and completed leagues
- **💾 Dual Data Sources**: Display interface supports both GitHub URLs and local storage

👉 **[See the Multi-League Guide](MULTI_LEAGUE_GUIDE.md) for complete details on new features**

## Features

### Admin Interface
- 🏆 Create and configure multiple leagues with customizable best-of-N frames
- 🔄 Switch between leagues and view cross-league statistics
- 👥 Manage players (add, edit, deactivate)
- 🎯 Automatic Swiss-format pairing generation
- 📊 Frame-by-frame score entry with snooker points tracking
- 💾 Multi-league local storage persistence
- 📤 JSON export/import for backup and portability
- ♿ Responsive design for desktop and tablet use

### Display Interface
- 📈 Live standings table with sortable columns including snooker points
- 🎮 Outstanding matches view
- 📜 Complete match history
- 📊 Detailed player statistics
- 🔄 Loads data from GitHub repository OR local storage
- 📱 Fully responsive for all devices
- 🖨️ Print-friendly styling

### Swiss Pairing Algorithm
- Pairs players with similar standings (top vs second, third vs fourth, etc.)
- Avoids repeat matchups when possible (allows them only if necessary)
- Bye goes to lowest-ranked player who hasn't had one yet
- Transparent pairing logic with explanations

## How Standings & Pairing Work

This section explains how player rankings are determined and how match pairings are generated. Understanding these helps you see why you're ranked where you are and who you might play next.

### How Your Ranking is Calculated

Players are ranked using six criteria, checked in order. If two players are tied on one criterion, the next one is used to break the tie:

| Priority | Criterion | What It Means |
|----------|-----------|---------------|
| 1st | **Match Points** | 1 point for a win, 0 for a loss. The most important factor. |
| 2nd | **Buchholz Score** | The total match points of all your opponents added together. If you played tougher opponents, this number is higher. |
| 3rd | **Strength of Schedule (SOS)** | The average win rate of your opponents. Shown as a percentage (e.g., 66% means your opponents win 2/3 of their matches on average). |
| 4th | **Frame Difference** | Frames won minus frames lost. Winning 3-0 is better than winning 3-2. |
| 5th | **Frames Won** | Total frames won across all matches. |
| 6th | **Alphabetical** | If still tied after all the above, sorted by name for display - but NOT used when considering ranking - replaced with random for pairing next round. |

**Example:** Two players both have 4 match points. Player A faced opponents who have a combined 12 points (Buchholz = 12). Player B faced opponents with a combined 8 points (Buchholz = 8). Player A ranks higher because they played tougher competition.

**Tied Rankings:** When players are equal on all five statistical criteria, they share the same rank (shown as "T1", "T2", etc. for tied positions).

### How Match Pairings Work

Each round, the system generates pairings using the **Swiss format**:

1. **Sort by Standings** - All active players are ranked using the criteria above
2. **Pair Top-to-Bottom** - The highest-ranked player plays the second-highest, third plays fourth, and so on
3. **Avoid Repeat Matchups** - If two players have already played each other, the system tries to find a different opponent nearby in the standings
4. **Allow Repeats if Necessary** - In later rounds or small leagues, repeat matchups may be unavoidable (marked with a warning)
5. **Assign Bye** - If there's an odd number of players, the lowest-ranked player who hasn't had a bye yet receives one (automatic win, 1 point)

**Why This Matters:** Swiss pairing ensures you play opponents of similar skill level. Early rounds may feel random (everyone starts at 0 points), but as the league progresses, you'll face players with similar records.

## Quick Start

### 1. Clone or Download

```bash
git clone https://github.com/yourusername/swissleague.git
cd swissleague
```

### 2. Deploy to GitHub Pages

1. Create a new repository on GitHub
2. Push this code to your repository
3. Enable GitHub Pages in repository settings
4. Select `main` branch and `/ (root)` folder

### 3. Access the Interfaces

**Admin Interface (for league management):**
```
https://yourusername.github.io/swissleague/admin/
```

**Display Interface (for public viewing):**
```
https://yourusername.github.io/swissleague/display/
```

## Usage Workflow

### Step 1: Create League (Admin Interface)

1. Open the admin interface
2. Click "Create New League"
3. Enter league details:
   - League name
   - Best of frames (3, 5, 7, or 9)
   - Total rounds (typically 7 for Swiss)
4. Add all players to the league

### Step 2: Generate Rounds

1. Click "Generate Next Round"
2. Review the proposed pairings
3. Confirm to create the round
4. Players receive their match assignments

### Step 3: Enter Results

1. After matches are played, select each match
2. Enter frame-by-frame scores
3. System automatically determines winners
4. Repeat for all matches in the round

### Step 4: Publish Data

1. Click "Export JSON" in admin interface
2. Save the file as `league-data.json`
3. Copy to the `data/` directory
4. Commit and push to GitHub:
   ```bash
   git add data/league-data.json
   git commit -m "Update: Round X results"
   git push origin main
   ```

### Step 5: View Public Display

1. Share the display interface URL with participants
2. Display automatically loads latest data from GitHub
3. Participants can view:
   - Current standings
   - Their upcoming matches
   - Match history and statistics

## Project Structure

```
swissleague/
├── admin/                      # Admin interface
│   ├── index.html             # Main admin page
│   ├── styles.css             # Admin styling
│   ├── app.js                 # Main application logic
│   ├── modules/               # Feature modules
│   │   ├── league.js          # League management
│   │   ├── players.js         # Player management
│   │   ├── rounds.js          # Round generation
│   │   ├── scoring.js         # Score entry
│   │   ├── swiss-pairing.js   # Pairing algorithm
│   │   └── storage.js         # Local storage handling
│   └── utils/                 # Utility functions
│       ├── validation.js      # Input validation
│       └── helpers.js         # Helper functions
│
├── display/                    # Display interface
│   ├── index.html             # Main display page
│   ├── styles.css             # Display styling
│   ├── app.js                 # Display application logic
│   ├── modules/               # Display modules
│   │   ├── standings.js       # Standings table
│   │   ├── matches.js         # Match displays
│   │   ├── statistics.js      # Player statistics
│   │   └── data-loader.js     # GitHub data fetching
│   └── utils/                 # Utility functions
│       └── helpers.js         # Helper functions
│
├── data/                       # League data storage
│   └── league-data.json       # Current league state
│
├── plans/                      # Planning documents
│   ├── architecture.md        # System architecture
│   ├── technical-specification.md  # Technical details
│   └── deployment-guide.md    # Deployment instructions
│
├── README.md                   # This file
└── .gitignore                 # Git ignore rules
```

## Data Model

The system uses a JSON data structure to represent the complete league state:

```json
{
  "league": {
    "id": "uuid",
    "name": "League Name",
    "format": "swiss",
    "bestOfFrames": 5,
    "currentRound": 1,
    "totalRounds": 7
  },
  "players": [
    {
      "id": "uuid",
      "name": "Player Name",
      "active": true,
      "stats": {
        "matchesPlayed": 0,
        "matchesWon": 0,
        "framesWon": 0,
        "framesLost": 0,
        "points": 0,
        "frameDifference": 0
      }
    }
  ],
  "rounds": [
    {
      "roundNumber": 1,
      "status": "completed",
      "matches": [...]
    }
  ],
  "pairingHistory": []
}
```

See [`plans/architecture.md`](plans/architecture.md) for complete data model documentation.

## Swiss Format Rules

### Scoring System

- **Match Win**: 1 point
- **Match Loss**: 0 points
- **Bye**: 1 point (automatic win for odd-numbered leagues)

### Tiebreakers

See [How Your Ranking is Calculated](#how-your-ranking-is-calculated) above for the full tiebreaker order: Buchholz, Strength of Schedule, Frame Difference, Frames Won.

### Best-of-N Frames

- Configurable: 3, 5, 7, or 9 frames
- Winner determined when reaching majority (e.g., 3 frames in best-of-5)
- All frame scores recorded for statistics

## Technical Details

### Technologies Used

- **HTML5**: Semantic markup
- **CSS3**: Responsive design with flexbox/grid
- **Vanilla JavaScript (ES6+)**: No frameworks required
- **Local Storage API**: Client-side data persistence
- **Fetch API**: Loading data from GitHub
- **GitHub Pages**: Free static hosting

### Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance

- Handles leagues up to 100 players
- Optimized pairing algorithm
- Efficient DOM manipulation
- Minimal external dependencies

## Configuration

### Admin Interface

Settings stored in browser local storage:
- League data (automatic)
- User preferences (optional)
- Backup data (automatic)

### Display Interface

Configuration via UI:
- GitHub raw JSON URL
- Refresh behavior
- Display preferences

Example GitHub raw URL:
```
https://raw.githubusercontent.com/username/swissleague/main/data/league-data.json
```

## Backup and Recovery

### Automatic Backups

- Admin interface auto-saves to local storage
- Survives browser restarts
- Limited to single device/browser

### Manual Backups

1. Export JSON after each round
2. Keep organized backup folder:
   ```
   backups/
   ├── 2026-01-13-round-1.json
   ├── 2026-01-20-round-2.json
   └── 2026-01-27-round-3.json
   ```

### Recovery

1. Open admin interface
2. Click "Import JSON"
3. Select backup file
4. System restores complete state

## Troubleshooting

### Display Shows Old Data

**Solution**: Hard refresh browser (`Ctrl+F5` or `Cmd+Shift+R`)

### Admin Data Lost

**Solution**: Import most recent JSON backup

### Pairing Generation Fails

**Solution**: Ensure all previous matches are completed

### GitHub Pages Not Updating

**Solution**: Wait 1-5 minutes for GitHub to rebuild, then clear cache

See [`plans/deployment-guide.md`](plans/deployment-guide.md) for comprehensive troubleshooting.

## Documentation

- **[Architecture](plans/architecture.md)**: System design and component breakdown
- **[Technical Specification](plans/technical-specification.md)**: Detailed implementation specs
- **[Deployment Guide](plans/deployment-guide.md)**: Complete deployment and usage instructions

## Development

### Local Development

1. Clone the repository
2. Open `admin/index.html` in a browser (no build step required)
3. Make changes to HTML/CSS/JS files
4. Refresh browser to see changes

### Testing

Test scenarios to verify:
- League creation with various player counts
- Swiss pairing with even/odd players
- Score entry and validation
- JSON export/import round-trip
- Display interface data loading
- Responsive design on different devices

### Contributing

This is a personal project, but suggestions and improvements are welcome:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is provided as-is for personal and recreational use. Feel free to modify and adapt for your own leagues.

## Roadmap

### Current Version (v2.0)
- ✅ Basic league management
- ✅ Swiss pairing algorithm
- ✅ Score entry and tracking
- ✅ Public display interface
- ✅ GitHub Pages deployment
- ✅ **Multiple league support**
- ✅ **Cross-league player statistics**
- ✅ **Snooker score points tracking**
- ✅ **Dual data source display (GitHub + Local)**

### Future Enhancements
- 📧 Email notifications for pairings
- 🔄 Real-time updates
- 📱 Native mobile apps
- 📊 Advanced statistics and analytics
- 🏆 Tournament bracket visualization
- 🎯 Player rating system (ELO)
- 🔀 Multi-format support (Round Robin, Knockout)
- 📈 Performance trends across seasons
- 👤 Dedicated player profile pages

## Support

For issues, questions, or suggestions:
1. Check the [Deployment Guide](plans/deployment-guide.md)
2. Review browser console for errors
3. Verify JSON data structure
4. Test with sample data
5. Open an issue on GitHub

## Acknowledgments

Built for managing recreational Snooker leagues with a focus on simplicity, reliability, and ease of use.

## Contact

For questions or feedback about this system, please open an issue on the GitHub repository.

---

**Ready to start your league?** Follow the Quick Start guide above and refer to the [Deployment Guide](plans/deployment-guide.md) for detailed instructions.
