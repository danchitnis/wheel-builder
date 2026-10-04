import test from 'node:test';
import { Euler, Vector3 } from 'three';
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
    const s={...setup(),profile,tool,rimDiameter:tool==='dish'?406.9:650};const a=buildAssembly(wheel,s);
    assert.deepEqual(a.errors,[]);
    for(const part of a.parts){
      assert.ok(part.size.every(x=>Number.isFinite(x)&&x>0),part.name);
      assert.ok(part.position.every(Number.isFinite),part.name);
      if(part.kind==='extrusion'){
        assert.ok((tool==='dish'?[100,300]:s.lengths).includes(part.stock!));
        assert.equal(part.size[{x:0,y:1,z:2}[part.axis!]],part.stock);
      }
    }
    const rows=billOfMaterials(a.parts);
    assert.equal(rows.reduce((n,row)=>n+row.quantity,0),a.parts.length);
    assert.equal(new Set(rows.flatMap(row=>row.ids)).size,a.parts.length);
    assert.ok(bomCsv(a).includes('Quantity'));
  }
});
test('stand stock failure never fabricates a longer extrusion',()=>{
  const a=buildAssembly(wheel,{...setup(),lengths:[100]});
  assert.ok(a.errors.some(e=>e.includes('no available stock')));
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
    assert.equal(a.parts.filter(p=>p.shape==='probe1').length,mode==='dials'?0:2);
    assert.ok(!a.parts.some(p=>p.sku.includes('post')));
    for(const p of a.parts.filter(p=>p.kind==='pla'))assert.ok(p.size.every(n=>n<=180),p.name);
  }
});
test('dial upgrade replaces pointers and includes mounting hardware',()=>{
  const pointer=buildAssembly(wheel,setup());
  const dial=buildAssembly(wheel,{...setup(),mode:'dials'});
  assert.equal(pointer.parts.filter(p=>p.sku==='probe1').length,2);
  assert.equal(dial.parts.filter(p=>p.sku==='probe1').length,0);
  assert.equal(dial.parts.filter(p=>(p.name==='M5 rear-lug mounting bolt'||p.radialMeshKey==='Lug M5x25 bolt')).length,2);
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
  assert.deepEqual(holder.size.map(n=>+n.toFixed(5)),[82,82,28]);
  assert.ok(!a.parts.some(p=>p.sku==='lateral-dials-rail-mount'));
  assert.equal(a.parts.filter(p=>p.meshKey?.includes('shank')).length,3);
  const upright=a.parts.filter(p=>p.kind==='extrusion'&&p.axis==='y').find(p=>p.position[0]>0)!;
  const bolts=a.parts.filter(p=>p.meshKey?.match(/^(Lower|Upper).*shank/));
  assert.equal(bolts.length,2);
  assert.equal(bolts[1].position[1]-bolts[0].position[1],18);
  for(const bolt of bolts)assert.equal(bolt.position[0],upright.position[0]);
  assert.equal(holder.position[2]-holder.size[2]/2,10); // flat back on 2020 front face
  assert.ok(!a.errors.some(e=>e.includes('required bolt position')));
  assert.match(holder.print!.bed,/−Z/);
});

test('exact holder fits without scaling when the rig reach falls within its slots',()=>{
  const a=buildAssembly(wheel,{...setup(),profile:'2020',mode:'dials',hubWidth:100});
  assert.ok(!a.errors.some(e=>e.includes('Exact Fusion')));
  const dial=a.parts.find(p=>p.meshKey==='Dial case and rear lug')!;
  assert.equal(dial.position[0]-dial.size[0]/2,a.wheel.offset+a.wheel.width/2);
  assert.deepEqual(a.parts.find(p=>p.meshKey==='Printable holder')!.size.map(n=>+n.toFixed(5)),[82,82,28]);
});


test('preloaded probe keeps the 20 mm sleeve and retracts the exposed pin by 5 mm',async()=>{
  const {default:meshes}=await import('../src/components/workshop/fusionHolderMeshes.json',{with:{type:'json'}});
  const xs=meshes['Dial case and rear lug'].positions.filter((_,i)=>i%3===0);
  assert.ok(Math.abs(Math.min(...xs)+74)<1e-4);
  assert.ok(xs.some(x=>Math.abs(x+59)<1e-4));
  assert.ok(xs.some(x=>Math.abs(x+39)<1e-4));
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
  assert.ok(Math.abs(caseCenter-upright.position[0]-16)<1e-8); // front-hub uprights stop at 120 mm; the slotted holder keeps the probe on the rim
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


test('pictured 90° connectors keep their dimensions and M5 hole alignment on every profile',()=>{
  for(const profile of Object.keys(profiles) as Profile[]){
    const a=buildAssembly(wheel,{...setup(),profile});
    const brackets=a.parts.filter(p=>p.shape==='angle');
    const bolts=a.parts.filter(p=>p.sku==='angle-bolt-M5'||p.sku==='base-bolt-M5');
    assert.equal(brackets.length,8);
    assert.equal(bolts.length,16);
    for(const bracket of brackets){
      assert.deepEqual(bracket.size,[50,50,18]);
      assert.equal(bracket.bore,6);
      // Transform both local hole axes into the assembled orientation, including
      // all four horizontal base rotations, then check the hardware centres.
      for(const local of [[40,4,0],[4,40,0]]){
        const point=new Vector3(...local).applyEuler(new Euler(...bracket.rotation!)).add(new Vector3(...bracket.position));
        const bolt=bolts.find(b=>point.distanceTo(new Vector3(...b.position))<1e-6);
        assert.ok(bolt,bracket.id+' has a bolt through each hole');
        assert.deepEqual(bolt.size,[5,16,5]);
      }
      if(bracket.sku.startsWith('angle-base'))assert.ok(bracket.position[1]-9>=1);
    }
    const rows=billOfMaterials(a.parts).filter(p=>p.sku.startsWith('angle-')&&p.kind==='metal');
    assert.equal(rows.reduce((n,row)=>n+row.quantity,0),8);
    assert.ok(rows.every(row=>row.dimensions==='50 × 50 × 18 mm'));
  }
});


test('50 mm connectors constrain crossbar stock and clamp narrow upright spacing',()=>{
  const a=buildAssembly(wheel,{...setup(),profile:'2020',hubWidth:100});
  assert.equal(a.hubSupport!.uprightSpacing,120);
  assert.equal(a.hubSupport!.rodRequired,true);
  assert.ok(!a.errors.some(e=>e.includes('upright brackets overlap')));
  const rail=a.parts.find(p=>p.kind==='extrusion'&&p.axis==='x')!;
  for(const b of a.parts.filter(p=>p.sku==='angle-gusset-50')){
    const end=new Vector3(50,0,0).applyEuler(new Euler(...b.rotation!)).add(new Vector3(...b.position));
    assert.ok(Math.abs(end.x)<=rail.stock!/2,'complete flange sits on the crossbar');
  }
});


test('narrow hubs automatically receive stepped spacers and a spanning rod at the bracket hard stop',()=>{
  for(const profile of Object.keys(profiles) as Profile[])for(const hubWidth of [70,100,116.9,117,135]){
    const a=buildAssembly(wheel,{...setup(),profile,hubWidth,projection:3,guideRod:false});
    const uprights=a.parts.filter(p=>p.kind==='extrusion'&&p.axis==='y');
    const span=Math.abs(uprights[1].position[0]-uprights[0].position[0]);
    assert.ok(span>=profiles[profile].size+100);
    const sleeves=a.parts.filter(p=>p.sku==='hub-support-spacer');
    const rod=a.parts.find(p=>p.sku==='hub-support-rod');
    if(a.hubSupport!.rodRequired){
      assert.ok(rod);assert.equal(sleeves.length,2);
      for(const sleeve of sleeves){
        assert.ok(Math.abs(Math.abs(sleeve.position[0])-sleeve.size[0]/2-hubWidth/2)<1e-8);
        assert.equal(sleeve.counterboreDepth,3);
        assert.ok(sleeve.counterbore!>10);
        assert.ok(sleeve.size[0]>sleeve.counterboreDepth!);
        assert.ok(rod.size[1]/2>Math.abs(sleeve.position[0])+sleeve.size[0]/2);
        assert.equal(sleeve.position[1],a.wheel.center[1]);
        assert.equal(sleeve.movesWithWheel,true);
      }
      if(profile==='2020'){
        for(const cap of a.parts.filter(p=>p.shape==='top-cap')){
          const sleeve=sleeves.find(p=>Math.sign(p.position[0])===Math.sign(cap.position[0]))!;
          assert.ok(Math.abs(sleeve.position[0]-cap.position[0])+1.5<=sleeve.size[0]/2);
          assert.ok(Math.abs(a.wheel.center[1]-cap.position[1]-26-sleeve.size[1]/Math.sqrt(2))<1e-8);
        }
      }
    }else{assert.equal(sleeves.length,0);assert.equal(rod,undefined);}
  }
});
