import { calculateWheelBuild, type WheelBuildInputs } from './physicsCalculator.ts';
import type { Point3, SpokePath, SpokePaths } from './spokePath';

export type LacingTarget = 'flange' | 'rim' | 'valve' | 'reference-flange' | 'reference-rim' | 'setup-reference' | 'alignment' | 'logo' | 'b-flange' | 'b-rim' | 'b-reference-flange' | 'b-reference-rim' | `b-crossing-${number}` | `crossing-${number}`;
export interface GuideInstructionPart { text: string; target?: LacingTarget }
export type GuideSide = 'Left' | 'Right';
export type GuideDirection = 'clockwise' | 'counterclockwise';
/** World angles increase counterclockwise from the right; the left view mirrors them. */
export const guideDirection = (side: GuideSide, turn: number): GuideDirection =>
  turn * (side === 'Right' ? 1 : -1) > 0 ? 'counterclockwise' : 'clockwise';
export const guideWorldTurn = (side: GuideSide, direction: GuideDirection): number =>
  (direction === 'counterclockwise' ? 1 : -1) * (side === 'Right' ? 1 : -1);
/** Signed angular sweep about the axle, following the actual hub-to-rim connection. */
export function spokeOrientation(path: SpokePath, viewSide: GuideSide = path.side) {
  const cross = path.hole.x * path.end.y - path.hole.y * path.end.x;
  const dot = path.hole.x * path.end.x + path.hole.y * path.end.y;
  const angle = Math.atan2(cross, dot);
  return { degrees: Math.abs(angle) * 180 / Math.PI,
    direction: Math.abs(angle) < 1e-9 ? null : guideDirection(viewSide, angle) };
}
export function spokeOrientationText(path: SpokePath, viewingLabel: string): string {
  const { direction, degrees } = spokeOrientation(path);
  return `Viewed from the ${viewingLabel} side, trace this spoke from hub to rim: ${direction ?
    `it sweeps ${direction} around the axle. In the assembled position, the lines from the axle to its flange hole and rim hole are ${Number(degrees.toFixed(2))}° apart.` : 'it runs radially, with no clockwise or counterclockwise sweep.'}`;
}
export function guideViewingLabel(inputs: WheelBuildInputs, side: GuideSide): string {
  const rear = inputs.isRear !== false;
  const disc = inputs.discType === '6-Bolt' ? 'six-bolt disc' : inputs.discType === 'Centerlock' ? 'Centerlock disc' : '';
  const role = side === 'Right' ? (rear ? 'drive' : disc ? 'non-disc' : 'front') :
    [disc, rear ? 'non-drive' : ''].filter(Boolean).join(' / ') || 'front';
  return `${side.toLowerCase()} · ${role}`;
}
export interface GuideSetup {
  reference: SpokePath;
  flangeHoles: SpokePath[];
  holeSteps: number;
  direction: GuideDirection;
  viewingLabel: string;
  referenceTarget: 'setup-reference' | 'reference-flange';
  referenceStep?: number;
  referenceAcrossHub: boolean;
  valveAngle: number;
  first: SpokePath;
  crossed: boolean;
}

export interface GuideSpoke {
  path: SpokePath;
  sequenceIndex: number;
  group: number;
  groupName: string;
  side: 'Left' | 'Right';
  sideLabel: string;
  viewingLabel: string;
  flangeHoleIndex: number;
  rimHoleIndex: number;
  headsDir: string;
  instruction: string;
  instructionParts: GuideInstructionPart[];
  instructionSteps: GuideInstructionPart[][];
  referenceFlange?: SpokePath;
  referenceRim?: SpokePath;
  groupStart?: GuideSetup;
  pattern: string;
  orientationText: string;
  length: number;
  crosses: number;
  crossings: GuideCrossing[];
}
export interface GuideCrossing {
  spoke: GuideSpoke;
  other: GuideSpoke;
  otherStep: number;
  number: number;
  outermost: boolean;
  towardOutside: boolean;
  point: Point3;
  target: `crossing-${number}`;
  description: string;
}
export interface GuidePair {
  index: number;
  side: GuideSide;
  a: GuideSpoke;
  b: GuideSpoke;
  instructionSteps: GuideInstructionPart[][];
}
/** Planar intersection, with separate axial positions for the two shafts. */
export function projectedCrossing(a: Point3, b: Point3, c: Point3, d: Point3) {
  const dx = b.x-a.x, dy = b.y-a.y, ex = d.x-c.x, ey = d.y-c.y;
  const den = dx*ey-dy*ex;
  if (Math.abs(den) < 1e-8) return null;
  const vx = c.x-a.x, vy = c.y-a.y;
  const t = (vx*ey-vy*ex)/den, u = (vx*dy-vy*dx)/den;
  if (t < -1e-9 || t > 1+1e-9 || u < -1e-9 || u > 1+1e-9) return null;
  return { t, u, point: { x: a.x+t*dx, y: a.y+t*dy, z: a.z+t*(b.z-a.z) }, otherZ: c.z+u*(d.z-c.z) };
}
function shaftCrossing(a: SpokePath, b: SpokePath) {
  for (let i=1; i<a.points.length; i++) for (let j=1; j<b.points.length; j++) {
    const cross = projectedCrossing(a.points[i-1], a.points[i], b.points[j-1], b.points[j]);
    if (cross) return cross;
  }
  return null;
}
const spokeName = (s: GuideSpoke) => `spoke ${s.sequenceIndex+1}`;

export interface LacingGuide {
  key: string;
  valid: boolean;
  errors: string[];
  valveAngle: number;
  spokes: GuideSpoke[];
  pairs: GuidePair[];
  groupNames: string[];
  groupStarts: number[];
  interlaced: boolean;
  total: number;
  setup: GuideSetup | null;
}
export interface GuideState {
  key: string;
  step: number;
  preview: boolean;
  cameraTracking: boolean;
  notice: string;
}
export type GuideAction = 'next' | 'previous' | 'next-group' | 'previous-group' | 'reset' | 'preview' | 'return' | 'fixed' | 'track';
export const initialGuideState = (): GuideState => ({ key: '', step: 0, preview: false, cameraTracking: false, notice: '' });

// Only build inputs invalidate a sequence; rendering options and provenance do not.
export function guideKey(inputs: WheelBuildInputs): string {
  const keys: (keyof WheelBuildInputs)[] = ['erd', 'osb', 'drillingOffsetLeft', 'drillingOffsetRight', 'spokeCount',
    'spokeHoleDiameter', 'flangeThickness', 'flangeThicknessLeft', 'flangeThicknessRight', 'flangeOuterDiameterLeft',
    'flangeOuterDiameterRight', 'spokeDiameter', 'interlaced', 'hubOffset', 'rimFlip', 'flangePcdLeft', 'centerToLeft',
    'crossesLeft', 'flangePcdRight', 'centerToRight', 'crossesRight', 'isRear', 'discType', 'rimWidthOuter', 'rimWidthInner', 'rimDepth'];
  return 'pairs-v2:' + JSON.stringify(keys.map(key => key === 'interlaced' ? (inputs.interlaced === true) : inputs[key]));
}

/** Shared valve landmark and ordering, including a stable tie-break for equal hole gaps. */
export function valveAngleFor(inputs: WheelBuildInputs): number {
  const n = inputs.spokeCount / 2;
  if (!Number.isInteger(n) || n < 4 || n > 32) return 0;
  const tau = Math.PI * 2;
  const angles = [inputs.crossesLeft, inputs.crossesRight].flatMap((crosses, side) =>
    Array.from({ length: n }, (_, j) => ((j * tau / n + side * Math.PI / n + (j % 2 === 0 ? 1 : -1) * crosses * tau / n) % tau + tau) % tau)
  ).sort((a, b) => a - b);
  let largest = 0, angle = 0;
  angles.forEach((a, i) => {
    const gap = (angles[i + 1] ?? angles[0] + tau) - a;
    if (gap > largest + 1e-9) { largest = gap; angle = (a + gap / 2) % tau; }
  });
  return angle;
}

export function createLacingGuide(inputs: WheelBuildInputs, paths: SpokePaths): LacingGuide {
  const key = guideKey(inputs), valveAngle = valveAngleFor(inputs), total = inputs.spokeCount;
  const lengths = calculateWheelBuild(inputs);
  const errors = [...paths.errors];
  const n = total / 2;
  if (!Number.isInteger(total) || total < 8 || total > 64 || total % 4 !== 0 || paths.spokes.length !== total ||
      paths.spokes.some(p => !p.valid || p.points.length < 2 || !Number.isFinite(p.traditionalLength) || !Number.isFinite(p.estimatedLength)) ||
      ['Left', 'Right'].some(side => new Set(paths.spokes.filter(p => p.side === side).map(p => p.index)).size !== n)) {
    errors.push('A complete set of valid spoke paths is required. Review hub dimensions, rim geometry and crossing counts.');
  }
  const groupNames = [0, 1, 2, 3].map(g => {
    const right = g % 2 === 0, headsOut = g < 2;
    const crosses = right ? inputs.crossesRight : inputs.crossesLeft;
    return `${right ? 'Right' : 'Left'} ${crosses === 0 ? `radial, heads-${headsOut ? 'out' : 'in'}` : headsOut ? 'trailing' : 'leading'}`;
  });
  const spokes: GuideSpoke[] = paths.spokes.filter(p => p.valid).map(path => {
    const right = path.side === 'Right', crosses = right ? inputs.crossesRight : inputs.crossesLeft;
    const group = (path.headsOut ? 0 : 2) + (right ? 1 : 2);
    const sideLabel = `${path.side} / ${inputs.isRear !== false ? (right ? 'drive' : 'non-drive') : inputs.discType === 'None' ? 'front' : right ? 'non-disc' : 'disc'}`;
    const headsDir = path.headsOut ? 'Heads out (elbows in)' : 'Heads in (elbows out)';
    const rimHoleIndex = (((path.index + (path.headsOut ? 1 : -1) * crosses) % n + n) % n) * 2 + (right ? 2 : 1);
    const pattern = crosses === 0 ? 'Radial pattern: no spoke crossings or weaving.' : path.headsOut ?
      `${crosses}-cross pattern. The opposing spokes will be added in group ${right ? 3 : 4}. Keep this nipple loose for that stage.` :
      !(inputs.interlaced === true) ? `${crosses}-cross, non-interlaced: pass toward the flange’s outside at every crossing; do not weave.` :
      `${crosses}-cross, interlaced: ${crosses > 1 ? 'pass toward the flange’s outside (over) at the earlier crossings, then ' : ''}pass toward the wheel centre (under) at the outermost crossing. Use this same rule on both flanges, each viewed from its own outside.`;
    return { path, sequenceIndex: 0, group, groupName: groupNames[group - 1], side: path.side, sideLabel, viewingLabel: guideViewingLabel(inputs, path.side),
      flangeHoleIndex: path.index + 1, rimHoleIndex, headsDir, instructionParts: [], instructionSteps: [], pattern,
      instruction: '', orientationText: spokeOrientationText(path, guideViewingLabel(inputs, path.side)),
      crosses, crossings: [], length: lengths[right ? 'right' : 'left'].calculatedSpokeLength };
  });
  const angularDistance = (s: GuideSpoke) => (Math.atan2(s.path.end.y, s.path.end.x) - valveAngle + 4 * Math.PI) % (2 * Math.PI);
  spokes.sort((a, b) => a.group - b.group || angularDistance(a) - angularDistance(b));
  // Pair mutual outermost crossings independently of insertion order.
  const outerPartner = (spoke: GuideSpoke) => spokes.filter(other => other.side === spoke.side && other.path.headsOut !== spoke.path.headsOut)
    .map(other => ({other, cross: projectedCrossing(spoke.path.hole,spoke.path.end,other.path.hole,other.path.end)}))
    .filter(c => c.cross && c.cross.t > 0 && c.cross.t < 1)
    .sort((a,b) => b.cross!.t-a.cross!.t)[0]?.other;
  const pairs: GuidePair[] = [];
  const used = new Set<GuideSpoke>();
  for (const side of ['Right','Left'] as const) for (const a of spokes.filter(s => s.side===side && s.path.headsOut)) {
    const b = a.crosses ? outerPartner(a) : spokes.find(s => s.side===side && s.path.index===(a.path.index+1)%n);
    if (!b || b.path.headsOut || used.has(b) || (a.crosses && outerPartner(b)!==a)) {
      errors.push(`${side}: a complete set of mutual crossing pairs is required.`); continue;
    }
    used.add(a); used.add(b); pairs.push({index:pairs.length,side,a,b,instructionSteps:[]});
  }
  if (used.size!==total) errors.push('The spoke pairs are incomplete.');
  if (errors.length) return {key,valid:false,errors:[...new Set(errors)],valveAngle,spokes:[],pairs:[],groupNames,
    groupStarts:[],interlaced:inputs.interlaced===true,total:Number.isFinite(total)?total:0,setup:null};
  spokes.splice(0,spokes.length,...pairs.flatMap(p=>[p.a,p.b]));
  spokes.forEach((s,i)=>{s.sequenceIndex=i;});
  const fromValve = (path: SpokePath) => (Math.atan2(path.hole.y, path.hole.x) - valveAngle + 4 * Math.PI) % (2 * Math.PI);
  const countWords = ['zero', 'one', 'two', 'three', 'four'];
  const countText = (count: number) => countWords[count] ?? String(count);
  const skipText = (distance: number, direction: GuideDirection) => distance === 1 ? `use the very next hole ${direction}: ` :
    `skip ${countText(distance - 1)} ${distance === 2 ? 'hole' : 'holes'} ${direction} and use `;
  spokes.forEach((spoke, i) => {
    const forward = guideDirection(spoke.side, 1);
    spoke.sequenceIndex = i;
    const earlier = spokes.slice(0, i);
    const previous = [...earlier].reverse().find(s => s.side===spoke.side && s.path.headsOut===spoke.path.headsOut);
    const sameGroup = previous?.group === spoke.group;
    // At a group boundary, anchor to the closest already illustrated hole behind
    // the destination. Inside a group, continue from the previous spoke.
    const flangeDistance = (other: GuideSpoke) => (spoke.path.index - other.path.index + n) % n;
    const rimDistance = (other: GuideSpoke) => (spoke.rimHoleIndex - other.rimHoleIndex + total) % total;
    const flangeReference = sameGroup ? previous : earlier.filter(s => s.side === spoke.side).sort((a, b) => flangeDistance(a) - flangeDistance(b))[0];
    const flangeTurn = (other: GuideSpoke) => Math.atan2(
      other.path.hole.x * spoke.path.hole.y - other.path.hole.y * spoke.path.hole.x,
      other.path.hole.x * spoke.path.hole.x + other.path.hole.y * spoke.path.hole.y);
    // The loose hub can rotate after group 1. Establish the opposite flange
    // from an installed spoke, never by finding the valve line again.
    const acrossReference = !flangeReference ? [...earlier].filter(s => s.side !== spoke.side && s.path.headsOut)
      .sort((a, b) => Math.abs(flangeTurn(a)) - Math.abs(flangeTurn(b)))[0] : undefined;
    const rimReference = acrossReference ?? (sameGroup ? previous : [...earlier].sort((a, b) => rimDistance(a) - rimDistance(b))[0]);
    const rimDistanceForward = rimReference ? rimDistance(rimReference) : 0;
    const reverseRim = rimDistanceForward > total / 2;
    const rimSteps = reverseRim ? total - rimDistanceForward : rimDistanceForward;
    const rimDirection = guideDirection(spoke.side, reverseRim ? -1 : 1);
    spoke.referenceFlange = (flangeReference ?? acrossReference)?.path;
    spoke.referenceRim = rimReference?.path;
    if (spoke.path.headsOut && !earlier.some(s=>s.side===spoke.side)) {
      const flangeHoles = paths.spokes.filter(p => p.side === spoke.side);
      const reference = (flangeReference ?? acrossReference)?.path ?? [...flangeHoles].sort((a, b) => fromValve(a) - fromValve(b))[0];
      const clockwise = (reference.index - spoke.path.index + n) % n;
      spoke.groupStart = { first: spoke.path, reference, flangeHoles, valveAngle,
        holeSteps: acrossReference ? Math.abs(flangeTurn(acrossReference)) / (2 * Math.PI / n) : flangeReference ? flangeDistance(flangeReference) : Math.min(clockwise, n - clockwise),
        direction: guideDirection(spoke.side, acrossReference ? flangeTurn(acrossReference) : flangeReference || clockwise > n / 2 ? 1 : -1),
        viewingLabel: spoke.viewingLabel,
        referenceTarget: flangeReference || acrossReference ? 'reference-flange' : 'setup-reference',
        referenceStep: (flangeReference ?? acrossReference) ? (flangeReference ?? acrossReference)!.sequenceIndex + 1 : undefined,
        referenceAcrossHub: !!acrossReference,
        crossed: (spoke.side === 'Right' ? inputs.crossesRight : inputs.crossesLeft) > 0 };
    }
    const parts: GuideInstructionPart[] = [{ text: `On the ${spoke.side.toLowerCase()} flange, ` }];
    if (flangeReference) {
      parts.push({ text: 'start from ' }, { text: sameGroup ? "the previous spoke’s flange hole" : `the flange hole of ${spokeName(flangeReference)} (already attached)`, target: 'reference-flange' },
        { text: `, ${skipText(flangeDistance(flangeReference), forward)}` });
    } else if (acrossReference) {
      parts.push({ text: 'use ' }, { text: `installed ${spokeName(acrossReference)} on the opposite ${acrossReference.side.toLowerCase()} flange`, target: 'reference-flange' },
        { text: ` as your reference. Look parallel to the axle to compare the two flanges. Viewed from the ${spoke.viewingLabel} side, the first staggered hole ${guideDirection(spoke.side, flangeTurn(acrossReference))} of that reference is ` });
    } else if (spoke.groupStart) {
      const setup = spoke.groupStart;
      parts.push({ text: 'find ' }, { text: `the first hole ${forward} of the yellow valve line`, target: 'setup-reference' });
      parts.push({ text: setup.holeSteps === 0 ? '. Use ' :
        `. From there, move ${countText(setup.holeSteps)} hole ${setup.holeSteps === 1 ? 'position' : 'positions'} ${setup.direction} (${setup.holeSteps === 1 ? 'the next hole' : `skip ${countText(setup.holeSteps - 1)} ${setup.holeSteps === 2 ? 'hole' : 'holes'}`}) to ` });
    } else parts.push({ text: 'begin with ' });
    parts.push({ text: 'this flange hole', target: 'flange' },
      { text: `. Feed the spoke through from the ${spoke.path.headsOut ? 'outside' : 'inside'} of the flange. ` });
    const rimStart = parts.length;
    parts.push({ text: 'At the rim, start from ' });
    if (rimReference) {
      parts.push({ text: sameGroup ? "the previous spoke’s rim hole" : `the rim hole assigned to ${spokeName(rimReference)}`, target: 'reference-rim' },
        { text: `, ${skipText(rimSteps, rimDirection)}` });
    } else {
      const pitch = 2 * Math.PI / total;
      const distance = Math.max(1, Math.ceil(angularDistance(spoke) / pitch - 1e-9));
      parts.push({ text: 'the valve hole', target: 'valve' },
        { text: `, count ${countText(distance)} spoke ${distance === 1 ? 'hole' : 'holes'} ${forward} and use ` });
    }
    parts.push({ text: 'this rim hole', target: 'rim' }, { text: '. ' }, { text: spoke.pattern });
    spoke.instructionSteps = [parts.slice(0, rimStart), parts.slice(rimStart, -1), [parts.at(-1)!]];
    spoke.instructionParts = parts;
    spoke.instruction = parts.map(part => part.text).join('');
  });
  for (const spoke of spokes) {
    // Derive all crossings from the routed shafts, in hub-to-rim order.
    // Availability is filtered after validating the complete geometry.
    const pair = pairs[Math.floor(spoke.sequenceIndex/2)];
    const partner = spoke===pair.a ? pair.b : pair.a;
    const candidates = spokes
      .filter(other => other.side === spoke.side && other.path.headsOut !== spoke.path.headsOut)
      .map(other => ({ other, cross: shaftCrossing(spoke.path, other.path) }))
      .filter((c): c is {other: GuideSpoke; cross: NonNullable<ReturnType<typeof shaftCrossing>>} => !!c.cross)
      .sort((a,b) => Math.hypot(a.cross.point.x-spoke.path.start.x,a.cross.point.y-spoke.path.start.y) -
        Math.hypot(b.cross.point.x-spoke.path.start.x,b.cross.point.y-spoke.path.start.y));
    spoke.crossings = candidates.map(({other,cross}, index) => {
      const outermost = index === candidates.length-1;
      const towardOutside = (cross.point.z-cross.otherZ)*(spoke.side === 'Right' ? 1 : -1) > 0;
      const position = towardOutside ? 'toward the flange’s outside (over, toward you)' : 'toward the wheel centre (under, away from you)';
      return {spoke, other, otherStep: other.sequenceIndex+1, number: index+1, outermost, towardOutside,
        point: cross.point, target: `crossing-${index}` as const,
        description: `Crossing ${index+1} of ${candidates.length}${outermost ? ' — outermost' : index===0 ? ' — nearest the hub' : ''}: pass ${position} relative to ${other===partner ? `loose partner ${other.path.headsOut?'A':'B'} (${spokeName(other)})` : `installed ${spokeName(other)}` }.`};
    });
    if (spoke.crossings.length !== spoke.crosses)
      errors.push(`${spoke.side} spoke ${spoke.flangeHoleIndex}: incomplete crossing references.`);
    if (spoke.crossings.some(c => c.towardOutside !== (spoke.path.headsOut ? ((inputs.interlaced === true) && c.outermost) : !((inputs.interlaced === true) && c.outermost))))
      errors.push(`${spoke.side} spoke ${spoke.flangeHoleIndex}: crossing layers do not match the selected pattern.`);
    // Only reference installed spokes and this pair's explicitly loose partner.
    spoke.crossings = spoke.crossings.filter(c=>c.other===partner || c.other.sequenceIndex < pair.index*2);
    spoke.pattern = spoke.crosses===0 ? 'Radial: no crossings or weave.' : inputs.interlaced===true ?
      'Interlaced: change layers only at the outermost crossing.' :
      'Non-interlaced: A stays toward the wheel centre and B toward the flange’s outside at every crossing.';
  }
  for (const pair of pairs) {
    const {a,b}=pair;
    const remap = (parts: GuideInstructionPart[], prefix: string): GuideInstructionPart[] => parts.map(part=>({
      ...part, text: part.text.replace(/already attached/g,'already positioned').replace(/previous spoke/g,prefix?'previous heads-in spoke':'previous heads-out spoke'),
      target: part.target && prefix && ['flange','rim','reference-flange','reference-rim'].includes(part.target) ? `b-${part.target}` as LacingTarget : part.target,
    }));
    pair.instructionSteps = [
      [{text:'Support the rim with axle clearance. Work with only this loose pair; do not load the whole hub. Attach neither nipple yet.'}],
      [{text:`A — ${a.headsDir}. Insert from outside. `},...remap(a.instructionSteps[0],'')],
      [{text:'A rim destination (leave unattached): '},...remap(a.instructionSteps[1],'')],
      [{text:'Hold A by its shaft to prevent it falling out. Tilt or turn the supported wheel to reach the inside flange face while holding A clear. Insert B from inside; its head must sit on the opposite face from A.'}],
      [{text:`B — ${b.headsDir}. `},...remap(b.instructionSteps[0],'b')],
      [{text:'B rim destination (leave unattached): '},...remap(b.instructionSteps[1],'b')],
      [{text:`Viewed from the ${a.viewingLabel} side: ${a.pattern} Position both routes before attaching either nipple.${a.crosses ? " Crossing numbers count from hub to rim; only the loose partner and already installed spokes are listed. Remaining crossings form as later pairs are added." : ""}`}],
      ...[a,b].flatMap(spoke=>spoke.crossings.map(c=>[{text:`${spoke===a?'A':'B'}: ${c.description}`,target:spoke===a?c.target:`b-${c.target}` as LacingTarget}])),
      [{text:'Check one head is outside and the other inside the flange. Support both spokes, then attach both nipples loosely, only enough to retain the threads. If obstructed, stop and reposition; do not force either spoke.'}],
    ];
    for (const spoke of [a,b]) {
      spoke.instructionSteps=pair.instructionSteps;
      spoke.instructionParts=pair.instructionSteps.flat();
      spoke.instruction=pair.instructionSteps.map(parts=>parts.map(p=>p.text).join('')).join(' ');
    }
  }

  if ([1, 2, 3, 4].some(g => spokes.filter(s => s.group === g).length !== total / 4)) errors.push('The four spoke groups are incomplete.');
  const valid = errors.length === 0;
  return { key, valid, errors: [...new Set(errors)], valveAngle, spokes: valid ? spokes : [], pairs:valid?pairs:[], groupNames,
    interlaced: (inputs.interlaced === true),
    groupStarts: valid ? [1,pairs.findIndex(p=>p.side==='Left')+1] : [], total: Number.isFinite(total) ? total : 0,
    setup: valid ? spokes[0]?.groupStart ?? null : null };
}

export function reconcileGuide(state: GuideState, guide: LacingGuide): GuideState {
  if (state.key !== guide.key) return { ...state, key: guide.key, step: 0, preview: false,
    notice: state.key ? 'Build changed. The guide has returned to Setup.' : '' };
  if (!guide.valid) return { ...state, step: 0, preview: false };
  return { ...state, step: Math.max(0, Math.min(guide.pairs.length, Math.trunc(state.step) || 0)) };
}

export function transitionGuide(state: GuideState, guide: LacingGuide, action: GuideAction): GuideState {
  const next = reconcileGuide(state, guide);
  if (action === 'fixed' || action === 'track') return { ...next, cameraTracking: action === 'track' };
  if (action === 'reset') return { ...next, step: 0, preview: false, notice: '' };
  if (!guide.valid) return next;
  if (action === 'preview' || action === 'return') return { ...next, preview: action === 'preview' };
  if (next.preview) return next;
  if (action === 'next') next.step = Math.min(guide.pairs.length, next.step + 1);
  if (action === 'previous') next.step = Math.max(0, next.step - 1);
  if (action === 'next-group') next.step = guide.groupStarts.find(s => s > next.step) ?? next.step;
  if (action === 'previous-group') next.step = [...guide.groupStarts].reverse().find(s => s < next.step) ?? 0;
  next.notice = '';
  return next;
}

export function guideSnapshot(state: GuideState, guide: LacingGuide) {
  const activePair = guide.valid && state.step>0 ? guide.pairs[state.step-1] ?? null : null;
  const targetPair = activePair ?? guide.pairs[0] ?? null;
  const activeSpoke = activePair?.a ?? null, targetSpoke = targetPair?.a ?? null;
  const representedSpokes = Math.min(state.step*2,guide.total);
  const spokeSelection = guide.valid && !state.preview && targetSpoke ? {
    label:targetSpoke.sideLabel, estimatedLength:targetSpoke.path.estimatedLength,
    roundedLength:Math.round(targetSpoke.length), traditionalLength:targetSpoke.length,
  } : null;
  const atHalfway = guide.valid && state.step===guide.pairs.length/2;
  const atEnd = guide.valid && state.step===guide.pairs.length;
  const orientationCheckpoint = !state.preview && (atHalfway || atEnd) ?
    `${atEnd?'Both flanges complete.':'Right flange complete. Check before moving to the left.'} Check adjacent flange holes alternate heads-out and heads-in. ${targetPair?.a.pattern} Trace every spoke from its assigned flange hole to its rim hole. Length alone does not confirm orientation. These are intended positions, not a physical handling or J-bend seating simulation.` : null;
  return {...state,valid:guide.valid,errors:guide.errors,totalSpokes:guide.total,totalPairs:guide.pairs.length,
    interlaced:guide.interlaced,spokeSelection,orientationCheckpoint,representedSpokes,
    valveAngle:guide.valveAngle,installedSpokes:guide.spokes.slice(0,Math.max(0,(state.step-1)*2)),
    checkpointTitle:atEnd?'Final routing check':'Halfway: right flange routing check',
    setup:guide.valid&&!state.preview ? targetSpoke?.groupStart??null:null,
    percent:guide.valid?Math.round(representedSpokes/guide.total*100):null,
    activePair,targetPair,activeSpoke,targetSpoke,
    currentGroups:activePair?[activePair.a.group,activePair.b.group]:[],groupNames:guide.groupNames,
    groupCounts:[1,2,3,4].map(g=>guide.spokes.slice(0,representedSpokes).filter(s=>s.group===g).length),
    groupTotals:[1,2,3,4].map(g=>guide.spokes.filter(s=>s.group===g).length),
    canPrevious:guide.valid&&!state.preview&&state.step>0,
    canNext:guide.valid&&!state.preview&&state.step<guide.pairs.length,
    canNextGroup:guide.valid&&!state.preview&&guide.groupStarts.some(s=>s>state.step),
  };
}
export type LacingSnapshot = ReturnType<typeof guideSnapshot>;
declare global {
  interface WindowEventMap { 'lacing-update': CustomEvent<LacingSnapshot> }
  interface WindowEventMap { 'lacing-view-change': CustomEvent<string> }
}
