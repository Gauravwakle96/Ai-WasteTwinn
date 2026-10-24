# Fixed-order versus adaptive collection: experimental method

Status: **prepared, not executed**. No comparative savings or performance result
is reported by this document or the interface.

1. Implement a named baseline policy that visits eligible bins in ascending bin
   ID order. Define its threshold before running it. Retain the same truck order,
   physical capacity checks, dump facilities, road search and movement budget.
2. Create two independent clones from one initial fixture. For the first trial
   use seed 240101, 100 bins, eight trucks, 08:00, the same initial loads and the
   same generation/rain/festival/closure/failure/processing inputs.
3. Run both policies for nine 10-minute steps. Do not use the scripted teaching
   demo, replay frames or fabricated multipliers as policy outcomes.
4. Record actual overflow crossings, simulated distance, completed pickup events,
   unique bins served, eligible bins left unserved, recorded completed delay,
   pending delay and completed dump trips. Record no-observation values as null.
5. Keep the baseline implementation/configuration fixed across trials. If testing
   more seeds or scenarios, publish every chosen seed and configuration and both
   paired outcomes. Report the trial count and variability; do not choose only
   seeds where the adaptive policy wins.
6. Check input equivalence, copy isolation, capacity/assignment invariants and
   per-truck movement limits for both policies before comparing results.
7. If measuring software runtime, use a separately documented warm-up, cache
   policy, machine configuration and repeated timings. Execution time does not
   establish operational savings.

The current scenario observations use one collection policy under different
conditions. They are not a baseline-versus-adaptive experiment. This synthetic
model also cannot establish field effectiveness without municipal data and
independent validation.
