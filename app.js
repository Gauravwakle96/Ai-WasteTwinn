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
  const OPERATIONAL_CAPACITY = .90;
  const EMERGENCY_RISK = 96;
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
  const guidedStory = [
    {stage:'OBSERVE',title:'WASTE IS GROWING',message:'Bin B-104 is filling faster than normal.',next:'Predict future fill'},
    {stage:'PREDICT',title:'AI PREDICTS OVERFLOW',message:'The 90-minute forecast detects a future overflow before the bin reaches 100%.',next:'Calculate priority'},
    {stage:'PRIORITIZE',title:'AI PRIORITIZES THE BIN',message:'B-104 moves to the front of the explainable collection queue.',next:'Select a suitable truck'},
    {stage:'DISPATCH',title:'TRUCK DISPATCHED',message:'The nearest feasible truck is assigned with capacity, route and ETA checks.',next:'Collect B-104'},
    {stage:'COLLECT',title:'WASTE COLLECTED',message:'The bin falls near 8% while the truck load increases.',next:'Re-evaluate nearby bins'},
    {stage:'RE-EVALUATE',title:'AI RE-EVALUATES',message:'Nearby bins are scanned again using risk, distance and remaining capacity.',next:'Collect the best nearby bin'},
    {stage:'COLLECT',title:'DYNAMIC MULTI-BIN COLLECTION',message:'The truck continues to another suitable bin instead of dumping immediately.',next:'Check capacity again'},
    {stage:'DUMP',title:'SMART DUMP-SITE SELECTION',message:'The best available facility is selected using distance, load and availability.',next:'Adapt to disruption'},
    {stage:'OPTIMIZE',title:'ROUTE REPLANNED',message:'A road disruption changes the route; the old plan is replaced automatically.',next:'Stabilize the city'},
    {stage:'RESULT',title:'CITY STABILIZED',message:'The simulated result is recorded with fewer unnecessary dump trips.',next:'Review the decision log'}
  ];
  let timer = null, toastTimer = null, replayTimer = null;
  let selectedBinId = null, demoMode = false, demoPaused = false, visitorMode = true, mapZoom = 1, currentTwinLayer = 'physical', labResults = null;

  function seeded(seed=2026){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
  function makeInitialState(){
    const rnd=seeded(240101);
    const bins=Array.from({length:100},(_,i)=>{
      const z=zones[i%zones.length];
      const fill=i===3?92:i===14?88:i===31?84:Math.round(12+rnd()*71);
      const rate=+(6+rnd()*24).toFixed(1);
      const wasteTypes=['organic','plastic','paper','glass','metal','e-waste','hazardous','mixed'];
      return {id:`B-${String(i+101).padStart(3,'0')}`,zone:z.name,x:Math.round(z.x+25+rnd()*(z.w-50)),y:Math.round(z.y+28+rnd()*(z.h-56)),capacity:Math.round(120+rnd()*100),fill,rate,predicted:fill,risk:'Low',priority:0,priorityBreakdown:{},lastCollected:'—',anomaly:i===14,expected:Math.round(rate*1.5),observed:i===14?82:Math.round(rate*1.5),wasteType:wasteTypes[i%wasteTypes.length],zonePriority:z.name==='Central Area'?1:z.name==='Jalna Road'?0.8:0.55};
    });
    const vehicles=Array.from({length:8},(_,i)=>({id:`T-${String(i+1).padStart(2,'0')}`,x:115+i*14,y:600-i*5,capacity:2200,currentLoad:Math.round(rnd()*450),status:'Available',assignedBin:null,nextTarget:null,eta:0,progress:0,route:[],facility:i%2,collectedBins:[],routeVersion:0,lastDecision:'Waiting for assignment',dumpTrips:0}));
    const facilities=[{id:'DS-01',x:880,y:115,capacity:25,currentLoad:23.5,status:'Operational',traffic:.35,compatibility:['organic','plastic','paper','glass','metal','mixed']},{id:'DS-02',x:850,y:560,capacity:30,currentLoad:12.6,status:'Operational',traffic:.12,compatibility:['organic','plastic','paper','glass','metal','e-waste','hazardous','mixed']}];
    const state={currentMinutes:480,speed:1,isRunning:false,isGuided:false,demoStep:0,tickCount:0,scenario:'Baseline',wasteModifier:1,rain:'none',festival:false,roadClosures:0,truckLimit:8,processingCapacity:1,bins,vehicles,facilities,incidents:[],wasteCollected:24.6,collectedThisTick:0,binsCollected:0,overflowPrevented:0,routeDistance:0,overflowIncidents:0,serviceLevel:91,dumpTrips:0,recoveredWaste:0,simulatedCost:0,reports:[],history:[],snapshots:[],logs:[{time:'08:00',text:'Local simulation initialized with a 10-minute model step.',type:'info'}]};
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
      const overflowProbability=clamp((b.predicted-65)*2.5+(mins<=45?20:mins<=90?10:0),0,100);
      const nearest=s.vehicles?.filter(v=>v.status!=='Breakdown'&&v.status!=='Maintenance').reduce((best,v)=>Math.min(best,Math.hypot(v.x-b.x,v.y-b.y)/CITY_UNITS_PER_KM),20)??0;
      const fillScore=clamp(b.fill*.25,0,25);
      const overflowScore=overflowProbability*.30;
      const growthScore=clamp((b.rate*mod)/30*15,0,15);
      const zoneScore=(b.zonePriority||.55)*10;
      const routeScore=clamp(12-nearest*1.15,0,12);
      const specialScore=clamp((b.anomaly?4:0)+(s.festival&&b.zone==='Central Area'?2:0)+(s.rain==='heavy'?1:0)+(s.incidents.some(i=>i.type==='surge')?1:0),0,8);
      b.overflowProbability=Math.round(overflowProbability);
      b.distanceKm=+nearest.toFixed(1);
      b.priorityBreakdown={overflow:Math.round(overflowScore),fill:Math.round(fillScore),growth:Math.round(growthScore),zone:Math.round(zoneScore),route:Math.round(routeScore),special:Math.round(specialScore)};
      b.priority=Math.round(clamp(overflowScore+fillScore+growthScore+zoneScore+routeScore+specialScore,0,100));
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
    const avgTime=Math.max(19,38-s.vehicles.filter(v=>v.status==='Collecting').length*1.8+s.roadClosures*4);
    const avgBinsPerTrip=s.dumpTrips?s.binsCollected/s.dumpTrips:s.binsCollected;
    return {critical,available,utilization,overflow,avgTime,avgBinsPerTrip};
  }
  function logEvent(text,type='info'){
    state.logs.unshift({time:timeText(),text,type}); state.logs=state.logs.slice(0,20);
    const ticker=$('#eventTicker span:last-child'); if(ticker)ticker.textContent=text;
  }
  function snapshot(s=state){s.snapshots.push({time:s.currentMinutes,bins:s.bins.map(b=>({id:b.id,fill:b.fill,predicted:b.predicted,risk:b.risk,priority:b.priority})),vehicles:s.vehicles.map(v=>({...v,route:v.route.map(p=>({...p})),collectedBins:[...v.collectedBins],wasteTypes:[...(v.wasteTypes||[])]})),wasteCollected:s.wasteCollected,binsCollected:s.binsCollected,overflowPrevented:s.overflowPrevented,dumpTrips:s.dumpTrips});if(s.snapshots.length>36)s.snapshots.shift()}
  function recordHistory(s=state){
    const m=currentMetrics(s);const generated=s.bins.reduce((sum,b)=>sum+b.rate*activeModFor(b,s)*(TICK_MINUTES/60),0);
    s.history.push({time:timeText(s.currentMinutes),generated:+generated.toFixed(1),collected:+s.collectedThisTick.toFixed(1),critical:m.critical,overflow:m.overflow,service:+s.serviceLevel.toFixed(1),distance:+s.routeDistance.toFixed(1),util:+m.utilization.toFixed(1)});
    if(s.history.length>48)s.history.shift();snapshot(s);
  }
  function binPayload(bin){return Math.max(0,(bin.fill-8)/100*bin.capacity)}
  function facilityChoice(vehicle,wasteType='mixed'){
    return state.facilities.map((f,i)=>{
      const distance=Math.hypot(f.x-vehicle.x,f.y-vehicle.y)/CITY_UNITS_PER_KM;
      const load=f.currentLoad/(f.capacity*state.processingCapacity);
      const available=f.status==='Operational'&&load<1;
      const compatible=f.compatibility?.includes(wasteType)||f.compatibility?.includes('mixed');
      const score=distance*2+load*42+(f.traffic||0)*12+(available?0:100)+(compatible?0:35);
      return {i,f,distance,load,available,compatible,score};
    }).sort((a,b)=>a.score-b.score)[0]
  }
  function routeToFacility(v,reason='capacity threshold reached'){
    const type=v.wasteTypes?.[0]||'mixed',choice=facilityChoice(v,type),old=state.facilities[v.facility];
    v.facility=choice.i;v.status='Returning';v.assignedBin=null;v.nextTarget=null;v.routeVersion++;v.route=[{x:v.x,y:v.y},{x:choice.f.x,y:choice.f.y}];
    v.lastDecision=`${choice.f.id} selected: ${Math.round(choice.load*100)}% load, ${fmt(choice.distance,1)} km, compatible`;
    logEvent(`${v.id} routed to ${choice.f.id} — ${reason}. ${old&&old.id!==choice.f.id?`${old.id} was less suitable.`:''}`,'ai');
  }
  function eligibleCandidates(v,excludeId=null){
    const assigned=new Set(state.vehicles.map(x=>x.assignedBin).filter(Boolean));
    const remaining=v.capacity-v.currentLoad;
    return criticalBins().filter(b=>{
      if(b.id===excludeId||assigned.has(b.id)||b.fill<45)return false;
      const payload=binPayload(b);if(payload>remaining)return false;
      const projected=(v.currentLoad+payload)/v.capacity;
      const emergency=b.overflowProbability>=EMERGENCY_RISK&&payload<=remaining;
      return (b.risk==='Critical'||b.risk==='High'||b.priority>=58)&&(projected<=OPERATIONAL_CAPACITY||emergency);
    }).map(b=>{
      const distance=Math.hypot(v.x-b.x,v.y-b.y)/CITY_UNITS_PER_KM*(1+state.roadClosures*.2);
      const emergency=b.overflowProbability>=EMERGENCY_RISK;
      const score=b.priority-clamp(distance*3.5,0,28)+(emergency?12:0);
      return {b,distance,score,emergency,projected:(v.currentLoad+binPayload(b))/v.capacity};
    }).sort((a,b)=>b.score-a.score||a.distance-b.distance)
  }
  function assignVehicleToTarget(v,target,reason){
    const distance=Math.hypot(v.x-target.x,v.y-target.y)/CITY_UNITS_PER_KM*(1+state.roadClosures*.2);
    v.status='Collecting';v.assignedBin=target.id;v.progress=0;v.eta=Math.max(2,Math.round(distance/TRUCK_SPEED_KMH*60));v.routeVersion++;v.route=[{x:v.x,y:v.y},{x:target.x,y:target.y}];
    const preview=eligibleCandidates(v,target.id)[0];v.nextTarget=preview?.b.id||null;
    v.lastDecision=`${target.id}: priority ${target.priority}/100, ${fmt(distance,1)} km, ${fmt((v.capacity-v.currentLoad)/v.capacity*100)}% capacity remaining`;
    logEvent(`${v.id} selected ${target.id}. Reason: ${reason}; priority ${target.priority}/100; route v${v.routeVersion}.`,'ai');
  }
  function assignVehicles(){
    state.vehicles.filter((v,i)=>i<state.truckLimit&&v.status==='Available').forEach(v=>{
      const candidate=eligibleCandidates(v)[0];
      if(!candidate){if(v.currentLoad/v.capacity>=.55)routeToFacility(v,'no suitable nearby bin');return}
      assignVehicleToTarget(v,candidate.b,candidate.emergency?'emergency overflow override':'high risk + capacity fit + efficient route');
    });
  }
  function moveVehicles(){
    const slow=state.rain==='heavy'?0.72:state.rain==='light'?0.88:1;
    const step=(TRUCK_SPEED_KMH*(TICK_MINUTES/60)*CITY_UNITS_PER_KM)*slow/(1+state.roadClosures*.2);
    state.vehicles.forEach((v,i)=>{
      if(i>=state.truckLimit&&v.status!=='Breakdown'){v.status='Maintenance';v.assignedBin=null;v.route=[];return}
      if(v.status==='Breakdown'||v.status==='Maintenance')return;
      if(v.status==='Collecting'&&v.assignedBin){
        const b=state.bins.find(x=>x.id===v.assignedBin);if(!b){v.status='Available';return}
        const dx=b.x-v.x,dy=b.y-v.y,dist=Math.hypot(dx,dy);
        if(dist<=step){
          v.x=b.x;v.y=b.y;
          const wasPredictedOverflow=b.predicted>=100||b.overflowProbability>=90;
          const removed=Math.min(binPayload(b),v.capacity-v.currentLoad);
          b.fill=clamp(b.fill-removed/b.capacity*100,8,100);b.lastCollected=timeText();
          v.currentLoad+=removed;v.collectedBins.push(b.id);v.wasteTypes=(v.wasteTypes||[]).concat(b.wasteType);v.progress=0;
          state.collectedThisTick+=removed;state.wasteCollected+=removed/1000;state.binsCollected++;if(wasPredictedOverflow)state.overflowPrevented++;
          state.routeDistance+=dist/CITY_UNITS_PER_KM;state.simulatedCost+=dist/CITY_UNITS_PER_KM*1.6;
          logEvent(`${v.id} collected ${b.id}; bin ${fmt(b.fill)}%, truck ${fmt(v.currentLoad/v.capacity*100)}%. Nearby bins re-evaluated.`,'success');
          recalculate();
          const next=eligibleCandidates(v,b.id)[0];
          if(next){
            const emergency=next.emergency&&next.projected>OPERATIONAL_CAPACITY;
            assignVehicleToTarget(v,next.b,emergency?'emergency override near capacity':'nearby high risk + low detour');
          }else{
            routeToFacility(v,v.currentLoad/v.capacity>=OPERATIONAL_CAPACITY?'90% operational threshold reached':'no suitable nearby bin');
          }
        }else{
          v.x+=dx/dist*step;v.y+=dy/dist*step;v.eta=Math.max(1,v.eta-TICK_MINUTES);
          state.routeDistance+=step/CITY_UNITS_PER_KM;state.simulatedCost+=step/CITY_UNITS_PER_KM*1.6;
        }
      }else if(v.status==='Returning'){
        let choice=facilityChoice(v,v.wasteTypes?.[0]||'mixed'),f=choice.f;
        if(v.facility!==choice.i){const old=state.facilities[v.facility];v.facility=choice.i;v.routeVersion++;v.route=[{x:v.x,y:v.y},{x:f.x,y:f.y}];logEvent(`${v.id} redirected from ${old?.id||'facility'} to ${f.id}: better capacity and compatibility.`,'ai')}
        const dx=f.x-v.x,dy=f.y-v.y,dist=Math.hypot(dx,dy);
        if(dist<=step){
          v.x=f.x;v.y=f.y;f.currentLoad=clamp(f.currentLoad+v.currentLoad/1000,0,f.capacity*state.processingCapacity);
          state.recoveredWaste+=v.currentLoad/1000*.46;state.dumpTrips++;v.dumpTrips++;
          v.currentLoad=0;v.status='Available';v.route=[];v.collectedBins=[];v.wasteTypes=[];v.lastDecision=`Unloaded at ${f.id}; ready for re-assignment`;
          logEvent(`${v.id} unloaded at ${f.id}. Dynamic collection trip completed.`,'success')
        }else{
          v.x+=dx/dist*step;v.y+=dy/dist*step;state.routeDistance+=step/CITY_UNITS_PER_KM;state.simulatedCost+=step/CITY_UNITS_PER_KM*1.6;
        }
      }
    });
  }
  function applyDemoEvents(){
    if(!demoMode)return;
    const t=state.tickCount;
    state.demoStep=clamp(t-1,0,guidedStory.length-1);
    const b=state.bins.find(x=>x.id==='B-104'),v=state.vehicles.find(x=>x.id==='T-03');
    if(t===1){b.fill=76;b.rate=42;recalculate();logEvent('B-104 is filling faster than its expected local pattern.','alert')}
    if(t===2){b.fill=82;recalculate();logEvent(`B-104 predicted fill ${fmt(b.predicted)}%; future overflow detected.`,'ai')}
    if(t===3){b.fill=92;recalculate();logEvent(`B-104 priority ${b.priority}/100 — moved to the front of the queue.`,'ai')}
    if(t===4){
      state.vehicles.filter(x=>x.assignedBin===b.id).forEach(x=>{x.status='Available';x.assignedBin=null;x.route=[]});
      v.status='Available';v.x=b.x-35;v.y=b.y+18;assignVehicleToTarget(v,b,'guided demo: nearest suitable truck');
    }
    if(t===5&&v.assignedBin){v.x=b.x;v.y=b.y}
    if(t===6&&v.assignedBin){const target=state.bins.find(x=>x.id===v.assignedBin);if(target){v.x=target.x;v.y=target.y}}
    if(t===7){v.currentLoad=Math.max(v.currentLoad,v.capacity*.84);logEvent(`${v.id} capacity check: ${fmt(v.currentLoad/v.capacity*100)}% loaded; emergency-risk bins remain eligible.`,'ai')}
    if(t===8&&!['Returning','Breakdown'].includes(v.status))routeToFacility(v,'guided demo capacity check');
    if(t===9&&!state.incidents.some(i=>i.type==='road'))activateIncident('road',true);
    if(t===10){demoMode=false;state.isGuided=false;logEvent('CITY STABILIZED — guided demo complete; simulated results recorded.','success');setTimeout(()=>setRunning(false),20);toast('Guided demo complete')}
  }
  function tick(){
    state.currentMinutes+=TICK_MINUTES;state.tickCount++;state.collectedThisTick=0;
    state.facilities.forEach(f=>{f.currentLoad=Math.max(0,f.currentLoad-.12*(TICK_MINUTES/10))});
    state.reports.forEach(r=>{if(r.step<5&&state.tickCount%2===0){r.step++;if(r.step===2)logEvent(`${r.id} assigned to an available vehicle.`,'ai');if(r.step===5)logEvent(`${r.id} resolved after simulated collection.`,'success')}});
    state.bins.forEach(b=>{const generatedKg=b.rate*(TICK_MINUTES/60)*activeModFor(b);const added=generatedKg/b.capacity*100;const before=b.fill;b.fill=clamp(b.fill+added,0,100);if(before<100&&b.fill>=100){state.overflowIncidents++;logEvent(`${b.id} overflow threshold reached.`,'alert')}});
    recalculate();applyDemoEvents();assignVehicles();moveVehicles();recalculate();recordHistory();renderAll();
  }
  function setRunning(run){state.isRunning=run;clearInterval(timer);if(run&&!demoPaused)timer=setInterval(tick,state.isGuided?6000:Math.max(90,1000/state.speed));renderControls()}
  function reset(){clearInterval(timer);clearInterval(replayTimer);state=makeInitialState();selectedBinId=null;demoMode=false;demoPaused=false;labResults=null;renderAll();toast('Simulation reset to 08:00')}

  function activateIncident(type,forceOn=false){
    const existing=state.incidents.find(i=>i.type===type);
    if(existing&&!forceOn){state.incidents=state.incidents.filter(i=>i.type!==type);if(type==='rain')state.rain='none';if(type==='festival')state.festival=false;if(type==='road')state.roadClosures=Math.max(0,state.roadClosures-1);if(type==='surge'){}if(type==='facility')state.processingCapacity=1;if(type==='breakdown'){const v=state.vehicles.find(v=>v.status==='Breakdown');if(v)v.status='Available'};logEvent(`${labelIncident(type)} cleared.`);renderAll();return}
    if(existing)return;
    const info={rain:['Heavy rain','Waste generation increased; travel speed reduced.'],festival:['Festival','Central Area generation increased.'],road:['Road closure','Blocked segment removed; routes recalculated.'],breakdown:['Truck breakdown','Assigned work moved to another available truck.'],surge:['Waste surge','Citywide generation temporarily increased.'],facility:['Facility capacity reduction','Vehicles redirected to balance processing load.']}[type];
    state.incidents.push({type,name:info[0],impact:info[1],time:timeText()});
    if(type==='rain')state.rain='heavy';if(type==='festival')state.festival=true;if(type==='road')state.roadClosures++;if(type==='facility')state.processingCapacity=.7;
    if(type==='breakdown'){const v=state.vehicles.find(v=>v.status==='Collecting')||state.vehicles.find(v=>v.status==='Available');if(v){const lost=v.assignedBin;v.status='Breakdown';v.assignedBin=null;v.nextTarget=null;v.route=[];v.lastDecision='Unavailable: simulated breakdown';logEvent(`${v.id} failed${lost?`; ${lost} returned to the priority queue`:''}.`,'alert')}}
    if(type==='road')state.vehicles.filter(v=>v.route.length>1).forEach(v=>{v.routeVersion++;v.lastDecision='Route updated because a road segment closed'});
    recalculate();assignVehicles();logEvent(`${info[0]} activated — ${info[1]}`,'alert');renderAll();toast(`${info[0]} simulated`);
  }
  function labelIncident(type){return ({rain:'Heavy rain',festival:'Festival',road:'Road closure',breakdown:'Truck breakdown',surge:'Waste surge',facility:'Facility reduction'})[type]}
  function activateCityCrisis(){
    ['rain','surge','road','breakdown','facility'].forEach(type=>{if(!state.incidents.some(i=>i.type===type))activateIncident(type,true)});
    state.scenario='CITY CRISIS';logEvent('CITY CRISIS detected → priorities, assignments, routes and facilities recalculated.','alert');renderAll();toast('City Crisis simulation activated')
  }

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
    const dataLabels=atlas&&currentTwinLayer==='data'?visibleBins.filter(b=>b.fill>=60).slice(0,32).map(b=>`<text class="bin-data-label" x="${b.x+9}" y="${b.y-8}">${fmt(b.fill)}%</text>`).join(''):'';
    const aiLabels=atlas&&currentTwinLayer==='ai'?visibleBins.filter(b=>b.priority>=58).slice(0,28).map(b=>`<g class="ai-marker"><circle cx="${b.x}" cy="${b.y}" r="${10+b.priority/18}"/><text x="${b.x+10}" y="${b.y-10}">P${b.priority}</text></g>`).join(''):'';
    const trucks=state.vehicles.map(v=>`<g class="truck" transform="translate(${v.x} ${v.y})"><rect class="truck-body" x="-9" y="-6" width="14" height="11" rx="2"/><path class="truck-body" d="M5-4h6l4 5v4H5Z"/><circle cx="-4" cy="7" r="2" fill="#dbeaff"/><circle cx="10" cy="7" r="2" fill="#dbeaff"/><title>${v.id} • ${v.status}</title></g>`).join('');
    const facilities=state.facilities.map((f,i)=>`<g transform="translate(${f.x} ${f.y})"><rect class="facility" x="-13" y="-13" width="26" height="26" rx="5"/><text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff" font-weight="900">F${i+1}</text><title>${f.id}</title></g>`).join('');
    const labels=atlas?`<g class="map-labels"><text class="landmark-label" x="490" y="350">CENTRAL AURANGABAD</text><text class="landmark-label" x="720" y="255">CIDCO</text><text class="landmark-label" x="155" y="465">WALUJ</text><text class="street-label" x="365" y="185">Jalna Road</text><text class="street-label" x="525" y="475">Beed Bypass Road</text><text class="street-label" x="665" y="365">Chhatrapati Sambhajinagar</text><text class="street-label" x="790" y="520">Chikalthana Industrial Area</text></g>`:'';
    const width=atlas?1000/mapZoom:1000,height=atlas?680/mapZoom:680,x=atlas?(1000-width)/2:0,y=atlas?(680-height)/2:0;
    const bg=atlas?'#edf0eb':'#091018';
    const fit=atlas&&window.innerWidth<=620?'xMidYMid slice':'xMidYMid meet';
    return `<svg class="map-svg ${atlas?'atlas':''} layer-${currentTwinLayer}" viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="${fit}" role="img" aria-label="Local simulated city waste-management map"><defs><pattern id="cityGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${atlas?'#dfe5e0':'#142130'}" stroke-width="1"/></pattern></defs><rect width="1000" height="680" fill="${bg}"/><rect width="1000" height="680" fill="url(#cityGrid)"/>${zoneShapes}${localRoads}<g>${roadShapes}</g>${labels}<g class="hotspot-layer">${hotspots}</g><g class="route-layer">${routes}</g><g class="ai-layer">${aiLabels}</g><g class="bin-layer">${bins}</g><g class="data-layer">${dataLabels}</g><g>${trucks}${facilities}<g transform="translate(105 610)"><rect class="depot" x="-17" y="-14" width="34" height="28" rx="6"/><text x="0" y="4" text-anchor="middle" font-size="8" fill="#fff" font-weight="900">DEPOT</text></g></g></svg>`;
  }
  function renderMaps(){
    ['dashboardMap','cityMap','simulationMap'].forEach((id,i)=>{const el=$(`#${id}`);if(!el)return;el.innerHTML=id==='cityMap'?mapSVG(false,true):mapSVG(i===0,false);$$('.bin',el).forEach(n=>n.addEventListener('click',()=>selectBin(n.dataset.bin)))});
    const summary=$('#mapSummary');if(summary){const visible=$$('#cityMap .bin').length,m=currentMetrics();summary.innerHTML=`<span><b>${visible}</b> visible bins</span><span><b>${m.critical}</b> critical</span><span><b>${state.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length}</b> active trucks</span><span><b>${timeText()}</b> simulation time</span>`}
    toggleMapLayers();
  }
  function selectBin(id){selectedBinId=id;showPage('twin');renderDetail()}
  function renderDetail(){const el=$('#assetDetail');if(!el)return;const b=state.bins.find(x=>x.id===selectedBinId);if(!b){el.classList.remove('is-open');el.innerHTML='';return}const lvl=levelOf(b.fill),overflow=overflowMinutes(b),p=b.priorityBreakdown||{};el.classList.add('is-open');el.innerHTML=`<button id="closeDetail" class="drawer-close" aria-label="Close details">×</button><div class="detail-top"><span class="kicker">SIMULATED WASTE BIN</span><h2>${b.id}</h2><p class="muted">${b.zone} • ${b.wasteType} waste</p></div><div class="big-value" style="color:${levelMeta[lvl-1][1]}">${fmt(b.fill)}%</div><p>Level ${lvl} — ${levelMeta[lvl-1][0]}</p><div class="detail-stat"><span>Growth rate</span><b>${b.rate} kg/hour</b></div><div class="detail-stat"><span>Predicted fill</span><b>${fmt(b.predicted)}%</b></div><div class="detail-stat"><span>Overflow probability</span><b>${b.overflowProbability}%</b></div><div class="detail-stat"><span>Predicted overflow</span><b>${Number.isFinite(overflow)?`${fmt(overflow)} min`:'Over 2 hours'}</b></div><div class="detail-stat"><span>Distance estimate</span><b>${fmt(b.distanceKm,1)} km</b></div><div class="detail-stat"><span>Priority score</span><b>${b.priority}/100</b></div><div class="score-breakdown"><span>Overflow ${p.overflow||0}</span><span>Fill ${p.fill||0}</span><span>Growth ${p.growth||0}</span><span>Zone ${p.zone||0}</span><span>Route ${p.route||0}</span><span>Special ${p.special||0}</span></div><div class="explain-box"><span class="kicker">DECISION</span><p>${b.priority>=58?'Collect':'Monitor'} — ${b.risk.toLowerCase()} overflow risk, ${b.rate>20?'fast':'normal'} growth and ${b.distanceKm<2?'efficient':'longer'} route.</p></div>`;$('#closeDetail').addEventListener('click',()=>{selectedBinId=null;renderDetail()})}
  function toggleMapLayers(){const city=$('#cityMap');if(!city)return;const hot=$('#showHotspots'),routes=$('#showRoutes'),bins=$('#showBins');const h=$('.hotspot-layer',city),r=$('.route-layer',city),b=$('.bin-layer',city);if(h&&hot)h.style.display=hot.checked?'':'none';if(r&&routes)r.style.display=routes.checked?'':'none';if(b&&bins)b.style.display=bins.checked?'':'none'}

  function metricCard(label,value,sub,trend='good'){return `<div class="metric"><div class="metric-top"><span>${label}</span><span class="trend ${trend}">${trend==='good'?'●':'▲'}</span></div><strong>${value}</strong><small>${sub}</small></div>`}
  function renderMetrics(){const m=currentMetrics();$('#metricGrid').innerHTML=[metricCard('Total bins','100','Across 6 simulated zones'),metricCard('Critical bins',m.critical,'Level 7 requires action',m.critical>10?'up':'good'),metricCard('Available vehicles',m.available,'of 8 local fleet'),metricCard('Waste collected',`${fmt(state.wasteCollected,1)} t`,'This simulation session'),metricCard('Overflow risk',`${fmt(m.overflow)}%`,'Forecast next 2 hours',m.overflow>20?'up':'good'),metricCard('Avg collection time',`${fmt(m.avgTime)} min`,'Simulated estimate'),metricCard('Vehicle utilization',`${fmt(m.utilization)}%`,'Active fleet'),metricCard('Service level',`${fmt(state.serviceLevel)}%`,'Bins served before overflow')].join('');$('#queueCount').textContent=m.critical;$('#dashboardBrief').textContent=m.critical?`${m.critical} critical bins need attention.`:'Monitoring waste generation across all zones.'}
  function priorityRows(limit=6){return criticalBins().slice(0,limit).map((b,i)=>`<div class="list-row"><span class="rank">${i+1}</span><div><b>${b.id}</b><small>${b.zone} • ${fmt(b.fill)}% fill • ${b.overflowProbability}% overflow risk</small></div><span class="priority-pill">${b.priority}/100</span></div>`).join('')}
  function renderPriority(){const html=priorityRows(7);$('#priorityList').innerHTML=html;$('#predictionQueue').innerHTML=priorityRows(10)}
  function renderLevels(){const counts=Array(7).fill(0);state.bins.forEach(b=>counts[levelOf(b.fill)-1]++);$('#levelBars').innerHTML=counts.map((n,i)=>`<div class="level-row"><span>L${i+1} ${i===6?'•':''}</span><div class="bar-track"><i style="width:${n/Math.max(...counts)*100}%;background:${levelMeta[i][1]}"></i></div><b>${n}</b></div>`).join('')}
  function lineChart(series,labels,colors=['#67a7ff','#65d69a']){const w=700,h=240,p=28,all=series.flat(),max=Math.max(...all,1)*1.12,min=Math.min(0,...all);const x=i=>p+(i/Math.max(1,series[0].length-1))*(w-p*2),y=v=>h-p-((v-min)/(max-min||1))*(h-p*2);const grid=Array.from({length:5},(_,i)=>`<line class="grid" x1="${p}" y1="${p+i*(h-2*p)/4}" x2="${w-p}" y2="${p+i*(h-2*p)/4}"/>`).join('');const paths=series.map((arr,si)=>`<polyline fill="none" stroke="${colors[si]}" stroke-width="3" points="${arr.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>`).join('');const dots=series[0].map((v,i)=>i%Math.max(1,Math.floor(series[0].length/7))===0?`<circle class="dot-point" cx="${x(i)}" cy="${y(v)}" r="3"/>`:'').join('');const ticks=labels.map((l,i)=>i%Math.max(1,Math.floor(labels.length/6))===0?`<text x="${x(i)}" y="${h-5}" text-anchor="middle">${l}</text>`:'').join('');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}${paths}${dots}${ticks}</svg>`}
  function renderCharts(){const hist=state.history;const labels=hist.map(h=>h.time);$('#dashboardChart').innerHTML=lineChart([hist.map(h=>h.generated)],labels);$('#analyticsChart').innerHTML=lineChart([hist.map(h=>h.generated),hist.map(h=>h.collected)],labels);const b=criticalBins()[0];const vals=[0,30,60,90,120].map(min=>clamp(b.fill+(b.rate*(min/60)/b.capacity*100*activeModFor(b)),0,100));$('#forecastChart').innerHTML=lineChart([vals],['Now','+30m','+60m','+90m','+120m'],['#ff6b6b'])}
  function renderRecommendation(){const b=criticalBins()[0],truck=state.vehicles.find(v=>v.assignedBin===b.id)||state.vehicles.find(v=>v.status==='Available');$('#recommendation').innerHTML=`<span class="risk ${b.risk.toLowerCase()}">${b.risk.toUpperCase()} ACTION</span><h4>Collect ${b.id} next</h4><p>${fmt(b.fill)}% full with a ${b.rate} kg/hour generation rate. ${b.predicted>=100?'Overflow is predicted within the simulation horizon.':'Risk is rising.'}</p><div class="reason-list"><span>${truck?truck.id:'Fleet queue'}</span><span>${b.zone}</span><span>Priority ${b.priority}</span></div>`}
  function renderPrediction(){const b=criticalBins()[0],p=b.priorityBreakdown||{};$('#predictionHero').innerHTML=`<span class="kicker">HIGHEST-RISK ASSET</span><h2>${b.id}</h2><p class="muted">${b.zone} • SIMULATED PREDICTION • ${b.wasteType}</p><div class="prediction-score"><strong style="color:${levelMeta[levelOf(b.fill)-1][1]}">${fmt(b.predicted)}%</strong><span>predicted fill<br>in 90 minutes</span></div><div class="risk-meter"><i style="width:${b.predicted}%"></i></div><div class="prediction-stats"><div class="mini-stat"><span>Current fill</span><strong>${fmt(b.fill)}%</strong></div><div class="mini-stat"><span>Overflow probability</span><strong>${b.overflowProbability}%</strong></div><div class="mini-stat"><span>Growth</span><strong>${b.rate>20?'High':'Moderate'}</strong></div><div class="mini-stat"><span>Priority score</span><strong>${b.priority}/100</strong></div></div><div class="score-breakdown"><span>Overflow ${p.overflow||0}</span><span>Fill ${p.fill||0}</span><span>Growth ${p.growth||0}</span><span>Zone ${p.zone||0}</span><span>Route ${p.route||0}</span><span>Special ${p.special||0}</span></div><div class="explain-box"><span class="kicker">DECISION EXPLANATION</span><p>${b.id} is collected ${b.risk==='Critical'?'now':'soon'} because future overflow risk, current fill, growth, zone importance and route efficiency combine to ${b.priority}/100.</p></div>`;const a=state.bins.find(x=>x.anomaly)||criticalBins()[1];const diff=Math.round((a.observed-a.expected)/Math.max(1,a.expected)*100);$('#anomalyCard').innerHTML=`<div class="anomaly-alert"><span class="risk high">ABNORMAL SIMULATED GENERATION</span><h4>${a.id} • ${a.zone}</h4><p>Expected: ${a.expected} kg • Observed simulated: ${a.observed} kg • Difference: +${diff}%</p><b>Rule-based response</b><p>${state.festival?'Festival condition active':'Deviation exceeded the local threshold'}. Priority is recalculated transparently.</p></div>`}
  function renderControls(){$('#playBtn').textContent=state.isRunning?'Ⅱ Pause simulation':'▶ Start simulation';$('#quickPlay').textContent=state.isRunning?'Ⅱ':'▶';$('#runStatus').textContent=state.isGuided?`GUIDED ${state.demoStep+1}/${guidedStory.length}`:state.isRunning?'RUNNING':'PAUSED';$('#runStatus').className=`run-status ${state.isRunning?'running':'paused'}`;$('#quickStatus').textContent=state.isGuided?'GUIDED DEMO':`SIMULATION ${state.isRunning?'RUNNING':'PAUSED'}`;$('#simClock').textContent=$('#quickClock').textContent=$('#stageTime').textContent=timeText();$('#timelineFill').style.width=`${((state.currentMinutes-480)%720)/720*100}%`;$$('#speedBtns button').forEach(b=>b.classList.toggle('active',+b.dataset.speed===state.speed));document.body.classList.toggle('visitor-mode',visitorMode);$('#visitorModeBtn')?.classList.toggle('active',visitorMode);$('#expertModeBtn')?.classList.toggle('active',!visitorMode);['demoPauseBtn','demoSkipBtn','demoExitBtn'].forEach(id=>{const el=$(`#${id}`);if(el)el.disabled=!state.isGuided});if($('#demoPauseBtn'))$('#demoPauseBtn').textContent=demoPaused?'Resume':'Pause';if($('#guidedDemoBtn'))$('#guidedDemoBtn').textContent=state.isGuided?'● GUIDED DEMO RUNNING':'▶ START GUIDED DEMO'}
  function renderSimulation(){
    const b=criticalBins()[0],activeTruck=state.vehicles.find(v=>v.status==='Collecting')||state.vehicles.find(v=>v.status==='Returning')||(state.isGuided?state.vehicles.find(v=>v.id==='T-03'):null),truck=activeTruck,mins=overflowMinutes(b),m=currentMetrics();
    const activeTrucks=state.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length;
    const cycleDone=state.tickCount>0;
    $('#simSnapshot').innerHTML=[
      ['SIMULATION TIME',timeText(),'Each step adds 10 minutes'],
      ['CRITICAL BINS',m.critical,'Level 7 needs action',m.critical?'alert':''],
      ['ACTIVE TRUCKS',activeTrucks,`${m.available} still available`],
      ['BINS COLLECTED',state.binsCollected,`${state.overflowPrevented} predicted overflows prevented`],
      ['DUMP TRIPS',state.dumpTrips,`${fmt(m.avgBinsPerTrip,1)} bins per trip`]
    ].map(x=>`<div class="sim-snapshot-card ${x[3]||''}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    const storyIndex=state.isGuided||state.demoStep?clamp(state.demoStep,0,guidedStory.length-1):clamp(state.tickCount%guidedStory.length,0,guidedStory.length-1);
    const story=guidedStory[storyIndex];
    $('#storyBar').innerHTML=guidedStory.map((s,i)=>`<span class="${i<storyIndex?'done':i===storyIndex?'active':''}">${s.stage}</span>`).join('<i>→</i>');
    const currentBin=truck?.assignedBin?state.bins.find(x=>x.id===truck.assignedBin):b;
    const nextCandidate=truck&&truck.status==='Collecting'?eligibleCandidates(truck,truck.assignedBin)[0]:null;
    let decision=`AI detected ${b.id} at ${b.priority}/100 priority with ${b.overflowProbability}% overflow probability.`;
    if(truck?.status==='Collecting')decision=`AI selected ${truck.id} for ${truck.assignedBin}: capacity fits, ETA ${truck.eta} min, and the route is efficient.`;
    if(truck?.status==='Returning')decision=`AI routed ${truck.id} to ${state.facilities[truck.facility]?.id}: the facility has the best capacity, compatibility and travel score.`;
    const showGuided=state.isGuided||(state.demoStep===guidedStory.length-1&&state.tickCount>=guidedStory.length);
    $('#guidedOverlay').classList.toggle('show',showGuided);
    $('#guidedOverlay').innerHTML=`<span>STEP ${storyIndex+1} OF ${guidedStory.length}</span><h2>${story.title}</h2><p>${story.message}</p><div class="guided-facts"><b>${currentBin?.id||b.id}: ${fmt(currentBin?.fill||b.fill)}% fill</b><b>Prediction: ${fmt(currentBin?.predicted||b.predicted)}%</b><b>${truck?`${truck.id}: ${fmt(truck.currentLoad/truck.capacity*100)}% load`:`Priority: ${b.priority}/100`}</b></div><small>NEXT: ${story.next}</small>`;
    $('#liveDecision').innerHTML=`<strong>${decision}</strong><span>NEXT: ${truck?.status==='Collecting'?`collect ${truck.assignedBin}, then re-check nearby bins`:`monitor ${b.id} and update the queue`}</span>`;
    const reasons=truck?.status==='Collecting'?[`${truck.assignedBin} has priority ${currentBin?.priority||0}/100`,`${truck.id} has ${fmt((truck.capacity-truck.currentLoad)/truck.capacity*100)}% capacity remaining`,`${fmt(currentBin?.distanceKm||0,1)} km route estimate`,state.roadClosures?'Route recalculated around a closure':'Low route disruption']:[`${b.fill>=76?'High':'Rising'} fill level`,`${b.overflowProbability}% overflow probability`,`${b.rate} kg/hour growth`,`Priority breakdown is visible in Digital Twin`];
    $('#whyPanel').innerHTML=`<b>WHY THIS DECISION?</b><ul>${reasons.map(r=>`<li>${r}</li>`).join('')}</ul>`;
    const load=truck?truck.currentLoad/truck.capacity*100:0,remaining=truck?truck.capacity-truck.currentLoad:0;
    $('#truckTelemetry').innerHTML=truck?`<div class="telemetry-head"><b>${truck.id}</b><span class="status-label ${truck.status.toLowerCase()}"><i></i>${truck.status}</span></div><div class="capacity-label"><span>Load ${fmt(load)}%</span><span>${fmt(remaining)} kg remaining</span></div><div class="truck-capacity"><i style="width:${load}%"></i><em style="left:${OPERATIONAL_CAPACITY*100}%"></em></div><div class="telemetry-grid"><span>Collected<b>${truck.collectedBins.length?truck.collectedBins.join(' → '):'None yet'}</b></span><span>Current target<b>${truck.assignedBin||state.facilities[truck.facility]?.id||'Waiting'}</b></span><span>Next target<b>${nextCandidate?.b.id||truck.nextTarget||'Re-evaluate'}</b></span><span>Route update<b>Version ${truck.routeVersion}</b></span></div><p>${truck.lastDecision}</p>`:`<p class="muted">No truck is active. The priority queue is being monitored.</p>`;
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
      ['3 · AI DECISION',truck?`${truck.id} ${truck.status.toLowerCase()}`:`Priority score ${b.priority}`,truck?truck.lastDecision:'The queue will be checked again next step.','action'],
      ['4 · EXPECTED RESULT',truck?.status==='Collecting'?'Collect, re-evaluate, continue':'Continue monitoring',truck?'The truck may collect multiple suitable bins before dumping.':'Fill, forecast and priority update again.']
    ].map(x=>`<div class="explain-tile ${x[3]||''}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
  }
  function renderVehicles(){const m=currentMetrics();$('#vehicleMetrics').innerHTML=[metricCard('Fleet size','8','Simulated trucks'),metricCard('Available',m.available,'Ready for assignment'),metricCard('Bins / dump trip',fmt(m.avgBinsPerTrip,1),'Dynamic multi-bin collection'),metricCard('Dump trips',state.dumpTrips,'Simulation total')].join('');$('#vehicleTable').innerHTML=state.vehicles.map(v=>`<tr><td><b>${v.id}</b><small>${v.collectedBins.length?`${v.collectedBins.length} bins this trip`:''}</small></td><td><span class="status-label ${v.status.toLowerCase()}"><i></i>${v.status}</span></td><td><div class="load-cell"><span>${fmt(v.currentLoad/v.capacity*100)}%</span><div class="load-mini"><i style="width:${v.currentLoad/v.capacity*100}%"></i></div></div></td><td>${v.assignedBin||state.facilities[v.facility]?.id||'—'}</td><td>${v.status==='Collecting'?`${v.eta} min`:'—'}</td></tr>`).join('');const active=state.vehicles.find(v=>v.status==='Collecting'||v.status==='Returning'),top=criticalBins().slice(0,3),aiDistance=Math.max(4,state.routeDistance||12.8),fixedDistance=aiDistance*1.32;$('#routeComparison').innerHTML=`<span class="kicker">LIVE ADAPTIVE ROUTE</span><div class="route-path"><span class="route-node">${active?.id||'Depot'}</span><span class="route-arrow">→</span>${active?.assignedBin?`<span class="route-node">${active.assignedBin}</span><span class="route-arrow">→</span>`:''}<span class="route-node">${active?.status==='Returning'?state.facilities[active.facility]?.id:(active?.nextTarget||top[0]?.id)}</span></div><p class="muted">${active?.lastDecision||'Routes are recalculated after every state change.'}</p><div class="compare-stats"><div class="compare-col"><b>Fixed scheduling</b><span>Estimated distance <strong>${fmt(fixedDistance,1)} km</strong></span><span>Pattern <strong>Collect → Dump</strong></span></div><div class="compare-col ai"><b>AI dynamic</b><span>Simulated distance <strong>${fmt(aiDistance,1)} km</strong></span><span>Pattern <strong>Collect → Re-evaluate</strong></span></div></div>`;$('#facilityGrid').innerHTML=state.facilities.map(f=>{const use=f.currentLoad/(f.capacity*state.processingCapacity)*100,predicted=clamp(use+state.vehicles.filter(v=>v.status==='Returning'&&state.facilities[v.facility]===f).reduce((s,v)=>s+v.currentLoad/1000/f.capacity*100,0),0,100);return `<div class="facility-card"><div class="facility-top"><div><span class="kicker">${f.status}</span><h3>${f.id}</h3><p class="muted">${f.compatibility.join(', ')}</p></div><div class="capacity-ring" style="--value:${use}"><b>${fmt(use)}%</b></div></div><div class="detail-stat"><span>Current load</span><b>${fmt(f.currentLoad,1)} t</b></div><div class="detail-stat"><span>Predicted with incoming</span><b>${fmt(predicted)}%</b></div><div class="detail-stat"><span>Traffic factor</span><b>${f.traffic<.2?'Low':'Moderate'}</b></div><div class="detail-stat"><span>Incoming trucks</span><b>${state.vehicles.filter(v=>v.status==='Returning'&&state.facilities[v.facility]===f).length}</b></div></div>`}).join('')}
  function decisionLabConfig(){return {waste:1+(+$('#wasteRange')?.value||0)/100,rain:$('#rainSelect')?.value||'none',festival:$('#festivalSelect')?.value==='on',closures:+($('#roadRange')?.value||0),trucks:+($('#truckRange')?.value||8),failures:+($('#failureRange')?.value||0),capacity:+($('#capacityRange')?.value||100)/100}}
  function simulateDecisionCopy(config=decisionLabConfig(),fleetOverride=null){
    const copy=JSON.parse(JSON.stringify(state)),fleet=Math.max(1,(fleetOverride??config.trucks)-config.failures);
    copy.wasteModifier=config.waste;copy.rain=config.rain;copy.festival=config.festival;copy.roadClosures=config.closures;copy.truckLimit=fleet;copy.processingCapacity=config.capacity;copy.incidents=[];
    if(config.rain==='heavy')copy.incidents.push({type:'rain'});if(config.festival)copy.incidents.push({type:'festival'});if(config.closures)copy.incidents.push({type:'road'});
    let served=0,overflowEvents=0,routeDistance=0,peakCritical=0;
    for(let step=0;step<9;step++){
      copy.bins.forEach(b=>{const generated=b.rate*(TICK_MINUTES/60)*activeModFor(b,copy);b.fill=clamp(b.fill+generated/b.capacity*100,0,100);if(b.fill>=100)overflowEvents++});
      recalculate(copy);peakCritical=Math.max(peakCritical,copy.bins.filter(b=>b.risk==='Critical').length);
      const queue=[...copy.bins].sort((a,b)=>b.priority-a.priority).filter(b=>b.priority>=58);
      for(let t=0;t<fleet;t++){
        let load=0,stops=0,last={x:105,y:610};
        while(queue.length&&stops<3){
          const idx=queue.findIndex(b=>binPayload(b)<=2200-load);if(idx<0)break;
          const b=queue.splice(idx,1)[0],payload=binPayload(b);if((load+payload)/2200>OPERATIONAL_CAPACITY&&b.overflowProbability<EMERGENCY_RISK)break;
          routeDistance+=Math.hypot(last.x-b.x,last.y-b.y)/CITY_UNITS_PER_KM*(1+config.closures*.2);load+=payload;b.fill=8;served++;stops++;last=b;
        }
        if(stops)routeDistance+=Math.min(...copy.facilities.map(f=>Math.hypot(last.x-f.x,last.y-f.y)/CITY_UNITS_PER_KM));
      }
    }
    recalculate(copy);const metrics=currentMetrics(copy),delay=Math.max(16,72-fleet*6+config.closures*5+(config.rain==='heavy'?8:0)),dumpTrips=Math.ceil(served/2.4),facilityDemand=served?Math.min(100,(served*0.12)/(copy.facilities.reduce((s,f)=>s+f.capacity*config.capacity,0))*100):0;
    return {overflowRisk:+metrics.overflow.toFixed(1),criticalBins:metrics.critical,peakCritical,collectionDelay:+delay.toFixed(0),requiredTrucks:Math.min(12,Math.max(fleet,Math.ceil(peakCritical/2.4))),facilityDemand:+facilityDemand.toFixed(1),routeDistance:+routeDistance.toFixed(1),dumpTrips,served,overflowEvents,serviceLevel:+copy.serviceLevel.toFixed(1),fleet};
  }
  function renderScenarios(){
    const result=labResults||simulateDecisionCopy(),name=labResults?.name||'Baseline copy';
    $('#scenarioName').textContent=name.toUpperCase();
    const vals=[['Overflow risk',`${result.overflowRisk}%`],['Critical bins',result.criticalBins],['Collection delay',`${result.collectionDelay} min`],['Required trucks',result.requiredTrucks],['Dump-site demand',`${result.facilityDemand}%`],['Route distance',`${result.routeDistance} km`],['Dump trips',result.dumpTrips],['Bins served',result.served]];
    $('#scenarioResults').innerHTML=vals.map(v=>`<div class="result-tile"><span>${v[0]}</span><strong>${v[1]}</strong></div>`).join('');
    $('#impactChart').innerHTML=lineChart([[result.criticalBins,result.overflowRisk,result.collectionDelay,result.routeDistance]],['Critical','Risk','Delay','Distance'],['#f2a65a']);
    const configs=[['Normal',{waste:1,rain:'none',festival:false,closures:0,trucks:8,failures:0,capacity:1}],['Festival',{waste:1.5,rain:'none',festival:true,closures:0,trucks:8,failures:0,capacity:1}],['Heavy rain',{waste:1.25,rain:'heavy',festival:false,closures:1,trucks:8,failures:0,capacity:1}],['Resource shortage',{waste:1.35,rain:'none',festival:false,closures:2,trucks:5,failures:1,capacity:.7}]];
    $('#scenarioCompare').innerHTML=configs.map(([label,c])=>{const r=simulateDecisionCopy(c);return `<div><b>${label}</b><span>${r.overflowRisk}% risk</span><span>${r.collectionDelay} min delay</span><span>${r.fleet} active trucks</span></div>`}).join('');
    const factors=[['Time of day',timeText(),'Controls demand pattern'],['Live scenario',state.scenario,'Decision Lab remains separate'],['Waste generation',`${fmt(state.wasteModifier*100-100)}% modifier`,'Live twin value'],['Rainfall',state.rain,'Live twin value'],['Road condition',state.roadClosures?`${state.roadClosures} closure(s)`:'Clear','Changes route and ETA'],['Vehicle availability',`${state.truckLimit}/8`,'Live service capacity'],['Processing capacity',`${fmt(state.processingCapacity*100)}%`,'Live facility capacity'],['Reports',state.reports.length,'Citizen issues in live state']];
    $('#factorGrid').innerHTML=factors.map(f=>`<div class="factor"><div class="factor-head"><span>${f[0]}</span><b>${f[1]}</b></div><small>${f[2]}</small></div>`).join('');
    $('#reportTimeline').innerHTML=state.reports.length?state.reports.map(r=>`<div class="report-item"><b>${r.location}</b><span>${r.type} • ${r.severity}</span><div>${['Reported','Verified','Assigned','Dispatched','Collected','Resolved'].map((s,i)=>`<i class="${i<=r.step?'done':''}">${s}</i>`).join('')}</div></div>`).join(''):'<p class="muted">No citizen reports in this simulated session.</p>';
    $$('.incident-card').forEach(b=>b.classList.toggle('active',state.incidents.some(i=>i.type===b.dataset.incident)));$$('[data-sim-incident]').forEach(b=>b.classList.toggle('active',state.incidents.some(i=>i.type===b.dataset.simIncident)))
  }
  function renderAnalytics(){const m=currentMetrics(),fixedDistance=state.routeDistance*1.3,fixedTrips=Math.max(state.dumpTrips,state.binsCollected),fixedDelay=m.avgTime*1.35;$('#analyticsMetrics').innerHTML=[metricCard('Bins collected',state.binsCollected,'Simulation total'),metricCard('Overflow events',state.overflowIncidents,'Recorded locally',state.overflowIncidents?'up':'good'),metricCard('Overflow prevented',state.overflowPrevented,'Predicted-risk collections'),metricCard('Avg response time',`${fmt(m.avgTime)} min`,'Simulation estimate'),metricCard('Truck utilization',`${fmt(m.utilization)}%`,'Active fleet'),metricCard('Bins / dump trip',fmt(m.avgBinsPerTrip,1),'Multi-bin routing'),metricCard('Dump trips',state.dumpTrips,'Facility visits'),metricCard('Route distance',`${fmt(state.routeDistance,1)} km`,'Adaptive routing'),metricCard('Simulated fuel / cost',`₹${fmt(state.simulatedCost,0)}`,'Model estimate only'),metricCard('Waste recovered',`${fmt(state.recoveredWaste,2)} t`,'Simulated 46% recovery')].join('');const gauges=[['Vehicle utilization',m.utilization],['Service level',state.serviceLevel],['Facility utilization',state.facilities.reduce((s,f)=>s+f.currentLoad,0)/state.facilities.reduce((s,f)=>s+f.capacity*state.processingCapacity,0)*100],['Bins below critical',100-m.critical]];$('#serviceGauges').innerHTML=gauges.map(g=>`<div class="gauge-item"><header><span>${g[0]}</span><b>${fmt(g[1])}%</b></header><div class="bar-track"><i style="width:${g[1]}%;background:${g[1]>80?'var(--green)':g[1]>55?'var(--yellow)':'var(--red)'}"></i></div></div>`).join('');const rows=[['Collection delay',`${fmt(fixedDelay)} min`,`${fmt(m.avgTime)} min`],['Overflow incidents',Math.max(state.overflowIncidents+Math.ceil(m.overflow/15),state.overflowIncidents),state.overflowIncidents],['Vehicle utilization',`${fmt(Math.max(35,m.utilization*.75))}%`,`${fmt(m.utilization)}%`],['Route distance',`${fmt(fixedDistance,1)} km`,`${fmt(state.routeDistance,1)} km`],['Dump trips',fixedTrips,state.dumpTrips],['Bins per trip','1.0',fmt(m.avgBinsPerTrip,1)],['Service level',`${fmt(Math.max(55,state.serviceLevel-9))}%`,`${fmt(state.serviceLevel)}%`]];$('#comparisonGrid').innerHTML=`<div class="head">SIMULATED RESULT</div><div class="head">Fixed scheduling</div><div class="head">AI dynamic</div>${rows.map(r=>`<div>${r[0]}</div><div>${r[1]}</div><div class="ai-value">${r[2]}</div>`).join('')}`}
  function renderHow(){if($('#processFlow').children.length)return;$('#processFlow').innerHTML=processStages.map((s,i)=>`<article class="process-card"><span class="num">${String(i+1).padStart(2,'0')}</span><h3>${s[0]}</h3><p>${s[1]}</p></article>`).join('')}
  function renderAll(){renderControls();renderMetrics();renderPriority();renderLevels();renderMaps();renderDetail();renderCharts();renderRecommendation();renderPrediction();renderSimulation();renderVehicles();renderScenarios();renderAnalytics();renderHow()}

  function showPage(id){const page=$(`#${id}`);if(!page)return;$$('.page').forEach(p=>p.classList.toggle('active',p.id===id));$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));$('#pageTitle').textContent=page.dataset.title||'AI-WasteTwin';$('.sidebar').classList.remove('open');window.scrollTo(0,0);renderAll()}
  function enterApp(page='dashboard'){demoMode=false;$('#landing').classList.add('hidden');$('#app').classList.remove('hidden');showPage(page)}
  function startDemo(){enterApp('simulation');reset();visitorMode=true;demoMode=true;state.isGuided=true;state.demoStep=0;state.truckLimit=3;state.bins.forEach(x=>{x.fill=Math.min(x.fill,64)});const b=state.bins.find(x=>x.id==='B-104'),near1=state.bins.find(x=>x.id==='B-115'),near2=state.bins.find(x=>x.id==='B-121');if(b){b.fill=74;b.rate=42}if(near1){near1.fill=72;near1.rate=31;near1.x=b.x+42;near1.y=b.y+18}if(near2){near2.fill=66;near2.rate=27;near2.x=b.x+70;near2.y=b.y-22}state.vehicles.forEach(x=>{x.status='Maintenance';x.assignedBin=null;x.route=[]});const v=state.vehicles.find(x=>x.id==='T-03');if(v&&b){v.x=b.x-80;v.y=b.y+45;v.currentLoad=v.capacity*.12;v.status='Maintenance';v.lastDecision='Waiting for guided dispatch'}recalculate();renderAll();setRunning(true);toast('Guided demo started — the system will explain each decision')}
  function pauseGuided(){if(!state.isGuided)return;demoPaused=!demoPaused;setRunning(!demoPaused);renderControls()}
  function skipGuided(){if(!state.isGuided)return;clearInterval(timer);tick();if(state.isGuided&&!demoPaused)setRunning(true)}
  function exitGuided(){demoMode=false;state.isGuided=false;demoPaused=false;setRunning(false);renderAll();toast('Guided demo exited; live state preserved')}
  function replay(){if(state.snapshots.length<2){toast('Run the simulation first to create a replay');return}setRunning(false);showPage('simulation');const saved=JSON.parse(JSON.stringify(state));let i=0;clearInterval(replayTimer);logEvent('Route replay started.','info');replayTimer=setInterval(()=>{const s=saved.snapshots[i++];if(!s){clearInterval(replayTimer);state=saved;renderAll();toast('Replay complete');return}state.currentMinutes=s.time;s.bins.forEach(x=>Object.assign(state.bins.find(b=>b.id===x.id),x));state.vehicles=s.vehicles.map(v=>({...v}));state.wasteCollected=s.wasteCollected;state.binsCollected=s.binsCollected||0;state.overflowPrevented=s.overflowPrevented||0;state.dumpTrips=s.dumpTrips||0;recalculate();renderAll()},350)}
  function runScenario(){const config=decisionLabConfig(),parts=[config.rain!=='none'&&`${config.rain} rain`,config.festival&&'festival',config.closures&&`${config.closures} closure(s)`,config.failures&&`${config.failures} failure(s)`,config.waste>1&&`${fmt((config.waste-1)*100)}% waste`].filter(Boolean);labResults={...simulateDecisionCopy(config),name:parts.join(' + ')||'Baseline copy'};renderScenarios();toast('What-if plan completed on a copy; live twin unchanged')}
  function applyLabPreset(name){const presets={normal:[0,'none','off',0,8,0,100],festival:[50,'none','on',0,8,0,100],rain:[30,'heavy','off',1,8,0,90],shortage:[50,'none','off',2,5,1,70]},p=presets[name];if(!p)return;$('#wasteRange').value=p[0];$('#rainSelect').value=p[1];$('#festivalSelect').value=p[2];$('#roadRange').value=p[3];$('#truckRange').value=p[4];$('#failureRange').value=p[5];$('#capacityRange').value=p[6];$('#wasteOut').value=`+${p[0]}%`;$('#roadOut').value=p[3];$('#truckOut').value=p[4];$('#failureOut').value=p[5];$('#capacityOut').value=`${p[6]}%`;runScenario()}
  function findRequiredFleet(){const config=decisionLabConfig(),risk=+$('#targetRisk').value||5,delay=+$('#targetDelay').value||30;let found=null,tests=[];for(let fleet=2;fleet<=12;fleet++){const r=simulateDecisionCopy({...config,trucks:fleet,failures:0},fleet);tests.push(`${fleet}: ${r.overflowRisk}% / ${r.collectionDelay}m`);if(r.overflowRisk<=risk&&r.collectionDelay<=delay){found={fleet,r};break}}$('#fleetResult').innerHTML=found?`<strong>${found.fleet} simulated trucks required</strong><span>Estimated overflow risk ${found.r.overflowRisk}% • delay ${found.r.collectionDelay} min</span><small>Simulation estimate; ${tests.join(' | ')}</small>`:`<strong>Target not reached within 12 trucks</strong><small>${tests.join(' | ')}</small>`}
  function submitCitizenReport(e){e.preventDefault();const type=$('#reportType').value,location=$('#reportLocation').value.trim(),hazard=/hazard|e-waste/i.test(type),severity=hazard?'Critical':/mixed|organic/i.test(type)?'High':'Medium',facility=hazard?'DS-02':'Best compatible facility';state.reports.unshift({id:`R-${String(state.reports.length+1).padStart(3,'0')}`,location,type:type.toLowerCase(),description:$('#reportDescription').value.trim(),image:$('#reportImage').files[0]?.name||null,severity,facility,step:1});logEvent(`Citizen report at ${location} verified: ${type}, ${severity}; ${facility} recommended.`,'ai');e.target.reset();renderAll();toast('Simulated citizen report classified and verified')}
  function copilotAnswer(kind){const b=criticalBins()[0],truck=state.vehicles.find(v=>v.status==='Collecting'||v.status==='Returning'),facility=truck?facilityChoice(truck,truck.wasteTypes?.[0]||'mixed'):null,low=[...state.bins].sort((a,b)=>a.priority-b.priority)[0];const answers={next:`Collect ${b.id} next. It has ${b.priority}/100 priority, ${b.overflowProbability}% overflow probability and ${fmt(b.distanceKm,1)} km estimated distance.`,truck:truck?`${truck.id} was selected because it has ${fmt((truck.capacity-truck.currentLoad)/truck.capacity*100)}% capacity remaining and an efficient route to ${truck.assignedBin||state.facilities[truck.facility]?.id}.`:'No truck is active; the next available feasible truck will be selected.',skip:`${low.id} is skipped because its priority is only ${low.priority}/100 and higher-risk bins need service first.`,breakdown:truck?`If ${truck.id} fails, ${truck.assignedBin||'its work'} returns to the queue, priorities recalculate and another available truck receives a new route.`:'A breakdown would reduce fleet capacity and trigger re-assignment.',facility:facility?`${facility.f.id} is preferred: ${fmt(facility.load*100)}% loaded, ${fmt(facility.distance,1)} km away and waste-compatible.`:'No active loaded truck currently needs a facility.'};$('#copilotAnswer').textContent=answers[kind]||'No answer available.'}
  function exportReport(){const m=currentMetrics();const report={project:'AI-WasteTwin',mode:'SIMULATION MODE — LOCAL / OFFLINE — SIMULATED DATA',generatedAt:new Date().toISOString(),simulationTime:timeText(),scenario:state.scenario,metrics:{totalBins:100,binsCollected:state.binsCollected,overflowIncidents:state.overflowIncidents,overflowPrevented:state.overflowPrevented,availableVehicles:m.available,wasteCollectedTons:+state.wasteCollected.toFixed(2),wasteRecoveredTons:+state.recoveredWaste.toFixed(2),overflowRisk:+m.overflow.toFixed(1),serviceLevel:+state.serviceLevel.toFixed(1),routeDistanceKm:+state.routeDistance.toFixed(1),dumpTrips:state.dumpTrips,averageBinsPerTrip:+m.avgBinsPerTrip.toFixed(1),simulatedCost:+state.simulatedCost.toFixed(1)},incidents:state.incidents,reports:state.reports,decisionLog:state.logs,history:state.history};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AI-WasteTwin-simulation-report.json';a.click();URL.revokeObjectURL(a.href);toast('Local report exported')}
  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}

  function bind(){
    $$('[data-enter]').forEach(b=>b.addEventListener('click',()=>enterApp('dashboard')));
    $$('[data-demo]').forEach(b=>b.addEventListener('click',startDemo));
    $$('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
    $$('[data-page-link]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.pageLink)));
    $('#menuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
    $('#playBtn').addEventListener('click',()=>setRunning(!state.isRunning));$('#quickPlay').addEventListener('click',()=>setRunning(!state.isRunning));
    $('#stepBtn').addEventListener('click',()=>{setRunning(false);tick()});$('#resetBtn').addEventListener('click',reset);$('#replayBtn').addEventListener('click',replay);
    $('#guidedDemoBtn').addEventListener('click',startDemo);$('#demoPauseBtn').addEventListener('click',pauseGuided);$('#demoSkipBtn').addEventListener('click',skipGuided);$('#demoExitBtn').addEventListener('click',exitGuided);
    $('#visitorModeBtn').addEventListener('click',()=>{visitorMode=true;renderAll()});$('#expertModeBtn').addEventListener('click',()=>{visitorMode=false;renderAll()});
    $('#whyBtn').addEventListener('click',()=>$('#whyPanel').classList.toggle('hidden'));
    $('#watchGuideBtn').addEventListener('click',()=>{setRunning(false);showPage('how');setTimeout(()=>{const v=$('#guideVideo');v.scrollIntoView({behavior:'smooth',block:'center'});v.play().catch(()=>{})},120)});
    $$('#speedBtns button').forEach(b=>b.addEventListener('click',()=>{state.speed=+b.dataset.speed;if(state.isRunning)setRunning(true);renderControls()}));
    ['showHotspots','showRoutes','showBins'].forEach(id=>$(`#${id}`).addEventListener('change',toggleMapLayers));
    $$('[data-twin-layer]').forEach(b=>b.addEventListener('click',()=>{currentTwinLayer=b.dataset.twinLayer;$$('[data-twin-layer]').forEach(x=>x.classList.toggle('active',x===b));renderMaps()}));
    ['zoneFilter','riskFilter'].forEach(id=>$(`#${id}`).addEventListener('change',renderMaps));
    $('#mapZoomIn').addEventListener('click',()=>{mapZoom=clamp(mapZoom+.25,1,2.25);renderMaps()});$('#mapZoomOut').addEventListener('click',()=>{mapZoom=clamp(mapZoom-.25,1,2.25);renderMaps()});
    $('#mapReset').addEventListener('click',()=>{mapZoom=1;$('#zoneFilter').value='all';$('#riskFilter').value='all';selectedBinId=null;renderMaps();renderDetail()});
    $('#focusCritical').addEventListener('click',()=>{$('#zoneFilter').value='all';$('#riskFilter').value='critical';renderMaps();const target=criticalBins()[0];if(target)selectBin(target.id)});
    $$('.incident-card[data-incident]').forEach(b=>b.addEventListener('click',()=>activateIncident(b.dataset.incident)));$$('[data-sim-incident]').forEach(b=>b.addEventListener('click',()=>activateIncident(b.dataset.simIncident)));$('#cityCrisisBtn').addEventListener('click',activateCityCrisis);
    $('#runScenario').addEventListener('click',runScenario);$$('[data-lab-preset]').forEach(b=>b.addEventListener('click',()=>applyLabPreset(b.dataset.labPreset)));$('#findFleetBtn').addEventListener('click',findRequiredFleet);
    $('#reportForm').addEventListener('submit',submitCitizenReport);$('#exportBtn').addEventListener('click',exportReport);
    $('#copilotBtn').addEventListener('click',()=>$('#copilotDrawer').classList.add('open'));$('#copilotClose').addEventListener('click',()=>$('#copilotDrawer').classList.remove('open'));$$('[data-copilot]').forEach(b=>b.addEventListener('click',()=>copilotAnswer(b.dataset.copilot)));
    [['wasteRange','wasteOut',v=>`+${v}%`],['roadRange','roadOut',v=>v],['truckRange','truckOut',v=>v],['failureRange','failureOut',v=>v],['capacityRange','capacityOut',v=>`${v}%`]].forEach(([a,b,f])=>$(`#${a}`).addEventListener('input',e=>$(`#${b}`).value=f(e.target.value)));
    window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if($(`#${id}.page`)&&!$('#app').classList.contains('hidden'))showPage(id)})
  }

  bind();renderAll();
  const params=new URLSearchParams(location.search),previewPage=document.body.dataset.preview||params.get('preview');if(previewPage&&$(`#${previewPage}.page`))enterApp(previewPage);if(params.get('guided')==='1')setTimeout(()=>{startDemo();if(params.get('qa')==='1'){setRunning(false);tick();setRunning(false)}},80);
})();
