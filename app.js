(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = (n, d = 0) => n==null||!Number.isFinite(Number(n))?'Not measured':Number(n).toFixed(d);
  const observed = (n, suffix='', d=0) => n==null?'Not measured':`${fmt(n,d)}${suffix}`;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const TICK_MINUTES = 10;
  const FORECAST_HOURS = 1.5;
  const CITY_UNITS_PER_KM = 50;
  const TRUCK_SPEED_KMH = 24;
  const OPERATIONAL_CAPACITY = .90;
  const EMERGENCY_RISK = 96;
  const zones = [
    {name:'CIDCO',x:565,y:95,w:310,h:190,color:'#14291c',profile:'Mixed commercial',commercial:68,priority:.72,growth:1.08,note:'Retail streets with residential demand'},
    {name:'Central Area',x:320,y:220,w:300,h:210,color:'#173521',profile:'Commercial core',commercial:94,priority:1,growth:1.20,note:'Markets, offices and high daily footfall'},
    {name:'Jalna Road',x:650,y:285,w:285,h:185,color:'#1a3020',profile:'Commercial corridor',commercial:86,priority:.90,growth:1.15,note:'Shops, restaurants and transport activity'},
    {name:'Waluj',x:70,y:345,w:290,h:220,color:'#13271b',profile:'Industrial',commercial:38,priority:.58,growth:1.02,note:'Industrial waste with lower retail activity'},
    {name:'Beed Bypass',x:385,y:455,w:350,h:150,color:'#172d1d',profile:'Logistics / mixed',commercial:52,priority:.62,growth:1.05,note:'Warehousing, through-traffic and mixed use'},
    {name:'Urban Fringe',x:80,y:70,w:330,h:210,color:'#102218',profile:'Mostly residential',commercial:24,priority:.45,growth:.94,note:'Lower-density homes and local services'}
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
    ['Input','Synthetic bins, vehicles, roads, facilities'],['City twin','One shared local city state'],['Waste generation','Bins fill at different rates'],['Prediction','Future fill and overflow time'],['Risk detection','Low to critical classification'],['Priority','Urgent bins move to the top'],['Assignment','Suitable available truck selected'],['Route planning','Shortest graph path between access nodes'],['Collection','Fill falls and truck load rises'],['Analytics','Results and comparisons update']
  ];
  const guidedStory = [
    {stage:'OBSERVE',title:'WASTE IS GROWING',message:'Bin B-104 is filling faster than normal.',next:'Predict future fill'},
    {stage:'PREDICT',title:'AI PREDICTS OVERFLOW',message:'The 90-minute forecast detects a future overflow before the bin reaches 100%.',next:'Calculate priority'},
    {stage:'PRIORITIZE',title:'AI PRIORITIZES THE BIN',message:'B-104 moves to the front of the explainable collection queue.',next:'Select a suitable truck'},
    {stage:'DISPATCH',title:'TRUCK DISPATCHED',message:'A feasible truck is assigned with capacity, route and ETA checks.',next:'Collect B-104'},
    {stage:'COLLECT',title:'WASTE COLLECTED',message:'The bin falls near 8% while the truck load increases.',next:'Re-evaluate nearby bins'},
    {stage:'RE-EVALUATE',title:'AI RE-EVALUATES',message:'Nearby bins are scanned again using risk, distance and remaining capacity.',next:'Collect the best nearby bin'},
    {stage:'COLLECT',title:'DYNAMIC MULTI-BIN COLLECTION',message:'The truck continues to another suitable bin instead of dumping immediately.',next:'Check capacity again'},
    {stage:'DUMP',title:'SMART DUMP-SITE SELECTION',message:'The best available facility is selected using distance, load and availability.',next:'Adapt to disruption'},
    {stage:'OPTIMIZE',title:'ROUTE REPLANNED',message:'A road disruption changes the route; the old plan is replaced automatically.',next:'Review the recorded outcome'},
    {stage:'RESULT',title:'DEMO COMPLETE',message:'Review the recorded collections, facility visits and remaining risks.',next:'Review the decision log'}
  ];
  let timer = null, toastTimer = null, replayTimer = null, replaySavedState = null;
  let selectedBinId = null, demoMode = false, demoPaused = false, visitorMode = true, mapZoom = 1, mapCenter = {x:500,y:340}, currentTwinLayer = 'physical', labResults = null;

  // Build a connected graph from the same roads drawn on the map. Curves are
  // sampled into short segments; intersections become shared routing nodes.
  function sampleRoad(d){
    const tokens=d.match(/[MLCS]|-?\d+(?:\.\d+)?/g),points=[];
    let i=0,p={x:0,y:0},control=null;
    const point=()=>({x:+tokens[i++],y:+tokens[i++]});
    while(i<tokens.length){
      const command=tokens[i++];
      if(command==='M'||command==='L'){p=point();points.push(p);control=null;continue}
      const a=p,c1=command==='S'&&control?{x:2*p.x-control.x,y:2*p.y-control.y}:command==='S'?p:point();
      const c2=point(),b=point();
      for(let n=1;n<=16;n++){
        const t=n/16,u=1-t;
        points.push({x:u*u*u*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*b.y});
      }
      p=b;control=c2;
    }
    return points;
  }
  function buildRoadGraph(){
    const segments=[];
    [...roads,...minorRoads].forEach((d,road)=>{
      const points=sampleRoad(d);
      points.slice(1).forEach((b,i)=>segments.push({a:points[i],b,road,cuts:[0,1]}));
    });
    const cross=(a,b)=>a.x*b.y-a.y*b.x;
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
      const a=segments[i],b=segments[j],r={x:a.b.x-a.a.x,y:a.b.y-a.a.y},s={x:b.b.x-b.a.x,y:b.b.y-b.a.y};
      const denominator=cross(r,s);if(Math.abs(denominator)<1e-8)continue;
      const offset={x:b.a.x-a.a.x,y:b.a.y-a.a.y},t=cross(offset,s)/denominator,u=cross(offset,r)/denominator;
      if(t>=0&&t<=1&&u>=0&&u<=1){a.cuts.push(t);b.cuts.push(u)}
    }
    const nodes=[],edges=[],ids=new Map();
    const node=p=>{
      const key=`${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      if(!ids.has(key)){ids.set(key,nodes.length);nodes.push(p);edges.push([])}
      return ids.get(key);
    };
    segments.forEach(segment=>{
      const cuts=[...new Set(segment.cuts)].sort((a,b)=>a-b);
      const points=cuts.map(t=>({x:segment.a.x+t*(segment.b.x-segment.a.x),y:segment.a.y+t*(segment.b.y-segment.a.y)}));
      points.slice(1).forEach((b,i)=>{
        const a=points[i],from=node(a),to=node(b),length=Math.hypot(a.x-b.x,a.y-b.y);
        if(from===to||length<1e-6)return;
        edges[from].push({to,length,road:segment.road});edges[to].push({to:from,length,road:segment.road});
      });
    });
    return {nodes,edges};
  }
  const roadGraph=buildRoadGraph(),routeTrees=new Map();
  const labCache=new WeakMap();
  function routeTree(start,closures){
    const key=`${start}:${closures}`;if(routeTrees.has(key))return routeTrees.get(key);
    const distances=Array(roadGraph.nodes.length).fill(Infinity),previous=Array(distances.length).fill(-1),done=new Set();
    distances[start]=0;
    for(let n=0;n<distances.length;n++){
      let from=-1,best=Infinity;
      distances.forEach((distance,i)=>{if(!done.has(i)&&distance<best){from=i;best=distance}});
      if(from<0)break;done.add(from);
      roadGraph.edges[from].forEach(edge=>{
        if(edge.road<closures)return;
        const distance=best+edge.length;
        if(distance<distances[edge.to]){distances[edge.to]=distance;previous[edge.to]=from}
      });
    }
    const result={distances,previous};routeTrees.set(key,result);return result;
  }
  function planRoute(from,to,s=state){
    const nearest=point=>{
      let result=-1,best=Infinity;
      roadGraph.nodes.forEach((node,i)=>{
        if(!roadGraph.edges[i].some(edge=>edge.road>=s.roadClosures))return;
        const distance=Math.hypot(point.x-node.x,point.y-node.y);
        if(distance<best){result=i;best=distance}
      });
      return result;
    };
    const start=nearest(from),end=nearest(to);if(start<0||end<0)return null;
    const tree=routeTree(start,s.roadClosures);if(!Number.isFinite(tree.distances[end]))return null;
    const ids=[];for(let node=end;node!==-1;node=tree.previous[node]){ids.unshift(node);if(node===start)break}
    const points=[{x:from.x,y:from.y},...ids.map(id=>({...roadGraph.nodes[id]})),{x:to.x,y:to.y}];
    // Nearby assets on the same access street need only a short connector.
    if(start===end)points.splice(1,points.length-2);
    const distance=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
    return {points,distance:distance/CITY_UNITS_PER_KM};
  }
  function effectiveSpeed(s=state){return TRUCK_SPEED_KMH*(s.rain==='heavy'?.72:s.rain==='light'?.88:1)}
  function setVehicleRoute(v,target,s=state){
    const route=planRoute(v,target,s);if(!route)return false;
    v.route=route.points;v.routeIndex=1;v.routeVersion++;
    v.eta=Math.ceil(route.distance/effectiveSpeed(s)*60);return true;
  }
  function replanRoutes(s=state){
    s.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').forEach(v=>{
      const target=v.assignedBin?s.bins.find(b=>b.id===v.assignedBin):s.facilities[v.facility];
      if(target&&setVehicleRoute(v,target,s))v.lastDecision='Route recalculated using the currently open road network';
      else{
        const id=v.assignedBin||s.facilities[v.facility]?.id||'target';
        v.assignedBin=null;v.nextTarget=null;v.route=[];v.eta=0;
        v.status=v.currentLoad>0?'Waiting':'Available';
        v.lastDecision=`No reachable route to ${id}; previous route cleared`;
        logEvent(`${v.id}: ${v.lastDecision}.`,'alert',s);
      }
    });
  }

  function seeded(seed=2026){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
  function makeInitialState(){
    const rnd=seeded(240101);
    const bins=Array.from({length:100},(_,i)=>{
      const z=zones[i%zones.length];
      const fill=i===3?92:i===14?88:i===31?84:Math.round(12+rnd()*71);
      const rate=+((6+rnd()*24)*z.growth).toFixed(1);
      const wasteTypes=['organic','plastic','paper','glass','metal','e-waste','hazardous','mixed'];
      return {id:`B-${String(i+101).padStart(3,'0')}`,zone:z.name,x:Math.round(z.x+25+rnd()*(z.w-50)),y:Math.round(z.y+28+rnd()*(z.h-56)),capacity:Math.round(120+rnd()*100),fill,rate,predicted:fill,risk:'Low',priority:0,priorityBreakdown:{},lastCollected:'—',anomaly:i===14,expected:Math.round(rate*1.5),observed:i===14?82:Math.round(rate*1.5),wasteType:wasteTypes[i%wasteTypes.length],zonePriority:z.priority};
    });
    const vehicles=Array.from({length:8},(_,i)=>({id:`T-${String(i+1).padStart(2,'0')}`,x:115+i*14,y:600-i*5,capacity:2200,currentLoad:Math.round(rnd()*450),status:'Available',assignedBin:null,nextTarget:null,eta:0,progress:0,route:[],facility:i%2,collectedBins:[],routeVersion:0,lastDecision:'Waiting for assignment',dumpTrips:0}));
    const facilities=[{id:'DS-01',x:880,y:115,capacity:25,currentLoad:23.5,status:'Operational',traffic:.35,compatibility:['organic','plastic','paper','glass','metal','mixed']},{id:'DS-02',x:850,y:560,capacity:30,currentLoad:12.6,status:'Operational',traffic:.12,compatibility:['organic','plastic','paper','glass','metal','e-waste','hazardous','mixed']}];
    const state={currentMinutes:480,speed:1,isRunning:false,isGuided:false,demoStep:0,tickCount:0,scenario:'Baseline',wasteModifier:1,rain:'none',festival:false,roadClosures:0,truckLimit:8,processingCapacity:1,bins,vehicles,facilities,incidents:[],wasteCollected:0,collectedThisTick:0,binsCollected:0,overflowPrevented:0,routeDistance:0,overflowIncidents:0,serviceLevel:null,collectionsBeforeOverflow:0,completedTripBins:0,partialPickups:0,dumpTrips:0,recoveredWaste:0,simulatedCost:0,responseTimes:[],reports:[],history:[],snapshots:[],logs:[{time:'08:00',text:'Local simulation initialized with a 10-minute model step.',type:'info'}]};
    recalculate(state);
    recordHistory(state);
    return state;
  }
  let state=makeInitialState();

  function timeText(minutes=state.currentMinutes){const h=Math.floor(minutes/60)%24,m=minutes%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
  function requireNumber(value,min,max,label,integer=false){
    if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw new RangeError(`${label} must be ${integer?'an integer':'a finite number'} from ${min} to ${max}.`);
  }
  function validateBin(b){requireNumber(b.capacity,Number.MIN_VALUE,1e9,`${b.id} capacity (kg)`);requireNumber(b.fill,0,100,`${b.id} fill (%)`);requireNumber(b.rate,0,1e9,`${b.id} generation (kg/hour)`)}
  function validateSimulationState(s){
    requireNumber(s.currentMinutes,0,1e9,'Simulation minutes');requireNumber(s.tickCount,0,1e9,'Tick count',true);
    requireNumber(s.speed,.5,10,'Playback speed');
    ['wasteCollected','collectedThisTick','binsCollected','routeDistance','overflowIncidents','dumpTrips','recoveredWaste','simulatedCost'].forEach(key=>requireNumber(s[key],0,1e12,key));
    (s.responseTimes||[]).forEach(n=>requireNumber(n,0,1e9,'Recorded response time'));
    requireNumber(s.wasteModifier,0,100,'Waste modifier');requireNumber(s.processingCapacity,Number.MIN_VALUE,1,'Processing capacity');
    requireNumber(s.truckLimit,0,s.vehicles.length,'Active fleet limit',true);requireNumber(s.roadClosures,0,roads.length+minorRoads.length,'Road closures',true);
    if(!['none','light','heavy'].includes(s.rain))throw new RangeError('Unknown rainfall setting.');
    s.bins.forEach(b=>{validateBin(b);requireNumber(b.x,-1e6,1e6,`${b.id} x`);requireNumber(b.y,-1e6,1e6,`${b.id} y`)});
    s.vehicles.forEach(v=>{requireNumber(v.capacity,Number.MIN_VALUE,1e9,`${v.id} truck capacity`);requireNumber(v.currentLoad,0,v.capacity,`${v.id} truck load`);requireNumber(v.x,-1e6,1e6,`${v.id} x`);requireNumber(v.y,-1e6,1e6,`${v.id} y`)});
  }
  function validateDecisionConfig(c){
    requireNumber(c.waste,1,2,'Waste generation multiplier');requireNumber(c.closures,0,3,'Planning road closures',true);
    requireNumber(c.trucks,2,12,'Total trucks',true);requireNumber(c.failures,0,3,'Truck failures',true);requireNumber(c.capacity,.4,1,'Planning processing capacity');
    if(!['none','light','heavy'].includes(c.rain)||typeof c.festival!=='boolean')throw new RangeError('Invalid rainfall or festival setting.');
  }
  function levelOf(fill){return fill<=15?1:fill<=30?2:fill<=45?3:fill<=60?4:fill<=75?5:fill<=90?6:7}
  function overflowMinutes(bin,s=state){validateBin(bin);const kgPerHour=bin.rate*activeModFor(bin,s);if(kgPerHour<=0||bin.fill>=100)return bin.fill>=100?0:Infinity;const remainingKg=(100-bin.fill)/100*bin.capacity;return remainingKg/kgPerHour*60}
  function riskOf(bin,s=state){const mins=overflowMinutes(bin,s);if(bin.fill>90||mins<=60)return 'Critical';if(bin.fill>75||mins<=120||bin.predicted>90)return 'High';if(bin.fill>45||bin.predicted>75)return 'Medium';return 'Low'}
  function activeModFor(bin,s=state){let mod=s.wasteModifier;if(s.rain==='light')mod*=1.1;if(s.rain==='heavy')mod*=1.28;if(s.festival&&bin.zone==='Central Area')mod*=1.7;if(s.incidents.some(i=>i.type==='surge'))mod*=1.25;return mod}
  function recalculate(s=state){
    s.modelVersion=(s.modelVersion||0)+1;
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
      b.priorityBreakdown={overflow:+overflowScore.toFixed(2),fill:+fillScore.toFixed(2),growth:+growthScore.toFixed(2),zone:+zoneScore.toFixed(2),route:+routeScore.toFixed(2),special:+specialScore.toFixed(2)};
      b.priority=Math.round(clamp(overflowScore+fillScore+growthScore+zoneScore+routeScore+specialScore,0,100));
    });
    s.bins.sort((a,b)=>a.id.localeCompare(b.id));
    s.serviceLevel=s.binsCollected?100*(s.collectionsBeforeOverflow||0)/s.binsCollected:null;
  }
  function criticalBins(s=state){return [...s.bins].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))}
  function currentMetrics(s=state){
    const critical=s.bins.filter(b=>b.risk==='Critical').length;
    const available=s.vehicles.filter(v=>v.status==='Available').length;
    const utilization=s.vehicles.length?s.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length/s.vehicles.length*100:0;
    const predictedOverflow=s.bins.filter(b=>b.predicted>=100).length;
    const overflow=s.bins.length?predictedOverflow/s.bins.length*100:0;
    const times=s.responseTimes||[];
    const avgTime=times.length?times.reduce((sum,n)=>sum+n,0)/times.length:null;
    const avgBinsPerTrip=s.dumpTrips?(s.completedTripBins||0)/s.dumpTrips:null;
    return {critical,available,utilization,overflow,predictedOverflow,avgTime,avgBinsPerTrip};
  }
  function logEvent(text,type='info',s=state){
    s.logs.unshift({time:timeText(s.currentMinutes),text,type});s.logs=s.logs.slice(0,20);
    const ticker=s===state?$('#eventTicker span:last-child'):null;if(ticker)ticker.textContent=text;
  }
  function snapshot(s=state){const {history,snapshots,...frame}=s;s.snapshots.push(JSON.parse(JSON.stringify(frame)));if(s.snapshots.length>36)s.snapshots.shift()}
  function recordHistory(s=state){
    const m=currentMetrics(s);const generated=s.generatedThisTick||0;
    s.history.push({time:timeText(s.currentMinutes),minutes:s.currentMinutes,generated:+generated.toFixed(1),collected:+s.collectedThisTick.toFixed(1),critical:m.critical,overflow:m.overflow,service:s.serviceLevel==null?null:+s.serviceLevel.toFixed(1),distance:+s.routeDistance.toFixed(1),util:+m.utilization.toFixed(1)});
    if(s.history.length>48)s.history.shift();snapshot(s);
  }
  function binPayload(bin){return Math.max(0,(bin.fill-8)/100*bin.capacity)}
  function facilityChoice(vehicle,wasteType='mixed',s=state){
    const types=vehicle.wasteTypes?.length?vehicle.wasteTypes:[wasteType];
    return s.facilities.map((f,i)=>{
      const route=planRoute(vehicle,f,s),distance=route?.distance??Infinity;
      const load=f.currentLoad/(f.capacity*s.processingCapacity);
      const available=f.status==='Operational'&&f.currentLoad+vehicle.currentLoad/1000<=f.capacity*s.processingCapacity;
      const compatible=types.every(type=>f.compatibility?.includes(type));
      const score=distance*2+load*42+(f.traffic||0)*12;
      return {i,f,distance,load,available,compatible,score};
    }).filter(choice=>choice.available&&choice.compatible&&Number.isFinite(choice.distance)).sort((a,b)=>a.score-b.score)[0]
  }
  function routeToFacility(v,reason='capacity threshold reached',s=state){
    const type=v.wasteTypes?.[0]||'mixed',choice=facilityChoice(v,type,s),old=s.facilities[v.facility];
    v.assignedBin=null;v.nextTarget=null;
    if(!choice){v.status='Waiting';v.route=[];v.lastDecision='Waiting for an available, waste-compatible facility';return}
    v.facility=choice.i;v.status='Returning';setVehicleRoute(v,choice.f,s);
    v.lastDecision=`${choice.f.id} selected: ${Math.round(choice.load*100)}% load, ${fmt(choice.distance,1)} km, compatible`;
    logEvent(`${v.id} routed to ${choice.f.id} — ${reason}. ${old&&old.id!==choice.f.id?`${old.id} was less suitable.`:''}`,'ai',s);
  }
  function eligibleCandidates(v,excludeId=null,s=state){
    const assigned=new Set(s.vehicles.map(x=>x.assignedBin).filter(Boolean));
    const remaining=v.capacity-v.currentLoad;
    return criticalBins(s).filter(b=>{
      if(b.id===excludeId||assigned.has(b.id)||b.fill<45)return false;
      const payload=binPayload(b);if(payload>remaining)return false;
      const projected=(v.currentLoad+payload)/v.capacity;
      const emergency=b.overflowProbability>=EMERGENCY_RISK&&payload<=remaining;
      return (b.risk==='Critical'||b.risk==='High'||b.priority>=58)&&(projected<=OPERATIONAL_CAPACITY||emergency);
    }).map(b=>{
      const distance=planRoute(v,b,s)?.distance??Infinity;
      const emergency=b.overflowProbability>=EMERGENCY_RISK;
      const score=b.priority-clamp(distance*3.5,0,28)+(emergency?12:0);
      return {b,distance,score,emergency,projected:(v.currentLoad+binPayload(b))/v.capacity};
    }).filter(candidate=>Number.isFinite(candidate.distance)).sort((a,b)=>b.score-a.score||a.distance-b.distance)
  }
  function assignVehicleToTarget(v,target,reason,s=state){
    if(v.status!=='Available'||s.vehicles.indexOf(v)>=s.truckLimit||target.fill<45||s.vehicles.some(other=>other!==v&&other.assignedBin===target.id)||binPayload(target)>v.capacity-v.currentLoad)return false;
    if(!setVehicleRoute(v,target,s))return false;
    const distance=planRoute(v,target,s).distance;
    v.status='Collecting';v.assignedBin=target.id;v.progress=0;
    const preview=eligibleCandidates(v,target.id,s)[0];v.nextTarget=preview?.b.id||null;
    v.lastDecision=`${target.id}: priority ${target.priority}/100, ${fmt(distance,1)} km, ${fmt((v.capacity-v.currentLoad)/v.capacity*100)}% capacity remaining`;
    logEvent(`${v.id} selected ${target.id}. Reason: ${reason}; priority ${target.priority}/100; route v${v.routeVersion}.`,'ai',s);
    return true;
  }
  function assignVehicles(s=state){
    s.vehicles.filter((v,i)=>i<s.truckLimit&&v.status==='Available').forEach(v=>{
      const candidate=eligibleCandidates(v,null,s)[0];
      if(!candidate){if(v.currentLoad/v.capacity>=.55)routeToFacility(v,'no suitable nearby bin',s);return}
      assignVehicleToTarget(v,candidate.b,candidate.emergency?'emergency overflow override':'high risk + capacity fit + efficient route',s);
    });
  }
  function advanceVehicle(v,budget,s){
    while(v.routeIndex<v.route.length){
      const target=v.route[v.routeIndex],dx=target.x-v.x,dy=target.y-v.y,distance=Math.hypot(dx,dy),travel=Math.min(budget,distance);
      if(distance>0){v.x+=dx/distance*travel;v.y+=dy/distance*travel}
      s.routeDistance+=travel/CITY_UNITS_PER_KM;s.simulatedCost+=travel/CITY_UNITS_PER_KM*1.6;budget-=travel;
      if(travel+1e-8<distance)break;
      v.x=target.x;v.y=target.y;v.routeIndex++;
      if(budget<=1e-8)break;
    }
    let remaining=0,last=v;
    v.route.slice(v.routeIndex).forEach(p=>{remaining+=Math.hypot(last.x-p.x,last.y-p.y);last=p});
    v.eta=Math.ceil(remaining/CITY_UNITS_PER_KM/effectiveSpeed(s)*60);
    return v.routeIndex>=v.route.length;
  }
  function moveVehicles(s=state){
    const step=effectiveSpeed(s)*(TICK_MINUTES/60)*CITY_UNITS_PER_KM;
    s.vehicles.forEach((v,i)=>{
      if(i>=s.truckLimit&&v.status!=='Breakdown'){v.status='Maintenance';v.assignedBin=null;v.route=[];return}
      if(v.status==='Breakdown'||v.status==='Maintenance')return;
      if(v.status==='Waiting'){routeToFacility(v,'facility capacity rechecked',s);return}
      if(v.status==='Collecting'&&v.assignedBin){
        const b=s.bins.find(x=>x.id===v.assignedBin);if(!b){v.status='Available';return}
        if(advanceVehicle(v,step,s)){
          const wasOverflowed=b.fill>=100;
          const wasPredictedOverflow=b.fill<100&&(b.predicted>=100||b.overflowProbability>=90);
          const removed=Math.max(0,Math.min(binPayload(b),v.capacity-v.currentLoad));
          if(removed<=1e-8){routeToFacility(v,'no collection capacity remains',s);return}
          b.fill=clamp(b.fill-removed/b.capacity*100,8,100);b.lastCollected=timeText(s.currentMinutes);
          v.currentLoad+=removed;v.wasteTypes=(v.wasteTypes||[]).concat(b.wasteType);v.progress=0;
          s.collectedThisTick+=removed;s.wasteCollected+=removed/1000;
          if(b.fill>8+1e-8){s.partialPickups=(s.partialPickups||0)+1;logEvent(`${v.id} partially collected ${b.id}; ${fmt(b.fill)}% remains in the queue.`,'alert',s);routeToFacility(v,'remaining bin payload exceeds truck capacity',s);recalculate(s);return}
          v.collectedBins.push(b.id);s.binsCollected++;if(!wasOverflowed)s.collectionsBeforeOverflow=(s.collectionsBeforeOverflow||0)+1;if(wasPredictedOverflow)s.overflowPrevented++;
          if(b.queuedAtMinutes!=null)(s.responseTimes??=[]).push(s.currentMinutes-b.queuedAtMinutes);
          b.queuedAtMinutes=null;v.status='Available';v.assignedBin=null;
          logEvent(`${v.id} collected ${b.id}; bin ${fmt(b.fill)}%, truck ${fmt(v.currentLoad/v.capacity*100)}%. Nearby bins re-evaluated.`,'success',s);
          recalculate(s);
          const next=eligibleCandidates(v,b.id,s)[0];
          if(next){
            const emergency=next.emergency&&next.projected>OPERATIONAL_CAPACITY;
            assignVehicleToTarget(v,next.b,emergency?'emergency override near capacity':'nearby high risk + low detour',s);
          }else{
            routeToFacility(v,v.currentLoad/v.capacity>=OPERATIONAL_CAPACITY?'90% operational threshold reached':'no suitable nearby bin',s);
          }
        }
      }else if(v.status==='Returning'){
        const choice=facilityChoice(v,v.wasteTypes?.[0]||'mixed',s);
        if(!choice){routeToFacility(v,'facility unavailable',s);return}
        const f=s.facilities[v.facility];
        if(!f||f.status!=='Operational'||f.currentLoad+v.currentLoad/1000>f.capacity*s.processingCapacity||!(v.wasteTypes||[]).every(type=>f.compatibility.includes(type))){routeToFacility(v,'facility capacity or compatibility changed',s);return}
        if(advanceVehicle(v,step,s)){
          f.currentLoad+=v.currentLoad/1000;
          s.completedTripBins=(s.completedTripBins||0)+v.collectedBins.length;
          s.recoveredWaste+=v.currentLoad/1000*.46;s.dumpTrips++;v.dumpTrips++;
          v.currentLoad=0;v.status='Available';v.route=[];v.collectedBins=[];v.wasteTypes=[];v.lastDecision=`Unloaded at ${f.id}; ready for re-assignment`;
          logEvent(`${v.id} unloaded at ${f.id}. Dynamic collection trip completed.`,'success',s)
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
    if(t===3){b.fill=90;recalculate();logEvent(`B-104 priority ${b.priority}/100 — moved to the front of the queue.`,'ai')}
    if(t===4){
      state.vehicles.filter(x=>x.assignedBin===b.id).forEach(x=>{x.status='Available';x.assignedBin=null;x.route=[]});
      v.status='Available';v.x=b.x-35;v.y=b.y+18;assignVehicleToTarget(v,b,'scripted teaching demo: selected suitable truck');
    }
    if(t===6)logEvent(`${v.id} re-evaluated nearby bins; next target ${v.assignedBin||'facility'}.`,'ai');
    if(t===7)logEvent(`${v.id} capacity check: ${fmt(v.currentLoad/v.capacity*100)}% loaded.`,'ai');
    if(t===8&&!['Returning','Breakdown','Waiting'].includes(v.status))routeToFacility(v,'finish the guided demonstration trip');
    if(t===9&&!state.incidents.some(i=>i.type==='road'))activateIncident('road',true);
  }
  function simulationStep(s=state,guided=false){
    validateSimulationState(s);
    s.currentMinutes+=TICK_MINUTES;s.tickCount++;s.collectedThisTick=0;s.generatedThisTick=0;
    s.facilities.forEach(f=>{f.currentLoad=Math.max(0,f.currentLoad-.12*s.processingCapacity)});
    s.reports.forEach(r=>{if(r.step<5&&s.tickCount%2===0){r.step++;if(r.step===2)logEvent(`${r.id} illustrative assignment stage reached; no vehicle dispatch is connected.`,'ai',s);if(r.step===5)logEvent(`${r.id} illustrative resolution stage reached; this is not a verified pickup.`,'success',s)}});
    s.bins.forEach(b=>{const generatedKg=b.rate*(TICK_MINUTES/60)*activeModFor(b,s);s.generatedThisTick+=generatedKg;const added=generatedKg/b.capacity*100;const before=b.fill;b.fill=clamp(b.fill+added,0,100);if(before<100&&b.fill>=100){s.overflowIncidents++;logEvent(`${b.id} overflow threshold reached.`,'alert',s)}});
    recalculate(s);if(guided)applyDemoEvents();
    s.bins.forEach(b=>{if((b.risk==='Critical'||b.risk==='High'||b.priority>=58)&&b.queuedAtMinutes==null)b.queuedAtMinutes=s.currentMinutes-TICK_MINUTES});
    const peakCritical=currentMetrics(s).critical;
    assignVehicles(s);
    // Keep dispatch and re-evaluation visible before the next collection step.
    if(!guided||![4,6].includes(s.tickCount))moveVehicles(s);
    recalculate(s);return peakCritical;
  }
  function demoOutcome(){
    const critical=currentMetrics().critical;
    return {title:critical?'DEMO COMPLETE — RISKS REMAIN':'DEMO COMPLETE — NO CRITICAL BINS',message:`${state.binsCollected} bins collected, ${state.dumpTrips} facility visits, and ${critical} critical bins remaining. Continue the simulation to address outstanding risk.`};
  }
  function restoreDemoFleet(){
    state.truckLimit=state.vehicles.length;
    state.vehicles.filter(v=>v.status==='Maintenance').forEach(v=>{v.status='Available'});
    recalculate();
  }
  function tick(){
    try{
    simulationStep(state,demoMode);
    if(demoMode&&state.tickCount>=guidedStory.length){demoMode=false;state.isGuided=false;demoPaused=false;restoreDemoFleet();setRunning(false);logEvent(demoOutcome().message,'info');toast('Guided demo complete — review the recorded outcome')}
    recordHistory();renderAll();return true;
    }catch(error){showError(error);return false}
  }
  function stopReplay(){clearInterval(replayTimer);replayTimer=null;if(replaySavedState)state=replaySavedState;replaySavedState=null}
  function setRunning(run){stopReplay();if(run)validateSimulationState(state);state.isRunning=run;clearInterval(timer);if(run&&!demoPaused)timer=setInterval(tick,state.isGuided?6000:Math.max(90,1000/state.speed));renderControls()}
  function reset(){clearInterval(timer);stopReplay();state=makeInitialState();selectedBinId=null;demoMode=false;demoPaused=false;labResults=null;[['wasteRange',0],['rainSelect','none'],['festivalSelect','off'],['roadRange',0],['truckRange',8],['failureRange',0],['capacityRange',100],['targetRisk',5],['targetDelay',30],['wasteOut','+0%'],['roadOut',0],['truckOut',8],['failureOut',0],['capacityOut','100%']].forEach(([id,value])=>{$('#'+id).value=value});mapZoom=1;mapCenter={x:500,y:340};currentTwinLayer='physical';$('#zoneFilter').value='all';$('#riskFilter').value='all';['showHotspots','showRoutes','showBins'].forEach(id=>{$(`#${id}`).checked=true});$$('[data-twin-layer]').forEach(b=>b.classList.toggle('active',b.dataset.twinLayer==='physical'));$('#errorBanner')?.classList.add('hidden');renderAll();toast('Simulation reset to 08:00')}

  function activateIncident(type,forceOn=false){
    stopReplay();
    const existing=state.incidents.find(i=>i.type===type);
    if(existing&&!forceOn){state.incidents=state.incidents.filter(i=>i.type!==type);if(type==='rain')state.rain='none';if(type==='festival')state.festival=false;if(type==='road')state.roadClosures=Math.max(0,state.roadClosures-1);if(type==='facility')state.processingCapacity=1;if(type==='breakdown'){const v=state.vehicles.find(v=>v.status==='Breakdown');if(v)v.status='Available'};recalculate();replanRoutes();assignVehicles();logEvent(`${labelIncident(type)} cleared.`);renderAll();return}
    if(existing)return;
    const info={rain:['Heavy rain','Waste generation increased; travel speed reduced.'],festival:['Festival','Central Area generation increased.'],road:['Road closure','Blocked segment removed; routes recalculated.'],breakdown:['Truck breakdown','Assigned bins return to the priority queue; available trucks are checked.'],surge:['Waste surge','Citywide generation temporarily increased.'],facility:['Facility capacity reduction','Vehicles redirected to balance processing load.']}[type];
    state.incidents.push({type,name:info[0],impact:info[1],time:timeText()});
    if(type==='rain')state.rain='heavy';if(type==='festival')state.festival=true;if(type==='road')state.roadClosures++;if(type==='facility')state.processingCapacity=.7;
    if(type==='breakdown'){const v=state.vehicles.find(v=>v.status==='Collecting')||state.vehicles.find(v=>v.status==='Available');if(v){const lost=v.assignedBin;v.status='Breakdown';v.assignedBin=null;v.nextTarget=null;v.route=[];v.lastDecision='Unavailable: simulated breakdown';logEvent(`${v.id} failed${lost?`; ${lost} returned to the priority queue`:''}.`,'alert')}}
    recalculate();replanRoutes();assignVehicles();logEvent(`${info[0]} activated — ${info[1]}`,'alert');renderAll();toast(`${info[0]} simulated`);
  }
  function labelIncident(type){return ({rain:'Heavy rain',festival:'Festival',road:'Road closure',breakdown:'Truck breakdown',surge:'Waste surge',facility:'Facility reduction'})[type]}
  function activateCityCrisis(){
    ['rain','surge','road','breakdown','facility'].forEach(type=>{if(!state.incidents.some(i=>i.type===type))activateIncident(type,true)});
    state.scenario='CITY CRISIS';logEvent('CITY CRISIS detected → priorities, assignments, routes and facilities recalculated.','alert');renderAll();toast('City Crisis simulation activated')
  }

  function mapViewport(){
    const width=1000/mapZoom,height=680/mapZoom;
    mapCenter.x=clamp(mapCenter.x,width/2,1000-width/2);mapCenter.y=clamp(mapCenter.y,height/2,680-height/2);
    return {x:mapCenter.x-width/2,y:mapCenter.y-height/2,width,height};
  }
  function updateMapViewport(){
    const box=mapViewport(),svg=$('#cityMap svg');
    if(svg)svg.setAttribute('viewBox',`${box.x} ${box.y} ${box.width} ${box.height}`);
    $('#cityMap')?.classList.toggle('is-zoomed',mapZoom>1);
  }
  function bindMapNavigation(){
    const city=$('#cityMap');let drag=null,suppressClick=false;
    city.addEventListener('pointerdown',e=>{
      if(mapZoom<=1||e.button!==0||e.target.closest('.bin'))return;
      const svg=$('svg',city),rect=svg.getBoundingClientRect(),box=mapViewport();
      drag={x:e.clientX,y:e.clientY,center:{...mapCenter},scale:Math.min(rect.width/box.width,rect.height/box.height),moved:false};
      city.setPointerCapture(e.pointerId);city.classList.add('is-dragging');
    });
    city.addEventListener('pointermove',e=>{
      if(!drag)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      drag.moved||=Math.hypot(dx,dy)>3;
      mapCenter={x:drag.center.x-dx/drag.scale,y:drag.center.y-dy/drag.scale};updateMapViewport();
    });
    const finish=()=>{suppressClick=!!drag?.moved;drag=null;city.classList.remove('is-dragging')};
    city.addEventListener('pointerup',finish);city.addEventListener('pointercancel',finish);
    city.addEventListener('click',e=>{if(suppressClick){e.stopPropagation();suppressClick=false}},true);
    city.addEventListener('keydown',e=>{
      if(e.target!==city||mapZoom<=1)return;
      const delta={ArrowLeft:[-70,0],ArrowRight:[70,0],ArrowUp:[0,-50],ArrowDown:[0,50]}[e.key];
      if(delta){e.preventDefault();mapCenter.x+=delta[0]/mapZoom;mapCenter.y+=delta[1]/mapZoom;updateMapViewport()}
    });
  }
  function mapSVG(compact=false,atlas=false){
    const zoneFilter=atlas?($('#zoneFilter')?.value||'all'):'all',riskFilter=atlas?($('#riskFilter')?.value||'all'):'all';
    const visibleBins=state.bins.filter(b=>{
      const zoneOk=zoneFilter==='all'||b.zone===zoneFilter;
      const riskOk=riskFilter==='all'||(riskFilter==='critical'&&b.risk==='Critical')||(riskFilter==='high'&&(b.risk==='High'))||(riskFilter==='normal'&&(b.risk==='Low'||b.risk==='Medium'));
      return zoneOk&&riskOk;
    });
    const bins=visibleBins.map(b=>{const [name,color]=levelMeta[levelOf(b.fill)-1];return `<circle class="bin" data-bin="${b.id}" cx="${b.x}" cy="${b.y}" r="${compact?5:atlas?7:6}" fill="${color}" tabindex="0" role="button" aria-label="${b.id}, ${fmt(b.fill)}% full, ${name}, ${b.zone}. Open details"><title>${b.id} • ${fmt(b.fill)}% • ${name} • ${b.zone}</title></circle>`}).join('');
    const zoneShapes=zones.map((z,i)=>`<rect class="zone" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${atlas?22:36}" fill="${atlas?'':z.color}"/><text class="zone-label" x="${z.x+20}" y="${z.y+26}">${z.name.toUpperCase()}</text><text class="zone-type" x="${z.x+20}" y="${z.y+43}">${z.profile.toUpperCase()} • ${z.commercial}% COMMERCIAL</text>`).join('');
    const roadShapes=roads.map((d,i)=>`<path class="road ${atlas&&i<2?'major':''} ${i<state.roadClosures?'closed':''} ${i>1?'thin':''}" d="${d}"/>`).join('');
    const localRoads=atlas?minorRoads.map(d=>`<path class="minor-road" d="${d}"/>`).join(''):'';
    const hotspots=visibleBins.filter(b=>b.fill>=76).slice(0,16).map(b=>`<circle class="hotspot" cx="${b.x}" cy="${b.y}" r="${18+(b.fill-75)*.35}"/>`).join('');
    const routes=state.vehicles.filter(v=>v.route.length>1).map(v=>`<path class="route ${state.roadClosures?'alt':''}" d="${v.route.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}"/>`).join('');
    const dataLabels=atlas&&currentTwinLayer==='data'?visibleBins.filter(b=>b.fill>=60).slice(0,32).map(b=>`<text class="bin-data-label" x="${b.x+9}" y="${b.y-8}">${fmt(b.fill)}%</text>`).join(''):'';
    const aiLabels=atlas&&currentTwinLayer==='ai'?visibleBins.filter(b=>b.priority>=58).slice(0,28).map(b=>`<g class="ai-marker"><circle cx="${b.x}" cy="${b.y}" r="${10+b.priority/18}"/><text x="${b.x+10}" y="${b.y-10}">P${b.priority}</text></g>`).join(''):'';
    const trucks=state.vehicles.map(v=>`<g class="truck" transform="translate(${v.x} ${v.y})"><rect class="truck-body" x="-9" y="-6" width="14" height="11" rx="2"/><path class="truck-body" d="M5-4h6l4 5v4H5Z"/><circle cx="-4" cy="7" r="2" fill="#fff2af"/><circle cx="10" cy="7" r="2" fill="#fff2af"/><title>${v.id} • ${v.status}</title></g>`).join('');
    const facilities=state.facilities.map((f,i)=>`<g transform="translate(${f.x} ${f.y})"><rect class="facility" x="-13" y="-13" width="26" height="26" rx="5"/><text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff" font-weight="900">F${i+1}</text><title>${f.id}</title></g>`).join('');
    const labels=atlas?`<g class="map-labels"><text class="landmark-label" x="490" y="350">CENTRAL AURANGABAD</text><text class="landmark-label" x="720" y="255">CIDCO</text><text class="landmark-label" x="155" y="465">WALUJ</text><text class="street-label" x="365" y="185">Jalna Road</text><text class="street-label" x="525" y="475">Beed Bypass Road</text><text class="street-label" x="665" y="365">Chhatrapati Sambhajinagar</text><text class="street-label" x="790" y="520">Chikalthana Industrial Area</text></g>`:'';
    const {width,height,x,y}=atlas?mapViewport():{width:1000,height:680,x:0,y:0};
    const bg=atlas?'#edf0eb':'#091018';
    const fit='xMidYMid meet';
    return `<svg class="map-svg ${atlas?'atlas':''} layer-${currentTwinLayer}" viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="${fit}" role="group" aria-label="Local simulated city waste-management map"><defs><pattern id="cityGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="${atlas?'#dfe5e0':'#142130'}" stroke-width="1"/></pattern></defs><rect width="1000" height="680" fill="${bg}"/><rect width="1000" height="680" fill="url(#cityGrid)"/>${zoneShapes}${localRoads}<g>${roadShapes}</g>${labels}<g class="hotspot-layer">${hotspots}</g><g class="route-layer">${routes}</g><g class="ai-layer">${aiLabels}</g><g class="bin-layer">${bins}</g><g class="data-layer">${dataLabels}</g><g>${trucks}${facilities}<g transform="translate(105 610)"><rect class="depot" x="-17" y="-14" width="34" height="28" rx="6"/><text x="0" y="4" text-anchor="middle" font-size="8" fill="#fff" font-weight="900">DEPOT</text></g></g></svg>`;
  }
  function renderMaps(){
    const focused=document.activeElement?.dataset?.bin,focusedMap=document.activeElement?.closest('.city-map,.mini-map,.sim-map')?.id;
    ['dashboardMap','cityMap','simulationMap'].forEach((id,i)=>{const el=$(`#${id}`);if(!el)return;el.innerHTML=id==='cityMap'?mapSVG(false,true):mapSVG(i===0,false);$$('.bin',el).forEach(n=>{
      n.addEventListener('click',()=>selectBin(n.dataset.bin));
      n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectBin(n.dataset.bin);$('#closeDetail')?.focus()}});
      n.addEventListener('focus',()=>{if(id==='cityMap'&&mapZoom>1){mapCenter={x:+n.getAttribute('cx'),y:+n.getAttribute('cy')};updateMapViewport()}});
    })});
    updateMapViewport();
    if(focused&&focusedMap)$(`#${focusedMap} [data-bin="${focused}"]`)?.focus();
    const summary=$('#mapSummary');if(summary){const visible=$$('#cityMap .bin').length,m=currentMetrics();summary.innerHTML=`<span><b>${visible}</b> visible bins</span><span><b>${m.critical}</b> critical</span><span><b>${state.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length}</b> active trucks</span><span><b>${timeText()}</b> simulation time</span>`}
    toggleMapLayers();
  }
  function selectBin(id){selectedBinId=id;showPage('twin');renderDetail()}
  function renderDetail(){const el=$('#assetDetail');if(!el)return;const b=state.bins.find(x=>x.id===selectedBinId);if(!b){el.classList.remove('is-open');el.innerHTML='';return}const lvl=levelOf(b.fill),overflow=overflowMinutes(b),p=b.priorityBreakdown||{},zone=zones.find(z=>z.name===b.zone);el.classList.add('is-open');el.innerHTML=`<button id="closeDetail" class="drawer-close" aria-label="Close details">×</button><div class="detail-top"><span class="kicker">SIMULATED WASTE BIN</span><h2>${b.id}</h2><p class="muted">${b.zone} • ${b.wasteType} waste</p></div><div class="big-value" style="color:${levelMeta[lvl-1][1]}">${fmt(b.fill)}%</div><p>Level ${lvl} — ${levelMeta[lvl-1][0]}</p><div class="detail-stat"><span>Area type</span><b>${zone?.profile||'Mixed use'}</b></div><div class="detail-stat"><span>Commercial intensity</span><b>${zone?.commercial||0}% simulated</b></div><div class="detail-stat"><span>Growth rate</span><b>${b.rate} kg/hour</b></div><div class="detail-stat"><span>Predicted fill</span><b>${fmt(b.predicted)}%</b></div><div class="detail-stat"><span>Overflow urgency index</span><b>${b.overflowProbability}/100</b></div><div class="detail-stat"><span>Predicted overflow</span><b>${Number.isFinite(overflow)?`${fmt(overflow)} min`:'No overflow at the current rate'}</b></div><div class="detail-stat"><span>Distance estimate</span><b>${fmt(b.distanceKm,1)} km</b></div><div class="detail-stat"><span>Priority score</span><b>${b.priority}/100</b></div><div class="score-breakdown"><span>Overflow ${p.overflow||0}</span><span>Fill ${p.fill||0}</span><span>Growth ${p.growth||0}</span><span>Zone ${p.zone||0}</span><span>Proximity ${p.route||0}</span><span>Special ${p.special||0}</span></div><div class="explain-box"><span class="kicker">DECISION</span><p>${b.priority>=58?'Collect':'Monitor'} — ${b.risk.toLowerCase()} overflow risk, ${b.rate>20?'fast':'normal'} growth and ${b.distanceKm<2?'efficient':'longer'} route.</p></div>`;$('#closeDetail').addEventListener('click',()=>{selectedBinId=null;renderDetail()})}
  function toggleMapLayers(){const city=$('#cityMap');if(!city)return;const hot=$('#showHotspots'),routes=$('#showRoutes'),bins=$('#showBins');const h=$('.hotspot-layer',city),r=$('.route-layer',city),b=$('.bin-layer',city);if(h&&hot)h.style.display=hot.checked?'':'none';if(r&&routes)r.style.display=routes.checked?'':'none';if(b&&bins)b.style.display=bins.checked?'':'none'}

  function metricCard(label,value,sub,trend='good'){return `<div class="metric"><div class="metric-top"><span>${label}</span><span class="trend ${trend}">${trend==='good'?'●':'▲'}</span></div><strong>${value}</strong><small>${sub}</small></div>`}
  function renderMetrics(){const m=currentMetrics();$('#metricGrid').innerHTML=[metricCard('Total bins','100','Across 6 simulated zones'),metricCard('Critical bins',m.critical,'Critical forecast or fill threshold',m.critical>10?'up':'good'),metricCard('Available vehicles',m.available,'of 8 local fleet'),metricCard('Waste collected',`${fmt(state.wasteCollected,1)} t`,'This simulation session'),metricCard('Forecast overflow bins',m.predictedOverflow,'Of 100 bins in the next 90 minutes',m.overflow>20?'up':'good'),metricCard('Avg recorded delay',observed(m.avgTime,' min'),'Completed collections only'),metricCard('Vehicle utilization',`${fmt(m.utilization)}%`,'Active fleet'),metricCard('On-time collections',observed(state.serviceLevel,'%'),'Completed pickups before 100% fill')].join('');$('#queueCount').textContent=m.critical;$('#dashboardBrief').textContent=m.critical?`${m.critical} critical bins need attention.`:'Monitoring waste generation across all zones.'}
  function renderAreaActivity(){
    const el=$('#areaActivityGrid');if(!el)return;
    el.innerHTML=[...zones].sort((a,b)=>b.commercial-a.commercial).map((z,i)=>{
      const bins=state.bins.filter(b=>b.zone===z.name),avg=bins.reduce((sum,b)=>sum+b.fill,0)/Math.max(1,bins.length);
      const band=z.commercial>=80?'high':z.commercial>=45?'mixed':'low';
      return `<div class="area-card ${band}"><div class="area-card-top"><span>${i+1}</span><b>${z.name}</b><strong>${z.commercial}%</strong></div><div class="area-meter"><i style="width:${z.commercial}%"></i></div><small>${z.profile} • avg bin fill ${fmt(avg)}%</small><p>${z.note}</p></div>`;
    }).join('');
  }
  function priorityRows(limit=6){return criticalBins().slice(0,limit).map((b,i)=>`<div class="list-row"><span class="rank">${i+1}</span><div><b>${b.id}</b><small>${b.zone} • ${fmt(b.fill)}% fill • ${b.overflowProbability}/100 urgency index</small></div><span class="priority-pill">${b.priority}/100</span></div>`).join('')}
  function renderPriority(){const html=priorityRows(7);$('#priorityList').innerHTML=html;$('#predictionQueue').innerHTML=priorityRows(10)}
  function renderLevels(){const counts=Array(7).fill(0);state.bins.forEach(b=>counts[levelOf(b.fill)-1]++);$('#levelBars').innerHTML=counts.map((n,i)=>`<div class="level-row"><span>L${i+1} ${i===6?'•':''}</span><div class="bar-track"><i style="width:${n/Math.max(...counts)*100}%;background:${levelMeta[i][1]}"></i></div><b>${n}</b></div>`).join('')}
  function lineChart(series,labels,colors=['#e2b83f','#65d69a']){const w=700,h=240,p=28,all=series.flat(),max=Math.max(...all,1)*1.12,min=Math.min(0,...all);const x=i=>p+(i/Math.max(1,series[0].length-1))*(w-p*2),y=v=>h-p-((v-min)/(max-min||1))*(h-p*2);const grid=Array.from({length:5},(_,i)=>`<line class="grid" x1="${p}" y1="${p+i*(h-2*p)/4}" x2="${w-p}" y2="${p+i*(h-2*p)/4}"/>`).join('');const paths=series.map((arr,si)=>`<polyline fill="none" stroke="${colors[si]}" stroke-width="3" points="${arr.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>`).join('');const dots=series[0].map((v,i)=>i%Math.max(1,Math.floor(series[0].length/7))===0?`<circle class="dot-point" cx="${x(i)}" cy="${y(v)}" r="3"/>`:'').join('');const ticks=labels.map((l,i)=>i%Math.max(1,Math.floor(labels.length/6))===0?`<text x="${x(i)}" y="${h-5}" text-anchor="middle">${l}</text>`:'').join('');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}${paths}${dots}${ticks}</svg>`}
  function renderCharts(){const hist=state.history;const labels=hist.map(h=>h.time);$('#dashboardChart').innerHTML=lineChart([hist.map(h=>h.generated)],labels);$('#analyticsChart').innerHTML=lineChart([hist.map(h=>h.generated),hist.map(h=>h.collected)],labels);const b=criticalBins()[0];const vals=[0,30,60,90,120].map(min=>clamp(b.fill+(b.rate*(min/60)/b.capacity*100*activeModFor(b)),0,100));$('#forecastChart').innerHTML=lineChart([vals],['Now','+30m','+60m','+90m','+120m'],['#ff6b6b'])}
  function renderRecommendation(){const b=criticalBins()[0],truck=state.vehicles.find(v=>v.assignedBin===b.id);$('#recommendation').innerHTML=`<span class="risk ${b.risk.toLowerCase()}">${b.risk.toUpperCase()} ACTION</span><h4>${truck?'Assigned collection':'Priority candidate'}: ${b.id}</h4><p>${fmt(b.fill)}% full with a ${b.rate} kg/hour generation rate. ${b.predicted>=100?'Overflow is predicted within the simulation horizon.':'Risk is rising.'}</p><div class="reason-list"><span>${truck?truck.id:'Awaiting assignment checks'}</span><span>${b.zone}</span><span>Priority ${b.priority}</span></div>`}
  function renderPrediction(){const b=criticalBins()[0],p=b.priorityBreakdown||{};$('#predictionHero').innerHTML=`<span class="kicker">HIGHEST-PRIORITY ASSET</span><h2>${b.id}</h2><p class="muted">${b.zone} • SIMULATED PREDICTION • ${b.wasteType}</p><div class="prediction-score"><strong style="color:${levelMeta[levelOf(b.fill)-1][1]}">${fmt(b.predicted)}%</strong><span>predicted fill<br>in 90 minutes</span></div><div class="risk-meter"><i style="width:${b.predicted}%"></i></div><div class="prediction-stats"><div class="mini-stat"><span>Current fill</span><strong>${fmt(b.fill)}%</strong></div><div class="mini-stat"><span>Overflow urgency index</span><strong>${b.overflowProbability}/100</strong></div><div class="mini-stat"><span>Growth</span><strong>${b.rate>20?'High':'Moderate'}</strong></div><div class="mini-stat"><span>Priority score</span><strong>${b.priority}/100</strong></div></div><div class="score-breakdown"><span>Overflow ${p.overflow||0}</span><span>Fill ${p.fill||0}</span><span>Growth ${p.growth||0}</span><span>Zone ${p.zone||0}</span><span>Proximity ${p.route||0}</span><span>Special ${p.special||0}</span></div><div class="explain-box"><span class="kicker">DECISION EXPLANATION</span><p>The weighted urgency, fill, growth, zone, proximity and special-condition contributions round to ${b.priority}/100. Collection requires an available truck, enough capacity and a reachable route.</p></div>`;const a=state.bins.find(x=>x.anomaly)||criticalBins()[1];const diff=Math.round((a.observed-a.expected)/Math.max(1,a.expected)*100);$('#anomalyCard').innerHTML=`<div class="anomaly-alert"><span class="risk high">SEEDED ANOMALY FIXTURE</span><h4>${a.id} • ${a.zone}</h4><p>Expected: ${a.expected} kg • Observed simulated: ${a.observed} kg • Difference: +${diff}%</p><b>Rule-based response</b><p>${state.festival?'Festival condition active':'Synthetic anomaly flag active'}. Priority is recalculated transparently.</p></div>`}
  function renderControls(){$('#playBtn').textContent=state.isRunning?'Ⅱ Pause simulation':'▶ Start simulation';$('#quickPlay').textContent=state.isRunning?'Ⅱ':'▶';$('#runStatus').textContent=state.isGuided?`GUIDED ${state.demoStep+1}/${guidedStory.length}`:state.isRunning?'RUNNING':'PAUSED';$('#runStatus').className=`run-status ${state.isRunning?'running':'paused'}`;$('#quickStatus').textContent=state.isGuided?'GUIDED DEMO':`SIMULATION ${state.isRunning?'RUNNING':'PAUSED'}`;$('#simClock').textContent=$('#quickClock').textContent=$('#stageTime').textContent=timeText();$('#timelineFill').style.width=`${((state.currentMinutes-480)%720)/720*100}%`;$$('#speedBtns button').forEach(b=>b.classList.toggle('active',+b.dataset.speed===state.speed));document.body.classList.toggle('visitor-mode',visitorMode);$('#visitorModeBtn')?.classList.toggle('active',visitorMode);$('#expertModeBtn')?.classList.toggle('active',!visitorMode);['demoPauseBtn','demoSkipBtn','demoExitBtn'].forEach(id=>{const el=$(`#${id}`);if(el)el.disabled=!state.isGuided});if($('#demoPauseBtn'))$('#demoPauseBtn').textContent=demoPaused?'Resume':'Pause';if($('#guidedDemoBtn'))$('#guidedDemoBtn').textContent=state.isGuided?'● GUIDED DEMO RUNNING':'▶ START GUIDED DEMO'}
  function renderSimulation(){
    const b=criticalBins()[0],activeTruck=state.vehicles.find(v=>v.status==='Collecting')||state.vehicles.find(v=>v.status==='Returning')||(state.isGuided?state.vehicles.find(v=>v.id==='T-03'):null),truck=activeTruck,mins=overflowMinutes(b),m=currentMetrics();
    const activeTrucks=state.vehicles.filter(v=>v.status==='Collecting'||v.status==='Returning').length;
    const cycleDone=state.tickCount>0;
    $('#simSnapshot').innerHTML=[
      ['SIMULATION TIME',timeText(),'Each step adds 10 minutes'],
      ['CRITICAL BINS',m.critical,'Critical forecast or fill threshold',m.critical?'alert':''],
      ['ACTIVE TRUCKS',activeTrucks,`${m.available} still available`],
      ['BINS COLLECTED',state.binsCollected,`${state.overflowPrevented} predicted overflows prevented`],
      ['DUMP TRIPS',state.dumpTrips,`${fmt(m.avgBinsPerTrip,1)} bins per trip`]
    ].map(x=>`<div class="sim-snapshot-card ${x[3]||''}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    const storyIndex=state.isGuided||state.demoStep?clamp(state.demoStep,0,guidedStory.length-1):clamp(state.tickCount%guidedStory.length,0,guidedStory.length-1);
    const story=storyIndex===guidedStory.length-1?{...guidedStory[storyIndex],...demoOutcome()}:guidedStory[storyIndex];
    $('#storyBar').innerHTML=guidedStory.map((s,i)=>`<span class="${i<storyIndex?'done':i===storyIndex?'active':''}">${s.stage}</span>`).join('<i>→</i>');
    const storyBin=(state.isGuided||state.demoStep===9)&&storyIndex<=4?state.bins.find(x=>x.id==='B-104'):null;
    const currentBin=storyBin||(truck?.assignedBin?state.bins.find(x=>x.id===truck.assignedBin):b);
    const nextCandidate=truck&&truck.status==='Collecting'?eligibleCandidates(truck,truck.assignedBin)[0]:null;
    let decision=`AI detected ${b.id} at ${b.priority}/100 priority with ${b.overflowProbability}/100 overflow urgency index.`;
    if(truck?.status==='Collecting')decision=`AI selected ${truck.id} for ${truck.assignedBin}: capacity fits, ETA ${truck.eta} min, and the route is efficient.`;
    if(truck?.status==='Returning')decision=`AI routed ${truck.id} to ${state.facilities[truck.facility]?.id}: the facility has the best capacity, compatibility and travel score.`;
    const showGuided=state.isGuided||(state.demoStep===guidedStory.length-1&&state.tickCount>=guidedStory.length);
    $('#guidedOverlay').classList.toggle('show',showGuided);
    $('#guidedOverlay').innerHTML=`<span>STEP ${storyIndex+1} OF ${guidedStory.length}</span><h2>${story.title}</h2><p>${story.message}</p><div class="guided-facts"><b>${currentBin?.id||b.id}: ${fmt(currentBin?.fill||b.fill)}% fill</b><b>Prediction: ${fmt(currentBin?.predicted||b.predicted)}%</b><b>${truck?`${truck.id}: ${fmt(truck.currentLoad/truck.capacity*100)}% load`:`Priority: ${b.priority}/100`}</b></div><small>NEXT: ${story.next}</small>`;
    $('#liveDecision').innerHTML=`<strong>${decision}</strong><span>NEXT: ${truck?.status==='Collecting'?`collect ${truck.assignedBin}, then re-check nearby bins`:`monitor ${b.id} and update the queue`}</span>`;
    const reasons=truck?.status==='Collecting'?[`${truck.assignedBin} has priority ${state.bins.find(x=>x.id===truck.assignedBin)?.priority||0}/100`,`${truck.id} has ${fmt((truck.capacity-truck.currentLoad)/truck.capacity*100)}% capacity remaining`,`${fmt(planRoute(truck,state.bins.find(x=>x.id===truck.assignedBin))?.distance,1)} km remaining planned route`,state.roadClosures?'Route recalculated around a closure':'Low route disruption']:[`${b.fill>=76?'High':'Rising'} fill level`,`${b.overflowProbability}/100 overflow urgency index`,`${b.rate} kg/hour growth`,`Priority breakdown is visible in Digital Twin`];
    $('#whyPanel').innerHTML=`<b>WHY THIS DECISION?</b><ul>${reasons.map(r=>`<li>${r}</li>`).join('')}</ul>`;
    const load=truck?truck.currentLoad/truck.capacity*100:0,remaining=truck?truck.capacity-truck.currentLoad:0;
    $('#truckTelemetry').innerHTML=truck?`<div class="telemetry-head"><b>${truck.id}</b><span class="status-label ${truck.status.toLowerCase()}"><i></i>${truck.status}</span></div><div class="capacity-label"><span>Load ${fmt(load)}%</span><span>${fmt(remaining)} kg remaining</span></div><div class="truck-capacity"><i style="width:${load}%"></i><em style="left:${OPERATIONAL_CAPACITY*100}%"></em></div><div class="telemetry-grid"><span>Collected<b>${truck.collectedBins.length?truck.collectedBins.join(' → '):'None yet'}</b></span><span>Current target<b>${truck.assignedBin||(truck.status==='Returning'?state.facilities[truck.facility]?.id:'Waiting')}</b></span><span>Next target<b>${nextCandidate?.b.id||truck.nextTarget||'Re-evaluate'}</b></span><span>Route update<b>Version ${truck.routeVersion}</b></span></div><p>${truck.lastDecision}</p>`:`<p class="muted">No truck is active. The priority queue is being monitored.</p>`;
    const cycleStages=[
      ['Waste grows','Every bin uses its own local generation rate.'],
      ['Forecast updates','The next 90 minutes are estimated.'],
      ['Risk is checked','Bins move from low to critical.'],
      ['Priority changes','Urgent bins move to the front.'],
      ['Truck acts','A feasible vehicle and route are selected.'],
      ['Results save','Collection and analytics update together.']
    ];
    $('#currentStep').innerHTML=`<div class="cycle-heading"><span class="cycle-number">${String(state.tickCount).padStart(2,'0')}</span><div><h3>${cycleDone?'Cycle completed':'Ready to begin'}</h3><p>${cycleDone?`At ${timeText()}, every stage below was recalculated from the same city state.`:'Press Start or +10 min. The system will run all six stages in order.'}</p></div></div><div class="cycle-flow">${cycleStages.map((s,i)=>`<div class="cycle-stage ${cycleDone?'done':i===0?'ready':''}"><i>${cycleDone?'✓':i+1}</i><span><b>${s[0]}</b><small>${s[1]}</small></span></div>`).join('')}</div>`;
    $('#eventLog').innerHTML=state.logs.map(l=>`<div class="log-row"><time>${l.time}</time><i style="background:${l.type==='alert'?'var(--red)':l.type==='success'?'var(--green)':'var(--blue)'}"></i><span>${escapeHTML(l.text)}</span></div>`).join('');
    $('#eventTicker').innerHTML=`<span class="signal ${state.logs[0]?.type==='alert'?'red':state.logs[0]?.type==='success'?'green':'blue'}"></span><span>${state.tickCount?escapeHTML(state.logs[0].text):'Ready. Start the simulation or advance one 10-minute step.'}</span>`;
    $('#explainStrip').innerHTML=[
      ['1 · CITY CONDITION',`${b.id} is ${fmt(b.fill)}% full`,`${b.zone} currently has the highest priority.`],
      ['2 · PREDICTION',Number.isFinite(mins)?`${fmt(mins)} min to overflow`:'No near overflow',`${b.rate} kg/hour generation creates ${b.risk.toLowerCase()} risk.`],
      ['3 · AI DECISION',truck?`${truck.id} ${truck.status.toLowerCase()}`:`Priority score ${b.priority}`,truck?truck.lastDecision:'The queue will be checked again next step.','action'],
      ['4 · EXPECTED RESULT',truck?.status==='Collecting'?'Collect, re-evaluate, continue':'Continue monitoring',truck?'The truck may collect multiple suitable bins before dumping.':'Fill, forecast and priority update again.']
    ].map(x=>`<div class="explain-tile ${x[3]||''}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
  }
  function renderVehicles(){const m=currentMetrics();$('#vehicleMetrics').innerHTML=[metricCard('Fleet size','8','Simulated trucks'),metricCard('Available',m.available,'Ready for assignment'),metricCard('Bins / dump trip',fmt(m.avgBinsPerTrip,1),'Dynamic multi-bin collection'),metricCard('Dump trips',state.dumpTrips,'Simulation total')].join('');$('#vehicleTable').innerHTML=state.vehicles.map(v=>`<tr><td><b>${v.id}</b><small>${v.collectedBins.length?`${v.collectedBins.length} bins this trip`:''}</small></td><td><span class="status-label ${v.status.toLowerCase()}"><i></i>${v.status}</span></td><td><div class="load-cell"><span>${fmt(v.currentLoad/v.capacity*100)}%</span><div class="load-mini"><i style="width:${v.currentLoad/v.capacity*100}%"></i></div></div></td><td>${v.assignedBin||state.facilities[v.facility]?.id||'—'}</td><td>${v.status==='Collecting'?`${v.eta} min`:'—'}</td></tr>`).join('');const active=state.vehicles.find(v=>v.status==='Collecting'||v.status==='Returning'),top=criticalBins().slice(0,3),aiDistance=state.routeDistance;$('#routeComparison').innerHTML=`<span class="kicker">LIVE ADAPTIVE ROUTE</span><div class="route-path"><span class="route-node">${active?.id||'Depot'}</span><span class="route-arrow">→</span>${active?.assignedBin?`<span class="route-node">${active.assignedBin}</span><span class="route-arrow">→</span>`:''}<span class="route-node">${active?.status==='Returning'?state.facilities[active.facility]?.id:(active?.nextTarget||top[0]?.id)}</span></div><p class="muted">${escapeHTML(active?.lastDecision||'Routes are recalculated after every state change.')}</p><div class="compare-stats"><div class="compare-col"><b>Fixed scheduling</b><span>Distance <strong>Not measured</strong></span><span>Pattern <strong>Collect → Dump</strong></span></div><div class="compare-col ai"><b>AI dynamic</b><span>Simulated distance <strong>${fmt(aiDistance,1)} km</strong></span><span>Pattern <strong>Collect → Re-evaluate</strong></span></div></div>`;$('#facilityGrid').innerHTML=state.facilities.map(f=>{const use=f.currentLoad/(f.capacity*state.processingCapacity)*100,predicted=clamp(use+state.vehicles.filter(v=>v.status==='Returning'&&state.facilities[v.facility]===f).reduce((s,v)=>s+v.currentLoad/1000/f.capacity*100,0),0,100);return `<div class="facility-card"><div class="facility-top"><div><span class="kicker">${f.status}</span><h3>${f.id}</h3><p class="muted">${f.compatibility.join(', ')}</p></div><div class="capacity-ring" style="--value:${use}"><b>${fmt(use)}%</b></div></div><div class="detail-stat"><span>Current load</span><b>${fmt(f.currentLoad,1)} t</b></div><div class="detail-stat"><span>Predicted with incoming</span><b>${fmt(predicted)}%</b></div><div class="detail-stat"><span>Traffic factor</span><b>${f.traffic<.2?'Low':'Moderate'}</b></div><div class="detail-stat"><span>Incoming trucks</span><b>${state.vehicles.filter(v=>v.status==='Returning'&&state.facilities[v.facility]===f).length}</b></div></div>`}).join('')}
  function decisionLabConfig(){return {waste:1+(+$('#wasteRange')?.value||0)/100,rain:$('#rainSelect')?.value||'none',festival:$('#festivalSelect')?.value==='on',closures:+($('#roadRange')?.value||0),trucks:+($('#truckRange')?.value||8),failures:+($('#failureRange')?.value||0),capacity:+($('#capacityRange')?.value||100)/100}}
  function simulateDecisionCopy(config=decisionLabConfig(),fleetOverride=null){
    validateDecisionConfig(config);if(fleetOverride!=null)requireNumber(fleetOverride,2,12,'Fleet override',true);
    const total=Math.max(2,Math.min(12,Math.floor(fleetOverride??config.trucks))),failures=Math.max(0,Math.floor(config.failures)),fleet=Math.max(0,total-failures);
    let cache=labCache.get(state);
    if(!cache||cache.version!==state.modelVersion){cache={version:state.modelVersion,results:new Map()};labCache.set(state,cache)}
    const key=JSON.stringify([config,total]);if(cache.results.has(key))return {...cache.results.get(key)};
    const copy=JSON.parse(JSON.stringify(state));
    copy.wasteModifier=config.waste;copy.rain=config.rain;copy.festival=config.festival;copy.roadClosures=config.closures;copy.truckLimit=fleet;copy.processingCapacity=config.capacity;copy.incidents=[];copy.isGuided=false;copy.responseTimes=[];
    if(config.rain==='heavy')copy.incidents.push({type:'rain'});if(config.festival)copy.incidents.push({type:'festival'});if(config.closures)copy.incidents.push({type:'road'});
    copy.vehicles=Array.from({length:total},(_,i)=>{
      const v=copy.vehicles[i]||{id:`T-${String(i+1).padStart(2,'0')}`,x:105,y:610,capacity:2200,currentLoad:0,status:'Available',assignedBin:null,nextTarget:null,eta:0,progress:0,route:[],facility:0,collectedBins:[],routeVersion:0,lastDecision:'Planning fleet addition',dumpTrips:0,wasteTypes:[]};
      if(i>=fleet||['Maintenance','Breakdown','Waiting'].includes(v.status)){v.status=i>=fleet?'Breakdown':'Available';v.assignedBin=null;v.nextTarget=null;v.route=[]}
      return v;
    });
    recalculate(copy);replanRoutes(copy);
    copy.bins.forEach(b=>{b.queuedAtMinutes=(b.risk==='Critical'||b.risk==='High'||b.priority>=58)?copy.currentMinutes:null});
    const initial={distance:copy.routeDistance,dumps:copy.dumpTrips,served:copy.binsCollected,overflow:copy.overflowIncidents};
    let peakCritical=currentMetrics(copy).critical;
    for(let step=0;step<FORECAST_HOURS*60/TICK_MINUTES;step++)peakCritical=Math.max(peakCritical,simulationStep(copy));
    const metrics=currentMetrics(copy),pending=copy.bins.filter(b=>b.queuedAtMinutes!=null).map(b=>copy.currentMinutes-b.queuedAtMinutes);
    const delay=Math.max(0,...copy.responseTimes,...pending),capacity=copy.facilities.reduce((sum,f)=>sum+f.capacity*copy.processingCapacity,0);
    const result={overflowRisk:+metrics.overflow.toFixed(1),criticalBins:metrics.critical,peakCritical,collectionDelay:delay,totalTrucks:total,facilityDemand:+(copy.facilities.reduce((sum,f)=>sum+f.currentLoad,0)/capacity*100).toFixed(1),routeDistance:+(copy.routeDistance-initial.distance).toFixed(1),dumpTrips:copy.dumpTrips-initial.dumps,served:copy.binsCollected-initial.served,overflowEvents:copy.overflowIncidents-initial.overflow,serviceLevel:copy.serviceLevel==null?null:+copy.serviceLevel.toFixed(1),fleet};
    cache.results.set(key,result);return {...result};
  }
  function renderScenarios(){
    const result=labResults||simulateDecisionCopy(),name=labResults?.name||'Baseline copy';
    $('#scenarioName').textContent=name.toUpperCase();
    const vals=[['Forecast overflow share',`${result.overflowRisk}%`],['Critical bins',result.criticalBins],['Max collection delay',`${result.collectionDelay} min`],['Active trucks',result.fleet],['Facility load',`${result.facilityDemand}%`],['Route distance',`${result.routeDistance} km`],['Dump trips',result.dumpTrips],['Bins served',result.served]];
    $('#scenarioResults').innerHTML=vals.map(v=>`<div class="result-tile"><span>${v[0]}</span><strong>${v[1]}</strong></div>`).join('');
    $('#impactChart').innerHTML=lineChart([[result.criticalBins,result.overflowRisk,result.collectionDelay,result.routeDistance]],['Critical','Risk','Delay','Distance'],['#f2a65a']);
    const configs=[['Normal',{waste:1,rain:'none',festival:false,closures:0,trucks:8,failures:0,capacity:1}],['Festival',{waste:1.5,rain:'none',festival:true,closures:0,trucks:8,failures:0,capacity:1}],['Heavy rain',{waste:1.3,rain:'heavy',festival:false,closures:1,trucks:8,failures:0,capacity:.9}],['Resource shortage',{waste:1.5,rain:'none',festival:false,closures:2,trucks:5,failures:1,capacity:.7}]];
    $('#scenarioCompare').innerHTML=configs.map(([label,c])=>{const r=simulateDecisionCopy(c);return `<div><b>${label}</b><span>${r.overflowRisk}% forecast overflow</span><span>${r.collectionDelay} min delay</span><span>${r.fleet} active trucks</span></div>`}).join('');
    const factors=[['Simulation clock',timeText(),'Fixed-rate model; no daily demand profile'],['Live scenario',state.scenario,'Decision Lab remains separate'],['Waste generation',`${fmt(state.wasteModifier*100-100)}% modifier`,'Live twin value'],['Rainfall',state.rain,'Live twin value'],['Road condition',state.roadClosures?`${state.roadClosures} closure(s)`:'Clear','Changes route and ETA'],['Vehicle availability',`${state.truckLimit}/8`,'Live service capacity'],['Processing capacity',`${fmt(state.processingCapacity*100)}%`,'Live facility capacity'],['Reports',state.reports.length,'Citizen issues in live state']];
    $('#factorGrid').innerHTML=factors.map(f=>`<div class="factor"><div class="factor-head"><span>${f[0]}</span><b>${f[1]}</b></div><small>${f[2]}</small></div>`).join('');
    $('#reportTimeline').innerHTML=state.reports.length?state.reports.map(r=>`<div class="report-item"><b>${escapeHTML(r.location)}</b><span>${escapeHTML(r.type)} • ${escapeHTML(r.severity)}</span><div>${['Reported','Verified','Assigned','Dispatched','Collected','Resolved'].map((s,i)=>`<i class="${i<=r.step?'done':''}">${s}</i>`).join('')}</div></div>`).join(''):'<p class="muted">No citizen reports in this simulated session.</p>';
    $$('.incident-card').forEach(b=>b.classList.toggle('active',state.incidents.some(i=>i.type===b.dataset.incident)));$$('[data-sim-incident]').forEach(b=>b.classList.toggle('active',state.incidents.some(i=>i.type===b.dataset.simIncident)))
  }
  function renderAnalytics(){
    const m=currentMetrics();
    $('#analyticsMetrics').innerHTML=[
      metricCard('Bins collected',state.binsCollected,'Simulation total'),
      metricCard('Overflow events',state.overflowIncidents,'Recorded locally',state.overflowIncidents?'up':'good'),
      metricCard('At-risk pickups',state.overflowPrevented,'Forecast-risk bins collected before full'),
      metricCard('Avg recorded delay',observed(m.avgTime,' min'),'Time since joining the priority queue'),
      metricCard('Truck utilization',`${fmt(m.utilization)}%`,'Active fleet'),
      metricCard('Bins / dump trip',fmt(m.avgBinsPerTrip,1),'Multi-bin routing'),
      metricCard('Dump trips',state.dumpTrips,'Facility visits'),
      metricCard('Route distance',`${fmt(state.routeDistance,1)} km`,'Adaptive routing'),
      metricCard('Simulated fuel / cost',`₹${fmt(state.simulatedCost,0)}`,'Model estimate only'),
      metricCard('Waste recovered',`${fmt(state.recoveredWaste,2)} t`,'Simulated 46% recovery')
    ].join('');

    const facilityCapacity=state.facilities.reduce((sum,f)=>sum+f.capacity*state.processingCapacity,0);
    const facilityLoad=state.facilities.reduce((sum,f)=>sum+f.currentLoad,0);
    const facilityUtilization=facilityCapacity>0?facilityLoad/facilityCapacity*100:0;
    const gauges=[
      ['Vehicle utilization',m.utilization],
      ['On-time collections',state.serviceLevel],
      ['Facility utilization',facilityUtilization],
      ['Bins below critical',100-m.critical]
    ];
    $('#serviceGauges').innerHTML=gauges.map(g=>{
      const value=clamp(Number(g[1])||0,0,100);
      return `<div class="gauge-item"><header><span>${g[0]}</span><b>${g[1]==null?'Not measured':fmt(value)+'%'}</b></header><div class="bar-track"><i style="width:${value}%;background:${value>80?'var(--green)':value>55?'var(--yellow)':'var(--red)'}"></i></div></div>`;
    }).join('');

    /*
      Evaluation-integrity safeguard:
      Fixed-schedule results must come from a separate run with the same initial
      state and the same horizon. Multiplying adaptive metrics does not create a
      valid baseline, so this column stays explicitly unmeasured until a paired
      policy experiment is implemented and tested.
    */
    const rows=[
      ['Recorded collection delay','Not measured',observed(m.avgTime,' min')],
      ['Overflow incidents','Not measured',state.overflowIncidents],
      ['Vehicle utilization','Not measured',`${fmt(m.utilization)}%`],
      ['Route distance','Not measured',`${fmt(state.routeDistance,1)} km`],
      ['Dump trips','Not measured',state.dumpTrips],
      ['Bins per trip','Not measured',fmt(m.avgBinsPerTrip,1)],
      ['On-time collections','Not measured',observed(state.serviceLevel,'%')]
    ];
    $('#comparisonGrid').innerHTML=`<div class="head">METRIC</div><div class="head">Fixed schedule<br><small>Not yet measured</small></div><div class="head">Adaptive simulation<br><small>Current session</small></div>${rows.map(r=>`<div>${r[0]}</div><div class="muted">${r[1]}</div><div class="ai-value">${r[2]}</div>`).join('')}`;
  }
  function renderHow(){if($('#processFlow').children.length)return;$('#processFlow').innerHTML=processStages.map((s,i)=>`<article class="process-card"><span class="num">${String(i+1).padStart(2,'0')}</span><h3>${s[0]}</h3><p>${s[1]}</p></article>`).join('')}
  function renderAll(){renderControls();renderMetrics();renderAreaActivity();renderPriority();renderLevels();renderMaps();renderDetail();renderCharts();renderRecommendation();renderPrediction();renderSimulation();renderVehicles();if($('#scenarios').classList.contains('active'))safeAction(renderScenarios);renderAnalytics();renderHow()}

  function showPage(id){const page=$(`#${id}`);if(!page)return;$$('.page').forEach(p=>p.classList.toggle('active',p.id===id));$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));$('#pageTitle').textContent=page.dataset.title||'AI-WasteTwin';$('.sidebar').classList.remove('open');window.scrollTo(0,0);renderAll()}
  function enterApp(page='dashboard'){demoMode=false;$('#landing').classList.add('hidden');$('#app').classList.remove('hidden');showPage(page)}
  function startDemo(){enterApp('simulation');reset();visitorMode=true;demoMode=true;state.isGuided=true;state.demoStep=0;state.truckLimit=3;state.bins.forEach(x=>{x.fill=Math.min(x.fill,64)});const b=state.bins.find(x=>x.id==='B-104'),near1=state.bins.find(x=>x.id==='B-115'),near2=state.bins.find(x=>x.id==='B-121');if(b){b.fill=74;b.rate=42;b.anomaly=true;b.zonePriority=1}if(near1){near1.fill=72;near1.rate=31;near1.anomaly=false;near1.x=b.x+42;near1.y=b.y+18}if(near2){near2.fill=66;near2.rate=27;near2.x=b.x+70;near2.y=b.y-22}state.vehicles.forEach(x=>{x.status='Maintenance';x.assignedBin=null;x.route=[]});const v=state.vehicles.find(x=>x.id==='T-03');if(v&&b){v.x=b.x-80;v.y=b.y+45;v.currentLoad=v.capacity*.12;v.status='Maintenance';v.lastDecision='Waiting for guided dispatch'}recalculate();renderAll();setRunning(true);toast('Guided demo started — the system will explain each decision')}
  function pauseGuided(){if(!state.isGuided)return;demoPaused=!demoPaused;setRunning(!demoPaused);renderControls()}
  function skipGuided(){if(!state.isGuided)return;clearInterval(timer);tick();if(state.isGuided&&!demoPaused)setRunning(true)}
  function exitGuided(){demoMode=false;state.isGuided=false;demoPaused=false;restoreDemoFleet();setRunning(false);renderAll();toast('Guided demo exited; collections preserved and full fleet available')}
  function replay(){stopReplay();if(state.snapshots.length<2){toast('Run the simulation first to create a replay');return}setRunning(false);showPage('simulation');const saved=state;let i=0;replaySavedState=saved;replayTimer=setInterval(()=>{const frame=saved.snapshots[i++];if(!frame){stopReplay();renderAll();toast('Replay complete');return}state={...JSON.parse(JSON.stringify(frame)),isRunning:false,isGuided:false,history:saved.history.filter(h=>h.minutes<=frame.currentMinutes),snapshots:saved.snapshots.slice(0,i)};renderAll()},350)}
  function runScenario(){stopReplay();const config=decisionLabConfig(),parts=[config.rain!=='none'&&`${config.rain} rain`,config.festival&&'festival',config.closures&&`${config.closures} closure(s)`,config.failures&&`${config.failures} failure(s)`,config.waste>1&&`${fmt((config.waste-1)*100)}% waste`].filter(Boolean);labResults={...simulateDecisionCopy(config),name:parts.join(' + ')||'Baseline copy'};renderScenarios();toast('What-if plan completed on a copy; live twin unchanged')}
  function applyLabPreset(name){const presets={normal:[0,'none','off',0,8,0,100],festival:[50,'none','on',0,8,0,100],rain:[30,'heavy','off',1,8,0,90],shortage:[50,'none','off',2,5,1,70]},p=presets[name];if(!p)return;$('#wasteRange').value=p[0];$('#rainSelect').value=p[1];$('#festivalSelect').value=p[2];$('#roadRange').value=p[3];$('#truckRange').value=p[4];$('#failureRange').value=p[5];$('#capacityRange').value=p[6];$('#wasteOut').value=`+${p[0]}%`;$('#roadOut').value=p[3];$('#truckOut').value=p[4];$('#failureOut').value=p[5];$('#capacityOut').value=`${p[6]}%`;runScenario()}
  function minimumFleet(config,risk,delay){
    validateDecisionConfig(config);requireNumber(risk,1,100,'Target forecast overflow share');requireNumber(delay,1,1440,'Target maximum delay');
    const tests=[];let found=null;
    for(let total=Math.max(2,config.failures+1);total<=12;total++){
      const r=simulateDecisionCopy({...config,trucks:total},total);
      tests.push(`${total} total (${r.fleet} active): ${r.overflowRisk}% / ${r.collectionDelay}m`);
      if(r.overflowRisk<=risk&&r.collectionDelay<=delay){found={fleet:total,r};break}
    }
    return {found,tests};
  }
  function findRequiredFleet(){
    const config=decisionLabConfig(),risk=+$('#targetRisk').value,delay=+$('#targetDelay').value,{found,tests}=minimumFleet(config,risk,delay);
    $('#fleetResult').innerHTML=found?`<strong>${found.fleet} total simulated trucks required</strong><span>${found.r.fleet} active after ${config.failures} failures • overflow risk ${found.r.overflowRisk}% • max delay ${found.r.collectionDelay} min</span><small>90-minute simulation estimate; ${tests.join(' | ')}</small>`:`<strong>Target not reached within 12 total trucks</strong><small>Includes ${config.failures} failures; ${tests.join(' | ')}</small>`;
  }
  function submitCitizenReport(e){e.preventDefault();stopReplay();if(!$('#reportLocation').value.trim())throw new RangeError('Enter a report location.');const type=$('#reportType').value,location=$('#reportLocation').value.trim(),hazard=/hazard|e-waste/i.test(type),severity=hazard?'Critical':/mixed|organic/i.test(type)?'High':'Medium',facility=hazard?'DS-02':'Best compatible facility';state.reports.unshift({id:`R-${String(state.reports.length+1).padStart(3,'0')}`,location,type:type.toLowerCase(),description:$('#reportDescription').value.trim(),image:$('#reportImage').files[0]?.name||null,severity,facility,step:1});logEvent(`Citizen report at ${location} classified by rules: ${type}, ${severity}; ${facility} recommended.`,'ai');e.target.reset();renderAll();toast('Simulated report classified; illustrative timeline added')}
  function copilotAnswer(kind){const b=criticalBins()[0],truck=state.vehicles.find(v=>v.status==='Collecting'||v.status==='Returning'),facility=truck?facilityChoice(truck,truck.wasteTypes?.[0]||'mixed'):null,low=[...state.bins].sort((a,b)=>a.priority-b.priority)[0];const answers={next:`Collect ${b.id} next. It has ${b.priority}/100 priority, ${b.overflowProbability}/100 overflow urgency index and ${fmt(b.distanceKm,1)} km estimated distance.`,truck:truck?`${truck.id} was selected because it has ${fmt((truck.capacity-truck.currentLoad)/truck.capacity*100)}% capacity remaining and an efficient route to ${truck.assignedBin||state.facilities[truck.facility]?.id}.`:'No truck is active; the next available feasible truck will be selected.',skip:`${low.id} is skipped because its priority is only ${low.priority}/100 and higher-risk bins need service first.`,breakdown:truck?`If ${truck.id} fails, ${truck.assignedBin||'its work'} returns to the queue, priorities recalculate and a replacement route is assigned when a suitable truck becomes available.`:'A breakdown would reduce fleet capacity and trigger re-assignment.',facility:facility?`${facility.f.id} is preferred: ${fmt(facility.load*100)}% loaded, ${fmt(facility.distance,1)} km away and waste-compatible.`:truck?'No available, compatible facility with enough capacity is currently reachable.':'No active loaded truck currently needs a facility.'};$('#copilotAnswer').textContent=answers[kind]||'No answer available.'}
  function exportReport(){const m=currentMetrics();const report={project:'AI-WasteTwin',mode:'SIMULATION MODE — LOCAL / OFFLINE — SIMULATED DATA',generatedAt:new Date().toISOString(),simulationTime:timeText(),scenario:state.scenario,schemaVersion:2,methodology:{forecast:'Linear rate over 90 minutes with explicit modifiers; no trained model',urgency:'Uncalibrated weighted rule index, not a probability',routing:'Dijkstra between nearest road access nodes; collection ordering is a heuristic',copilot:'Deterministic current-state templates',metricDefinitions:{overflowRisk:'Percentage of bins forecast to reach 100% within 90 minutes',serviceLevel:'Percentage of completed collections made before actual bin overflow',overflowPrevented:'Forecast-risk bins collected before 100%; not a measured counterfactual',averageBinsPerTrip:'Completed-bin stops across completed dump trips'}},conditions:{rain:state.rain,festival:state.festival,roadClosures:state.roadClosures,wasteModifier:state.wasteModifier,truckLimit:state.truckLimit,processingCapacity:state.processingCapacity},assignments:state.vehicles.map(v=>({id:v.id,status:v.status,assignedBin:v.assignedBin,loadKg:v.currentLoad,capacityKg:v.capacity,etaMinutes:v.eta,routeVersion:v.routeVersion})),metrics:{totalBins:100,binsCollected:state.binsCollected,overflowIncidents:state.overflowIncidents,overflowPrevented:state.overflowPrevented,availableVehicles:m.available,wasteCollectedTons:+state.wasteCollected.toFixed(2),wasteRecoveredTons:+state.recoveredWaste.toFixed(2),overflowRisk:+m.overflow.toFixed(1),forecastOverflowBins:m.predictedOverflow,recordedAverageDelayMinutes:m.avgTime,onTimeCollectionPercent:state.serviceLevel,serviceLevel:state.serviceLevel==null?null:+state.serviceLevel.toFixed(1),routeDistanceKm:+state.routeDistance.toFixed(1),dumpTrips:state.dumpTrips,averageBinsPerTrip:m.avgBinsPerTrip==null?null:+m.avgBinsPerTrip.toFixed(1),simulatedCost:+state.simulatedCost.toFixed(1)},incidents:state.incidents,reports:state.reports,decisionLog:state.logs,history:state.history};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AI-WasteTwin-simulation-report.json';a.click();URL.revokeObjectURL(a.href);toast('Local report exported')}
  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
  function showError(error){clearInterval(timer);state.isRunning=false;const message=error.message||String(error);const banner=$('#errorBanner');if(banner){banner.textContent=message;banner.classList.remove('hidden')}logEvent(`Action stopped: ${message}`,'alert');toast(message);renderControls()}
  function safeAction(action){try{return action()}catch(error){showError(error);return null}}

  function bind(){
    $$('[data-enter]').forEach(b=>b.addEventListener('click',()=>enterApp('dashboard')));
    $$('[data-demo]').forEach(b=>b.addEventListener('click',startDemo));
    $$('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
    $$('[data-page-link]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.pageLink)));
    $('#menuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
    bindMapNavigation();
    $('#playBtn').addEventListener('click',()=>safeAction(()=>setRunning(!state.isRunning)));$('#quickPlay').addEventListener('click',()=>safeAction(()=>setRunning(!state.isRunning)));
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
    $('#mapReset').addEventListener('click',()=>{mapZoom=1;mapCenter={x:500,y:340};$('#zoneFilter').value='all';$('#riskFilter').value='all';selectedBinId=null;renderMaps();renderDetail()});
    $('#focusCritical').addEventListener('click',()=>{$('#zoneFilter').value='all';$('#riskFilter').value='critical';renderMaps();const target=criticalBins().find(b=>b.risk==='Critical');if(target)selectBin(target.id);else toast('No bins currently meet the critical-risk thresholds')});
    $$('.incident-card[data-incident]').forEach(b=>b.addEventListener('click',()=>activateIncident(b.dataset.incident)));$$('[data-sim-incident]').forEach(b=>b.addEventListener('click',()=>activateIncident(b.dataset.simIncident)));$('#cityCrisisBtn').addEventListener('click',activateCityCrisis);
    $('#runScenario').addEventListener('click',()=>safeAction(runScenario));$$('[data-lab-preset]').forEach(b=>b.addEventListener('click',()=>safeAction(()=>applyLabPreset(b.dataset.labPreset))));$('#findFleetBtn').addEventListener('click',()=>safeAction(findRequiredFleet));
    $('#reportForm').addEventListener('submit',e=>safeAction(()=>submitCitizenReport(e)));$('#exportBtn').addEventListener('click',exportReport);
    $('#copilotBtn').addEventListener('click',()=>$('#copilotDrawer').classList.add('open'));$('#copilotClose').addEventListener('click',()=>$('#copilotDrawer').classList.remove('open'));$$('[data-copilot]').forEach(b=>b.addEventListener('click',()=>copilotAnswer(b.dataset.copilot)));
    [['wasteRange','wasteOut',v=>`+${v}%`],['roadRange','roadOut',v=>v],['truckRange','truckOut',v=>v],['failureRange','failureOut',v=>v],['capacityRange','capacityOut',v=>`${v}%`]].forEach(([a,b,f])=>$(`#${a}`).addEventListener('input',e=>$(`#${b}`).value=f(e.target.value)));
    window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if($(`#${id}.page`)&&!$('#app').classList.contains('hidden'))showPage(id)})
  }

  bind();renderAll();
  const params=new URLSearchParams(location.search),previewPage=document.body.dataset.preview||params.get('preview');if(previewPage&&$(`#${previewPage}.page`))enterApp(previewPage);if(params.get('guided')==='1')setTimeout(()=>{startDemo();if(params.get('qa')==='1'){setRunning(false);tick();setRunning(false)}},80);
})();
