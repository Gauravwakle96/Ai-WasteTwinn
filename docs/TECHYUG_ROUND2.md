# TECHYUG 2K26 Round 2 — technical and demonstration guide

AI-WasteTwin is a browser-based, simulation-based prototype of municipal waste
collection. Its intended users are municipal operators and planners; citizens
benefit if a future field deployment reduces missed pickups. No live municipal
integration or verified cost reduction is claimed.

## Actual architecture

- Static HTML/CSS and vanilla JavaScript; no framework, bundler, backend or package installation.
- `index.html` loads `styles.css` and `app.js` through relative paths suitable for GitHub Pages.
- Eight navigation sections share one in-memory state inside a JavaScript closure.
- A deterministic seed, 240101, creates 100 bins, six zones, eight trucks and two facilities.
- One step is 10 simulated minutes. Generation is in kg/hour, bin/truck capacity in kg,
  facility load in tonnes, distance in km. A 90-minute forecast projects linear
  generation with explicit rain, festival and surge modifiers.
- Risk rules use current fill and time to overflow. Priority is a weighted rule
  score with an uncalibrated urgency index, fill, growth, zone, straight-line
  truck proximity and special-condition contributions.
- Trucks are checked in vehicle order. Eligible bins are ranked by priority
  minus a route-distance penalty, subject to availability, duplicate-assignment
  and payload constraints. This is a collection heuristic.
- Dijkstra searches sampled road edges between nearest access nodes. Closed
  edges are excluded. Asset connectors and the collection tour do not establish
  global route optimality. Unreachable replans clear previous routes.
- The Decision Lab runs nine steps on a copied state using the same engine.
- Views and JSON exports read that state. Copilot answers use deterministic templates.

## Audit and feature classification

A = implemented and verified in the recorded checks. B = implemented, with incomplete
verification. C = partial. D = illustrative or not implemented.

| Feature | Class | Evidence or practical limit |
|---|---|---|
| Start, pause, resume, step and reset | A | Browser clock and reset checks |
| Generation, forecast, priority and risk | A | Dimensional and boundary model tests; browser view checks |
| Assignment, capacity and duplicate prevention | A | Model tests plus exported assignments during incidents |
| Road closure and unreachable route handling | A | Browser closure check; synthetic all-roads-closed model fixture |
| Rain, festival, surge, breakdown and facility reduction | A | Input and generation changes checked; reset/clear checked |
| Decision Lab and fleet failures | A | Same-engine results, travel budget and live-state isolation tests |
| Recorded metrics, replay and report export | A | Event calculations, complete frames, replay/reset and export checks |
| Mobile map and keyboard access | A | All 100 default markers fit; drag, arrow keys and Enter tested |
| Deterministic Copilot | A | All predefined prompts checked; no LLM inference |
| Citizen input/type classification | C | Local form and rule classification; illustrative timeline only |
| Real report dispatch or image classification | D | No connected vehicle task or image inference pipeline |
| Fixed-order baseline comparison | D | Clearly unmeasured; experiment method provided separately |
| Full accessibility and long-session load behavior | B | Focused checks only, not a comprehensive audit |
| Municipal sensors, authentication and persistent backend | D | Future integration requirements |

The three first priorities were misleading event metrics, inconsistent critical
counts, and stale routes after an unreachable replan. Additional safe fixes cover
partial-pickup completion, invalid inputs, complete replay state and reset of
planning/map controls. Existing algorithms and navigation were retained.

## Local demonstration

Use a terminal in the repository:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`. On Windows, `start.bat` is also available.
The local application requires no API key, cloud account or environment variable.

1. Explain the problem: uneven generation and constrained vehicles make fixed
   collection plans difficult to adapt. This prototype tests explicit assumptions.
2. Enter the Digital Twin and show the baseline Dashboard: 100 synthetic bins and
   eight trucks; unobserved delay/on-time figures say **Not measured**.
3. Open **AI Predictions** before advancing time. Inspect B-104 and explain its
   fill, 90-minute projection and actual weighted score. Call the urgency value
   an index, not a calibrated probability.
4. Open **Simulation**. Use the visible manual controls, not the scripted teaching
   demo or the video. Start, allow one step, and pause; or use **+10 min** once.
5. Open **Vehicles & Routes** and show the assigned bin, truck load, ETA and route.
   Use the Digital Twin marker for detailed bin inspection if needed.
6. Activate **Road closure** in Simulation. Inspect the actual route geometry and
   decision log. Unaffected routes need not change; another valid plan may remain best.
7. Advance **+10 min** once or twice. Show completed pickups, recorded distance
   and the measured queue delay. A conditional on-time ratio is not citywide coverage.
8. Open **AI Decision Lab**, run Normal and Heavy Rain, and show projected outcomes.
   The live clock and current assignments must stay unchanged by a what-if run.
9. Export the local JSON report. It includes conditions, assignments, units in field
   names and methodology notes. The fixed-order column remains **Not measured**.
10. Reset. Confirm 08:00, zero completed pickups/distance, baseline controls and
    cleared incidents. State the limitations and validation status below.

This is a short, reproducible live model demonstration. The guided demo is a
scripted teaching aid, and the video is explanatory footage.

## Verification commands

```powershell
node --check app.js
node --test tests/model_regressions.cjs
python tests/check_project.py
node tests/scenario_validation.cjs
```

With the local server running in another terminal, Node 22+ and Chrome:

```powershell
node tests/browser_regressions.cjs
```

`WASTETWIN_URL` overrides the browser-test URL; `CHROME_PATH` overrides the Chrome
binary. These are test-only settings. The production static site needs neither.
There is no configured production build, TypeScript check or lint command.

## Validation and limitations

`validation-results.json` records one trial per existing preset, each starting
from the same deterministic fixture. It includes the source hash and input values.
Distance stays within the fleet's 90-minute speed budget; scenario execution is
checked to preserve live state. Local execution time is an observation, not a
controlled scalability benchmark.

Correctness tests do not prove real-world cost reduction, prediction calibration
or superiority to fixed scheduling. No paired fixed-order experiment was run.
See `BASELINE_EXPERIMENT.md` for a fair experimental method.

The model uses synthetic roads, access connectors and illustrative operating
coefficients. It excludes verified GIS connectivity, stop service duration,
facility queues and escaped spill mass beyond 100% bin fill. Responses are
quantized to 10-minute steps. Seeded anomaly flags are fixtures. No trained ML,
computer vision, real citizen verification or language-model Copilot is present.

A future field deployment needs authorized sensors/GIS data, persistent storage,
identity/access control, privacy and retention rules, calibrated rates/costs,
municipal validation, traffic constraints and waste-handling procedures.

## Viva and ownership

Be ready to explain the kg/hour-to-fill conversion, the difference between risk
and fill levels, why a priority score is not a probability, Dijkstra's scope,
capacity/duplicate checks, copy isolation and the measured-versus-assumed metrics.
Use the test fixtures and source to demonstrate these points. Explain how tools
helped implement the changes and identify the engineering decisions you can
personally justify; a test report does not establish individual ownership.

Problem context, design, implementation, testing and documentation have software
evidence. Real-world impact, originality beyond standard algorithms, operational
feasibility at municipal scale and viva performance remain evaluation questions.

## Deployment

These Round 2 changes are delivered on the separate review branch
`codex/techyug-round2-readiness`; they are not automatically deployed.
GitHub's Pages settings were checked on 24 October 2026: the publishing source
is `main`, directory `/`, using the legacy Pages build. The remote main branch
was still `1066bf1` at verification. This review branch leaves that source unchanged.
Any later deployment must follow fresh verification of the chosen branch and
Pages settings. See `ROUND2_REPORT.md` for this round's verification results.
