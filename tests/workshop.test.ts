import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationDefaults, serializeConfiguration, BUILD_SESSION_KEY } from '../src/utils/buildConfiguration.ts';
import { workshopDefaults, buildAssembly, profiles, stockLength, parseStock, billOfMaterials, bomCsv, inferAxle, loadWorkshop, workshopSnapshot, resolveWorkshopWheel, repeatability, reversal, dishOffset, type Profile } from '../src/utils/workshop.ts';
const wheel=configurationDefaults();
function setup(){return {...workshopDefaults(wheel),profile:'3030' as const,axle:'qr10' as const,hubWidth:135,rimDiameter:650,seatLeft:10,seatRight:10,projection:5};}

test('stock selection uses full available members, sorted, and fails explicitly',()=>{
  assert.equal(stockLength(401,[600,300,500,400]),500);
  assert.equal(stockLength(500,[500,600]),500);
  assert.equal(stockLength(1001,[300,1000]),null);
  assert.deepEqual(parseStock('600, 300, 400, 300'),[300,400,600]);
  for(const invalid of ['', '300, abc','0, 500','300.5','300, Infinity','-400','2100'])assert.equal(parseStock(invalid),null);
});
test('axle inference does not mistake nominal spacing or multi-standard hub for interface',()=>{
  assert.deepEqual(inferAxle('12x148mm Boost'),{axle:'12',hubWidth:148});
  assert.deepEqual(inferAxle('135mm'),{axle:'',hubWidth:135});
  assert.deepEqual(inferAxle('12x142mm / 135mm'),{axle:'',hubWidth:null});
  assert.equal(buildAssembly(wheel,{...setup(),axle:''}).errors.some(e=>e.includes('axle interface')),true);
});
test('all profiles and both tools use exact stock and BOM quantities equal model instances',()=>{
  for(const profile of Object.keys(profiles) as Profile[])for(const tool of ['stand','dish'] as const){
    const s={...setup(),profile,tool};const a=buildAssembly(wheel,s);
    assert.deepEqual(a.errors,[]);
    for(const part of a.parts){
      assert.ok(part.size.every(x=>Number.isFinite(x)&&x>0),part.name);
      assert.ok(part.position.every(Number.isFinite),part.name);
      if(part.kind==='extrusion'){
        assert.ok(s.lengths.includes(part.stock!));
        assert.equal(part.size[{x:0,y:1,z:2}[part.axis!]],part.stock);
      }
    }
    const rows=billOfMaterials(a.parts);
    assert.equal(rows.reduce((n,row)=>n+row.quantity,0),a.parts.length);
    assert.equal(new Set(rows.flatMap(row=>row.ids)).size,a.parts.length);
    assert.ok(bomCsv(a).includes('Quantity'));
  }
});
test('stock failure never fabricates a longer extrusion',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish',lengths:[300,400]});
  assert.ok(a.errors.some(e=>e.includes('Dishing bridge needs')));
  assert.equal(a.parts.some(p=>p.kind==='extrusion'),false);
  assert.ok(bomCsv(a).includes('UNRESOLVED'));
});
test('stand uses two feet and one cross rail, with fixed matched top datums',()=>{
  for(const profile of Object.keys(profiles) as Profile[])for(const D of [300,650,850]){
    const a=buildAssembly(wheel,{...setup(),profile,rimDiameter:D});
    assert.deepEqual(a.errors,[]);
    const rails=a.parts.filter(p=>p.kind==='extrusion');
    assert.equal(rails.length,5); // two feet, one cross rail, two uprights
    assert.equal(rails.filter(p=>p.axis==='z').length,2);
    assert.equal(rails.filter(p=>p.axis==='x').length,1);
    assert.equal(a.parts.some(p=>p.sku==='probe-platform'||p.sku==='probe-tower'),false);
    const uprights=rails.filter(p=>p.axis==='y');
    assert.equal(uprights[0].stock,uprights[1].stock);
    const top=uprights[0].position[1]+uprights[0].size[1]/2;
    const caps=a.parts.filter(p=>p.shape==='top-cap');
    assert.equal(caps.length,2);caps.forEach(p=>assert.equal(p.position[1],top));
    const seats=caps;
    assert.equal(seats.length,2);
    seats.forEach(p=>assert.equal(p.position[1]+p.seatHeight!+a.wheel.axleDiameter/2,a.wheel.center[1]));
    assert.ok(seats.every(p=>p.spec.includes('upward-open')));
    assert.equal(a.parts.some(p=>p.sku==='axle-strap'||p.sku==='endcap-spacer'),false);
    assert.equal(a.parts.filter(p=>p.sku==='qr-skewer').length,0);
  }
});
test('coplanar H base butts the crossbar against both feet without overlap',()=>{
  for(const profile of Object.keys(profiles) as Profile[]){
    const P=profiles[profile].size,a=buildAssembly(wheel,{...setup(),profile});
    const rails=a.parts.filter(p=>p.kind==='extrusion');
    const cross=rails.find(p=>p.axis==='x')!;
    const feet=rails.filter(p=>p.axis==='z');
    for(const rail of [cross,...feet])assert.equal(rail.position[1]-P/2,0);
    for(const foot of feet)assert.equal(Math.abs(foot.position[0])-P/2,cross.stock!/2);
    for(const upright of rails.filter(p=>p.axis==='y'))assert.equal(upright.position[1]-upright.stock!/2,P);
    assert.equal(a.parts.filter(p=>p.sku.startsWith('angle-base')).length,4);
    assert.ok(a.parts.filter(p=>p.sku.startsWith('base-bolt')).every(p=>p.position[1]===P/2&&p.axis!=='y'));
  }
});
test('dial bodies face the operator and clear the cross rail and uprights',()=>{
  for(const profile of Object.keys(profiles) as Profile[])for(const D of [300,650,850]){
    const a=buildAssembly(wheel,{...setup(),profile,rimDiameter:D,mode:'dials'});
    const P=profiles[profile].size;
    const dials=a.parts.filter(p=>p.measurementAxis!==undefined && p.kind==='gauge');assert.equal(dials.length,2);
    for(const dial of dials){
      assert.equal(dial.axis,'z');
      assert.ok(dial.position[1]-27.5>2*P,'dial body must clear the cross rail');
    }
    const lateral=dials.find(p=>p.measurementAxis==='x')!;
    assert.ok(lateral.position[2]-11>P/2,'lateral body is ahead of upright');
    const radial=dials.find(p=>p.measurementAxis==='y')!;
    const uprights=a.parts.filter(p=>p.kind==='extrusion'&&p.axis==='y');
    assert.ok(uprights.every(p=>Math.abs(radial.position[0]-p.position[0])>27+P/2),'radial case sits between uprights');
    if(profile!=='2020')assert.ok(a.errors.some(e=>e.includes('2020 slot-6 uprights only')));
  }
});
test('cradles stay fixed and loose guide is optional, with no custom metal adaptors',()=>{
  const a=buildAssembly(wheel,{...setup(),axle:'12',guideRod:true});
  assert.equal(a.parts.find(p=>p.sku==='loose-guide-rod')?.movesWithWheel,true);
  assert.ok(a.parts.filter(p=>p.shape==='top-cap').every(p=>!p.movesWithWheel));
  assert.ok(!buildAssembly(wheel,setup()).parts.some(p=>p.sku==='loose-guide-rod'));
  assert.ok(!a.parts.some(p=>/collar|dropout|skewer/.test(p.sku)));
});
test('short measurement brackets attach directly to upright slots and fit the printer',()=>{
  for(const profile of Object.keys(profiles) as Profile[])for(const mode of ['pointers','dials'] as const){
    const a=buildAssembly(wheel,{...setup(),profile,mode,lengths:[1000]});
    assert.equal(a.parts.filter(p=>p.shape==='rail-mount').length,mode==='dials'?0:2);
    assert.ok(!a.parts.some(p=>p.sku.includes('post')));
    for(const p of a.parts.filter(p=>p.kind==='pla'))assert.ok(p.size.every(n=>n<=180),p.name);
  }
});
test('dish feet share reach and span and bridge remains clear of hub',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish'});
  const feet=a.parts.filter(p=>p.sku==='dish-foot');
  assert.equal(feet.length,2);assert.deepEqual(feet[0].size,feet[1].size);
  assert.ok(Math.abs(feet[1].position[1]-feet[0].position[1])<a.wheel.diameter-a.wheel.depth);
  for(const rod of a.parts.filter(p=>p.sku==='foot-datum'||p.sku==='dish-probe'))assert.ok(rod.position[2]-3>15,'rods clear the bridge side');
  const bridge=a.parts.find(p=>p.kind==='extrusion')!;
  assert.equal(bridge.position[0]-bridge.size[0]/2,a.wheel.width/2+a.probe!.stopReach);
  assert.equal(a.probe!.stopReach%20,0);
  assert.equal(a.parts.filter(p=>p.sku==='foot-datum').length,0);
});
test('dial upgrade replaces pointers and includes mounting hardware',()=>{
  const pointer=buildAssembly(wheel,setup());
  const dial=buildAssembly(wheel,{...setup(),mode:'dials'});
  assert.equal(pointer.parts.filter(p=>p.sku==='pointer-tip').length,2);
  assert.equal(dial.parts.filter(p=>p.sku==='pointer-tip').length,0);
  assert.equal(dial.parts.filter(p=>(p.name==='M5 rear-lug mounting bolt'||p.radialMeshKey==='Lug M5x16 bolt')).length,2);
  assert.ok(pointer.parts.filter(p=>p.shape==='rail-mount').every(p=>p.sku.includes('pointers')));
  assert.ok(dial.parts.filter(p=>p.shape==='rail-mount').every(p=>p.sku.includes('dials')));
  assert.equal(dial.parts.filter(p=>p.measurementAxis!==undefined && p.kind==='gauge').length,2);
});
test('rim override and invalid dimensions are explicit; frame offsets are not silently centred',()=>{
  const estimated=buildAssembly(wheel,{...setup(),rimDiameter:null});assert.equal(estimated.estimated,true);
  assert.equal(estimated.wheel.diameter,wheel.erd!+2*wheel.rimDepth!);
  assert.equal(buildAssembly(wheel,setup()).estimated,false);
  const offset=buildAssembly({...wheel,hubOffset:5},setup());assert.equal(offset.wheel.offset,5);assert.ok(offset.notes.some(s=>s.includes('frame offset')));
  assert.ok(buildAssembly({...wheel,hubOffset:30},setup()).errors.some(s=>s.includes('offset exceeds')));
  assert.ok(buildAssembly(wheel,{...setup(),hubWidth:null}).errors.length);
  assert.ok(buildAssembly(wheel,{...setup(),rimDiameter:NaN,fit:NaN}).errors.length>=2);
});
test('wheel transfer wins over storage and return snapshot preserves custom edits',()=>{
  const custom={...wheel,rp:'custom',erd:611,rimWidthOuter:29};
  const storage=()=>({getItem:()=>serializeConfiguration(wheel,false),setItem:()=>{}});
  const imported=resolveWorkshopWheel('#'+serializeConfiguration(custom,false),storage);
  assert.equal(imported.config.erd,611);assert.equal(imported.imported,true);
  assert.equal(resolveWorkshopWheel('',storage).source,'Saved wheel from this tab');
  const empty=()=>({getItem:()=>null,setItem:()=>{}});
  assert.match(resolveWorkshopWheel('',empty).source,/Default wheel/);
  const denied=()=>{throw new Error('denied');};assert.match(resolveWorkshopWheel('',denied).source,/Default wheel/);
  assert.ok(resolveWorkshopWheel('#v=99',storage).error);
  assert.equal(BUILD_SESSION_KEY,'wheel-builder:build:v2');
});
test('workshop persistence validates settings and invalidates wheel-specific overrides',()=>{
  const s={...setup(),profile:'4040' as const,readings:'0, .1, .05'};
  const raw=workshopSnapshot(s,wheel);
  assert.deepEqual(loadWorkshop(raw,wheel),s);
  assert.deepEqual(loadWorkshop('{oops',wheel),workshopDefaults(wheel));
  const changed=loadWorkshop(raw,{...wheel,erd:600});
  assert.equal(changed.profile,'4040');assert.equal(changed.rimDiameter,null);assert.equal(changed.readings,'');
  const bad=JSON.stringify({version:1,wheel:serializeConfiguration(wheel,false),settings:{profile:'__proto__',lengths:[-1],fit:99,axle:'unknown',readings:3}});
  const restored=loadWorkshop(bad,wheel);assert.equal(restored.profile,'2020');assert.equal(restored.fit,.3);assert.equal(restored.axle,'');
});
test('calibration calculations preserve signed reversal and central-gap conventions',()=>{
  assert.equal(repeatability('0, 0.1'),null);assert.equal(repeatability('0, NaN, 0.1'),null);
  assert.equal(repeatability('0, 0.2, 0.1')!.passes,true);
  assert.equal(repeatability('0, 0.201, 0.1')!.passes,false);
  assert.deepEqual(reversal(.7,.3),{jigBias:.5,wheelOffset:.19999999999999998});
  assert.equal(dishOffset(.4),.2);
});

test('unmeasured seats and incompatible dial lug dimensions remain provisional',()=>{
  assert.ok(buildAssembly(wheel,{...setup(),seatLeft:null}).errors.some(e=>e.includes('hub-end')));
  assert.ok(buildAssembly(wheel,{...setup(),mode:'dials',dialLugHole:4}).errors.some(e=>e.includes('rear lug')));
  const a=buildAssembly(wheel,{...setup(),seatLeft:9,seatRight:15});
  for(const cap of a.parts.filter(p=>p.shape==='top-cap')){
    const d=cap.sku.endsWith('left')?9:15;
    assert.equal(cap.position[1]+cap.seatHeight!+d/2,a.wheel.center[1]);
  }
});

test('every printed fixture has orientation, support and accuracy guidance',()=>{
  for(const tool of ['stand','dish'] as const)for(const mode of ['pointers','dials'] as const){
    const a=buildAssembly(wheel,{...setup(),tool,mode});
    assert.ok(a.parts.filter(p=>p.kind==='pla').every(p=>p.print?.bed&&p.print.supports&&p.print.accuracy));
    assert.ok(bomCsv(a).includes('PRINT:'));
  }
});
test('central carriage supports the only adjustment screw, with two fixed rim stops',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish'});
  const plates=a.parts.filter(p=>p.sku==='dish-center');assert.equal(plates.length,1);
  for(const plate of plates){
    assert.equal(plate.holes?.length,3);
    const screw=a.parts.find(p=>(p.sku==='foot-datum'||p.sku==='dish-probe')&&p.position[1]===plate.position[1])!;
    assert.equal(plate.position[2]-plate.holes![2].x,screw.position[2]);
    assert.ok(screw.position[0]-screw.size[1]/2<plate.position[0]-4);
    assert.ok(screw.position[0]+screw.size[1]/2>plate.position[0]+4);
  }
  const fork=a.parts.find(p=>p.shape==='fork')!;assert.equal(fork.position[0]-fork.size[0]/2,a.wheel.hubWidth/2);
});

test('angled dish layout removes rim adjustment screws and selects shorter full stock',()=>{
  for(const profile of Object.keys(profiles) as Profile[]){
    const straight=buildAssembly(wheel,{...setup(),profile,tool:'dish'});
    const angled=buildAssembly(wheel,{...setup(),profile,tool:'dish',dishLayout:'angled'});
    assert.deepEqual(angled.errors,[]);
    assert.equal(angled.parts.filter(p=>p.sku==='foot-datum').length,0);
    assert.equal(angled.parts.filter(p=>p.sku==='dish-probe').length,1);
    const feet=angled.parts.filter(p=>p.shape==='contact-cap');assert.equal(feet.length,2);
    assert.deepEqual(feet[0].size,feet[1].size);
    for(const foot of feet)assert.ok(Math.abs(foot.position[0]-foot.size[0]/2-angled.wheel.width/2-angled.wheel.offset)<1e-9);
    const arms=angled.parts.filter(p=>p.kind==='extrusion'&&p.rotation);
    assert.equal(arms.length,2);assert.equal(arms[0].stock,arms[1].stock);
    assert.equal(arms[0].size[1],arms[0].stock);
    assert.ok(!angled.parts.some(p=>p.shape==='angle-foot'));
    assert.ok(angled.parts.find(p=>p.kind==='extrusion')!.stock!<straight.parts.find(p=>p.kind==='extrusion')!.stock!);
  }
});
test('angled layout persistence, stock failure and central overlap are explicit',()=>{
  const s={...setup(),tool:'dish' as const,dishLayout:'angled' as const};
  assert.equal(loadWorkshop(workshopSnapshot(s,wheel),wheel).dishLayout,'angled');
  assert.ok(buildAssembly(wheel,{...s,lengths:[100]}).errors.some(e=>e.includes('No available stock')));
  assert.ok(buildAssembly(wheel,{...s,rimDiameter:250,hubWidth:200}).errors.some(e=>e.includes('No available stock')));
});

test('pictured angled brackets join two rails using M5 on both legs',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout:'angled',profile:'4040'});
  assert.equal(a.parts.filter(p=>p.shape==='photo-bracket').length,2);
  assert.ok(a.parts.some(p=>p.name==='M5 × 16 rail-joint bolt'));
  assert.equal(a.parts.filter(p=>p.name==='M5 × 16 rail-joint bolt').length,4);
  assert.ok(a.parts.filter(p=>p.shape==='photo-bracket').every(p=>p.spec.includes('Ø5.5')));
});

test('small wheels accept 200 or 300 stock with sliding contacts and uncut overhang',()=>{
  for(const length of [200,300]){
    const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout:'angled',rimDiameter:406.9,lengths:[length]});
    assert.deepEqual(a.errors,[]);
    const rails=a.parts.filter(p=>p.kind==='extrusion');assert.equal(rails.length,3);
    assert.ok(rails.every(p=>p.stock===length));
    assert.equal(a.parts.filter(p=>p.shape==='contact-cap').length,2);
    for(const stop of a.parts.filter(p=>p.shape==='contact-cap'))assert.match(stop.spec,/continues beyond/);
  }
});

test('one reusable straight stop pair accepts ordinary hub and rim variation through probe travel',()=>{
  for(const hubWidth of [130,135])for(const width of [25,28,32]){
    const a=buildAssembly({...wheel,rimWidthOuter:width},{...setup(),hubWidth,tool:'dish',dishStopReach:80,dishAllowance:5});
    assert.deepEqual(a.errors,[]);
    assert.equal(a.parts.find(p=>p.sku==='dish-foot')!.size[0],80);
    assert.ok(a.probe!.inward>=5);assert.ok(a.probe!.outward>=5);
    assert.equal(a.parts.filter(p=>p.sku==='dish-probe').length,1);
  }
});
test('insufficient probe retraction is reported without changing a selected stop pair',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish',dishStopReach:60});
  assert.ok(a.errors.some(e=>e.includes('Central probe lacks')));
  assert.equal(a.parts.find(p=>p.sku==='dish-foot')!.size[0],60);
});
test('both dish layouts budget real rod travel and export it',()=>{
  for(const dishLayout of ['straight','angled'] as const){
    const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout,dishAllowance:8});
    assert.deepEqual(a.errors,[]);
    const r=a.probe!;assert.ok(r.nominal-8>=r.min);assert.ok(r.nominal+8<=r.max);
    assert.equal(a.parts.find(p=>p.sku==='dish-probe')!.size[1],r.rodLength);
    assert.ok(bomCsv(a).includes('Probe reach'));
  }
  const s={...setup(),dishStopReach:80,dishAllowance:7};assert.deepEqual(loadWorkshop(workshopSnapshot(s,wheel),wheel),s);
});

test('angled stock search compares complete combinations and uses shorter arms on equal totals',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout:'angled',rimDiameter:406.9,lengths:[100,150,200,300,400]});
  assert.deepEqual(a.errors,[]);
  assert.equal(a.parts.find(p=>p.kind==='extrusion'&&!p.rotation)!.stock,300);
  assert.ok(a.parts.filter(p=>p.kind==='extrusion'&&p.rotation).every(p=>p.stock===100));
  assert.ok(a.notes.some(n=>n.includes('500 mm total')));
});
test('short-only lists never retain or fabricate a 200 mm bridge',()=>{
  for(const lengths of [[100],[150],[100,150]]){
    const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout:'angled',rimDiameter:406.9,lengths});
    assert.ok(a.errors.some(e=>e.includes('194 mm')));
    assert.equal(a.parts.filter(p=>p.kind==='extrusion').length,0);
  }
  const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout:'angled',rimDiameter:406.9,lengths:[150,200,300]});
  assert.equal(a.parts.find(p=>p.kind==='extrusion'&&!p.rotation)!.stock,300);
  assert.ok(a.parts.filter(p=>p.kind==='extrusion'&&p.rotation).every(p=>p.stock===150));
});

test('short arms use positive end caps when joint placement permits',()=>{
  const a=buildAssembly(wheel,{...setup(),tool:'dish',dishLayout:'angled',rimDiameter:406.9,lengths:[100,200,300,400]});
  assert.deepEqual(a.errors,[]);
  const caps=a.parts.filter(p=>p.shape==='contact-cap');assert.equal(caps.length,2);
  assert.ok(caps.every(p=>p.endLocated));
  for(const cap of caps){
    const sign=cap.angleSign!;
    const arm=a.parts.find(p=>p.kind==='extrusion'&&p.rotation&&Math.sign(p.position[1]-a.wheel.center[1])===sign)!;
    assert.ok(Math.abs(arm.position[1]+sign*arm.stock!/Math.sqrt(2)/2-cap.position[1])<1e-8);
  }
});

test('new workshop builds default to the user’s 2020 extrusion',()=>{
  assert.equal(workshopDefaults(wheel).profile,'2020');
  const a=buildAssembly(wheel,{...setup(),profile:'2020'});
  assert.ok(a.parts.filter(p=>p.kind==='extrusion').every(p=>Math.min(...p.size)===20));
  assert.ok(a.notes.some(n=>n.includes('Coplanar H base')));
});


test('lateral dial uses the redesigned Fusion holder and exactly three M5 bolts',()=>{
  const a=buildAssembly(wheel,{...setup(),profile:'2020',mode:'dials'});
  const holder=a.parts.find(p=>p.sku==='lateral-dial-bracket')!;
  assert.equal(holder.meshKey,'Printable holder');
  assert.deepEqual(holder.size.map(n=>+n.toFixed(5)),[82,82,27]);
  assert.ok(!a.parts.some(p=>p.sku==='lateral-dials-rail-mount'));
  assert.equal(a.parts.filter(p=>p.meshKey?.includes('shank')).length,3);
  const upright=a.parts.filter(p=>p.kind==='extrusion'&&p.axis==='y').find(p=>p.position[0]>0)!;
  const bolts=a.parts.filter(p=>p.meshKey?.match(/^(Lower|Upper).*shank/));
  assert.equal(bolts.length,2);
  assert.equal(bolts[1].position[1]-bolts[0].position[1],18);
  for(const bolt of bolts)assert.equal(bolt.position[0],upright.position[0]);
  assert.equal(holder.position[2]-13.5,10); // flat back on 2020 front face
  assert.ok(!a.errors.some(e=>e.includes('required bolt position')));
  assert.match(holder.print!.bed,/−Z/);
});

test('exact holder fits without scaling when the rig reach falls within its slots',()=>{
  const a=buildAssembly(wheel,{...setup(),profile:'2020',mode:'dials',hubWidth:100});
  assert.ok(!a.errors.some(e=>e.includes('Exact Fusion')));
  const dial=a.parts.find(p=>p.meshKey==='Dial case and rear lug')!;
  assert.equal(dial.position[0]-dial.size[0]/2,a.wheel.offset+a.wheel.width/2);
  assert.deepEqual(a.parts.find(p=>p.meshKey==='Printable holder')!.size.map(n=>+n.toFixed(5)),[82,82,27]);
});


test('preloaded probe keeps the 20 mm sleeve and retracts the exposed pin by 5 mm',async()=>{
  const {default:meshes}=await import('../src/components/workshop/fusionHolderMeshes.json',{with:{type:'json'}});
  const xs=meshes['Dial case and rear lug'].positions.filter((_,i)=>i%3===0);
  assert.equal(Math.min(...xs),-74);
  assert.ok(xs.includes(-59));
  assert.ok(xs.includes(-39));
  const a=buildAssembly(wheel,{...setup(),profile:'2020',mode:'dials',hubWidth:100});
  assert.ok(!a.errors.some(e=>e.includes('overruns the rim sidewall')));
});


test('upper mounting bolts clear the lower dial and probe touches front-wheel rim',()=>{
  const a=buildAssembly({...wheel,rimWidthOuter:28},{...setup(),profile:'2020',mode:'dials',hubWidth:100,projection:3,rimDiameter:406.9});
  const dial=a.parts.find(p=>p.meshKey==='Dial case and rear lug')!;
  const lower=a.parts.find(p=>p.meshKey==='Lower M5 washer')!;
  const upper=a.parts.find(p=>p.meshKey==='Upper M5 washer')!;
  const upright=a.parts.find(p=>p.kind==='extrusion'&&p.axis==='y'&&p.position[0]>0)!;
  const caseCenter=dial.position[0]+17.5; // preloaded envelope centre -29.5, case centre -12
  assert.ok(Math.abs(caseCenter-upright.position[0]-24.5)<1e-8); // centred saddle places the upright beneath the 3 mm hub projection
  assert.equal(dial.position[0]-dial.size[0]/2,14);
  assert.equal(lower.position[1]-5-(dial.position[1]+27),11);
  assert.equal(upper.position[1]-lower.position[1],18);
  assert.ok(a.parts.find(p=>p.meshKey==='Printable holder')!.position[1]>dial.position[1]);
});


test('symmetric holder accommodates front and rear hubs at mid-travel preload',async()=>{
  const {default:meshes}=await import('../src/components/workshop/fusionHolderMeshes.json',{with:{type:'json'}});
  const h=meshes['Printable holder'];
  assert.ok(Math.abs((h.min[0]+h.max[0])/2+12)<1e-8);
  for(const hubWidth of [100,135]){
    const a=buildAssembly({...wheel,rimWidthOuter:28},{...setup(),profile:'2020',mode:'dials',hubWidth,projection:3,rimDiameter:406.9});
    const dial=a.parts.find(p=>p.meshKey==='Dial case and rear lug')!;
    const holder=a.parts.find(p=>p.meshKey==='Printable holder')!;
    const bolt=a.parts.find(p=>p.meshKey==='Lower M5 washer')!;
    const upright=a.parts.find(p=>p.kind==='extrusion'&&p.axis==='y'&&p.position[0]>0)!;
    assert.equal(dial.position[0]-dial.size[0]/2,14);
    assert.ok(Math.abs(holder.position[0]-(dial.position[0]+17.5))<1e-8);
    assert.equal(bolt.position[0],upright.position[0]);
    const localBolt=bolt.position[0]-(holder.position[0]+12);
    assert.ok(localBolt>=-42+5&&localBolt<=18-5);
    assert.ok(!a.errors.some(e=>e.includes('Exact Fusion')));
  }
});
