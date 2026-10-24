const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the real model without starting the browser UI or adding debug
// exports to the shipped application.
function model() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const boundary = source.indexOf('  bind();renderAll();');
  assert.ok(boundary > 0, 'UI initialization boundary exists');
  const context = { document: { querySelector: () => null } };
  vm.runInNewContext(source.slice(0, boundary) + `
    globalThis.model = {state, makeInitialState, recalculate, planRoute,
      simulationStep, simulateDecisionCopy, minimumFleet, effectiveSpeed,
      moveVehicles, facilityChoice};
  })();`, context);
  return context.model;
}

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
