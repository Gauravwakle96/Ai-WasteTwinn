# AI-WasteTwin — pre-demo smoke test

Run these checks after installing the upgrade. Record any failure; do not present a failed check as passed.

## Automated checks

From the repository root:

```bash
node --check app.js
python tests/check_project.py
node --test tests/model_regressions.cjs
node tests/scenario_validation.cjs
```

The CI workflow runs the same checks on pushes and pull requests.

For automated browser regression checks, start the local server described below in another terminal, then run `node tests/browser_regressions.cjs` with Node 22 or later and Google Chrome installed. `CHROME_PATH` can point to another Chromium executable, and `WASTETWIN_URL` can override the default `http://127.0.0.1:8000/`.

## Browser smoke test (5–8 minutes)

1. Start a local server with `python -m http.server 8000` and open `http://localhost:8000`.
2. Confirm the landing page loads without a blank screen or JavaScript error in DevTools.
3. Enter the application; verify dashboard cards, city map, bins, and vehicles render.
4. In **Simulation Center**, select **Expert**, then click **+10 min** three times. Confirm time advances in 10-minute steps and logs/forecasts change.
5. Click **Reset**. Confirm the simulation returns to its initial state.
6. Start **Guided Demo**. Check pause, resume, skip, and exit controls. Dispatch should precede collection; the outcome must match the critical-bin count, and parked trucks should return to service when the demo ends.
7. Activate each incident (heavy rain, road closure, truck breakdown) separately. Confirm a decision-log entry appears and the interface stays responsive. Reset between cases if state gets confusing.
8. Open **AI Decision Lab** and run Normal, Festival, Heavy Rain, and Resource Shortage presets. Confirm result cards render and there is no console error. Verify the live twin is not visibly changed just by running a what-if plan.
9. Open **Analytics**. Confirm fixed scheduling says **Not measured**. Do not interpret it as an AI win/loss or cite a savings percentage.
10. Export a local report and verify the downloaded JSON opens and identifies its results as simulated.
11. Repeat one path at a narrow mobile viewport. Confirm all 100 bins fit the reset map, then zoom and drag. Select a bin using the keyboard and verify its details open.

## What this checklist does not establish

Passing these checks is not evidence of real-world waste reduction, prediction accuracy, calibrated financial savings, field validation, or production readiness. Those require independent paired experiments and external data validation.

## Round 2 evidence

See `docs/TECHYUG_ROUND2.md` for the unscripted live demo sequence and feature classification. Scenario output is a correctness observation from one deterministic trial per configuration. It is not an adaptive-versus-fixed performance comparison. Run `node tests/scenario_validation.cjs docs/validation-results.json` to refresh the recorded evidence for the current source.
