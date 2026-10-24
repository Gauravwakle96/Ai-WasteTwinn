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
