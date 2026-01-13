# Quick Start Guide

## Important: Running the Application

⚠️ **This application uses ES6 modules and MUST be run through a web server, not by opening HTML files directly in your browser.**

## Option 1: Using Python (Recommended for Local Testing)

### If you have Python 3:
```bash
# Navigate to the project directory
cd /path/to/swissleague

# Start a simple HTTP server
python3 -m http.server 8000

# Open in browser:
# Admin: http://localhost:8000/admin/
# Display: http://localhost:8000/display/
```

### If you have Python 2:
```bash
python -m SimpleHTTPServer 8000
```

## Option 2: Using Node.js

### Install http-server globally:
```bash
npm install -g http-server

# Navigate to project directory
cd /path/to/swissleague

# Start server
http-server -p 8000

# Open in browser:
# Admin: http://localhost:8000/admin/
# Display: http://localhost:8000/display/
```

## Option 3: Using VS Code Live Server Extension

1. Install "Live Server" extension in VS Code
2. Right-click on `admin/index.html`
3. Select "Open with Live Server"
4. Browser will open automatically

## Option 4: Deploy to GitHub Pages (Production)

```bash
# Initialize git repository
git init
git add .
git commit -m "Initial commit"

# Create GitHub repository and push
git remote add origin https://github.com/yourusername/swissleague.git
git push -u origin main

# Enable GitHub Pages in repository settings
# Then access at:
# https://yourusername.github.io/swissleague/admin/
# https://yourusername.github.io/swissleague/display/
```

## Why You Need a Web Server

Modern browsers block ES6 module imports when files are opened directly (file:// protocol) due to CORS security restrictions. A web server is required to serve the files over HTTP/HTTPS.

## First Time Setup

Once you have the server running:

1. **Open Admin Interface** at `http://localhost:8000/admin/`
2. You should see "Create New League" form
3. Fill in:
   - League name (e.g., "Winter 2026 League")
   - Best of frames (select 5)
   - Total rounds (enter 7)
4. Click "Create League"
5. You'll be taken to the Players view
6. Add players one by one
7. Navigate to Rounds to generate pairings
8. Navigate to Scoring to enter match results

## Troubleshooting

### Blank Page or No Content

**Problem**: Opening HTML files directly in browser
**Solution**: Use one of the web server options above

### JavaScript Errors in Console

**Problem**: Module import errors
**Solution**: Ensure you're accessing via http://localhost, not file://

### "Failed to load module script"

**Problem**: CORS policy blocking module imports
**Solution**: Must use a web server (see options above)

### Navigation Not Working

**Problem**: JavaScript not loading
**Solution**: Check browser console for errors, ensure web server is running

## Browser Requirements

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

All browsers must support:
- ES6 modules
- Local Storage API
- Fetch API

## Next Steps

After getting the admin interface running:

1. Create your league
2. Add all players
3. Generate Round 1
4. Enter match scores
5. Export JSON when round is complete
6. Commit to GitHub for display interface

See [`README.md`](README.md) for full documentation.
