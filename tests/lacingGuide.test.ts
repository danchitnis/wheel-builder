import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationDefaults } from '../src/utils/buildConfiguration.ts';
import { calculateSpokePaths } from '../src/utils/spokePath.ts';
import { calculateWheelBuild, type WheelBuildInputs } from '../src/utils/physicsCalculator.ts';
import { createLacingGuide, guideKey, guideSnapshot, initialGuideState, reconcileGuide, transitionGuide, projectedCrossing, spokeOrientation } from '../src/utils/lacingGuide.ts';
import { lacingSpokeDiagram, lacingSetupDiagram } from '../src/utils/lacingSetupDiagram.ts';
const inputs = (front=false) => configurationDefaults(undefined,front?'hope-pro5-front-100-6b':'hope-pro5-rear-135-6b') as WheelBuildInputs;
const build = (overrides={}) => {const i={...inputs(),...overrides}; return createLacingGuide(i,calculateSpokePaths(i));};

test('non-interlaced default has Setup plus 16 pairs, right then left, and alternating heads',()=>{
  const g=build(); assert.equal(g.valid,true); assert.equal(g.interlaced,false);
  assert.deepEqual(g.groupStarts,[1,9]); assert.equal(g.pairs.length,16);
  let state=reconcileGuide(initialGuideState(),g);
  assert.equal(guideSnapshot(state,g).activePair,null);
  for(let step=1;step<=16;step++) {
    state=transitionGuide(state,g,'next'); const snapshot=guideSnapshot(state,g);
    assert.equal(snapshot.activePair,g.pairs[step-1]); assert.equal(snapshot.representedSpokes,step*2);
    assert.equal(snapshot.activePair!.side,step<=8?'Right':'Left');
    assert.equal(snapshot.activePair!.a.path.headsOut,true); assert.equal(snapshot.activePair!.b.path.headsOut,false);
    assert.equal(snapshot.groupCounts.reduce((a,b)=>a+b,0),step*2);
  }
  assert.equal(guideSnapshot(state,g).canNext,false); assert.deepEqual(guideSnapshot(state,g).groupCounts,[8,8,8,8]);
  for(const side of ['Left','Right']) {
    const spokes=g.spokes.filter(s=>s.side===side).sort((a,b)=>a.path.index-b.path.index);
    spokes.forEach((s,i)=>assert.equal(s.path.headsOut,i%2===0));
  }
});

test('pair navigation, side jumps, preview and checkpoints preserve the represented count',()=>{
  const g=build(); let state=reconcileGuide(initialGuideState(),g);
  for(const [action,step] of [['next-group',1],['next-group',9],['previous-group',1],['previous-group',0],['next',1],['next',2],['previous',1]] as const) {
    state=transitionGuide(state,g,action); assert.equal(state.step,step);
  }
  state={...state,step:8}; let snap=guideSnapshot(state,g);
  assert.match(snap.orientationCheckpoint!,/Right flange complete/); assert.equal(snap.representedSpokes,16);
  state=transitionGuide(state,g,'preview'); snap=guideSnapshot(state,g);
  assert.equal(snap.orientationCheckpoint,null); assert.equal(snap.spokeSelection,null); assert.equal(snap.setup,null);
  assert.equal(transitionGuide(state,g,'next').step,8);
  state=transitionGuide(state,g,'return'); assert.equal(state.step,8);
  assert.match(guideSnapshot({...state,step:16},g).orientationCheckpoint!,/Both flanges complete/);
});

test('geometry and interlacing reset progress while rendering changes preserve it',()=>{
  const i=inputs(),g=build(); const state={...reconcileGuide(initialGuideState(),g),step:7,preview:true};
  for(const next of [build({erd:i.erd+1}),build({interlaced:true})]) {
    const reset=reconcileGuide(state,next); assert.equal(reset.step,0); assert.equal(reset.preview,false);
  }
  assert.equal(reconcileGuide(state,build({...i,displayColor:'red'})).step,7);
  assert.equal(guideKey({...i,interlaced:undefined}),guideKey({...i,interlaced:false}));
  assert.equal(reconcileGuide({...state,key:'groups-v2:old'},g).step,0);
});

test('mutual outermost partners and all endpoints and lengths are preserved across Hope geometry',()=>{
  for(const front of [false,true]) for(const crossesLeft of [0,1,2,3]) for(const crossesRight of [0,1,2,3])
  for(const interlaced of [false,true]) for(const osb of [0,2.5]) {
    const i={...inputs(front),crossesLeft,crossesRight,interlaced,osb,hubOffset:.5};
    const paths=calculateSpokePaths(i),g=createLacingGuide(i,paths),calc=calculateWheelBuild(i);
    assert.equal(g.valid,true,g.errors.join(';')); assert.equal(new Set(g.spokes.map(s=>`${s.side}:${s.path.index}`)).size,32);
    assert.equal(new Set(g.spokes.map(s=>s.rimHoleIndex)).size,32);
    for(const pair of g.pairs) {
      for(const [s,partner] of [[pair.a,pair.b],[pair.b,pair.a]]) {
        assert.equal(s.path,paths.spokes.find(p=>p.side===s.side&&p.index===s.path.index));
        assert.equal(s.length,calc[s.side==='Left'?'left':'right'].calculatedSpokeLength);
        if(!s.crosses) {assert.equal(s.crossings.length,0);assert.doesNotMatch(s.instruction,/Crossing numbers|Remaining crossings/);continue;}
        const all=g.spokes.filter(o=>o.side===s.side&&o.path.headsOut!==s.path.headsOut)
          .map(other=>({other,c:projectedCrossing(s.path.hole,s.path.end,other.path.hole,other.path.end)}))
          .filter(o=>o.c).sort((a,b)=>b.c!.t-a.c!.t);
        assert.equal(all[0].other,partner);
        assert.equal(s.crossings.find(c=>c.outermost)!.other,partner);
        for(const c of s.crossings) {
          assert.ok(c.other===partner||c.other.sequenceIndex<pair.index*2);
          assert.equal(c.towardOutside,s.path.headsOut?(interlaced&&c.outermost):!(interlaced&&c.outermost));
        }
      }
      if(!pair.a.crosses)assert.equal(pair.b.path.index,(pair.a.path.index+1)%16);
    }
  }
});

test('all physical crossings are covered when the later pair is added, with no future references',()=>{
  for(const crosses of [1,2,3,4]) for(const interlaced of [false,true]) {
    const g=build({crossesLeft:crosses,crossesRight:crosses,interlaced}); assert.equal(g.valid,true);
    const crossings=new Set<string>();
    for(const pair of g.pairs) for(const s of [pair.a,pair.b]) {
      const available=g.spokes.slice(0,pair.index*2).concat(pair.a,pair.b);
      for(const reference of [s.referenceFlange,s.referenceRim]) if(reference)assert.ok(available.some(o=>o.path===reference));
      for(const c of s.crossings) {
        assert.ok(available.includes(c.other));
        crossings.add([s.sequenceIndex,c.other.sequenceIndex].sort((a,b)=>a-b).join(':'));
      }
    }
    assert.equal(crossings.size,32*crosses/2);
  }
});

test('left start anchors both endpoints to an installed right heads-out spoke, independent of hub rotation',()=>{
  const g=build(),left=g.pairs[8].a,ref=left.referenceFlange!;
  assert.equal(ref.side,'Right'); assert.equal(ref.headsOut,true); assert.equal(left.referenceRim,ref);
  assert.ok(g.spokes.indexOf(g.spokes.find(s=>s.path===ref)!)<16);
  const angle=(p:{x:number,y:number})=>Math.atan2(p.y,p.x);
  const relative=angle(left.path.hole)-angle(ref.hole);
  const rotate=(p:{x:number,y:number},t:number)=>({x:p.x*Math.cos(t)-p.y*Math.sin(t),y:p.x*Math.sin(t)+p.y*Math.cos(t)});
  for(const t of [0,.5,Math.PI/2])assert.ok(Math.abs(Math.sin(angle(rotate(left.path.hole,t))-angle(rotate(ref.hole,t)))-Math.sin(relative))<1e-12);
  assert.match(lacingSetupDiagram(left.groupStart!),/opposite right flange/);
});

test('pair instructions place both heads and crossing routes before attaching either nipple',()=>{
  const g=build();
  for(const pair of g.pairs) {
    const text=pair.a.instruction;
    assert.match(text,/Attach neither nipple yet/); assert.match(text,/A — Heads out/); assert.match(text,/B — Heads in/);
    assert.match(text,/Hold A by its shaft/); assert.match(text,/loose partner B/); assert.match(text,/loose partner A/);
    assert.match(text,/Non-interlaced: A stays toward the wheel centre and B toward the flange’s outside/);
    assert.ok(text.indexOf('Position both routes')<text.indexOf('then attach both nipples'));
    assert.doesNotMatch(text,/opposing spokes will be added|group 3|group 4/);
    assert.doesNotMatch(text.slice(text.indexOf('B —')),/previous heads-out spoke/);
  }
});

test('pair diagrams identify both connections, lengths and mirrored viewing directions',()=>{
  for(const front of [false,true]) for(const interlaced of [false,true]) {
    const g=build({...inputs(front),interlaced});
    for(const pair of g.pairs) {
      const svg=lacingSpokeDiagram(pair.a,g.valveAngle,g.spokes.slice(0,pair.index*2),pair.b);
      assert.match(svg,/A heads-out, B heads-in/); assert.match(svg,/data-lacing-target="b-flange"/); assert.match(svg,/data-lacing-target="b-rim"/);
      assert.ok(svg.includes(`B flange hole ${pair.b.flangeHoleIndex} to rim hole ${pair.b.rimHoleIndex}`));
      for(const s of [pair.a,pair.b]) {
        assert.ok(svg.includes(s.orientationText));
        const actual=spokeOrientation(s.path),other=spokeOrientation(s.path,s.side==='Left'?'Right':'Left');
        assert.equal(actual.degrees,other.degrees); assert.notEqual(actual.direction,other.direction);
      }
    }
  }
});

test('invalid or incomplete geometry prevents pair navigation and stale lengths',()=>{
  const i=inputs(),paths=calculateSpokePaths(i);
  for(const p of [{...paths,spokes:paths.spokes.slice(1)}, {...paths,errors:['Invalid geometry']},calculateSpokePaths({...i,erd:0})]) {
    const g=createLacingGuide(i,p); assert.equal(g.valid,false); assert.equal(g.pairs.length,0);
    const state=reconcileGuide({...initialGuideState(),step:8},g),snapshot=guideSnapshot(state,g);
    assert.equal(snapshot.spokeSelection,null); assert.equal(snapshot.canNext,false); assert.equal(snapshot.targetPair,null);
  }
});

test('supported spoke counts pair every flange hole exactly once, including radial sides',()=>{
  for(const spokeCount of [8,12,16,20,24,28,32,36,48,64]) for(const crosses of [0,1,Math.min(4,Math.floor(spokeCount/8))]) {
    const g=build({spokeCount,crossesLeft:crosses,crossesRight:crosses});
    assert.equal(g.valid,true,g.errors.join(';')); assert.equal(g.pairs.length,spokeCount/2);
    assert.equal(new Set(g.pairs.flatMap(p=>[p.a,p.b])).size,spokeCount);
    assert.deepEqual(g.groupStarts,[1,spokeCount/4+1]);
    assert.deepEqual(guideSnapshot({...reconcileGuide(initialGuideState(),g),step:g.pairs.length},g).groupCounts,Array(4).fill(spokeCount/4));
  }
});
