# TECHYUG 2K26 Round 2 — implementation and verification report

Date: 24 October 2026. Repository: AI-WasteTwin / Ai-WasteTwinn.
Starting commit: `1066bf1`; the checkout was clean before this round.
Delivery branch: `codex/techyug-round2-readiness`.

## 1. Summary

Preserved the static HTML/CSS/JavaScript application, its shared state, existing
forecast formula, collection heuristic and road-graph search. The three first
priorities were replacing fabricated service/delay metrics with observations,
making critical counts agree with risk rules, and clearing stale routes when a
replanned destination is unreachable. Further changes protect partial-pickup
accounting, assignment consistency, invalid inputs, replay and reset.

The UI now identifies simulated data, an uncalibrated urgency index, deterministic
Copilot answers and the scripted teaching demo accurately. No dependencies,
framework migration, model training or external AI API were introduced.

## 2. Modified files

| File | Purpose |
|---|---|
| `app.js` | Observed metrics; consistent thresholds; assignment and partial-pickup guards; unreachable replans; validation/errors; complete replay frames; reset; accurate export schema and explanations |
| `index.html` | Visible errors, clear manual-demo controls and accurate feature labels |
| `styles.css` | Keep manual simulation controls visible in visitor mode; error-banner styling |
| `README.md` | Methodology, metric definitions, limitations and links to evidence |
| `tests/model_fixture.cjs` | Dependency-free test access to the real model before UI initialization |
| `tests/model_regressions.cjs` | Seventeen deterministic model correctness tests |
| `tests/browser_regressions.cjs` | Thirty-one Chrome checks, including a real downloaded JSON report |
| `tests/scenario_validation.cjs` | Real same-engine scenario execution, isolation checks and evidence output |
| `tests/check_project.py` | Extend source checks to referenced SVG, WebP and MP4 assets |
| `tests/SMOKE_TEST.md` | Reproducible automated and manual verification instructions |
| `.github/workflows/quality-checks.yml` | Run deterministic scenario validation alongside existing CI checks |
| `docs/TECHYUG_ROUND2.md` | Architecture, feature classification, technical limits and viva/demo guide |
| `docs/validation-results.json` | Actual inputs, source hash and four scenario observations |
| `docs/BASELINE_EXPERIMENT.md` | Fair fixed-order comparison method; explicitly not executed |
| `docs/ROUND2_REPORT.md` | This report |

## 3. Functional verification

- Chrome: all eight pages open; manual controls are visible; start, pause, resume,
  10-minute steps, replay restoration and reset work in the tested paths.
- Model: kg/hour-to-fill conversion and 90-minute projections match derived
  expected values; zero-rate, fractional thresholds and overflow crossings behave
  consistently; priority ordering has deterministic ties.
- Assignment: failed trucks and duplicate assignments are rejected; payload
  constraints hold in tested fixtures; partial pickups preserve mass and the
  pending task instead of counting a completed bin.
- Routes: a closure changes affected geometry; reopening restores it; a fixture
  with all roads closed clears the old assignment and prevents movement.
- Incidents: rain, festival, road, breakdown, surge and facility reduction change
  their real inputs; generation modifiers affect output; controls can clear them.
- Decision Lab: preset execution uses the live engine on copies, respects fleet
  failures and travel budgets, and preserves live conditions and assignments.
- Reports and interface: injected report markup remains text; Copilot prompts
  return current-state templates; unobserved metrics stay null; invalid fleet
  targets show an error. A real browser download opens as valid schema-v2 JSON.
- Mobile map: all 100 reset markers fit; pointer drag, arrow-key panning and
  keyboard selection work at the tested 390-pixel viewport.

The final Chrome run recorded `ERRORS []` and `HTTP_FAILURES []`. These are focused
regression checks, not exhaustive browser or accessibility certification.

## 4. Test results

Executed from the repository on Windows with Node v24.14.1 and Google Chrome:

| Command | Actual outcome |
|---|---|
| `node --check app.js` | Passed |
| `node --test tests/model_regressions.cjs` | 17 passed, 0 failed |
| `python tests/check_project.py` | All 17 source/asset checks passed |
| `node tests/scenario_validation.cjs docs/validation-results.json` | Four scenario validations passed; evidence refreshed |
| `$env:WASTETWIN_URL='http://127.0.0.1:8765/'; node tests/browser_regressions.cjs` | 31 browser checks passed, exit code 0 |
| `git diff --check` | Passed |

An earlier Chrome attempt timed out at `Runtime.evaluate` while checking exported
scenario reports. A rerun passed all 30 then-existing checks; the final run also
passed the added real-download check. The timeout's cause was not established.
CI execution on GitHub is separate from these recorded local results.

## 5. Build status

**Not configured / not executed.** This repository serves static source directly;
it has no production build command, package manifest, TypeScript check or lint
configuration. JavaScript syntax, local asset references and actual browser
execution passed. Relative production asset paths were preserved.

## 6. Validation status

These are software correctness observations. One trial per scenario used seed
240101, 100 bins, eight initial vehicles, 08:00 and nine 10-minute steps. Presets
then apply their documented fleet and disruption inputs.

| Scenario | Completed pickup events | Distance (km) | Overflow crossings | Final critical bins |
|---|---:|---:|---:|---:|
| Normal | 34 | 220.0 | 0 | 0 |
| Festival | 41 | 197.9 | 8 | 9 |
| Heavy rain | 28 | 170.5 | 12 | 15 |
| Resource shortage | 23 | 85.2 | 11 | 16 |

No dump trips completed during these four short runs. A separate model fixture
verified facility unloading and mass accounting. Pickup events are not necessarily
unique bins. Runtime observations were not collected under controlled conditions.

**No adaptive-versus-fixed baseline experiment was executed.** No operational
savings, real-world prediction accuracy or policy superiority is established.
The planned fair comparison is in `BASELINE_EXPERIMENT.md`.

## 7. Remaining issues

- Synthetic city roads, operating rates and anomaly flags; no municipal feeds.
- Formula-based forecasts and heuristic collection order; no trained ML model
  and no proof of a globally optimal collection tour.
- Asset-to-road connectors simplify access; verified GIS/traffic integration,
  stop duration, facility queues and spilled mass beyond capped 100% fill are absent.
- Citizen report progression is illustrative; no real dispatch, image inference
  or independently verified resolution is connected.
- Full accessibility, cross-browser, long-session and municipal-scale performance
  audits remain incomplete. The earlier headless-test timeout is recorded above.
- No persistent backend, authentication, calibrated costs or field validation.

No core runtime regression was observed in the final tested paths; this is not
a claim that every possible application state is defect-free.

## 8. Demonstration instructions

Serve locally with `python -m http.server 8000 --bind 127.0.0.1` and open
`http://127.0.0.1:8000/`. The existing preview uses port 8765.

1. Explain uneven waste generation and constrained collection resources.
2. Enter the Dashboard and identify the synthetic baseline and unobserved metrics.
3. Open AI Predictions, inspect B-104, and explain fill, forecast and score terms.
4. Open Simulation; use Start then Pause, or advance one **+10 min** step.
5. Show the actual assigned bin, vehicle load, ETA and route in Vehicles & Routes.
6. Activate Road Closure and inspect changed route geometry and the decision log.
7. Advance once or twice; inspect recorded pickups, distance, delay and remaining risk.
8. Run Normal and Heavy Rain in Decision Lab; confirm the live state stays unchanged.
9. Export the JSON report and explain the explicitly unmeasured fixed-order baseline.
10. Reset and confirm 08:00, zero pickups/distance and cleared incidents.
11. State formula, routing, synthetic-data and validation limitations.

Use the manual workflow for the technical demonstration. The scripted guided demo
and explanatory video are clearly identified as teaching aids.

## 9. Deployment status

**Not deployed this round.** Changes are delivered for review on
`codex/techyug-round2-readiness`. GitHub's Pages API confirmed the publishing source
is `main`, directory `/`, using the legacy Pages build. Remote `main` was still
`1066bf1` during verification. Pushing this separate branch does not change that
publishing source. Live-site behavior has not been retested as this round's code.

## 10. Competition readiness

| Criterion | Supporting evidence and uncertainty |
|---|---|
| Problem and impact — 10 | Clear municipal planning problem and beneficiaries; real impact unmeasured |
| Technical depth — 20 | Units, formula, explained score, capacity guards, road search and copy isolation; synthetic assumptions remain |
| Implementation/demo — 25 | Executed local browser workflow and reproducible manual sequence; public deployment unchanged |
| Testing/results — 15 | 17 model tests, 31 browser checks and four recorded scenarios; no paired policy experiment |
| Innovation — 10 | Integrated explainable adaptive workflow; novelty beyond established techniques not established |
| Viva/ownership — 10 | Source, fixtures and technical explanation guide; individual understanding requires demonstration |
| Feasibility/ethics/scalability — 5 | Accurate simulation labels and limitations; field safety and scale require independent work |
| Presentation/docs — 5 | README, audit, evidence, report and short demonstration sequence |

These observations support evaluation; they do not guarantee a competition score.
