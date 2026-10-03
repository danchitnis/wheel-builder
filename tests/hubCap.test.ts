import test from 'node:test';
import assert from 'node:assert/strict';
import spec from '../src/data/hubSupportCap.json' with { type: 'json' };
import exported from '../src/components/workshop/fusionHubCapMeshes.json' with { type: 'json' };
import { configurationDefaults } from '../src/utils/buildConfiguration.ts';
import { buildAssembly, workshopDefaults, billOfMaterials, bomCsv, hubCapDimensions as cap, loadWorkshop, workshopSnapshot } from '../src/utils/workshop.ts';

const wheel=configurationDefaults();
const settings={...workshopDefaults(wheel),axle:'qr10' as const,hubWidth:135,rimDiameter:650,seatLeft:10,seatRight:10,projection:3};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('Fusion export matches the shared dimensions and contains closed positive-volume solids',()=>{
  assert.equal(exported.metadata.revision,spec.revision);
  for(const [key,value] of Object.entries(spec.parameters))near(exported.metadata.parameters[key as keyof typeof exported.metadata.parameters],value);
  for(const mesh of Object.values(exported.meshes)){
    assert.equal(mesh.solid,true);
    const vertices=Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(i*3,i*3+3));
    const key=(i:number)=>vertices[i].map(x=>x.toFixed(4)).join(',');
    const edges=new Map<string,number>();
    let volume=0;
    for(let i=0;i<mesh.indices.length;i+=3){
      const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(i=>vertices[i]);
      assert.ok(ids.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length));
      volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
      for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
    }
    assert.ok([...edges.values()].every(n=>n===2),'Every welded edge must bound exactly two triangles');
    assert.ok(volume>0);
    assert.ok(Math.abs(volume-mesh.volumeMm3)/mesh.volumeMm3<.002);
  }
  near(exported.meshes.cap.min[0],-cap.outer/2);
  near(exported.meshes.cap.min[1],-cap.skirt_depth);
  near(exported.meshes.cap.max[1],cap.cradle_top);
  near(exported.meshes.cap.max[2]-exported.meshes.cap.min[2],cap.cradle_width);
  near(cap.slot_width+cap.key_interference,6.1);
  near(cap.roof_rise,(cap.profile_width+cap.socket_clearance)/2-cap.seat_ledge);
});

test('2020 pair uses the same unscaled solid, one BOM row and no cap fasteners',()=>{
  const a=buildAssembly(wheel,settings),caps=a.parts.filter(p=>p.shape==='top-cap');
  assert.deepEqual(a.errors,[]);
  assert.equal(caps.length,2);
  assert.ok(caps.every(p=>p.capDesign==='centred-v2'&&!p.movesWithWheel));
  assert.deepEqual(caps[0].size,caps[1].size);
  assert.deepEqual(caps.map(p=>p.rotation),[[0,Math.PI,0],[0,0,0]]);
  const row=billOfMaterials(a.parts).filter(r=>r.sku==='top-cap-2020-v2');
  assert.equal(row.length,1);assert.equal(row[0].quantity,2);
  assert.ok(!a.parts.some(p=>p.sku.startsWith('cap-bolt-')||p.sku.startsWith('cap-nut-')));
  const changed=buildAssembly(wheel,{...settings,fit:.9});
  assert.deepEqual(changed.parts.filter(p=>p.shape==='top-cap'),caps,'General hole allowance must not distort the cap');
  assert.match(bomCsv(a),/nominal 0.1 mm interference/);
  assert.match(row[0].spec,/coupon/);
});

test('Top V and upright centre follow the hub-end projection across the supported range',()=>{
  for(const diameter of [6,9,10,15,20,35])for(const projection of [3,20]){
    const a=buildAssembly(wheel,{...settings,seatLeft:diameter,seatRight:diameter,projection});
    assert.deepEqual(a.errors,[]);
    const upright=a.parts.find(p=>p.kind==='extrusion'&&p.axis==='y'&&p.position[0]>0)!;
    const top=upright.position[1]+upright.size[1]/2;
    near(a.wheel.center[1],top+cap.v_apex+diameter/Math.sqrt(2));
    near(upright.position[0],settings.hubWidth/2+projection/2);
    assert.ok(cap.saddle_depth<=projection);
    const tangentHeight=cap.v_apex+diameter/(2*Math.sqrt(2));
    assert.ok(tangentHeight<cap.cradle_top);
    assert.ok(cap.seatCenterHeight(diameter)-16>cap.saddle_rise);
  }
});

test('unequal and missing hub ends are provisional; larger profiles retain bolted seats',()=>{
  const a=buildAssembly(wheel,{...settings,seatRight:15});
  assert.ok(a.errors.some(e=>e.includes('equal hub-end diameters')));
  const caps=a.parts.filter(p=>p.shape==='top-cap');
  assert.deepEqual(caps[0].size,caps[1].size);
  assert.notEqual(caps[0].seatHeight,caps[1].seatHeight,'Derived cylinder bottoms expose unequal contact heights, not edited caps');
  assert.ok(buildAssembly(wheel,{...settings,seatLeft:null}).errors.some(e=>e.includes('Confirm both')));
  for(const profile of ['3030','4040'] as const){
    const legacy=buildAssembly(wheel,{...settings,profile,seatRight:15});
    assert.deepEqual(legacy.errors,[]);
    assert.ok(legacy.parts.filter(p=>p.shape==='top-cap').every(p=>!p.capDesign));
    assert.equal(legacy.parts.filter(p=>p.sku.startsWith('cap-bolt-')).length,8);
  }
});

test('previous cap revision cannot retain calibration results',()=>{
  const snapshot=JSON.parse(workshopSnapshot({...settings,readings:'0,0.1,0.05',reverseA:'0.2',reverseB:'0.1'},wheel));
  snapshot.design=7;
  const restored=loadWorkshop(JSON.stringify(snapshot),wheel);
  assert.equal(restored.readings,'');assert.equal(restored.reverseA,'');assert.equal(restored.reverseB,'');
  assert.equal(restored.seatLeft,null);
});

test('upright print has no broad unsupported roof or floating islands',()=>{
  const mesh=exported.meshes.cap, v=Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(i*3,i*3+3));
  let roofArea=0, slopedCheekArea=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3).map(k=>v[k]);
    const u=b.map((n,k)=>n-a[k]),w=c.map((n,k)=>n-a[k]);
    const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]], length=Math.hypot(...n);
    if(!length||n[1]>=-1e-6)continue;
    const angle=Math.acos(Math.min(1,-n[1]/length))*180/Math.PI;
    if(angle<44.99){
      assert.ok([a,b,c].every(p=>Math.abs(p[1]+cap.skirt_depth)<1e-4)||[a,b,c].every(p=>Math.abs(p[1])<1e-4),'Only the first layer and small rail-end seating ledge may be horizontal undersides');
      if(a[1]>-1e-4)for(const p of [a,b,c])assert.ok(Math.max(Math.abs(p[0]),Math.abs(p[2]))>=exported.metadata.parameters.roof_opening/2-1e-4,'Seating ledge cannot close the central cavity');
    } else if(angle<45.01 && a[1]>=-1e-4)roofArea+=length/2;
    else if(angle>50&&a[1]>=-1e-4)slopedCheekArea+=length/2;
  }
  assert.ok(roofArea>300,'The internal cavity must close on sloped roof faces');
  assert.ok(slopedCheekArea>100,'Wide cheeks need sloped undersides');
  assert.ok(cap.seat_ledge<=1.5);
  assert.ok((cap.cradle_width-cap.outer)/2<=cap.saddle_rise,'Outward growth stays within 45 degrees');
});


test('fin tapers equally on both sides about the upright centre plane',()=>{
  const p=exported.meshes.cap.positions;
  const vertices=Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));
  for(const height of [cap.saddle_rise,cap.cradle_top]){
    const edge=vertices.filter(v=>Math.abs(v[1]-height)<1e-5&&Math.abs(Math.abs(v[2])-cap.cradle_width/2)<1e-5);
    assert.ok(edge.length>=4);
    const half=(height===cap.saddle_rise?cap.fin_root_depth:cap.saddle_depth)/2;
    near(Math.min(...edge.map(v=>v[0])),-half);
    near(Math.max(...edge.map(v=>v[0])),half);
  }
  for(const [x,y,z] of vertices.filter(v=>v[1]>=cap.saddle_rise-1e-5)){
    const half=(cap.fin_root_depth-(cap.fin_root_depth-cap.saddle_depth)*(y-cap.saddle_rise)/(cap.cradle_top-cap.saddle_rise))/2;
    assert.ok(Math.abs(x)<=half+1e-5);
    assert.ok(vertices.some(v=>Math.abs(v[0]+x)<1e-5&&Math.abs(v[1]-y)<1e-5&&Math.abs(v[2]-z)<1e-5),'Each fin vertex has a reflected counterpart');
  }
});
