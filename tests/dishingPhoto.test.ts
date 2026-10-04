import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationDefaults} from '../src/utils/buildConfiguration.ts';
import {buildAssembly,workshopDefaults,workshopSnapshot,loadWorkshop,billOfMaterials} from '../src/utils/workshop.ts';
const wheel=configurationDefaults();
const settings={...workshopDefaults(wheel),tool:'dish' as const,axle:'qr10' as const,hubWidth:135,rimDiameter:406.9};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('photo assembly always uses 300 + 100 + 100 mm rails and four 135 degree bends',()=>{
  for(const lengths of [[100],[300,400,500],[]]){
    const a=buildAssembly(wheel,{...settings,lengths});assert.deepEqual(a.errors,[]);
    const rails=a.parts.filter(p=>p.kind==='extrusion');assert.equal(rails.length,3);
    assert.deepEqual(rails.map(p=>p.stock).sort((a,b)=>a!-b!),[100,100,300]);
    assert.equal(rails.filter(p=>p.rotation).length,2);
    const bends=a.parts.filter(p=>p.shape==='photo-bracket');assert.equal(bends.length,4);
    for(const b of bends){const [u,v]=b.bendLegs!;near(u[0]*v[0]+u[1]*v[1],-Math.SQRT1_2);assert.match(b.spec,/Ø5.5/);}
    assert.equal(a.parts.filter(p=>p.sku==='dish-bracket-m5').length,6);
    assert.equal(a.parts.filter(p=>p.sku.startsWith('dish-bracket-tnut')).length,6);
    assert.equal(a.parts.filter(p=>p.sku==='probe1-m4-bolt').length,1);
    assert.deepEqual(a.parts.filter(p=>p.kind==='pla').map(p=>p.sku),['probe1']);
    assert.equal(billOfMaterials(rails).find(r=>r.sku.endsWith('-100'))!.quantity,2);
  }
});

test('mirrored metal feet touch the same rim plane with equal reach',()=>{
  const a=buildAssembly(wheel,settings),d=a.dishing!,feet=a.parts.filter(p=>p.sku==='dish-foot');
  assert.equal(feet.length,2);assert.ok(d.contactAlongFoot>=5&&d.contactAlongFoot<=55);
  for(const foot of feet){
    near(foot.position[0],a.wheel.width/2+a.wheel.offset);
    const sign=Math.sign(foot.position[1]-a.wheel.center[1]);
    near(foot.position[1]+sign*d.contactAlongFoot,a.wheel.center[1]+sign*(a.wheel.diameter-a.wheel.depth)/2);
  }
  const probe=a.parts.find(p=>p.shape==='probe1')!,bridge=a.parts.find(p=>p.kind==='extrusion'&&!p.rotation)!;
  near(probe.position[0]-100,a.wheel.hubWidth/2);
  near(probe.position[0]-probe.probeBolt!,bridge.position[0]);
  near(probe.position[2],bridge.size[2]/2);
  assert.deepEqual(probe.size,[105,15,15]);
});

test('unsupported wheel span is explicit and never changes the fixed frame',()=>{
  const a=buildAssembly(wheel,{...settings,rimDiameter:850});
  assert.ok(a.errors.some(e=>e.includes('cannot place both metal feet')));
  assert.deepEqual(a.parts.filter(p=>p.kind==='extrusion').map(p=>p.stock),[300,100,100]);
});

test('legacy straight setting cannot resurrect the removed alternative',()=>{
  const legacy={...settings,dishLayout:'straight' as const,dishStopReach:160};
  const loaded=loadWorkshop(workshopSnapshot(legacy,wheel),wheel);
  assert.ok(!Object.hasOwn(loaded,'dishLayout'));
  assert.ok(!Object.hasOwn(loaded,'dishStopReach'));
  const a=buildAssembly(wheel,loaded),b=buildAssembly(wheel,settings);
  assert.deepEqual(a.parts,b.parts);
  assert.ok(!a.parts.some(p=>['probe-fork','probe-shoe-arm','dish-center','angled-rim-cap'].includes(p.sku)));
});
