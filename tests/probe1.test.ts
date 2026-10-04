import test from 'node:test';
import assert from 'node:assert/strict';
import probe from '../src/components/workshop/fusionProbe1Mesh.json' with {type:'json'};
import {configurationDefaults} from '../src/utils/buildConfiguration.ts';
import {buildAssembly,workshopDefaults,billOfMaterials,profiles,type Profile} from '../src/utils/workshop.ts';
const wheel=configurationDefaults();
const settings={...workshopDefaults(wheel),axle:'qr10' as const,hubWidth:135,rimDiameter:650,seatLeft:10,seatRight:10,projection:3};

test('Probe 1 native Fusion export retains its solid, slot and 105 mm envelope',()=>{
  assert.equal(probe.metadata.source,'probe1');
  assert.equal(probe.mesh.solid,true);
  assert.deepEqual(probe.mesh.min,[-5,-7.5,0]);assert.deepEqual(probe.mesh.max,[100,7.5,15]);
  assert.equal(probe.metadata.slotMax-probe.metadata.slotMin,90);
  assert.equal(probe.metadata.slotWidth,5);
  assert.ok(Math.abs(probe.mesh.volumeMm3-6446.891615)<.001);
  assert.ok(probe.mesh.indices.every(i=>i>=0&&i<probe.mesh.positions.length/3));
});

test('lateral and radial pointers are translated copies clamped directly to the same upright',()=>{
  for(const profile of Object.keys(profiles) as Profile[])for(const hubWidth of [100,135]){
    const a=buildAssembly(wheel,{...settings,profile,hubWidth});
    const parts=a.parts.filter(p=>p.shape==='probe1');assert.equal(parts.length,2);
    const lateral=parts.find(p=>p.probeRole==='lateral')!,radial=parts.find(p=>p.probeRole==='radial')!;
    const upright=a.parts.find(p=>p.kind==='extrusion'&&p.axis==='y'&&p.position[0]>0)!;
    for(const part of parts){
      assert.deepEqual(part.size,[105,15,15]);assert.deepEqual(part.rotation,[0,0,Math.PI]);
      assert.equal(part.position[0]-part.probeBolt!,upright.position[0]);
      assert.equal(part.position[2],profiles[profile].size/2);
      assert.ok(part.probeBolt!>=7&&part.probeBolt!<=93);
    }
    assert.equal(radial.position[0]-100,a.wheel.offset);
    const rimX=a.wheel.offset+a.wheel.width/2;
    assert.equal(lateral.position[0]-100,rimX+1);
    assert.ok(radial.position[0]-100<rimX);
    const yAtBack=a.wheel.center[1]-Math.sqrt((a.wheel.diameter/2)**2-radial.position[2]**2);
    assert.ok(Math.abs(yAtBack-(radial.position[1]+7.5)-1)<1e-8);
    assert.ok(!a.parts.some(p=>p.sku==='radial-probe-adapter'||p.sku==='pointer-tip'));
    assert.equal(billOfMaterials(parts)[0].quantity,2);
  }
});

test('photographed dishing model uses the same native probe',()=>{
  const a=buildAssembly(wheel,{...settings,tool:'dish',rimDiameter:406.9});
  assert.deepEqual(a.errors,[]);
  const parts=a.parts.filter(p=>p.shape==='probe1');assert.equal(parts.length,1);
  assert.deepEqual(parts[0].size,[105,15,15]);assert.deepEqual(parts[0].rotation,[0,0,Math.PI]);
  assert.ok(parts[0].probeBolt!>=7&&parts[0].probeBolt!<=93);
  assert.equal(parts[0].probeRole,'dish');
  assert.equal(a.probe!.rodLength,105);
  assert.ok(!a.parts.some(p=>p.sku==='dish-probe'||p.sku==='dish-m6-nut'));
});
