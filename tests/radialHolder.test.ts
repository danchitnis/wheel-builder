import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import spec from '../src/data/radialHolder.json' with { type:'json' };
import exported from '../src/components/workshop/fusionRadialHolderMeshes.json' with { type:'json' };
import { configurationDefaults } from '../src/utils/buildConfiguration.ts';
import { buildAssembly, workshopDefaults, workshopSnapshot, loadWorkshop } from '../src/utils/workshop.ts';
const near=(a:number,b:number,tolerance=1e-4)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const wheel=configurationDefaults();
function assembly(width=135,offset=0,projection=3,diameter=406.9){
 const config={...configurationDefaults(wheel.rp,width===100?'hope-pro5-front-100-6b':'hope-pro5-rear-135-6b'),hubOffset:offset};
 return buildAssembly(config,{...workshopDefaults(config),mode:'dials',axle:width===100?'qr9':'qr10',hubWidth:width,seatLeft:10,seatRight:10,projection,rimDiameter:diameter});
}

test('two Fusion solids are manifold, support-free in their STL orientations, and reduced in volume',()=>{
 assert.equal(exported.metadata.revision,spec.revision);
 for(const [name,value] of Object.entries(spec.parameters))near(exported.metadata.parameters[name as keyof typeof exported.metadata.parameters],value);
 let totalTriangles=0;
 for(const name of ['Radial printable bridge','Radial printable C-holder'] as const){
  const mesh=exported.meshes[name];assert.ok(mesh.solid);
  const native=Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(3*i,3*i+3));
  const vertices=native.map(v=>name==='Radial printable bridge'?[v[0]+28,v[1]+78,v[2]]:[mesh.max[2]-v[2],v[1]-mesh.min[1],v[0]-mesh.min[0]]);
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
  const file=name==='Radial printable bridge'?'radial-bridge':'radial-c-holder';
  const stl=readFileSync(new URL(`../cad/${file}.stl`,import.meta.url));near(stl.readUInt32LE(80),mesh.indices.length/3);
  assert.equal(stl.length,84+50*mesh.indices.length/3);
  for(let i=0;i<mesh.indices.length;i++)for(let axis=0;axis<3;axis++)near(stl.readFloatLE(84+Math.floor(i/3)*50+12+(i%3)*12+axis*4),vertices[mesh.indices[i]][axis]);
  totalTriangles+=mesh.indices.length/3;
 }
 const combined=readFileSync(new URL('../cad/radial-dial-holder.stl',import.meta.url));assert.equal(combined.readUInt32LE(80),totalTriangles);
 assert.ok(exported.metadata.volumeReductionPercent>17);
 near(3*spec.parameters.pivot_tab_thickness+2*spec.parameters.pivot_gap,12.4);near(spec.parameters.lug_mount_thickness+spec.parameters.lug_thickness,8);
 assert.equal(Object.keys(exported.meshes).filter(n=>n.endsWith(' bolt')&&n.includes('M5x16')).length,4);assert.ok(exported.meshes['Pivot M5x25 bolt']);
});

test('both fork cheeks enclose the arm and the longer pivot bolt spans their clamp stack',()=>{
 const p=spec.parameters,bridge=exported.meshes['Radial printable bridge'];
 const bearingAreas=[0,0],planes=[p.pivot_moving_x-p.pivot_gap,p.pivot_moving_x+p.pivot_tab_thickness+p.pivot_gap];
 for(let i=0;i<bridge.indices.length;i+=3){
  const [a,b,c]=bridge.indices.slice(i,i+3).map(j=>bridge.positions.slice(j*3,j*3+3));
  for(let k=0;k<2;k++)if([a,b,c].every(v=>Math.abs(v[0]-planes[k])<1e-4))bearingAreas[k]+=Math.abs((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]))/2;
 }
 assert.ok(bearingAreas.every(a=>a>200),'Both inner cheek faces provide broad clamping surfaces');
 near(planes[1]-planes[0],4.4);
 const foot=Array.from({length:bridge.positions.length/3},(_,i)=>bridge.positions.slice(i*3,i*3+3)).filter(v=>Math.abs(v[1]+14)<1e-4&&Math.abs(v[2])<1e-4);
 near(p.pivot_fixed_x-Math.min(...foot.map(v=>v[0])),6);
 near(Math.max(...foot.map(v=>v[0]))-(p.pivot_moving_x+2*p.pivot_tab_thickness+p.pivot_gap),6);
 near(p.pivot_root_radius,4);
 const bolt=exported.meshes['Pivot M5x25 bolt'];near(bolt.max[0]-bolt.min[0],25);
 assert.ok(bolt.min[0]<planes[0]-4&&bolt.max[0]>planes[1]+4);
});

test('both hubs and offsets use the same slotted bridge, with normal probe contact and a double-sided M5 pivot',()=>{
 for(const width of [100,135])for(const offset of [-5,0,5])for(const projection of [3,20]){
  const a=assembly(width,offset,projection),m=a.radialMount!;
  assert.ok(!a.errors.some(e=>e.includes('radial')),a.errors.join('; '));
  near(m.uprightSpan,width+projection);near(m.rightBolt+m.bridgeShift,m.uprightSpan);near(m.leftBolt+m.bridgeShift,0);near(m.dialX,(width+projection)/2+offset);near(m.tip[0],offset);
  const radius=a.wheel.diameter/2;near(Math.hypot(m.tip[1]-a.wheel.center[1],m.tip[2]),radius);
  [0,(a.wheel.center[1]-m.tip[1])/radius,-m.tip[2]/radius].forEach((v,i)=>near(m.direction[i],v));near(m.alignmentErrorDegrees,0);
  for(const name of ['Radial printable bridge','Radial printable C-holder'] as const){
   const part=a.parts.find(p=>p.radialMeshKey===name)!,mesh=exported.meshes[name];assert.deepEqual(part.size,mesh.min.map((v,i)=>mesh.max[i]-v));assert.match(part.print!.supports,/Supports OFF/);
   if(name.endsWith('bridge'))assert.equal(part.rotation,undefined);else near(part.rotation![0],-m.tiltDegrees*Math.PI/180);
  }
  for(const key of ['Lug M5x16 bolt'] as const)near(a.parts.find(p=>p.radialMeshKey===key)!.position[0],offset);
  assert.equal(a.parts.filter(p=>p.radialMeshKey?.endsWith(' bolt')).length,5);
  const bridge=a.parts.find(p=>p.radialMeshKey==='Radial printable bridge')!;
  assert.ok(bridge.position[1]+bridge.size[1]/2<m.tip[1]-40);
 }
 near(assembly(135).radialMount!.dialX-assembly(100).radialMount!.dialX,17.5);
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
 const a=buildAssembly(wheel,workshopDefaults(wheel));assert.equal(a.radialMount,undefined);assert.equal(a.parts.filter(p=>p.shape==='rail-mount').length,2);
});
