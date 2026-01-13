# Multi-League Management Guide

## Overview

The Swiss Snooker League system now supports managing multiple leagues simultaneously. This allows you to:

- Create and manage multiple independent leagues
- Switch between active and completed leagues
- View cross-league player statistics
- Archive completed leagues while starting new ones
- Display any league from local storage or GitHub

## New Features

### 1. Snooker Score Points in Standings Table

The main standings table now includes three additional columns:
- **Points For**: Total snooker points scored by the player
- **Points Against**: Total snooker points conceded by the player  
- **Points +/-**: The difference between points scored and conceded

These columns provide deeper insight into player performance beyond just match wins and frame counts.

### 2. Multiple League Support

#### Admin Interface

**League Selector View**
- Access via the initial screen when you have multiple leagues
- Shows all leagues with their status (active/completed)
- Displays league information: name, current round, last updated
- Options to:
  - Select and manage any league
  - Create a new league
  - Delete existing leagues
  - View cross-league player statistics

**Current League Indicator**
- Shows which league you're currently managing in the header
- "Switch League" button to return to the league selector

**Creating Multiple Leagues**
1. Create your first league as normal
2. Navigate to the League Selector (via "Switch League" button)
3. Click "Create New League" to start another league
4. Each league maintains independent:
   - Players and their stats
   - Rounds and matches
   - Scoring history

#### Display Interface

**Dual Data Source Support**

The display interface now supports two ways to view leagues:

1. **GitHub URL** (Original method)
   - Load league data from a GitHub repository
   - Ideal for public display and sharing
   - Auto-refreshes to show latest data

2. **Local Storage** (New method)
   - View leagues created in your admin interface
   - No GitHub setup required
   - Perfect for local tournaments
   - Select from a list of all your leagues

**Switching Between Sources**
- Use the tabs at the top of the configuration screen
- "GitHub URL" tab for remote data
- "Local Storage" tab for locally managed leagues

### 3. Cross-League Player Statistics

**All-Time Stats**
- Track player performance across all leagues
- Aggregated statistics include:
  - Total matches played
  - Total matches won
  - Overall win percentage
  - Total frames won/lost
  - Total match points earned
  - Number of leagues participated in

**Accessing Cross-League Stats**
- In the admin interface, go to League Selector
- Click "View Cross-League Stats" button
- See a comprehensive table of all players across all leagues

## Data Structure

### Storage Keys

The system uses the following localStorage keys:

- `snooker_leagues`: All league data (new multi-league storage)
- `snooker_current_league_id`: ID of the currently selected league
- `snooker_all_players`: Cached cross-league player statistics
- `snooker_league_data`: Legacy single league storage (for backward compatibility)

### League Data Format

Each league is stored with its unique ID:

```json
{
  "league-id-1": {
    "league": { ... },
    "players": [ ... ],
    "rounds": [ ... ],
    "pairingHistory": [ ... ]
  },
  "league-id-2": { ... }
}
```

## Migration from Single League

The system automatically migrates existing single-league data:

1. On first load, any existing league data is detected
2. The league is automatically added to the multi-league storage
3. The league ID is set as the current league
4. All functionality continues to work seamlessly

## Best Practices

### League Management

1. **Naming Conventions**
   - Use descriptive names: "Winter 2026 League", "Summer Tournament"
   - Include dates or seasons for easy identification

2. **League Lifecycle**
   - Create a new league for each tournament/season
   - Keep completed leagues for historical reference
   - Delete only leagues you no longer need

3. **Data Backup**
   - Export each league's JSON regularly
   - Store exports in a safe location
   - Consider using GitHub for automatic backups

### Display Setup

1. **For Public Display**
   - Use GitHub URL method
   - Export league data and commit to GitHub
   - Share the raw GitHub URL with viewers

2. **For Local Display**
   - Use Local Storage method
   - Ensure display device has access to admin interface
   - Create leagues on the same device/browser

### Player Statistics

1. **Cross-League Tracking**
   - Use consistent player names across leagues
   - Statistics are matched by exact name
   - Consider name standardization (e.g., "John Smith" not "J. Smith")

2. **Viewing Stats**
   - Individual league stats: View in each league's standings
   - Cross-league stats: Use the "View Cross-League Stats" feature
   - Historical comparison: Keep completed leagues for reference

## Troubleshooting

### League Not Appearing

**Problem**: Created league doesn't show in selector
**Solution**: 
- Refresh the page
- Check browser's localStorage isn't full
- Verify league was saved (check Data Management view)

### Cross-League Stats Not Updating

**Problem**: Player stats don't reflect recent changes
**Solution**:
- Stats update automatically on save
- Manually trigger update by switching leagues
- Check player names are exactly the same across leagues

### Display Shows Wrong League

**Problem**: Display interface shows old league data
**Solution**:
- Click "Refresh" button in display interface
- For GitHub: Ensure latest data is committed
- For Local Storage: Verify correct league is selected

### Cannot Delete League

**Problem**: Delete button doesn't work
**Solution**:
- Ensure you're not trying to delete the current league
- Switch to another league first, then delete
- Check browser console for errors

## API Reference

### StorageManager Methods

```javascript
// Multi-league methods
StorageManager.saveLeague(leagueData)
StorageManager.loadLeague(leagueId)
StorageManager.getAllLeagues()
StorageManager.getLeaguesList()
StorageManager.deleteLeague(leagueId)
StorageManager.setCurrentLeagueId(leagueId)
StorageManager.getCurrentLeagueId()
StorageManager.getCurrentLeague()

// Cross-league statistics
StorageManager.updateAllPlayersStats()
StorageManager.getAllPlayersStats()

// Legacy methods (still supported)
StorageManager.save(leagueData)
StorageManager.load()
```

### Display App Methods

```javascript
// Tab switching
displayApp.switchTab('github' | 'local')

// Local league management
displayApp.loadLocalLeaguesList()
displayApp.loadLocalLeague(leagueId)
```

### Admin App Methods

```javascript
// League selection
app.selectLeague(leagueId)
app.deleteLeagueConfirm(leagueId)
app.showAllPlayersStats()
app.updateCurrentLeagueIndicator()
```

## Future Enhancements

Potential features for future versions:

1. **League Comparison**
   - Side-by-side league statistics
   - Performance trends across seasons

2. **Player Profiles**
   - Dedicated player pages
   - Historical performance graphs
   - Head-to-head records across all leagues

3. **Export/Import**
   - Bulk export all leagues
   - Import multiple leagues at once
   - Merge league data

4. **Advanced Filtering**
   - Filter leagues by date range
   - Search players across all leagues
   - Custom stat calculations

## Support

For issues or questions:
1. Check this guide first
2. Review the main README.md
3. Check browser console for errors
4. Verify localStorage has sufficient space

## Version History

### v2.0.0 - Multi-League Support
- Added multiple league management
- Implemented cross-league player statistics
- Added snooker score points to standings table
- Created league selector interfaces
- Backward compatible with single-league data

### v1.0.0 - Initial Release
- Single league management
- Swiss pairing system
- Basic statistics and standings
