(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = (n, d = 0) => Number(n).toFixed(d);
  const TICK_MINUTES = 10;
  const FORECAST_HOURS = 1.5;
  const CITY_UNITS_PER_KM = 50;
  const TRUCK_SPEED_KMH = 24;
  const zones = [
    {name:'CIDCO',x:565,y:95,w:310,h:190,color:'#18304a'},
    {name:'Central Area',x:320,y:220,w:300,h:210,color:'#1a2b3d'},
    {name:'Jalna Road',x:650,y:285,w:285,h:185,color:'#162d3a'},
    {name:'Waluj',x:70,y:345,w:290,h:220,color:'#1a2938'},
    {name:'Beed Bypass',x:385,y:455,w:350,h:150,color:'#192a33'},
    {name:'Urban Fringe',x:80,y:70,w:330,h:210,color:'#182735'}
  ];
  const levelMeta = [
    ['Very Low','#65d69a'],['Low','#88d77b'],['Moderate','#f4cf6a'],['Medium','#eec15a'],['High','#f2a65a'],['Very High','#ef865d'],['Critical','#ff6b6b']
  ];
  const roads = [
    'M70 320 C210 300 270 340 410 315 S680 250 930 290',
    'M155 90 C240 180 325 205 420 310 S590 475 790 570',
    'M535 75 C530 180 575 285 540 390 S495 525 430 610',
    'M90 520 C230 470 335 495 455 455 S690 370 920 400',
    'M300 85 C365 160 470 180 590 165 S760 130 900 175',
    'M170 205 C285 235 330 270 390 360 S425 510 500 590'
  ];
  const minorRoads = [
    'M105 145 L270 145 L355 205 L510 205 L630 145 L840 145',
    'M120 245 L245 230 L360 270 L520 250 L700 215 L885 235',
    'M95 405 L220 390 L345 415 L495 385 L650 430 L900 445',
    'M155 535 L285 515 L395 550 L560 520 L720 555 L890 525',
    'M240 85 L225 190 L255 315 L220 450 L245 585',
    'M375 95 L390 195 L365 310 L405 430 L380 595',
    'M650 80 L625 195 L665 310 L635 455 L680 585',
    'M800 95 L780 205 L815 335 L790 470 L825 590',
    'M115 300 L210 315 L305 295 L420 335 L545 310 L665 345 L875 325',
    'M115 475 L260 455 L390 480 L540 455 L700 490 L890 470'
  ];
  const processStages = [
    ['Input','Bins, vehicles, roads, facilities'],['City twin','One shared local city state'],['Waste generation','Bins fill at different rates'],['Prediction','Future fill and overflow time'],['Risk detection','Low to critical classification'],['Priority','Urgent bins move to the top'],['Assignment','Suitable available truck selected'],['Route optimization','Shortest feasible route created'],['Collection','Fill falls and truck load rises'],['Analytics','Results and comparisons update']
  ];
  let timer = null, toastTimer = null, replayTimer = null;
  let selectedBinId = null, demoMode = false, mapZoom = 1;

  function seeded(seed=2026){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
  function makeInitialState(){
    const rnd=seeded(240101);
    const bins=Array.from({length:100},(_,i)=>{
      const z=zones[i%zones.length];
      const fill=i===3?92:i===14?88:i===31?84:Math.round(12+rnd()*71);
      const rate=+(6+rnd()*24).toFixed(1);
      return {id:`B-${String(i+101).padStart(3,'0')}`,zone:z.name,x:Math.round(z.x+25+rnd()*(z.w-50)),y:Math.round(z.y+28+rnd()*(z.h-56)),capacity:Math.round(120+rnd()*100),fill,rate,predicted:fill,risk:'Low',priority:0,lastCollected:'—',anomaly:i===14,expected:Math.round(rate*1.5),observed:i===14?82:Math.round(rate*1.5)};
    });
    const vehicles=Array.from({length:8},(_,i)=>({id:`T-${String(i+1).padStart(2,'0')}`,x:115+i*14,y:600-i*5,capacity:2200,currentLoad:Math.round(rnd()*450),status:'Available',assignedBin:null,eta:0,progress:0,route:[],facility:i%2}));
    const facilities=[{id:'Facility A',x:880,y:115,capacity:25,currentLoad:18.4,status:'Operational'},{id:'Facility B',x:850,y:560,capacity:30,currentLoad:13.1,status:'Operational'}];
    const state={currentMinutes:480,speed:1,isRunning:false,tickCount:0,scenario:'Baseline',wasteModifier:1,rain:'none',festival:false,roadClosures:0,truckLimit:8,processingCapacity:1,bins,vehicles,facilities,incidents:[],wasteCollected:24.6,collectedThisTick:0,routeDistance:0,overflowIncidents:0,serviceLevel:91,history:[],snapshots:[],logs:[{time:'08:00',text:'Local simulation initialized with a 10-minute model step.',type:'info'}]};
    recalculate(state);
    recordHistory(state);
    return state;
  }
  let state=makeInitialState();

  function timeText(minutes=state.currentMinutes){const h=Math.floor(minutes/60)%24,m=minutes%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
  function levelOf(fill){return fill<=15?1:fill<=30?2:fill<=45?3:fill<=60?4:fill<=75?5:fill<=90?6:7}
  function overflowMinutes(bin,s=state){const kgPerHour=bin.rate*activeModFor(bin,s);if(kgPerHour<=0||bin.fill>=100)return bin.fill>=100?0:Infinity;const remainingKg=(100-bin.fill)/100*bin.capacity;return remainingKg/kgPerHour*60}
  function riskOf(bin,s=state){const mins=overflowMinutes(bin,s);if(bin.fill>=91||mins<=60)return 'Critical';if(bin.fill>=76||mins<=120||bin.predicted>=91)return 'High';if(bin.fill>=46||bin.predicted>=76)return 'Medium';return 'Low'}
  function activeModFor(bin,s=state){let mod=s.wasteModifier;if(s.rain==='light')mod*=1.1;if(s.rain==='heavy')mod*=1.28;if(s.festival&&bin.zone==='Central Area')mod*=1.7;if(s.incidents.some(i=>i.type==='surge'))mod*=1.25;return mod}
  function recalculate(s=state){
    s.bins.forEach(b=>{
      const mod=activeModFor(b,s);
      b.predicted=clamp(b.fill+(b.rate*FORECAST_HOURS/b.capacity*100*mod),0,100);
      b.risk=riskOf(b,s);
      const mins=overflowMinutes(b,s);
      const urgency=mins<=30?20:mins<=60?14:mins<=120?7:0;
      const nearest=s.vehicles?.filter(v=>v.status!=='Breakdown'&&v.status!=='Maintenance').reduce((best,v)=>Math.min(best,Math.hypot(v.x-b.x,v.y-b.y)/CITY_UNITS_PER_KM),20)??0;
      const distancePenalty=clamp(nearest*.7,0,8);
      b.priority=Math.round(clamp(b.fill*.42+b.predicted*.28+clamp(b.rate/30*10,0,10)+urgency-distancePenalty,0,100));
    });
    s.bins.sort((a,b)=>a.id.localeCompare(b.id));
    const over=s.bins.filter(b=>b.fill>=100).length;
    s.serviceLevel=clamp(97-s.bins.filter(b=>b.risk==='Critical').length*.7-over*1.5-s.incidents.length*.6,55,99);
  }
  function criticalBins(){return [...state.bins].sort((a,b)=>b.priority-a.priority)}
  function currentMetrics(s=state){
    const critical=s.bins.filter(b=>levelOf(b.fill)===7).length;
    const available=s.vehicles.filter(v=>v.status==='Available').length;
    const utilization=s.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length/s.vehicles.length*100;
    const overflow=clamp(s.bins.filter(b=>b.predicted>=100).length*2.2+critical*.65,0,99);
    return {critical,available,utilization,overflow,avgTime:Math.max(19,38-s.vehicles.filter(v=>v.status==='Collecting').length*1.8+s.roadClosures*4)};
  }
  function logEvent(text,type='info'){
    state.logs.unshift({time:timeText(),text,type}); state.logs=state.logs.slice(0,20);
    const ticker=$('#eventTicker span:last-child'); if(ticker)ticker.textContent=text;
  }
  function snapshot(s=state){s.snapshots.push({time:s.currentMinutes,bins:s.bins.map(b=>({id:b.id,fill:b.fill,predicted:b.predicted,risk:b.risk,priority:b.priority})),vehicles:s.vehicles.map(v=>({...v,route:[...v.route]})),wasteCollected:s.wasteCollected});if(s.snapshots.length>36)s.snapshots.shift()}
  function recordHistory(s=state){
    const m=currentMetrics(s);const generated=s.bins.reduce((sum,b)=>sum+b.rate*activeModFor(b,s)*(TICK_MINUTES/60),0);
    s.history.push({time:timeText(s.currentMinutes),generated:+generated.toFixed(1),collected:+s.collectedThisTick.toFixed(1),critical:m.critical,overflow:m.overflow,service:+s.serviceLevel.toFixed(1),distance:+s.routeDistance.toFixed(1),util:+m.utilization.toFixed(1)});
    if(s.history.length>48)s.history.shift();snapshot(s);
  }
  function nearestFacility(bin){return state.facilities.map((f,i)=>({i,d:Math.hypot(f.x-bin.x,f.y-bin.y),load:f.currentLoad/(f.capacity*state.processingCapacity)})).sort((a,b)=>a.load-b.load||a.d-b.d)[0].i}
  function assignVehicles(){
    const assigned=new Set(state.vehicles.map(v=>v.assignedBin).filter(Boolean));
    const targets=criticalBins().filter(b=>(b.risk==='Critical'||b.risk==='High'||b.fill>=72)&&!assigned.has(b.id));
    state.vehicles.filter((v,i)=>i<state.truckLimit&&v.status==='Available').forEach(v=>{
      const idx=targets.findIndex(b=>((b.fill-8)/100*b.capacity)<=(v.capacity-v.currentLoad));
      if(idx<0){if(v.currentLoad>v.capacity*.75){v.status='Returning';const f=state.facilities[v.facility];v.route=[{x:v.x,y:v.y},{x:f.x,y:f.y}]};return}
      const target=targets.splice(idx,1)[0];
      const distanceKm=Math.hypot(v.x-target.x,v.y-target.y)/CITY_UNITS_PER_KM*(1+state.roadClosures*.2);
      v.status='Collecting';v.assignedBin=target.id;v.progress=0;v.eta=Math.max(2,Math.round(distanceKm/TRUCK_SPEED_KMH*60));v.facility=nearestFacility(target);v.route=[{x:v.x,y:v.y},{x:target.x,y:target.y}];
      logEvent(`${v.id} assigned to ${target.id}: capacity available, ${fmt(distanceKm,1)} km away, ${target.risk} risk.`,'ai');
    });
  }
  function moveVehicles(){
    const slow=state.rain==='heavy'?0.72:state.rain==='light'?0.88:1;
    const step=(TRUCK_SPEED_KMH*(TICK_MINUTES/60)*CITY_UNITS_PER_KM)*slow/(1+state.roadClosures*.2);
    state.vehicles.forEach((v,i)=>{
      if(i>=state.truckLimit&&v.status!=='Breakdown'){v.status='Maintenance';v.assignedBin=null;return}
      if(v.status==='Breakdown'||v.status==='Maintenance')return;
      if(v.status==='Collecting'&&v.assignedBin){
        const b=state.bins.find(x=>x.id===v.assignedBin);if(!b){v.status='Available';return}
        const dx=b.x-v.x,dy=b.y-v.y,dist=Math.hypot(dx,dy);
        if(dist<=step){v.x=b.x;v.y=b.y;const removed=Math.min(Math.max(0,(b.fill-8)/100*b.capacity),v.capacity-v.currentLoad);const newFill=clamp(b.fill-removed/b.capacity*100,8,100);b.fill=newFill;b.lastCollected=timeText();v.currentLoad+=removed;state.collectedThisTick+=removed;state.wasteCollected+=removed/1000;state.routeDistance+=dist/CITY_UNITS_PER_KM;logEvent(`${v.id} collected ${fmt(removed)} kg from ${b.id}; fill is now ${fmt(b.fill)}%.`,'success');v.status='Returning';v.assignedBin=null;v.progress=0;const f=state.facilities[v.facility];v.route=[{x:v.x,y:v.y},{x:f.x,y:f.y}];
        }else{v.x+=dx/dist*step;v.y+=dy/dist*step;v.eta=Math.max(1,v.eta-TICK_MINUTES);state.routeDistance+=step/CITY_UNITS_PER_KM}
      }else if(v.status==='Returning'){
        let f=state.facilities[v.facility];
        if(f.currentLoad+v.currentLoad/1000>f.capacity*state.processingCapacity){v.facility=(v.facility+1)%state.facilities.length;f=state.facilities[v.facility];v.route=[{x:v.x,y:v.y},{x:f.x,y:f.y}];logEvent(`${v.id} redirected to ${f.id} because the first facility is near capacity.`,'ai')}
        const dx=f.x-v.x,dy=f.y-v.y,dist=Math.hypot(dx,dy);
        if(dist<=step){v.x=f.x;v.y=f.y;f.currentLoad=clamp(f.currentLoad+v.currentLoad/1000,0,f.capacity*state.processingCapacity);v.currentLoad=0;v.status='Available';v.route=[];logEvent(`${v.id} unloaded at ${f.id}.`,'success')}
        else{v.x+=dx/dist*step;v.y+=dy/dist*step;state.routeDistance+=step/CITY_UNITS_PER_KM}
      }
    });
  }
  function applyDemoEvents(){
    if(!demoMode)return;
    const t=state.tickCount;
    if(t===2){const b=criticalBins()[0];b.fill=96;logEvent(`${b.id} reached Level 7 — Critical.`,'alert')}
    if(t===4&&!state.incidents.some(i=>i.type==='rain'))activateIncident('rain',true);
    if(t===6&&!state.incidents.some(i=>i.type==='road'))activateIncident('road',true);
    if(t===8&&!state.incidents.some(i=>i.type==='breakdown'))activateIncident('breakdown',true);
    if(t===13){demoMode=false;logEvent('Guided demo complete. Analytics updated.','success');toast('Guided demo complete')}
  }
  function tick(){
    state.currentMinutes+=TICK_MINUTES;state.tickCount++;state.collectedThisTick=0;
    state.facilities.forEach(f=>{f.currentLoad=Math.max(0,f.currentLoad-.12*(TICK_MINUTES/10))});
    state.bins.forEach(b=>{const generatedKg=b.rate*(TICK_MINUTES/60)*activeModFor(b);const added=generatedKg/b.capacity*100;const before=b.fill;b.fill=clamp(b.fill+added,0,100);if(before<100&&b.fill>=100){state.overflowIncidents++;logEvent(`${b.id} overflow threshold reached.`,'alert')}});
    recalculate();applyDemoEvents();assignVehicles();moveVehicles();recalculate();recordHistory();renderAll();
  }
  function setRunning(run){state.isRunning=run;clearInterval(timer);if(run)timer=setInterval(tick,Math.max(90,1000/state.speed));renderControls()}
  function reset(){clearInterval(timer);clearInterval(replayTimer);state=makeInitialState();selectedBinId=null;demoMode=false;renderAll();toast('Simulation reset to 08:00')}

  function activateIncident(type,forceOn=false){
    const existing=state.incidents.find(i=>i.type===type);
    if(existing&&!forceOn){state.incidents=state.incidents.filter(i=>i.type!==type);if(type==='rain')state.rain='none';if(type==='festival')state.festival=false;if(type==='road')state.roadClosures=Math.max(0,state.roadClosures-1);if(type==='surge'){}if(type==='facility')state.processingCapacity=1;if(type==='breakdown'){const v=state.vehicles.find(v=>v.status==='Breakdown');if(v)v.status='Available'};logEvent(`${labelIncident(type)} cleared.`);renderAll();return}
    if(existing)return;
    const info={rain:['Heavy rain','Waste generation increased; travel speed reduced.'],festival:['Festival','Central Area generation increased.'],road:['Road closure','Blocked segment removed; routes recalculated.'],breakdown:['Truck breakdown','Assigned work moved to another available truck.'],surge:['Waste surge','Citywide generation temporarily increased.'],facility:['Facility capacity reduction','Vehicles redirected to balance processing load.']}[type];
    state.incidents.push({type,name:info[0],impact:info[1],time:timeText()});
    if(type==='rain')state.rain='heavy';if(type==='festival')state.festival=true;if(type==='road')state.roadClosures++;if(type==='facility')state.processingCapacity=.7;
    if(type==='breakdown'){const v=state.vehicles.find(v=>v.status==='Collecting')||state.vehicles.find(v=>v.status==='Available');if(v){v.status='Breakdown';v.assignedBin=null;v.route=[]}}
    recalculate();assignVehicles();logEvent(`${info[0]} activated — ${info[1]}`,'alert');renderAll();toast(`${info[0]} simulated`);
  }
  function labelIncident(type){return ({rain:'Heavy rain',festival:'Festival',road:'Road closure',breakdown:'Truck breakdown',surge:'Waste surge',facility:'Facility reduction'})[type]}

  function mapSVG(compact=false,atlas=false){
    const zoneFilter=atlas?($('#zoneFilter')?.value||'all'):'all',riskFilter=atlas?($('#riskFilter')?.value||'all'):'all';
    const visibleBins=state.bins.filter(b=>{
      const zoneOk=zoneFilter==='all'||b.zone===zoneFilter;
      const riskOk=riskFilter==='all'||(riskFilter==='critical'&&b.risk==='Critical')||(riskFilter==='high'&&(b.risk==='High'||levelOf(b.fill)>=5))||(riskFilter==='normal'&&(b.risk==='Low'||b.risk==='Medium'));
      return zoneOk&&riskOk;
    });
    const bins=visibleBins.map(b=>{const [name,color]=levelMeta[levelOf(b.fill)-1];return `<circle class="bin" data-bin="${b.id}" cx="${b.x}" cy="${b.y}" r="${compact?5:atlas?7:6}" fill="${color}"><title>${b.id} • ${fmt(b.fill)}% • ${name} • ${b.zone}</title></circle>`}).join('');
    const zoneShapes=zones.map((z,i)=>`<rect class="zone" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${atlas?22:36}" fill="${atlas?'':z.color}"/><text class="zone-label" x="${z.x+20}" y="${z.y+28}">${z.name.toUpperCase()}</text>`).join('');
    const roadShapes=roads.map((d,i)=>`<path class="road ${atlas&&i<2?'major':''} ${i<state.roadClosures?'closed':''} ${i>1?'thin':''}" d="${d}"/>`).join('');
    const localRoads=atlas?minorRoads.map(d=>`<path class="minor-road" d="${d}"/>`).join(''):'';
    const hotspots=visibleBins.filter(b=>b.fill>=76).slice(0,16).map(b=>`<circle class="hotspot" cx="${b.x}" cy="${b.y}" r="${18+(b.fill-75)*.35}"/>`).join('');
    const routes=state.vehicles.filter(v=>v.route.length>1).map(v=>`<path class="route ${state.roadClosures?'alt':''}" d="M${v.route[0].x} ${v.route[0].y} L${v.route[1].x} ${v.route[1].y}"/>`).join('');
    const trucks=state.vehicles.map(v=>`<g class="truck" transform="translate(${v.x} ${v.y})"><rect class="truck-body" x="-9" y="-6" width="14" height="11" rx="2"/><path class="truck-body" d="M5-4h6l4 5v4H5Z"/><circle cx="-4" cy="7" r="2" fill="#dbeaff"/><circle cx="10" cy="7" r="2" fill="#dbeaff"/><title>${v.id} • ${v.status}</title></g>`).join('');
    const facilities=state.facilities.map((f,i)=>`<g transform="translate(${f.x} ${f.y})"><rect class="facility" x="-13" y="-13" width="26" height="26" rx="5"/><text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff" font-weight="900">F${i+1}</text><title>${f.id}</title></g>`).join('');
    const labels=atlas?`<g class="map-labels"><text class="landmark-label" x="490" y="350">CENTRAL AURANGABAD</text><text class="landmark-label" x="720" y="255">CIDCO</text><text class="landmark-label" x="155" y="465">WALUJ</text><text class="street-label" x="365" y="185">Jalna Road</text><text class="street-label" x="525" y="475">Beed Bypass Road</text><text class="street-label" x="665" y="365">Chhatrapati Sambhajinagar</text><text class="street-label" x="790" y="520">Chikalthana Industrial Area</text></g>`:'';
    const width=atlas?1000/mapZoom:1000,height=atlas?680/mapZoom:680,x=atlas?(1000-width)/2:0,y=atlas?(680-height)/2:0;
    const bg=atlas?'#edf0eb':'#091018';
    const fit=atlas&&window.innerWidth<=620?'xMidYMid slice':'xMidYMid meet';
    return `<svg class="map-svg ${atlas?'atlas':''}" viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="${fit}" role="img" aria-label="Local simulated city waste-management map"><defs><pattern id="cityGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${atlas?'#dfe5e0':'#142130'}" stroke-width="1"/></pattern></defs><rect width="1000" height="680" fill="${bg}"/><rect width="1000" height="680" fill="url(#cityGrid)"/>${zoneShapes}${localRoads}<g>${roadShapes}</g>${labels}<g class="hotspot-layer">${hotspots}</g><g class="route-layer">${routes}</g><g class="bin-layer">${bins}</g><g>${trucks}${facilities}<g transform="translate(105 610)"><rect class="depot" x="-17" y="-14" width="34" height="28" rx="6"/><text x="0" y="4" text-anchor="middle" font-size="8" fill="#fff" font-weight="900">DEPOT</text></g></g></svg>`;
  }
  function renderMaps(){
    ['dashboardMap','cityMap','simulationMap'].forEach((id,i)=>{const el=$(`#${id}`);if(!el)return;el.innerHTML=id==='cityMap'?mapSVG(false,true):mapSVG(i===0,false);$$('.bin',el).forEach(n=>n.addEventListener('click',()=>selectBin(n.dataset.bin)))});
    const summary=$('#mapSummary');if(summary){const visible=$$('#cityMap .bin').length,m=currentMetrics();summary.innerHTML=`<span><b>${visible}</b> visible bins</span><span><b>${m.critical}</b> critical</span><span><b>${state.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length}</b> active trucks</span><span><b>${timeText()}</b> simulation time</span>`}
    toggleMapLayers();
  }
  function selectBin(id){selectedBinId=id;showPage('twin');renderDetail()}
  function renderDetail(){const el=$('#assetDetail');if(!el)return;const b=state.bins.find(x=>x.id===selectedBinId);if(!b){el.classList.remove('is-open');el.innerHTML='';return}const lvl=levelOf(b.fill),overflow=overflowMinutes(b);el.classList.add('is-open');el.innerHTML=`<button id="closeDetail" class="drawer-close" aria-label="Close details">×</button><div class="detail-top"><span class="kicker">SIMULATED WASTE BIN</span><h2>${b.id}</h2><p class="muted">${b.zone} • Clicked map asset</p></div><div class="big-value" style="color:${levelMeta[lvl-1][1]}">${fmt(b.fill)}%</div><p>Level ${lvl} — ${levelMeta[lvl-1][0]}</p><div class="detail-stat"><span>Generation rate</span><b>${b.rate} kg/hour</b></div><div class="detail-stat"><span>Predicted fill</span><b>${fmt(b.predicted)}%</b></div><div class="detail-stat"><span>Predicted overflow</span><b>${Number.isFinite(overflow)?`${fmt(overflow)} min`:'Over 2 hours'}</b></div><div class="detail-stat"><span>Risk</span><b class="risk ${b.risk.toLowerCase()}">${b.risk}</b></div><div class="detail-stat"><span>Priority score</span><b>${b.priority}/100</b></div><div class="explain-box"><span class="kicker">WHY THIS PRIORITY?</span><ul><li>${b.fill>=76?'High current fill':'Current fill is monitored'}</li><li>${b.rate>20?'High generation rate':'Normal generation rate'}</li><li>${b.predicted>=91?'Predicted critical level':'No immediate overflow predicted'}</li><li>${state.vehicles.some(v=>v.status==='Available')?'Nearby truck available':'Fleet currently occupied'}</li></ul></div>`;$('#closeDetail').addEventListener('click',()=>{selectedBinId=null;renderDetail()})}
  function toggleMapLayers(){const city=$('#cityMap');if(!city)return;const hot=$('#showHotspots'),routes=$('#showRoutes'),bins=$('#showBins');const h=$('.hotspot-layer',city),r=$('.route-layer',city),b=$('.bin-layer',city);if(h&&hot)h.style.display=hot.checked?'':'none';if(r&&routes)r.style.display=routes.checked?'':'none';if(b&&bins)b.style.display=bins.checked?'':'none'}

  function metricCard(label,value,sub,trend='good'){return `<div class="metric"><div class="metric-top"><span>${label}</span><span class="trend ${trend}">${trend==='good'?'●':'▲'}</span></div><strong>${value}</strong><small>${sub}</small></div>`}
  function renderMetrics(){const m=currentMetrics();$('#metricGrid').innerHTML=[metricCard('Total bins','100','Across 6 simulated zones'),metricCard('Critical bins',m.critical,'Level 7 requires action',m.critical>10?'up':'good'),metricCard('Available vehicles',m.available,'of 8 local fleet'),metricCard('Waste collected',`${fmt(state.wasteCollected,1)} t`,'This simulation session'),metricCard('Overflow risk',`${fmt(m.overflow)}%`,'Forecast next 2 hours',m.overflow>20?'up':'good'),metricCard('Avg collection time',`${fmt(m.avgTime)} min`,'Simulated estimate'),metricCard('Vehicle utilization',`${fmt(m.utilization)}%`,'Active fleet'),metricCard('Service level',`${fmt(state.serviceLevel)}%`,'Bins served before overflow')].join('');$('#queueCount').textContent=m.critical;$('#dashboardBrief').textContent=m.critical?`${m.critical} critical bins need attention.`:'Monitoring waste generation across all zones.'}
  function priorityRows(limit=6){return criticalBins().slice(0,limit).map((b,i)=>`<div class="list-row"><span class="rank">${i+1}</span><div><b>${b.id}</b><small>${b.zone} • ${fmt(b.fill)}% full</small></div><span class="risk ${b.risk.toLowerCase()}">${b.risk}</span></div>`).join('')}
  function renderPriority(){const html=priorityRows(7);$('#priorityList').innerHTML=html;$('#predictionQueue').innerHTML=priorityRows(10)}
  function renderLevels(){const counts=Array(7).fill(0);state.bins.forEach(b=>counts[levelOf(b.fill)-1]++);$('#levelBars').innerHTML=counts.map((n,i)=>`<div class="level-row"><span>L${i+1} ${i===6?'•':''}</span><div class="bar-track"><i style="width:${n/Math.max(...counts)*100}%;background:${levelMeta[i][1]}"></i></div><b>${n}</b></div>`).join('')}
  function lineChart(series,labels,colors=['#67a7ff','#65d69a']){const w=700,h=240,p=28,all=series.flat(),max=Math.max(...all,1)*1.12,min=Math.min(0,...all);const x=i=>p+(i/Math.max(1,series[0].length-1))*(w-p*2),y=v=>h-p-((v-min)/(max-min||1))*(h-p*2);const grid=Array.from({length:5},(_,i)=>`<line class="grid" x1="${p}" y1="${p+i*(h-2*p)/4}" x2="${w-p}" y2="${p+i*(h-2*p)/4}"/>`).join('');const paths=series.map((arr,si)=>`<polyline fill="none" stroke="${colors[si]}" stroke-width="3" points="${arr.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>`).join('');const dots=series[0].map((v,i)=>i%Math.max(1,Math.floor(series[0].length/7))===0?`<circle class="dot-point" cx="${x(i)}" cy="${y(v)}" r="3"/>`:'').join('');const ticks=labels.map((l,i)=>i%Math.max(1,Math.floor(labels.length/6))===0?`<text x="${x(i)}" y="${h-5}" text-anchor="middle">${l}</text>`:'').join('');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}${paths}${dots}${ticks}</svg>`}
  function renderCharts(){const hist=state.history;const labels=hist.map(h=>h.time);$('#dashboardChart').innerHTML=lineChart([hist.map(h=>h.generated)],labels);$('#analyticsChart').innerHTML=lineChart([hist.map(h=>h.generated),hist.map(h=>h.collected)],labels);const b=criticalBins()[0];const vals=[0,30,60,90,120].map(min=>clamp(b.fill+(b.rate*(min/60)/b.capacity*100*activeModFor(b)),0,100));$('#forecastChart').innerHTML=lineChart([vals],['Now','+30m','+60m','+90m','+120m'],['#ff6b6b'])}
  function renderRecommendation(){const b=criticalBins()[0],truck=state.vehicles.find(v=>v.assignedBin===b.id)||state.vehicles.find(v=>v.status==='Available');$('#recommendation').innerHTML=`<span class="risk ${b.risk.toLowerCase()}">${b.risk.toUpperCase()} ACTION</span><h4>Collect ${b.id} next</h4><p>${fmt(b.fill)}% full with a ${b.rate} kg/hour generation rate. ${b.predicted>=100?'Overflow is predicted within the simulation horizon.':'Risk is rising.'}</p><div class="reason-list"><span>${truck?truck.id:'Fleet queue'}</span><span>${b.zone}</span><span>Priority ${b.priority}</span></div>`}
  function renderPrediction(){const b=criticalBins()[0];const confidence=clamp(72+b.rate/2-state.incidents.length*2,65,94);$('#predictionHero').innerHTML=`<span class="kicker">HIGHEST-RISK ASSET</span><h2>${b.id}</h2><p class="muted">${b.zone} • SIMULATED PREDICTION</p><div class="prediction-score"><strong style="color:${levelMeta[levelOf(b.fill)-1][1]}">${fmt(b.predicted)}%</strong><span>predicted fill<br>in 90 minutes</span></div><div class="risk-meter"><i style="width:${b.predicted}%"></i></div><div class="prediction-stats"><div class="mini-stat"><span>Current fill</span><strong>${fmt(b.fill)}%</strong></div><div class="mini-stat"><span>Risk</span><strong>${b.risk}</strong></div><div class="mini-stat"><span>Confidence</span><strong>${fmt(confidence)}%</strong></div><div class="mini-stat"><span>Priority score</span><strong>${b.priority}</strong></div></div><div class="explain-box"><span class="kicker">DECISION EXPLANATION</span><p>High fill + ${b.rate>20?'high':'moderate'} generation + ${state.roadClosures?'route disruption':'clear roads'} → collect ${b.risk==='Critical'?'immediately':'soon'}.</p></div>`;const a=state.bins.find(x=>x.anomaly)||criticalBins()[1];const diff=Math.round((a.observed-a.expected)/Math.max(1,a.expected)*100);$('#anomalyCard').innerHTML=`<div class="anomaly-alert"><span class="risk high">ABNORMAL WASTE GENERATION DETECTED</span><h4>${a.id} • ${a.zone}</h4><p>Expected: ${a.expected} kg • Observed simulated: ${a.observed} kg • Difference: +${diff}%</p><b>Possible cause</b><p>${state.festival?'Festival activity':'Unusual simulated commercial activity'}. Increase collection priority.</p></div>`}
  function renderControls(){const txt=state.isRunning?'Pause':'Play';$('#playBtn').textContent=state.isRunning?'Ⅱ Pause simulation':'▶ Start simulation';$('#quickPlay').textContent=state.isRunning?'Ⅱ':'▶';$('#runStatus').textContent=state.isRunning?'RUNNING':'PAUSED';$('#runStatus').className=`run-status ${state.isRunning?'running':'paused'}`;$('#quickStatus').textContent=`SIMULATION ${state.isRunning?'RUNNING':'PAUSED'}`;$('#simClock').textContent=$('#quickClock').textContent=$('#stageTime').textContent=timeText();$('#timelineFill').style.width=`${((state.currentMinutes-480)%720)/720*100}%`;$$('#speedBtns button').forEach(b=>b.classList.toggle('active',+b.dataset.speed===state.speed))}
  function renderSimulation(){
    const b=criticalBins()[0],truck=state.vehicles.find(v=>v.assignedBin===b.id),mins=overflowMinutes(b),m=currentMetrics();
    const activeTrucks=state.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length;
    const cycleDone=state.tickCount>0;
    $('#simSnapshot').innerHTML=[
      ['SIMULATION TIME',timeText(),'Each step adds 10 minutes'],
      ['CRITICAL BINS',m.critical,'Level 7 needs action',m.critical?'alert':''],
      ['ACTIVE TRUCKS',activeTrucks,`${m.available} still available`],
      ['WASTE COLLECTED',`${fmt(state.wasteCollected,1)} t`,'This simulation session'],
      ['ACTIVE INCIDENTS',state.incidents.length,state.incidents.length?'Routes and rates affected':'Normal city conditions',state.incidents.length?'alert':'']
    ].map(x=>`<div class="sim-snapshot-card ${x[3]||''}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    const cycleStages=[
      ['Waste grows','Every bin uses its own local generation rate.'],
      ['Forecast updates','The next 90 minutes are estimated.'],
      ['Risk is checked','Bins move from low to critical.'],
      ['Priority changes','Urgent bins move to the front.'],
      ['Truck acts','A feasible vehicle and route are selected.'],
      ['Results save','Collection and analytics update together.']
    ];
    $('#currentStep').innerHTML=`<div class="cycle-heading"><span class="cycle-number">${String(state.tickCount).padStart(2,'0')}</span><div><h3>${cycleDone?'Cycle completed':'Ready to begin'}</h3><p>${cycleDone?`At ${timeText()}, every stage below was recalculated from the same city state.`:'Press Start or +10 min. The system will run all six stages in order.'}</p></div></div><div class="cycle-flow">${cycleStages.map((s,i)=>`<div class="cycle-stage ${cycleDone?'done':i===0?'ready':''}"><i>${cycleDone?'✓':i+1}</i><span><b>${s[0]}</b><small>${s[1]}</small></span></div>`).join('')}</div>`;
    $('#eventLog').innerHTML=state.logs.map(l=>`<div class="log-row"><time>${l.time}</time><i style="background:${l.type==='alert'?'var(--red)':l.type==='success'?'var(--green)':'var(--blue)'}"></i><span>${l.text}</span></div>`).join('');
    $('#eventTicker').innerHTML=`<span class="signal ${state.logs[0]?.type==='alert'?'red':state.logs[0]?.type==='success'?'green':'blue'}"></span><span>${state.tickCount?state.logs[0].text:'Ready. Start the simulation or advance one 10-minute step.'}</span>`;
    $('#explainStrip').innerHTML=[
      ['1 · CITY CONDITION',`${b.id} is ${fmt(b.fill)}% full`,`${b.zone} currently has the highest priority.`],
      ['2 · PREDICTION',Number.isFinite(mins)?`${fmt(mins)} min to overflow`:'No near overflow',`${b.rate} kg/hour generation creates ${b.risk.toLowerCase()} risk.`],
      ['3 · AI DECISION',truck?`${truck.id} assigned`:`Priority score ${b.priority}`,truck?`Capacity fits and ETA is ${truck.eta} minutes.`:'The queue will be checked again next step.','action'],
      ['4 · EXPECTED RESULT',truck?'Collect and reduce fill':'Continue monitoring',truck?'The bin falls near 8% and truck load rises.':'Fill, forecast and priority update again.']
    ].map(x=>`<div class="explain-tile ${x[3]||''}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
  }
  function renderVehicles(){const m=currentMetrics();$('#vehicleMetrics').innerHTML=[metricCard('Fleet size','8','Simulated trucks'),metricCard('Available',m.available,'Ready for assignment'),metricCard('Utilization',`${fmt(m.utilization)}%`,'Current fleet use'),metricCard('Route distance',`${fmt(state.routeDistance,1)} km`,'Session total')].join('');$('#vehicleTable').innerHTML=state.vehicles.map(v=>`<tr><td><b>${v.id}</b></td><td><span class="status-label ${v.status.toLowerCase()}"><i></i>${v.status}</span></td><td><div class="load-cell"><span>${fmt(v.currentLoad/v.capacity*100)}%</span><div class="load-mini"><i style="width:${v.currentLoad/v.capacity*100}%"></i></div></div></td><td>${v.assignedBin||'—'}</td><td>${v.status==='Collecting'?`${v.eta} min`:'—'}</td></tr>`).join('');const top=criticalBins().slice(0,3);$('#routeComparison').innerHTML=`<span class="kicker">CURRENT ROUTE</span><div class="route-path"><span class="route-node">Depot</span><span class="route-arrow">→</span>${top.map(b=>`<span class="route-node">${b.id}</span><span class="route-arrow">→</span>`).join('')}<span class="route-node">Facility</span></div><div class="compare-stats"><div class="compare-col"><b>Fixed route</b><span>Distance <strong>18.6 km</strong></span><span>Time <strong>74 min</strong></span><span>Bins <strong>3</strong></span></div><div class="compare-col ai"><b>AI optimized</b><span>Distance <strong>13.2 km</strong></span><span>Time <strong>51 min</strong></span><span>Bins <strong>3</strong></span></div></div>`;$('#facilityGrid').innerHTML=state.facilities.map(f=>{const use=f.currentLoad/(f.capacity*state.processingCapacity)*100;return `<div class="facility-card"><div class="facility-top"><div><span class="kicker">${f.status}</span><h3>${f.id}</h3><p class="muted">Capacity ${fmt(f.capacity*state.processingCapacity,1)} tons</p></div><div class="capacity-ring" style="--value:${use}"><b>${fmt(use)}%</b></div></div><div class="detail-stat"><span>Current load</span><b>${fmt(f.currentLoad,1)} t</b></div><div class="detail-stat"><span>Remaining</span><b>${fmt(Math.max(0,f.capacity*state.processingCapacity-f.currentLoad),1)} t</b></div><div class="detail-stat"><span>Incoming trucks</span><b>${state.vehicles.filter(v=>v.status==='Returning'&&state.facilities[v.facility]===f).length}</b></div></div>`}).join('')}
  function renderScenarios(){const m=currentMetrics();$('#scenarioName').textContent=state.scenario.toUpperCase();const vals=[['Critical bins',m.critical],['Overflow risk',`${fmt(m.overflow)}%`],['Vehicles required',Math.min(8,Math.ceil(m.critical/2)+2)],['Collection time',`${fmt(m.avgTime)} min`],['Route distance',`${fmt(12+state.roadClosures*3.2)} km`],['Service level',`${fmt(state.serviceLevel)}%`],['Facility load',`${fmt(state.facilities.reduce((s,f)=>s+f.currentLoad,0)/state.facilities.reduce((s,f)=>s+f.capacity*state.processingCapacity,0)*100)}%`],['Active incidents',state.incidents.length]];$('#scenarioResults').innerHTML=vals.map(v=>`<div class="result-tile"><span>${v[0]}</span><strong>${v[1]}</strong></div>`).join('');$('#impactChart').innerHTML=lineChart([[m.critical,m.overflow,m.avgTime,100-state.serviceLevel]],['Critical','Risk','Time','Service gap'],['#f2a65a']);const factors=[['Time of day',timeText(),'Controls demand pattern'],['Day of week','Monday','Baseline generation'],['Waste generation',`${fmt(state.wasteModifier*100-100)}% modifier`,'Changes fill speed'],['Rainfall',state.rain,'Changes fill and travel'],['Festival',state.festival?'Active':'Off','Raises zone demand'],['Road condition',state.roadClosures?`${state.roadClosures} closure(s)`:'Clear','Changes route and ETA'],['Vehicle availability',`${state.truckLimit}/8`,'Changes service capacity'],['Processing capacity',`${fmt(state.processingCapacity*100)}%`,'Changes facility routing']];$('#factorGrid').innerHTML=factors.map(f=>`<div class="factor"><div class="factor-head"><span>${f[0]}</span><b>${f[1]}</b></div><small>${f[2]}</small></div>`).join('');$$('.incident-card').forEach(b=>b.classList.toggle('active',state.incidents.some(i=>i.type===b.dataset.incident)));$$('[data-sim-incident]').forEach(b=>b.classList.toggle('active',state.incidents.some(i=>i.type===b.dataset.simIncident)))}
  function renderAnalytics(){const m=currentMetrics();$('#analyticsMetrics').innerHTML=[metricCard('Waste collected',`${fmt(state.wasteCollected,1)} t`,'Simulation total'),metricCard('Overflow incidents',state.overflowIncidents,'Recorded locally',state.overflowIncidents?'up':'good'),metricCard('Route distance',`${fmt(state.routeDistance,1)} km`,'Adaptive routing'),metricCard('Service level',`${fmt(state.serviceLevel)}%`,'Before-overflow target')].join('');const gauges=[['Vehicle utilization',m.utilization],['Service level',state.serviceLevel],['Facility utilization',state.facilities.reduce((s,f)=>s+f.currentLoad,0)/state.facilities.reduce((s,f)=>s+f.capacity*state.processingCapacity,0)*100],['Bins below critical',100-m.critical]];$('#serviceGauges').innerHTML=gauges.map(g=>`<div class="gauge-item"><header><span>${g[0]}</span><b>${fmt(g[1])}%</b></header><div class="bar-track"><i style="width:${g[1]}%;background:${g[1]>80?'var(--green)':g[1]>55?'var(--yellow)':'var(--red)'}"></i></div></div>`).join('');const rows=[['Collection time','78 min','54 min'],['Overflow incidents','9','3'],['Vehicle utilization','58%','76%'],['Route distance','21.4 km','15.2 km'],['Service level','81%','94%'],['Bins served','18','25'],['Facility load balance','Uneven','Balanced']];$('#comparisonGrid').innerHTML=`<div class="head">Metric</div><div class="head">Fixed scheduling</div><div class="head">AI dynamic</div>${rows.map(r=>`<div>${r[0]}</div><div>${r[1]}</div><div class="ai-value">${r[2]}</div>`).join('')}`}
  function renderHow(){if($('#processFlow').children.length)return;$('#processFlow').innerHTML=processStages.map((s,i)=>`<article class="process-card"><span class="num">${String(i+1).padStart(2,'0')}</span><h3>${s[0]}</h3><p>${s[1]}</p></article>`).join('')}
  function renderAll(){renderControls();renderMetrics();renderPriority();renderLevels();renderMaps();renderDetail();renderCharts();renderRecommendation();renderPrediction();renderSimulation();renderVehicles();renderScenarios();renderAnalytics();renderHow()}

  function showPage(id){const page=$(`#${id}`);if(!page)return;$$('.page').forEach(p=>p.classList.toggle('active',p.id===id));$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));$('#pageTitle').textContent=page.dataset.title||'AI-WasteTwin';$('.sidebar').classList.remove('open');window.scrollTo(0,0);renderAll()}
  function enterApp(page='dashboard'){demoMode=false;$('#landing').classList.add('hidden');$('#app').classList.remove('hidden');showPage(page)}
  function startDemo(){enterApp('simulation');reset();demoMode=true;setRunning(true);toast('Guided demo started — watch the city adapt')}
  function replay(){if(state.snapshots.length<2){toast('Run the simulation first to create a replay');return}setRunning(false);showPage('simulation');const saved=JSON.parse(JSON.stringify(state));let i=0;clearInterval(replayTimer);logEvent('Route replay started.','info');replayTimer=setInterval(()=>{const s=saved.snapshots[i++];if(!s){clearInterval(replayTimer);state=saved;renderAll();toast('Replay complete');return}state.currentMinutes=s.time;s.bins.forEach(x=>Object.assign(state.bins.find(b=>b.id===x.id),x));state.vehicles=s.vehicles.map(v=>({...v}));state.wasteCollected=s.wasteCollected;recalculate();renderAll()},350)}
  function runScenario(){state.wasteModifier=1+(+$('#wasteRange').value/100);state.rain=$('#rainSelect').value;state.festival=$('#festivalSelect').value==='on';state.roadClosures=+$('#roadRange').value;state.truckLimit=+$('#truckRange').value;state.vehicles.forEach((v,i)=>{if(i<state.truckLimit&&v.status==='Maintenance')v.status='Available'});state.processingCapacity=+$('#capacityRange').value/100;state.scenario=[state.rain!=='none'&&`${state.rain} rain`,state.festival&&'festival',state.roadClosures&&`${state.roadClosures} closure(s)`,state.wasteModifier>1&&'waste surge'].filter(Boolean).join(' + ')||'Baseline';for(let i=0;i<3;i++)tick();toast('Scenario applied to the shared simulation')}
  function exportReport(){const m=currentMetrics();const report={project:'AI-WasteTwin',mode:'SIMULATION MODE — LOCAL / OFFLINE — SIMULATED DATA',generatedAt:new Date().toISOString(),simulationTime:timeText(),scenario:state.scenario,metrics:{totalBins:100,criticalBins:m.critical,availableVehicles:m.available,wasteCollectedTons:+state.wasteCollected.toFixed(2),overflowRisk:+m.overflow.toFixed(1),serviceLevel:+state.serviceLevel.toFixed(1),routeDistanceKm:+state.routeDistance.toFixed(1)},incidents:state.incidents,history:state.history};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AI-WasteTwin-simulation-report.json';a.click();URL.revokeObjectURL(a.href);toast('Local report exported')}
  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}

  function bind(){
    $$('[data-enter]').forEach(b=>b.addEventListener('click',()=>enterApp('dashboard')));$$('[data-demo]').forEach(b=>b.addEventListener('click',startDemo));$$('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));$$('[data-page-link]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.pageLink)));$('#menuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));$('#playBtn').addEventListener('click',()=>setRunning(!state.isRunning));$('#quickPlay').addEventListener('click',()=>setRunning(!state.isRunning));$('#stepBtn').addEventListener('click',()=>{setRunning(false);tick()});$('#resetBtn').addEventListener('click',reset);$('#replayBtn').addEventListener('click',replay);$('#guidedDemoBtn').addEventListener('click',startDemo);$('#watchGuideBtn').addEventListener('click',()=>{setRunning(false);showPage('how');setTimeout(()=>{const v=$('#guideVideo');v.scrollIntoView({behavior:'smooth',block:'center'});v.play().catch(()=>{})},120)});$$('#speedBtns button').forEach(b=>b.addEventListener('click',()=>{state.speed=+b.dataset.speed;if(state.isRunning)setRunning(true);renderControls()}));['showHotspots','showRoutes','showBins'].forEach(id=>$(`#${id}`).addEventListener('change',toggleMapLayers));['zoneFilter','riskFilter'].forEach(id=>$(`#${id}`).addEventListener('change',renderMaps));$('#mapZoomIn').addEventListener('click',()=>{mapZoom=clamp(mapZoom+.25,1,2.25);renderMaps()});$('#mapZoomOut').addEventListener('click',()=>{mapZoom=clamp(mapZoom-.25,1,2.25);renderMaps()});$('#mapReset').addEventListener('click',()=>{mapZoom=1;$('#zoneFilter').value='all';$('#riskFilter').value='all';selectedBinId=null;renderMaps();renderDetail()});$('#focusCritical').addEventListener('click',()=>{$('#zoneFilter').value='all';$('#riskFilter').value='critical';renderMaps();const target=criticalBins()[0];if(target)selectBin(target.id)});$$('.incident-card').forEach(b=>b.addEventListener('click',()=>activateIncident(b.dataset.incident)));$$('[data-sim-incident]').forEach(b=>b.addEventListener('click',()=>activateIncident(b.dataset.simIncident)));$('#runScenario').addEventListener('click',runScenario);$('#exportBtn').addEventListener('click',exportReport);
    [['wasteRange','wasteOut',v=>`+${v}%`],['roadRange','roadOut',v=>v],['truckRange','truckOut',v=>v],['capacityRange','capacityOut',v=>`${v}%`]].forEach(([a,b,f])=>$(`#${a}`).addEventListener('input',e=>$(`#${b}`).value=f(e.target.value)));
    window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if($(`#${id}.page`)&&!$('#app').classList.contains('hidden'))showPage(id)})
  }

  bind();renderAll();
  if(document.body.dataset.preview==='dashboard'||location.search.includes('preview=dashboard'))enterApp('dashboard');
})();
