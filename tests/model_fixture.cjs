const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function loadModel() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const boundary = source.indexOf('  bind();renderAll();');
  assert.ok(boundary > 0, 'UI initialization boundary exists');
  const context = { document: { querySelector: () => null } };
  vm.runInNewContext(source.slice(0, boundary) + `
    globalThis.model = {state, makeInitialState, recalculate, planRoute,
      simulationStep, simulateDecisionCopy, minimumFleet, effectiveSpeed,
      moveVehicles, facilityChoice, overflowMinutes, riskOf, criticalBins,
      currentMetrics, assignVehicles, assignVehicleToTarget, replanRoutes,
      activeModFor, validateSimulationState, validateDecisionConfig};
  })();`, context);
  return context.model;
};
