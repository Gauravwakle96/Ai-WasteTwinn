# AI-WasteTwin — pre-demo smoke test

Run these checks after installing the upgrade. Record any failure; do not present a failed check as passed.

## Automated checks

From the repository root:

```bash
node --check app.js
python tests/check_project.py
```

The CI workflow runs the same checks on pushes and pull requests.

## Browser smoke test (5–8 minutes)

1. Start a local server with `python -m http.server 8000` and open `http://localhost:8000`.
2. Confirm the landing page loads without a blank screen or JavaScript error in DevTools.
3. Enter the application; verify dashboard cards, city map, bins, and vehicles render.
4. In **Simulation Center**, click **+10 min** three times. Confirm time advances in 10-minute steps and logs/forecasts change.
5. Click **Reset**. Confirm the simulation returns to its initial state.
6. Start **Guided Demo**. Check pause, resume, skip, and exit controls.
7. Activate each incident (heavy rain, road closure, truck breakdown) separately. Confirm a decision-log entry appears and the interface stays responsive. Reset between cases if state gets confusing.
8. Open **AI Decision Lab** and run Normal, Festival, Heavy Rain, and Resource Shortage presets. Confirm result cards render and there is no console error. Verify the live twin is not visibly changed just by running a what-if plan.
9. Open **Analytics**. Confirm fixed scheduling says **Not measured**. Do not interpret it as an AI win/loss or cite a savings percentage.
10. Export a local report and verify the downloaded JSON opens and identifies its results as simulated.
11. Repeat one path at a narrow mobile viewport. Check that navigation, tables, controls, and key labels remain usable.

## What this checklist does not establish

Passing these checks is not evidence of real-world waste reduction, prediction accuracy, calibrated financial savings, field validation, or production readiness. Those require independent paired experiments and external data validation.
