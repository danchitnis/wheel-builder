import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { calculateNippleFit, nippleFitDefaults, nippleReferences, purchasedSpokePoints, fitSettingsFrom, type NippleFitSettings } from '../src/utils/nippleFit.ts';
import { calculateSpokePaths, type SpokePath } from '../src/utils/spokePath.ts';
import { configurationDefaults, parseConfiguration, serializeConfiguration, saveConfiguration, restoreConfiguration } from '../src/utils/buildConfiguration.ts';
import { createWheelModel } from '../src/components/WheelModel.ts';
import { createNippleGeometry } from '../src/components/NippleGeometry.ts';
import { calculateWheelBuild, type WheelBuildInputs } from '../src/utils/physicsCalculator.ts';
import { createLacingGuide, guideKey, initialGuideState, reconcileGuide } from '../src/utils/lacingGuide.ts';

const config = configurationDefaults();
const paths = calculateSpokePaths(config as unknown as WheelBuildInputs);
const path: SpokePath = {...paths.spokes[0], estimatedLength:100, traditionalLength:100,
  points:[{x:-100,y:0,z:0},{x:0,y:0,z:0}],end:{x:0,y:0,z:0}};
function fitAt(tip:number, overrides: Partial<NippleFitSettings> = {}) {
  // These boundary fixtures deliberately use a 10 mm male thread, independent
  // of the 9 mm production default.
  const result = calculateNippleFit(path,{...nippleFitDefaults,spokeThreadLeft:10,erdReferenceThread:10,purchasedLengthLeft:100+tip-10,...overrides});
  if(!result.valid)throw new Error(result.error);
  return result;
}
function close(actual:number,expected:number) {assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function dispose(group:ReturnType<typeof createNippleGeometry>) {
  group.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
}

test('thread overlap handles entry, slot floor, head and loss of engagement independently',()=>{
  const cases = [
    {tip:0,engagement:0,exposed:10,slot:-11,protrusion:0,travel:12},
    {tip:2,engagement:0,exposed:8,slot:-9,protrusion:0,travel:10},
    {tip:10,engagement:8,exposed:0,slot:-1,protrusion:0,travel:2},
    {tip:11,engagement:9,exposed:0,slot:0,protrusion:0,travel:1},
    {tip:12,engagement:9,exposed:0,slot:1,protrusion:0,travel:0},
    {tip:13,engagement:8,exposed:0,slot:2,protrusion:1,travel:0},
    {tip:30,engagement:0,exposed:0,slot:19,protrusion:18,travel:0},
  ];
  for(const c of cases){const f=fitAt(c.tip);close(f.engagement,c.engagement);close(f.exposedThread,c.exposed);close(f.slotOffset,c.slot);close(f.protrusion,c.protrusion);close(f.remainingTravel,c.travel);}
  close(fitAt(13).runoutExceeded,1);
  close(fitAt(-2).exposedThread,10); // Only actual threaded material counts, even outside the nipple.
});

test('candidate thread length changes overlap but cannot move the ERD reference or spoke tip',()=>{
  const original=fitAt(10), longer=fitAt(10,{spokeThreadLeft:12}), shorter=fitAt(10,{spokeThreadLeft:5});
  close(longer.tip,original.tip);close(shorter.tip,original.tip);close(longer.exposedThread,2);close(shorter.engagement,5);
  close(fitAt(10,{erdReferenceThread:11}).tip,11);
});

test('each purchased millimetre moves only the final endpoint by one physical millimetre',()=>{
  const original=structuredClone(path);
  const f0=calculateNippleFit(path,{...nippleFitDefaults,purchasedLengthLeft:100});
  const f1=calculateNippleFit(path,{...nippleFitDefaults,purchasedLengthLeft:101});
  const a=purchasedSpokePoints(path,f0),b=purchasedSpokePoints(path,f1);
  close(b.at(-1)!.x-a.at(-1)!.x,1);assert.deepEqual(a[0],b[0]);assert.deepEqual(path,original);
});

test('auto rounding and left/right overrides use the existing bend-adjusted estimate',()=>{
  for(const p of paths.spokes){
    const auto=calculateNippleFit(p,nippleFitDefaults);
    assert.ok(auto.valid);if(!auto.valid)continue;
    close(auto.delta,Math.round(p.traditionalLength)-p.traditionalLength-p.bendAllowance);
    const chosen=calculateNippleFit(p,{...nippleFitDefaults,purchasedLengthLeft:170,purchasedLengthRight:172,spokeThreadLeft:8,spokeThreadRight:9});
    assert.ok(chosen.valid);if(chosen.valid){close(chosen.purchasedLength,p.side==='Left'?170:172);close(chosen.threadLength,p.side==='Left'?8:9);}
  }
});

test('invalid geometry, blank measurements, impossible spans and incompatible diameters have no fit',()=>{
  for(const overrides of [{nippleLeadIn:11},{nippleSlotDepth:3},{nippleHeadHeight:null},{spokeThreadLeft:null},
    {spokeThreadLeft:-1},{spokeThreadLeft:101},{nippleLength:Infinity},{purchasedLengthLeft:0},
    {purchasedLengthLeft:2001},{erdReferenceThread:0}]) {
    assert.equal(calculateNippleFit(path,{...nippleFitDefaults,...overrides}).valid,false,JSON.stringify(overrides));
  }
  assert.equal(calculateNippleFit(path,nippleFitDefaults,1.8).valid,false);
  assert.equal(calculateNippleFit({...path,valid:false},nippleFitDefaults).valid,false);
  assert.equal(calculateNippleFit({...path,points:[{x:-1,y:0,z:0},path.end]}, {...nippleFitDefaults,purchasedLengthLeft:98}).valid,false);
});

test('nipple geometry has an open bore and real half-section faces within its 12 mm profile',()=>{
  for(const cutaway of [false,true]) {
    const group=createNippleGeometry(nippleFitDefaults,cutaway,true);group.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(group);close(bounds.min.y,0);close(bounds.max.y,12);
    if(cutaway)assert.ok(bounds.max.z<1e-6);else assert.ok(bounds.max.z>1);
    const ray=new Raycaster(new Vector3(0,-2,0),new Vector3(0,1,0));assert.equal(ray.intersectObject(group,true).length,0,'opening must not be capped');
    group.traverse(o=>{if(o instanceof Mesh)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));});dispose(group);
  }
});

test('wheel rendering shares tip displacement and is invariant under exploded view and diameter exaggeration',()=>{
  const inputs={...config,nippleFit:{...nippleFitDefaults,purchasedLengthLeft:175,purchasedLengthRight:172}} as unknown as WheelBuildInputs;
  const baseline=createWheelModel(inputs), exploded=createWheelModel(inputs,{explodedValue:1,spokeThickness:3});
  const originalPaths=calculateSpokePaths(inputs);
  for(const mesh of baseline.spokeMeshes){
    const p=originalPaths.spokes.find(p=>p.side===mesh.userData.side&&p.index===mesh.userData.index)!;
    const f=calculateNippleFit(p,inputs.nippleFit!);
    assert.ok(f.valid);if(!f.valid)continue;
    const other=exploded.spokeMeshes.find(m=>m.userData.side===p.side&&m.userData.index===p.index)!;
    assert.deepEqual(other.userData.nippleFit,mesh.userData.nippleFit);
    close(other.userData.purchasedEnd.distanceTo(mesh.userData.purchasedEnd),60);
    close(mesh.userData.purchasedEnd.distanceTo(mesh.userData.end),Math.abs(f.delta));
    const nipple=baseline.group.children.find(o=>o.name==='nipple'&&o.userData.side===p.side&&o.userData.index===p.index)!;
    const opening=nipple.localToWorld(new Vector3(0,0,0));
    const tip=nipple.localToWorld(new Vector3(0,f.tip,0));
    close(tip.distanceTo(mesh.userData.purchasedEnd),0);
    close(opening.distanceTo(mesh.userData.end),nippleFitDefaults.erdReferenceThread!);
  }
  dispose(baseline.group);dispose(exploded.group);
});

test('fit settings preserve traditional calculations and lacing progress across changes',()=>{
  const input=config as unknown as WheelBuildInputs;
  const changed={...config,nippleFit:{...nippleFitDefaults,purchasedLengthLeft:170,spokeThreadLeft:12}} as unknown as WheelBuildInputs;
  assert.deepEqual(calculateWheelBuild(changed),calculateWheelBuild(input));assert.equal(guideKey(changed),guideKey(input));
  const guide=createLacingGuide(input,calculateSpokePaths(input)),state={...initialGuideState(),key:guide.key,step:4};
  assert.equal(reconcileGuide(state,createLacingGuide(changed,calculateSpokePaths(changed))).step,4);
});

test('old links get fit defaults, and new blank/explicit settings survive sharing and tab restoration',()=>{
  const old=parseConfiguration('#v=2&rp='+config.rp+'&hp='+config.hp);assert.equal(old.kind,'configuration');
  if(old.kind==='configuration')assert.deepEqual(fitSettingsFrom(old.config),nippleFitDefaults);
  const updated={...config,purchasedLengthLeft:171,purchasedLengthRight:172,spokeThreadLeft:9,spokeThreadRight:11,
    erdReferenceThread:10.5,nippleLeadIn:2.5,nippleSlotDepth:1.2,nippleHeadHeight:2.2,
    nippleWrenchLength:4.25,nippleBarrelLength:4.75,nippleHeadDiameter:6.4,nippleBodyDiameter:4.2};
  const parsed=parseConfiguration(serializeConfiguration(updated));assert.equal(parsed.kind,'configuration');if(parsed.kind==='configuration')assert.deepEqual(parsed.config,updated);
  let value='';const storage=()=>({getItem:()=>value,setItem:(_key:string,v:string)=>{value=v;}});
  assert.ok(saveConfiguration({...updated,spokeThreadLeft:null},storage));assert.equal(restoreConfiguration('',storage).config.spokeThreadLeft,null);
  const invalid=parseConfiguration('#purchasedLengthLeft=NaN');assert.equal(invalid.kind,'error');
});

test('default profile uses 9 mm spoke and ERD threads with a 12 mm, 4-to-6 mm tapered nipple',()=>{
  assert.equal(nippleFitDefaults.spokeThreadLeft,9);
  assert.equal(nippleFitDefaults.spokeThreadRight,9);
  assert.equal(nippleFitDefaults.erdReferenceThread,9);
  close(nippleFitDefaults.nippleWrenchLength!+nippleFitDefaults.nippleBarrelLength!+nippleFitDefaults.nippleHeadHeight!,12);
  const fit=calculateNippleFit(path,nippleFitDefaults);
  assert.ok(fit.valid);
  close(fit.tip,9); close(fit.threadStart,0); close(fit.taperStart,9);
  for(const cutaway of [false,true]) {
    const geometry=createNippleGeometry(nippleFitDefaults,cutaway);
    const radiiAt=(height:number)=>{
      const radii:number[]=[];
      geometry.traverse(object=>{
        if(!(object instanceof Mesh))return;
        const positions=object.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)if(Math.abs(positions.getY(i)-height)<1e-5)
          radii.push(Math.hypot(positions.getX(i),positions.getZ(i)));
      });
      assert.ok(radii.length>0,`Missing profile at height ${height}`);
      return Math.max(...radii);
    };
    for(const [height,radius] of [[4.5,2],[9,2],[11,8/3],[12,3]])
      assert.ok(Math.abs(radiiAt(height)-radius)<1e-5,`${height} mm section must have radius ${radius}`);
    dispose(geometry);
  }
});

test('inconsistent external sections and bore-breaking body dimensions cannot generate fit geometry',()=>{
  for(const overrides of [{nippleWrenchLength:6},{nippleBarrelLength:null},{nippleHeadDiameter:3},
    {nippleBodyDiameter:2},{nippleWrenchLength:-1}]) {
    const settings={...nippleFitDefaults,...overrides};
    assert.equal(calculateNippleFit(path,settings).valid,false);
    assert.equal(createNippleGeometry(settings).children.length,0);
  }
});

test('shared nipple references distinguish taper start from the ERD calibration across renderers',()=>{
  const settings={...nippleFitDefaults,nippleLength:14,nippleHeadHeight:3,nippleSlotDepth:.8,erdReferenceThread:7.5};
  const references=nippleReferences(settings);
  assert.deepEqual(references,{opening:0,calibratedTipReference:7.5,internalStart:2,internalEnd:13.2,
    taperStart:11,slotFloor:13.2,headTop:14});
  const fit=calculateNippleFit(path,settings);
  assert.ok(fit.valid); if(!fit.valid)return;
  assert.deepEqual(fit.references,references);close(fit.tip,7.5);close(fit.taperStart,11);
  const geometry=createNippleGeometry(settings,true,true);
  assert.deepEqual(geometry.userData.references,references);dispose(geometry);
  const inputs={...config,nippleFit:settings} as unknown as WheelBuildInputs;
  const model=createWheelModel(inputs);
  for(const mesh of model.spokeMeshes) {
    const nipple=model.group.children.find(o=>o.name==='nipple'&&o.userData.side===mesh.userData.side&&o.userData.index===mesh.userData.index)!;
    assert.deepEqual(nipple.userData.references,references);
    const reference=nipple.localToWorld(new Vector3(0,references.calibratedTipReference,0));
    close(reference.distanceTo(mesh.userData.end),0);
    const tip=nipple.localToWorld(new Vector3(0,mesh.userData.nippleFit.tip,0));
    close(tip.distanceTo(mesh.userData.purchasedEnd),0);
  }
  dispose(model.group);
});

test('the reported front build is a geometric regression case, without a fitted physical correction',()=>{
  const front=configurationDefaults(config.rp,'hope-pro5-front-100-6b');
  const input={...front,nippleFit:{...nippleFitDefaults,purchasedLengthLeft:171,purchasedLengthRight:177}} as unknown as WheelBuildInputs;
  const result=calculateWheelBuild(input);
  close(result.left.calculatedSpokeLength,171.73133169752552);
  close(result.right.calculatedSpokeLength,175.7362180921236);
  close(result.tensionRatioLeft,100);close(result.tensionRatioRight,60.18502590825802);
  for(const interlaced of [false,true]) for(const p of calculateSpokePaths({...input,interlaced}).spokes) {
    const fit=calculateNippleFit(p,input.nippleFit!);
    assert.ok(fit.valid);if(!fit.valid)continue;
    close(fit.traditionalDelta,p.side==='Left'?-.7313316975255191:1.2637819078763926);
    close(fit.delta,fit.traditionalDelta-p.bendAllowance);
    close(fit.tip,9+fit.delta);
    const oneLonger=calculateNippleFit(p,{...input.nippleFit!,
      ...(p.side==='Left'?{purchasedLengthLeft:172}:{purchasedLengthRight:178})});
    assert.ok(oneLonger.valid);if(oneLonger.valid)close(oneLonger.tip-fit.tip,1);
  }
  // Reported tensioned tip protrusion is documented separately. It is not an
  // expected value here: seating, elastic deformation and internal dimensions
  // have not been measured sufficiently to explain that observation.
});
