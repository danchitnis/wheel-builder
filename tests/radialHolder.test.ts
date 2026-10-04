import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import spec from '../src/data/radialHolder.json' with { type:'json' };
import lateralMeshes from '../src/components/workshop/fusionHolderMeshes.json' with { type:'json' };
import exported from '../src/components/workshop/fusionRadialHolderMeshes.json' with { type:'json' };
import { configurationDefaults } from '../src/utils/buildConfiguration.ts';
import { buildAssembly, workshopDefaults, workshopSnapshot, loadWorkshop } from '../src/utils/workshop.ts';
const near=(a:number,b:number,tolerance=1e-4)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const wheel=configurationDefaults();
function assembly(width=135,offset=0,projection=3,diameter=406.9){
 const config={...configurationDefaults(wheel.rp,width===100?'hope-pro5-front-100-6b':'hope-pro5-rear-135-6b'),hubOffset:offset};
 return buildAssembly(config,{...workshopDefaults(config),mode:'dials',axle:width===100?'qr9':'qr10',hubWidth:width,seatLeft:10,seatRight:10,projection,rimDiameter:diameter});
}

test('single Fusion solid is manifold, support-free in their STL orientations, and reduced in volume',()=>{
 assert.equal(exported.metadata.revision,spec.revision);
 for(const [name,value] of Object.entries(spec.parameters))near(exported.metadata.parameters[name as keyof typeof exported.metadata.parameters],value);
 let totalTriangles=0;
 for(const name of ['Radial printable bridge'] as const){
  const mesh=exported.meshes[name];assert.ok(mesh.solid);
  const native=Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(3*i,3*i+3));
  const vertices=native.map(v=>[v[0]+28,v[1]+58,v[2]]);
  const edges=new Map<string,number>();let volume=0,bedArea=0;
  for(let i=0;i<mesh.indices.length;i+=3){
   const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(j=>vertices[j]);
   const u=b.map((n,j)=>n-a[j]),v=c.map((n,j)=>n-a[j]);
   const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);
   assert.ok(len>1e-8);
   volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
   if(Math.max(a[2],b[2],c[2])<1e-5)bedArea+=len/2;
   else assert.ok(n[2]/len>=-Math.SQRT1_2-.001,`${name} unsupported face at ${a}`);
   for(let j=0;j<3;j++){
    const edge=[vertices[ids[j]].map(x=>x.toFixed(4)).join(','),vertices[ids[(j+1)%3]].map(x=>x.toFixed(4)).join(',')].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);
   }
  }
  assert.ok([...edges.values()].every(n=>n===2),'Each welded edge has two triangles');
  assert.ok(volume>0&&Math.abs(volume-mesh.volumeMm3)/mesh.volumeMm3<.002);assert.ok(bedArea>300);
  const file='radial-dial-holder';
  const stl=readFileSync(new URL(`../cad/${file}.stl`,import.meta.url));near(stl.readUInt32LE(80),mesh.indices.length/3);
  assert.equal(stl.length,84+50*mesh.indices.length/3);
  for(let i=0;i<mesh.indices.length;i++)for(let axis=0;axis<3;axis++)near(stl.readFloatLE(84+Math.floor(i/3)*50+12+(i%3)*12+axis*4),vertices[mesh.indices[i]][axis]);
  totalTriangles+=mesh.indices.length/3;
 }
 const combined=readFileSync(new URL('../cad/radial-dial-holder.stl',import.meta.url));assert.equal(combined.readUInt32LE(80),totalTriangles);
 assert.ok(exported.metadata.volumeReductionPercent>17);
 assert.equal(Object.keys(exported.meshes).filter(n=>n.startsWith('Radial printable')).length,1);
 near(spec.parameters.ear_thickness+spec.parameters.lug_thickness,13.2);
 assert.equal(Object.keys(exported.meshes).filter(n=>n.endsWith(' bolt')&&n.includes('M5x16')).length,3);
 assert.ok(exported.meshes['Lug M5x25 bolt']);assert.ok(!Object.keys(exported.meshes).some(n=>n.startsWith('Pivot ')));
});

test('each dial mounts against one thick ear without a fitted gap or shims',()=>{
 const p=spec.parameters,bridge=exported.meshes['Radial printable bridge'];
 const points=Array.from({length:bridge.positions.length/3},(_,i)=>bridge.positions.slice(3*i,3*i+3)).filter(v=>v[2]>p.foot_thickness+p.outer_root_radius+.001);
 near(Math.min(...points.map(v=>v[0])),p.dial_reference_x-p.lug_thickness/2-p.ear_thickness);
 near(Math.max(...points.map(v=>v[0])),p.dial_reference_x-p.lug_thickness/2);
 near(p.foot_thickness,8);near(p.foot_thickness,p.bridge_thickness);
 near(p.ear_thickness,8);near(p.outer_root_radius,6);near(p.inner_root_radius,3);
 const bolt=exported.meshes['Lug M5x25 bolt'];near(bolt.max[0]-bolt.min[0],25);
 assert.ok(!Object.keys(exported.meshes).some(k=>k.includes('shim')));
 assert.ok(!Object.keys(lateralMeshes).some(k=>k.includes('shim')));
 const lateral=lateralMeshes['Printable holder'];
 const ear=Array.from({length:lateral.positions.length/3},(_,i)=>lateral.positions.slice(3*i,3*i+3)).filter(v=>v[2]>16.001);
 near(Math.min(...ear.map(v=>v[1])),2.6);near(Math.max(...ear.map(v=>v[1])),10.6);
 near(lateral.max[2],28);
 near(lateralMeshes['Lug head washer'].max[0]-lateralMeshes['Lug head washer'].min[0],15,.02);
 near(exported.meshes['Lug left washer'].max[1]-exported.meshes['Lug left washer'].min[1],15,.02); // Export tessellation tolerance is 0.01 mm.
 near(p.lug_washer_diameter,15);
 const supportPlane=p.dial_reference_x-p.lug_thickness/2;
 near(exported.meshes['Lug right washer'].min[0],supportPlane+p.lug_thickness);
 near(exported.meshes['Lug left washer'].max[0],supportPlane-p.ear_thickness);
});

test('both hubs and offsets use the same slotted bridge, with normal probe contact and a single-ear M5 pivot',()=>{
 for(const width of [100,135])for(const offset of [-5,0,5])for(const projection of [3,20]){
  const a=assembly(width,offset,projection),m=a.radialMount!;
  assert.ok(!a.errors.some(e=>e.includes('radial')),a.errors.join('; '));
  near(m.uprightSpan,Math.max(120,width+projection));near(m.rightBolt+m.bridgeShift,m.uprightSpan);near(m.leftBolt+m.bridgeShift,0);near(m.dialX,Math.max(120,width+projection)/2+offset);near(m.tip[0],offset);
  const radius=a.wheel.diameter/2;near(Math.hypot(m.tip[1]-a.wheel.center[1],m.tip[2]),radius);
  [0,(a.wheel.center[1]-m.tip[1])/radius,-m.tip[2]/radius].forEach((v,i)=>near(m.direction[i],v));near(m.alignmentErrorDegrees,0);
  for(const name of ['Radial printable bridge'] as const){
   const part=a.parts.find(p=>p.radialMeshKey===name)!,mesh=exported.meshes[name];assert.deepEqual(part.size,mesh.min.map((v,i)=>mesh.max[i]-v));assert.match(part.print!.supports,/Supports OFF/);
   assert.equal(part.rotation,undefined);
  }
  const lugBolt=a.parts.find(p=>p.radialMeshKey==='Lug M5x25 bolt')!;
  near(lugBolt.position[0],offset+.9);assert.equal(lugBolt.axis,'x');
  assert.equal(a.parts.filter(p=>p.radialMeshKey?.endsWith(' bolt')).length,4);
  const bridge=a.parts.find(p=>p.radialMeshKey==='Radial printable bridge')!;
  assert.ok(bridge.position[1]+bridge.size[1]/2<m.tip[1]-40);
 }
 near(assembly(135).radialMount!.dialX-assembly(100).radialMount!.dialX,9);
 const a=assembly(100,-5),b=assembly(100,5);
 near(b.parts.find(p=>p.radialMeshKey==='Radial printable bridge')!.position[0]-a.parts.find(p=>p.radialMeshKey==='Radial printable bridge')!.position[0],10);
 near(b.parts.find(p=>p.radialMeshKey==='Left upper M5x16 bolt')!.position[0],a.parts.find(p=>p.radialMeshKey==='Left upper M5x16 bolt')!.position[0]);near(a.radialMount!.tiltDegrees,b.radialMount!.tiltDegrees);near(b.radialMount!.dialX-a.radialMount!.dialX,10);
 for(const diameter of [250,406.9,650,850]){
  const a=assembly(135,0,3,diameter);near(a.radialMount!.alignmentErrorDegrees,0);assert.ok(a.radialMount!.tiltDegrees>0&&a.radialMount!.tiltDegrees<25);
 }
});

test('out-of-range fits cannot stretch the printed meshes or conceal incorrect contact',()=>{
 const wide=assembly(200,15),m=wide.radialMount!;
 assert.ok(wide.errors.some(e=>e.includes('right fixing cannot reach')));assert.ok(wide.errors.some(e=>e.includes('cannot centre beneath')));assert.ok(wide.errors.some(e=>e.includes('±5 mm')));
 near(m.rightBolt,145);near(m.dialX,83);assert.notEqual(m.tip[0],15);
 assert.deepEqual(wide.parts.find(p=>p.radialMeshKey==='Radial printable bridge')!.size,assembly().parts.find(p=>p.radialMeshKey==='Radial printable bridge')!.size);
 assert.ok(assembly(148).errors.some(e=>e.includes('Hope front 100 mm')));
 const other=buildAssembly(wheel,{...workshopDefaults(wheel),mode:'dials',profile:'3030'});assert.ok(other.errors.some(e=>e.includes('2020 slot-6 uprights only')));
});

test('fixed dial reference, stale calibration reset, and pointer mode survive the revision',()=>{
 const saved=workshopSnapshot({...workshopDefaults(wheel),dialLugThickness:9,dialLugHole:9,dialLugOffset:12},wheel),restored=loadWorkshop(saved,wheel);
 const previous=JSON.parse(workshopSnapshot({...workshopDefaults(wheel),readings:'0,0.1,0.05'},wheel));previous.design=12;assert.equal(loadWorkshop(JSON.stringify(previous),wheel).readings,'');
 assert.deepEqual([restored.dialLugThickness,restored.dialLugHole,restored.dialLugOffset],[5.2,6.85,10.25]);
 const a=buildAssembly(wheel,workshopDefaults(wheel));assert.equal(a.radialMount,undefined);assert.equal(a.parts.filter(p=>p.shape==='probe1').length,2);
});


test('both rear-lug screws are perpendicular to the measuring pin across hub configurations',()=>{
 for(const width of [100,135])for(const offset of [-5,0,5]){
  const a=assembly(width,offset);
  const lateral=a.parts.find(p=>p.meshKey==='Lug M5x25 shank')!;
  assert.equal(lateral.axis,'y');assert.ok(lateral.size[1]>lateral.size[0]*2);
  const radial=a.parts.find(p=>p.radialMeshKey==='Lug M5x25 bolt')!;
  assert.equal(radial.axis,'x');near(radial.size[0],25);near(radial.size[1],5);near(radial.size[2],5);
  near(a.radialMount!.direction[0],0); // X-directed fixing stays normal to the tilted YZ pin.
  const lug=exported.meshes['Radial dial case and rear lug'];
  const behindCase=Array.from({length:lug.positions.length/3},(_,i)=>lug.positions.slice(i*3,i*3+3)).filter(v=>v[2]<spec.parameters.case_rear-.01);
  near(Math.max(...behindCase.map(v=>v[0]))-Math.min(...behindCase.map(v=>v[0])),5.2);
 }
});

test('lateral single ear retains a manifold flat-backed support-free print mesh',()=>{
 const m=lateralMeshes['Printable holder'],p=m.positions,edges=new Map<string,number>();let bedArea=0;
 const vertex=(i:number)=>p.slice(i*3,i*3+3);
 for(let i=0;i<m.indices.length;i+=3){
  const v=m.indices.slice(i,i+3).map(vertex),[a,b,c]=v;
  const u=b.map((n,j)=>n-a[j]),w=c.map((n,j)=>n-a[j]);
  const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n);
  assert.ok(length>1e-8);
  if(v.every(q=>Math.abs(q[2])<1e-5))bedArea+=length/2;
  else assert.ok(n[2]/length>=-Math.SQRT1_2-.001,`Unsupported lateral triangle at ${a}`);
  for(let j=0;j<3;j++){
   const key=[v[j],v[(j+1)%3]].map(q=>q.map(n=>n.toFixed(4)).join(',')).sort().join('|');edges.set(key,(edges.get(key)??0)+1);
  }
 }
 assert.ok(bedArea>300);assert.ok([...edges.values()].every(n=>n===2));
});
