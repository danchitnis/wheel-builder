import { calculateWheelBuild, type WheelBuildInputs } from './physicsCalculator.ts';
import type { SpokePath, SpokePaths } from './spokePath';

export type LacingTarget = 'flange' | 'rim' | 'valve' | 'reference-flange' | 'reference-rim' | 'setup-reference' | 'alignment' | 'logo';
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
}
export interface LacingGuide {
  key: string;
  valid: boolean;
  errors: string[];
  valveAngle: number;
  spokes: GuideSpoke[];
  groupNames: string[];
  groupStarts: number[];
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
  return JSON.stringify(keys.map(key => inputs[key]));
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
    const pattern = crosses === 0 ? 'Radial pattern: no spoke crossings or weaving.' :
      !inputs.interlaced ? `${crosses}-cross pattern, non-interlaced: do not weave the spokes.` :
      path.headsOut ? `${crosses}-cross, interlaced pattern. The opposing heads-in spokes are added in a later group.` :
      `${crosses}-cross, interlaced pattern. Follow the illustrated path, interlacing at the final crossing with the heads-out spokes on this side.`;
    return { path, sequenceIndex: 0, group, groupName: groupNames[group - 1], side: path.side, sideLabel, viewingLabel: guideViewingLabel(inputs, path.side),
      flangeHoleIndex: path.index + 1, rimHoleIndex, headsDir, instructionParts: [], instructionSteps: [], pattern,
      instruction: '', orientationText: spokeOrientationText(path, guideViewingLabel(inputs, path.side)),
      length: lengths[right ? 'right' : 'left'].calculatedSpokeLength };
  });
  const angularDistance = (s: GuideSpoke) => (Math.atan2(s.path.end.y, s.path.end.x) - valveAngle + 4 * Math.PI) % (2 * Math.PI);
  spokes.sort((a, b) => a.group - b.group || angularDistance(a) - angularDistance(b));
  const fromValve = (path: SpokePath) => (Math.atan2(path.hole.y, path.hole.x) - valveAngle + 4 * Math.PI) % (2 * Math.PI);
  const countWords = ['zero', 'one', 'two', 'three', 'four'];
  const countText = (count: number) => countWords[count] ?? String(count);
  const skipText = (distance: number, direction: GuideDirection) => distance === 1 ? `use the very next hole ${direction}: ` :
    `skip ${countText(distance - 1)} ${distance === 2 ? 'hole' : 'holes'} ${direction} and use `;
  spokes.forEach((spoke, i) => {
    const forward = guideDirection(spoke.side, 1);
    spoke.sequenceIndex = i;
    const earlier = spokes.slice(0, i);
    const previous = earlier.at(-1);
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
    const acrossReference = !flangeReference ? [...earlier].filter(s => s.side !== spoke.side)
      .sort((a, b) => Math.abs(flangeTurn(a)) - Math.abs(flangeTurn(b)))[0] : undefined;
    const rimReference = acrossReference ?? (sameGroup ? previous : [...earlier].sort((a, b) => rimDistance(a) - rimDistance(b))[0]);
    const rimDistanceForward = rimReference ? rimDistance(rimReference) : 0;
    const reverseRim = !!acrossReference && rimDistanceForward > total / 2;
    const rimSteps = reverseRim ? total - rimDistanceForward : rimDistanceForward;
    const rimDirection = guideDirection(spoke.side, reverseRim ? -1 : 1);
    spoke.referenceFlange = (flangeReference ?? acrossReference)?.path;
    spoke.referenceRim = rimReference?.path;
    if (!sameGroup) {
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
      parts.push({ text: 'start from ' }, { text: sameGroup ? "the previous spoke’s flange hole" : `the flange hole of the spoke installed at step ${flangeReference.sequenceIndex + 1}`, target: 'reference-flange' },
        { text: `, ${skipText(flangeDistance(flangeReference), forward)}` });
    } else if (acrossReference) {
      parts.push({ text: 'use ' }, { text: `the spoke installed at step ${acrossReference.sequenceIndex + 1} on the opposite ${acrossReference.side.toLowerCase()} flange`, target: 'reference-flange' },
        { text: ` as your reference. Look parallel to the axle to compare the two flanges. Viewed from the ${spoke.viewingLabel} side, the first staggered hole ${spoke.groupStart!.direction} of that reference is ` });
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
      parts.push({ text: sameGroup ? "the previous spoke’s rim hole" : `the rim hole of the spoke installed at step ${rimReference.sequenceIndex + 1}`, target: 'reference-rim' },
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
  if ([1, 2, 3, 4].some(g => spokes.filter(s => s.group === g).length !== total / 4)) errors.push('The four spoke groups are incomplete.');
  const valid = errors.length === 0;
  return { key, valid, errors: [...new Set(errors)], valveAngle, spokes: valid ? spokes : [], groupNames,
    groupStarts: valid ? [1, 2, 3, 4].map(g => spokes.findIndex(s => s.group === g) + 1) : [], total: Number.isFinite(total) ? total : 0,
    setup: valid ? spokes[0]?.groupStart ?? null : null };
}

export function reconcileGuide(state: GuideState, guide: LacingGuide): GuideState {
  if (state.key !== guide.key) return { ...state, key: guide.key, step: 0, preview: false,
    notice: state.key ? 'Build changed. The guide has returned to Setup.' : '' };
  if (!guide.valid) return { ...state, step: 0, preview: false };
  return { ...state, step: Math.max(0, Math.min(guide.total, Math.trunc(state.step) || 0)) };
}

export function transitionGuide(state: GuideState, guide: LacingGuide, action: GuideAction): GuideState {
  const next = reconcileGuide(state, guide);
  if (action === 'fixed' || action === 'track') return { ...next, cameraTracking: action === 'track' };
  if (action === 'reset') return { ...next, step: 0, preview: false, notice: '' };
  if (!guide.valid) return next;
  if (action === 'preview' || action === 'return') return { ...next, preview: action === 'preview' };
  if (next.preview) return next;
  if (action === 'next') next.step = Math.min(guide.total, next.step + 1);
  if (action === 'previous') next.step = Math.max(0, next.step - 1);
  if (action === 'next-group') next.step = guide.groupStarts.find(s => s > next.step) ?? next.step;
  if (action === 'previous-group') next.step = [...guide.groupStarts].reverse().find(s => s < next.step) ?? 0;
  next.notice = '';
  return next;
}

export function guideSnapshot(state: GuideState, guide: LacingGuide) {
  const activeSpoke = guide.valid && state.step > 0 ? guide.spokes[state.step - 1] : null;
  const targetSpoke = activeSpoke ?? guide.spokes[0] ?? null;
  // Use the same per-side calculation and rounding as the main calculator.
  const spokeSelection = guide.valid && !state.preview && targetSpoke ? {
    label: targetSpoke.sideLabel,
    estimatedLength: targetSpoke.path.estimatedLength,
    roundedLength: Math.round(targetSpoke.length),
    traditionalLength: targetSpoke.length,
  } : null;
  let orientationCheckpoint: string | null = null;
  if (guide.valid && !state.preview && state.step === guide.total / 2) {
    const firstGroups = [1, 2].map(group => guide.spokes.find(spoke => spoke.group === group)!);
    const [right, left] = firstGroups.map(spoke => spokeOrientation(spoke.path));
    const equalCross = right.degrees > 1e-6 && Math.abs(right.degrees - left.degrees) < 1e-6;
    const directions = firstGroups.map(spoke =>
      spoke.orientationText).join('\n\n');
    orientationCheckpoint = `Before group 3, trace each installed spoke from hub to rim. View each flange from its own outside.\n\n${directions}\n\n${
      equalCross ? 'For this equal-cross pattern, an opposite-slope hub position can fit the same calculated lengths. Length alone does not confirm orientation.\n\n' : ''
    }Match the illustrated direction and hole connections. Logo alignment is cosmetic.`;
  }
  return { ...state, valid: guide.valid, errors: guide.errors, totalSpokes: guide.total,
    spokeSelection, orientationCheckpoint,
    setup: guide.valid && !state.preview ? (state.step === 0 ? guide.setup : activeSpoke?.groupStart ?? null) : null,
    percent: guide.valid ? Math.round(state.step / guide.total * 100) : null,
    activeSpoke, targetSpoke,
    currentGroup: activeSpoke?.group ?? 0, groupNames: guide.groupNames,
    groupCounts: [1, 2, 3, 4].map(g => guide.spokes.slice(0, state.step).filter(s => s.group === g).length),
    groupTotals: [1, 2, 3, 4].map(g => guide.spokes.filter(s => s.group === g).length),
    canPrevious: guide.valid && !state.preview && state.step > 0,
    canNext: guide.valid && !state.preview && state.step < guide.total,
    canNextGroup: guide.valid && !state.preview && guide.groupStarts.some(s => s > state.step),
  };
}
export type LacingSnapshot = ReturnType<typeof guideSnapshot>;
declare global {
  interface WindowEventMap { 'lacing-update': CustomEvent<LacingSnapshot> }
  interface WindowEventMap { 'lacing-view-change': CustomEvent<string> }
}
