const {spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'wastetwin-audit-'));
 const port=19000+Math.floor(Math.random()*1000);
 const child=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws,seq=0,session;const pending=new Map(),events=[];
 try{
  let info;for(let n=0;n<100;n++){try{info=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();break}catch(e){await sleep(100)}}
  if(!info)throw Error('Chrome did not start');
  ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}else events.push(m)};
  const send=(method,params={},sid=session)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timeout '+method))}},20000).unref()});
  const target=await send('Target.createTarget',{url:'about:blank'},null);
  session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:900,deviceScaleFactor:1,mobile:false});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  await send('Page.navigate',{url:process.env.WASTETWIN_URL||'http://127.0.0.1:8000/'});
  for(let n=0;n<100;n++){if(await evaluate("document.readyState==='complete' && !!document.querySelector('#metricGrid .metric')"))break;await sleep(100)}

const assert=require('node:assert/strict');
let checks=0;
const check=async(name,expression)=>{assert.equal(await evaluate(expression),true,name);console.log('PASS: '+name);checks++};
await check('route comparison starts at zero with an unmeasured baseline', "document.querySelector('#routeComparison').innerText.includes('Not measured') && document.querySelector('#routeComparison').innerText.includes('0.0 km')");
await check('all pages open', "(()=>{document.querySelector('[data-enter]').click();return [...document.querySelectorAll('.nav-item')].every(b=>{b.click();return document.querySelector('.page.active').id===b.dataset.page})})()");
await check('closure replans actual routes', "(()=>{document.querySelector('#resetBtn').click();document.querySelector('#stepBtn').click();const paths=()=>[...document.querySelectorAll('#cityMap .route')].map(e=>e.getAttribute('d'));const before=paths();document.querySelector('[data-sim-incident=road]').click();return before.length>0&&before.some((p,i)=>p!==paths()[i])})()");
await check('clearing rain removes its priority bonus immediately', "(()=>{document.querySelector('#resetBtn').click();const b=document.querySelector('[data-sim-incident=rain]');b.click();const on=document.querySelector('#predictionHero').innerText.includes('Special 1');b.click();return on&&document.querySelector('#predictionHero').innerText.includes('Special 0')})()");
await check('dispatch is visible before collection', "(()=>{document.querySelector('#guidedDemoBtn').click();document.querySelector('#demoPauseBtn').click();for(let i=0;i<4;i++)document.querySelector('#demoSkipBtn').click();return document.querySelectorAll('#simSnapshot .sim-snapshot-card')[3].querySelector('b').textContent==='0'&&document.querySelector('#truckTelemetry').innerText.includes('B-104')})()");
await check('collection step displays the collected bin', "(()=>{document.querySelector('#demoSkipBtn').click();return document.querySelector('#guidedOverlay').innerText.includes('B-104: 8%')&&document.querySelectorAll('#simSnapshot .sim-snapshot-card')[3].querySelector('b').textContent==='1'})()");
await check('demo outcome agrees with remaining critical bins', "(()=>{for(let i=0;i<5;i++)document.querySelector('#demoSkipBtn').click();const count=+document.querySelectorAll('#simSnapshot .sim-snapshot-card')[1].querySelector('b').textContent,text=document.querySelector('#guidedOverlay').innerText;return text.includes(count+' critical bins remaining')&&(count?text.includes('RISKS REMAIN'):text.includes('NO CRITICAL BINS'))})()");
await check('full fleet returns after the demonstration', "!document.querySelector('#vehicleTable').innerText.includes('Maintenance')");
await check('report markup stays text in every view', "(()=>{document.querySelector('#resetBtn').click();document.querySelector('[data-page=scenarios]').click();document.querySelector('#reportLocation').value='<img src=x onerror=window.__reportInjected=true>';document.querySelector('#reportForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));document.querySelector('#stepBtn').click();return document.querySelector('#reportTimeline').innerText.includes('<img')&&!document.querySelector('#reportTimeline img,#eventLog img,#eventTicker img')&&!window.__reportInjected})()");
await check('Decision Lab honors failed trucks', "(()=>{document.querySelector('#resetBtn').click();document.querySelector('[data-lab-preset=normal]').click();document.querySelector('#failureRange').value=3;document.querySelector('#runScenario').click();const tile=[...document.querySelectorAll('#scenarioResults .result-tile')].find(e=>e.textContent.includes('Active trucks'));return tile.querySelector('strong').textContent==='5'})()");
await check('minimum fleet preserves failures', "(()=>{document.querySelector('#findFleetBtn').click();return document.querySelector('#fleetResult').innerText.includes('3 failures')&&document.querySelector('#fleetResult').innerText.includes('(5 active)')})()");
await check('manual controls are visible for the live demo', "(()=>{document.querySelector('[data-page=simulation]').click();document.querySelector('#resetBtn').click();return document.querySelector('#simulation .control-deck').getBoundingClientRect().width>0})()");
await evaluate("document.querySelector('#playBtn').click()");
await sleep(1150);
await check('start advances the clock and pause stops it', "(()=>{const moved=document.querySelector('#simClock').textContent!=='08:00';document.querySelector('#playBtn').click();window.__pausedClock=document.querySelector('#simClock').textContent;return moved&&document.querySelector('#runStatus').textContent==='PAUSED'})()");
await sleep(1150);
await check('paused clock stays fixed', "document.querySelector('#simClock').textContent===window.__pausedClock");
await evaluate("document.querySelector('#playBtn').click()");
await sleep(1150);
await check('resume advances again', "(()=>{const moved=document.querySelector('#simClock').textContent!==window.__pausedClock;document.querySelector('#playBtn').click();return moved})()");
await check('replay has a consistent initial frame', "(()=>{document.querySelector('#resetBtn').click();document.querySelector('#stepBtn').click();document.querySelector('#stepBtn').click();window.__preReplay=JSON.stringify([document.querySelector('#simClock').textContent,document.querySelector('#metricGrid').textContent,document.querySelector('#vehicleTable').textContent]);document.querySelector('#replayBtn').click();return true})()");
await sleep(400);
await check('replay restores recorded metrics with recorded time', "document.querySelector('#simClock').textContent==='08:00'&&document.querySelector('#analyticsMetrics').textContent.includes('0.0 km')");
await sleep(1250);
await check('replay completion restores the live state', "JSON.stringify([document.querySelector('#simClock').textContent,document.querySelector('#metricGrid').textContent,document.querySelector('#vehicleTable').textContent])===window.__preReplay");
await evaluate("document.querySelector('#replayBtn').click()");
await sleep(400);
await evaluate("document.querySelector('#resetBtn').click()");
await sleep(850);
await check('reset cancels replay and restores the baseline', "document.querySelector('#simClock').textContent==='08:00'&&document.querySelector('#metricGrid').textContent.includes('Not measured')");
await evaluate("window.__readReport=async()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob;try{URL.createObjectURL=b=>{blob=b;return create(b)};HTMLAnchorElement.prototype.click=()=>{};document.querySelector('#exportBtn').click()}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}return JSON.parse(await blob.text())}");
await check('incidents change real inputs and generated waste, then clear', "(async()=>{document.querySelector('[data-page=scenarios]').click();document.querySelector('#resetBtn').click();document.querySelector('#stepBtn').click();const baseline=await window.__readReport();for(const type of ['rain','festival','road','breakdown','surge','facility']){document.querySelector('#resetBtn').click();const b=document.querySelector('[data-incident='+type+']');b.click();document.querySelector('#stepBtn').click();const r=await window.__readReport();if(!r.incidents.some(i=>i.type===type))return false;if(type==='rain'&&r.conditions.rain!=='heavy')return false;if(type==='festival'&&!r.conditions.festival)return false;if(type==='road'&&r.conditions.roadClosures!==1)return false;if(type==='facility'&&r.conditions.processingCapacity!==.7)return false;if(['rain','festival','surge'].includes(type)&&r.history.at(-1).generated<=baseline.history.at(-1).generated)return false;if(type==='breakdown'&&!r.assignments.some(v=>v.status==='Breakdown'&&v.assignedBin===null))return false;const ids=r.assignments.map(v=>v.assignedBin).filter(Boolean);if(new Set(ids).size!==ids.length)return false;b.click();const cleared=await window.__readReport();if(cleared.incidents.some(i=>i.type===type))return false;}return true})()");
await check('what-if presets preserve live state and assignments', "(async()=>{document.querySelector('#resetBtn').click();document.querySelector('#stepBtn').click();const select=r=>JSON.stringify([r.metrics,r.conditions,r.assignments,r.decisionLog]),before=select(await window.__readReport());for(const b of document.querySelectorAll('[data-lab-preset]'))b.click();return select(await window.__readReport())===before})()");
await check('Copilot prompts provide deterministic current-state explanations', "(()=>{document.querySelector('#copilotBtn').click();let ok=true;for(const b of document.querySelectorAll('[data-copilot]')){b.click();const answer=document.querySelector('#copilotAnswer').textContent;ok&&=answer.length>10&&!answer.includes('No answer available')}document.querySelector('#copilotClose').click();return ok})()");
await check('invalid fleet targets show a visible error without advancing time', "(()=>{document.querySelector('#resetBtn').click();document.querySelector('#targetRisk').value='';const before=document.querySelector('#simClock').textContent;document.querySelector('#findFleetBtn').click();return !document.querySelector('#errorBanner').classList.contains('hidden')&&document.querySelector('#simClock').textContent===before})()");
await check('reset clears errors and map filters', "(()=>{document.querySelector('#zoneFilter').value='Waluj';document.querySelector('#riskFilter').value='critical';document.querySelector('#resetBtn').click();return document.querySelector('#errorBanner').classList.contains('hidden')&&document.querySelector('#zoneFilter').value==='all'&&document.querySelector('#riskFilter').value==='all'})()");
await check('export includes assumptions and null unobserved measurements', "(async()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;try{URL.createObjectURL=blob=>{window.__reportBlob=blob;return create(blob)};HTMLAnchorElement.prototype.click=()=>{};document.querySelector('#exportBtn').click()}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}const r=JSON.parse(await window.__reportBlob.text());return r.schemaVersion===2&&r.metrics.recordedAverageDelayMinutes===null&&r.metrics.serviceLevel===null&&r.metrics.averageBinsPerTrip===null&&r.methodology.urgency.includes('not a probability')})()");
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:profile},null);
await evaluate("document.querySelector('#exportBtn').click()");
const reportPath=path.join(profile,'AI-WasteTwin-simulation-report.json');
let downloaded;
for(let n=0;n<100;n++){try{downloaded=JSON.parse(fs.readFileSync(reportPath,'utf8'));break}catch(e){await sleep(100)}}
assert.ok(downloaded,'the real export produces a readable downloaded JSON file');
assert.equal(downloaded.schemaVersion,2);
assert.equal(downloaded.metrics.binsCollected,0);
assert.equal(downloaded.metrics.serviceLevel,null);
checks++;console.log('PASS: actual browser download contains the baseline simulation report');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await check('all bins fit the default mobile map', "(()=>{document.querySelector('[data-page=twin]').click();document.querySelector('#mapReset').click();const box=document.querySelector('#cityMap').getBoundingClientRect(),bins=[...document.querySelectorAll('#cityMap .bin')];return bins.length===100&&bins.every(e=>{const r=e.getBoundingClientRect();return e.tabIndex===0&&r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom})})()");
await evaluate("document.querySelector('#mapZoomIn').click();document.querySelector('#cityMap').scrollIntoView({behavior:'instant',block:'center'})");
await sleep(350); // Let the responsive sidebar transition finish before hit testing.
const drag=await evaluate("(()=>{const r=document.querySelector('#cityMap').getBoundingClientRect();return {x:r.left+30,y:r.top+180,before:document.querySelector('#cityMap svg').getAttribute('viewBox')}})()");
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:drag.x,y:drag.y,button:'left',buttons:1,clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x+50,y:drag.y,button:'left',buttons:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x+50,y:drag.y,button:'left',buttons:0,clickCount:1});
assert.notEqual(await evaluate("document.querySelector('#cityMap svg').getAttribute('viewBox')"),drag.before,'pointer drag pans the map');checks++;console.log('PASS: pointer drag pans the map');
await check('arrow keys pan the zoomed map', "(()=>{const city=document.querySelector('#cityMap'),svg=city.querySelector('svg'),before=svg.getAttribute('viewBox');city.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return before!==svg.getAttribute('viewBox')})()");
await evaluate("document.querySelector('#cityMap .bin').focus()");
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await check('keyboard selection opens bin details', "document.querySelector('#assetDetail').classList.contains('is-open') && document.activeElement.id==='closeDetail'");
const exceptions=events.filter(e=>e.method==='Runtime.exceptionThrown');
assert.equal(exceptions.length,0,'no uncaught application errors');console.log('PASS: no uncaught application errors');checks++;
console.log(checks+' browser regression checks passed.');

  console.log('ERRORS',JSON.stringify(events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Network.loadingFailed'||(e.method==='Log.entryAdded'&&e.params.entry.level==='error'))));
  console.log('HTTP_FAILURES',JSON.stringify(events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400).map(e=>({url:e.params.response.url,status:e.params.response.status}))));
  await send('Browser.close',{},null).catch(()=>{});
 }catch(e){console.log('AUDIT_ERROR',e.stack);if(ws&&ws.readyState===1){ws.send(JSON.stringify({id:++seq,method:'Browser.close'}));await sleep(500);ws.close()}child.kill();process.exitCode=1}
 finally{
 await sleep(500);child.kill();
 const resolved=path.resolve(profile),tempRoot=path.resolve(os.tmpdir());
 if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('wastetwin-audit-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:200})}catch(e){console.log('TEMP_PROFILE',profile)}}
 }
})()
