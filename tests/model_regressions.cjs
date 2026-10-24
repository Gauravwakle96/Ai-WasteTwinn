const assert = require('node:assert/strict');
const { test } = require('node:test');
const model = require('./model_fixture.cjs');

const normal = { waste: 1, rain: 'none', festival: false, closures: 0, trucks: 8, failures: 0, capacity: 1 };

test('what-if plans leave the live state untouched and match the live engine', () => {
  const m = model(), before = JSON.stringify(m.state);
  const result = m.simulateDecisionCopy(normal);
  assert.equal(JSON.stringify(m.state), before);
  const live = JSON.parse(before);
  for (let i = 0; i < 9; i++) m.simulationStep(live);
  assert.equal(result.served, live.binsCollected);
  assert.equal(result.dumpTrips, live.dumpTrips);
  assert.equal(result.overflowEvents, live.overflowIncidents);
  assert.equal(result.routeDistance, +live.routeDistance.toFixed(1));
  assert.equal(JSON.stringify(m.simulateDecisionCopy(normal)), JSON.stringify(result));
});

test('every plan obeys the available fleet and 90-minute travel budget', () => {
  const m = model();
  for (const config of [normal, {...normal, rain: 'heavy', closures: 1}, {...normal, trucks: 5, failures: 3}, {...normal, trucks: 2, failures: 3}]) {
    const result = m.simulateDecisionCopy(config);
    assert.equal(result.fleet, Math.max(0, config.trucks - config.failures));
    assert.ok(result.routeDistance <= result.fleet * m.effectiveSpeed({rain: config.rain}) * 1.5 + .1);
    assert.ok(result.routeDistance >= 0);
    if (result.fleet === 0) assert.equal(result.served, 0);
  }
});

test('minimum fleet includes trucks lost to failures', () => {
  const m = model();
  const working = m.minimumFleet(normal, 99, 90).found;
  const disrupted = m.minimumFleet({...normal, failures: 3}, 99, 90).found;
  assert.ok(working && disrupted);
  assert.equal(working.fleet, 2);
  assert.ok(disrupted.fleet >= 4);
  assert.equal(disrupted.r.fleet, disrupted.fleet - 3);
});

test('road closures change affected route geometry and reopening restores it', () => {
  const m = model(), s = m.makeInitialState(), v = s.vehicles[0];
  let affected = 0;
  for (const b of s.bins) {
    const open = m.planRoute(v, b, s);
    const closed = m.planRoute(v, b, {...s, roadClosures: 1});
    assert.ok(open && closed);
    if (JSON.stringify(open.points) !== JSON.stringify(closed.points)) affected++;
    assert.equal(JSON.stringify(m.planRoute(v, b, s)), JSON.stringify(open));
  }
  assert.ok(affected > 0, 'a closed road forces actual detours');
});

test('a bin remaining full is counted as one overflow crossing', () => {
  const m = model(), s = m.makeInitialState();
  s.truckLimit = 0;
  s.bins.forEach(b => { b.fill = 0; b.rate = 0; });
  s.bins[0].fill = 99; s.bins[0].rate = 60;
  for (let i = 0; i < 9; i++) m.simulationStep(s);
  assert.equal(s.overflowIncidents, 1);
});

test('final facility approach counts distance and preserves unloaded mass', () => {
  const m = model(), s = m.makeInitialState(), f = s.facilities[0];
  const v = s.vehicles[0];
  s.vehicles = [v];
  Object.assign(v, {x: f.x - 1, y: f.y, currentLoad: 1000, wasteTypes: ['organic'], status: 'Returning', facility: 0, routeIndex: 1, route: [{x: f.x - 1, y: f.y}, {x: f.x, y: f.y}]});
  const load = f.currentLoad;
  m.moveVehicles(s);
  assert.equal(s.routeDistance, .02);
  assert.equal(f.currentLoad, load + 1);
  assert.equal(v.currentLoad, 0);
  assert.equal(s.dumpTrips, 1);
});

test('facilities must accept every waste type and have room for the truck', () => {
  const m = model(), s = m.makeInitialState(), v = s.vehicles[0];
  v.wasteTypes = ['organic', 'hazardous']; v.currentLoad = 1000;
  assert.equal(m.facilityChoice(v, 'organic', s).f.id, 'DS-02');
  s.facilities.forEach(f => { f.currentLoad = f.capacity; });
  assert.equal(m.facilityChoice(v, 'organic', s), undefined);
});

test('ten-minute generation and 90-minute forecast use kilograms consistently', () => {
  const m = model(), s = m.makeInitialState(), b = s.bins[0];
  s.bins = [b]; s.truckLimit = 0;
  Object.assign(b, {capacity: 200, fill: 40, rate: 24});
  m.recalculate(s);
  assert.equal(b.predicted, 58); // 40% + (24 kg/hour * 1.5 hours / 200 kg) * 100.
  assert.equal(m.overflowMinutes(b, s), 300);
  m.simulationStep(s);
  assert.equal(b.fill, 42); // 24 * 10/60 = 4 kg, or 2 percentage points.
  assert.equal(s.generatedThisTick, 4);
  assert.equal(b.predicted, 60);
  s.rain = 'heavy';
  m.simulationStep(s);
  assert.ok(Math.abs(b.fill - 44.56) < 1e-8); // 4 kg * 1.28 / 200 kg * 100.
});

test('zero generation and fractional fill thresholds produce consistent risk', () => {
  const m = model(), s = m.makeInitialState(), b = s.bins[0];
  Object.assign(b, {capacity: 200, fill: 90.5, rate: 0});
  m.recalculate(s);
  assert.equal(m.overflowMinutes(b, s), Infinity);
  assert.equal(b.predicted, 90.5);
  assert.equal(b.risk, 'Critical');
  assert.equal(m.currentMetrics(s).critical, s.bins.filter(x => x.risk === 'Critical').length);
  Object.assign(b, {capacity: 100, fill: 95, rate: 24});
  m.recalculate(s);
  assert.equal(m.overflowMinutes(b, s), 12.5);
  assert.equal(b.predicted, 100);
});

test('priority orders urgency and uses deterministic ID tie breaking', () => {
  const m = model(), s = m.makeInitialState(), template = {...s.bins[0], rate: 12, capacity: 200, anomaly: false, zonePriority: .5};
  s.bins = [{...template, id: 'B-203', fill: 20}, {...template, id: 'B-202', fill: 80}, {...template, id: 'B-201', fill: 80}];
  m.recalculate(s);
  assert.equal(m.criticalBins(s).map(b => b.id).join(','), 'B-201,B-202,B-203');
  s.bins.forEach(b => {
    assert.ok(b.priority >= 0 && b.priority <= 100);
    const sum = Object.values(b.priorityBreakdown).reduce((a, n) => a + n, 0);
    assert.ok(Math.abs(sum - b.priority) <= .53);
  });
});

test('unavailable trucks and duplicate bin assignments are rejected', () => {
  const m = model(), s = m.makeInitialState(), b = s.bins[0], [first, second] = s.vehicles;
  b.fill = 80; m.recalculate(s);
  first.status = 'Breakdown';
  assert.equal(m.assignVehicleToTarget(first, b, 'test', s), false);
  first.status = 'Available';
  assert.equal(m.assignVehicleToTarget(first, b, 'test', s), true);
  assert.equal(m.assignVehicleToTarget(second, b, 'test', s), false);
  assert.equal(s.vehicles.filter(v => v.assignedBin === b.id).length, 1);
});

test('partial pickups conserve mass without marking a bin completed', () => {
  const m = model(), s = m.makeInitialState(), b = s.bins[0], v = s.vehicles[0];
  Object.assign(b, {capacity: 200, fill: 80, rate: 0, queuedAtMinutes: 480});
  s.bins = [b]; s.vehicles = [v]; s.truckLimit = 1;
  Object.assign(v, {capacity: 100, currentLoad: 50, status: 'Collecting', assignedBin: b.id, x: b.x, y: b.y, routeIndex: 1, route: [{x: b.x, y: b.y}, {x: b.x, y: b.y}]});
  m.moveVehicles(s);
  assert.equal(v.currentLoad, 100);
  assert.equal(b.fill, 55);
  assert.equal(s.wasteCollected, .05);
  assert.equal(s.binsCollected, 0);
  assert.equal(s.partialPickups, 1);
  assert.equal(b.queuedAtMinutes, 480);
  assert.equal(s.responseTimes.length, 0);
  assert.equal(v.assignedBin, null);
});

test('unreachable destinations clear stale routes and cannot move trucks', () => {
  const m = model(), s = m.makeInitialState(), b = s.bins[0], v = s.vehicles[0];
  b.fill = 80; m.recalculate(s);
  assert.equal(m.assignVehicleToTarget(v, b, 'test', s), true);
  const position = [v.x, v.y];
  s.roadClosures = 16;
  m.replanRoutes(s);
  assert.equal(v.route.length, 0);
  assert.equal(v.assignedBin, null);
  m.moveVehicles(s);
  assert.equal(v.x, position[0]); assert.equal(v.y, position[1]);
  assert.equal(s.routeDistance, 0);
});

test('invalid numeric inputs are rejected before time or live state changes', () => {
  const m = model(), s = m.makeInitialState();
  s.bins[0].capacity = 0;
  const invalid = JSON.stringify(s);
  assert.throws(() => m.simulationStep(s), /capacity/);
  assert.equal(JSON.stringify(s), invalid);
  const live = JSON.stringify(m.state);
  for (const config of [{...normal, capacity: 0}, {...normal, waste: NaN}, {...normal, trucks: Infinity}, {...normal, closures: -1}]) {
    assert.throws(() => m.simulateDecisionCopy(config), /must be/);
    assert.equal(JSON.stringify(m.state), live);
  }
});

test('unobserved metrics stay null and measured delay uses actual events', () => {
  const m = model(), s = m.makeInitialState();
  assert.equal(m.currentMetrics(s).avgTime, null);
  assert.equal(s.serviceLevel, null);
  assert.equal(s.history[0].generated, 0);
  assert.equal(m.currentMetrics(s).avgBinsPerTrip, null);
  s.responseTimes = [10, 20, 30];
  s.binsCollected = 3; s.collectionsBeforeOverflow = 2;
  m.recalculate(s);
  assert.equal(m.currentMetrics(s).avgTime, 20);
  assert.ok(Math.abs(s.serviceLevel - 200/3) < 1e-8);
  s.vehicles = []; s.truckLimit = 0;
  assert.equal(m.currentMetrics(s).utilization, 0);
});

test('reset fixture restores the same deterministic baseline', () => {
  const m = model(), before = JSON.stringify(m.makeInitialState());
  m.state.rain = 'heavy'; m.state.roadClosures = 2;
  m.simulationStep(m.state);
  assert.equal(JSON.stringify(m.makeInitialState()), before);
});

test('festival and surge modifiers change generation through the real model', () => {
  const m = model(), s = m.makeInitialState(), b = s.bins[0];
  s.bins = [b]; s.truckLimit = 0;
  Object.assign(b, {zone: 'Central Area', capacity: 200, fill: 20, rate: 24});
  s.festival = true; s.incidents = [{type:'surge'}];
  m.simulationStep(s);
  assert.ok(Math.abs(s.generatedThisTick - 4*1.7*1.25) < 1e-8);
  assert.ok(Math.abs(b.fill - (20 + 4*1.7*1.25/200*100)) < 1e-8);
});
