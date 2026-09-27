# AI-WasteTwin

AI-powered urban waste-management digital twin for Chhatrapati Sambhajinagar.

## Important

This is a **local/offline simulation**. It uses simulated data and does not claim to show actual municipal measurements.

## Run locally (recommended)

1. Open Terminal / Command Prompt.
2. Go to this folder:

   ```bash
   cd ai-wastetwin
   ```

3. Start a local server with Python:

   ```bash
   python -m http.server 8000
   ```

   On some systems use:

   ```bash
   python3 -m http.server 8000
   ```

4. Open this address in your browser:

   ```text
   http://localhost:8000
   ```

5. Stop the server with `Ctrl + C`.

## Quick option

You can also double-click `index.html`. The local-server method above is more reliable.

## Features

- Shared centralized simulation state
- 100 simulated bins with 7 fill levels
- Physically consistent 10-minute waste-generation updates
- Explainable 90-minute forecasts, overflow time, risk, and normalized priority score
- Capacity-aware assignment for 8 simulated collection vehicles
- Incident-aware ETA, movement, route distance, collection, and facility redirection
- Local SVG city map and animated routes
- Play, pause, reset, step, speed, and replay controls
- Plain-language “What / Why / AI action / Next” explanation panel
- Heavy rain, festival, road closure, breakdown, waste surge, and facility incidents
- Scenario controls and analytics
- Simulated AI vs fixed-scheduling comparison
- Embedded 28-second local MP4 explainer video
- JSON report export
- No cloud, external APIs, accounts, or internet connection required

## Project files

- `index.html` — app structure and all seven sections
- `styles.css` — responsive control-center design
- `app.js` — simulation engine, predictions, routing, incidents, and analytics
