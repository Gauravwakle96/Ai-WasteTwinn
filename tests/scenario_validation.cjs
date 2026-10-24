const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const loadModel = require('./model_fixture.cjs');

const normal = {waste:1,rain:'none',festival:false,closures:0,trucks:8,failures:0,capacity:1};
const scenarios = [
  ['Normal', normal],
  ['Festival', {...normal,waste:1.5,festival:true}],
  ['Heavy rain', {...normal,waste:1.3,rain:'heavy',closures:1,capacity:.9}],
  ['Resource shortage', {...normal,waste:1.5,closures:2,trucks:5,failures:1,capacity:.7}]
];
const rows = scenarios.map(([name, inputs]) => {
  const model=loadModel(),initial=JSON.stringify(model.state),start=performance.now();
  const result=model.simulateDecisionCopy(inputs),elapsedMs=+(performance.now()-start).toFixed(2);
  assert.equal(JSON.stringify(model.state),initial,'what-if plan must preserve live state');
  assert.ok(result.routeDistance<=result.fleet*model.effectiveSpeed({rain:inputs.rain})*1.5+.1);
  assert.ok(result.overflowRisk>=0&&result.overflowRisk<=100);
  assert.ok(Number.isInteger(result.served)&&Number.isInteger(result.overflowEvents));
  return {name,inputs,result,executionTimeMs:elapsedMs,checks:'passed'};
});
const evidence={
  purpose:'Deterministic scenario correctness observations; not an AI-versus-fixed performance experiment',
  generatedAt:new Date().toISOString(),nodeVersion:process.version,platform:process.platform,
  sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..','app.js'))).digest('hex'),
  fixture:{seed:240101,bins:100,vehicles:8,startMinutes:480,horizonMinutes:90,tickMinutes:10,trialsPerScenario:1},
  metricNotes:{overflowRisk:'Fraction of bins forecast full after the run, expressed as a percentage',served:'Completed collection events; a bin may be collected more than once',collectionDelay:'Maximum observed or still-pending queue delay',executionTimeMs:'One local observation; not a controlled runtime benchmark'},
  scenarios:rows
};
const output=process.argv[2];
if(output){fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n')}
console.log(JSON.stringify(evidence,null,2));
