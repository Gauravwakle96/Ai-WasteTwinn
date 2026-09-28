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
- Deterministic 10-minute waste-generation updates and historical replay
- Transparent priority scoring from overflow risk, fill, growth, zone, route efficiency, and incidents
- Predictive 90-minute overflow warnings and pre-overflow dispatch
- Dynamic multi-bin collection with re-evaluation after every pickup and a 90% operating threshold
- Smart dump-site selection using distance, capacity, traffic, availability, and waste compatibility
- Continuous route replanning after collection, closures, traffic, breakdowns, and facility changes
- Guided/Visitor Demo with a 10-step visual story, WHY explanations, and demo reset
- Live AI decision log, truck load/remaining capacity, current/next target, and route versions
- Digital Twin Physical, Data, and AI map layers
- AI Decision Lab that runs what-if scenarios on copied state without changing the live simulation
- Scenario comparison, minimum required fleet analysis, and one-click City Crisis
- Citizen waste reporting, rule-based waste classification, assignment, and resolution timeline
- Circular-economy simulation estimates for recovery and material streams
- Current-state AI Copilot for operational questions
- Local SVG city map and animated routes
- Play, pause, reset, step, speed, and replay controls
- Heavy rain, festival, road closure, breakdown, waste surge, and facility incidents
- Expanded simulated analytics and AI vs fixed-scheduling comparison
- Embedded 28-second local MP4 explainer video
- JSON report export
- No cloud, external APIs, accounts, or internet connection required

## Project files

- `index.html` — app structure, Guided Demo, Decision Lab, reports, and Copilot
- `styles.css` — responsive control-center design
- `app.js` — shared simulation engine, predictions, dynamic routing, incidents, Decision Lab, and analytics
