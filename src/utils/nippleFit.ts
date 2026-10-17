import type { SpokePath, Point3 } from './spokePath.ts';

export const fitNumericFields = {
  purchasedLengthLeft: 'fit-length-left', purchasedLengthRight: 'fit-length-right',
  spokeThreadLeft: 'fit-thread-left', spokeThreadRight: 'fit-thread-right',
  erdReferenceThread: 'fit-erd-thread', nippleLength: 'fit-nipple-length',
  nippleLeadIn: 'fit-lead-in', nippleSlotDepth: 'fit-slot-depth', nippleHeadHeight: 'fit-head-height',
  nippleWrenchLength: 'fit-wrench-length', nippleBarrelLength: 'fit-barrel-length',
  nippleHeadDiameter: 'fit-head-diameter', nippleBodyDiameter: 'fit-body-diameter',
} as const;
export type NippleFitSettings = Record<keyof typeof fitNumericFields, number | null>;
export const nippleFitDefaults: NippleFitSettings = {
  purchasedLengthLeft: null, purchasedLengthRight: null, spokeThreadLeft: 9, spokeThreadRight: 9,
  erdReferenceThread: 9, nippleLength: 12, nippleLeadIn: 2, nippleSlotDepth: 1, nippleHeadHeight: 3,
  nippleWrenchLength: 4.5, nippleBarrelLength: 4.5, nippleHeadDiameter: 6, nippleBodyDiameter: 4,
};
/** Illustrative dimensions for this nominal 2 mm profile, not a thread specification. */
export const nippleProfileConstants = {
  nominalSpokeDiameter: 2, minimumBodyDiameter: 2.6,
  boreRadius: 1.12, wrenchHalfWidth: 1.65, slotHalfWidth: .55,
  threadMarkerSpacing: .5,
  internalMarkerOffset: .2, internalMarkerHeight: .12,
  internalMarkerOuterRadius: 1.17, internalMarkerInnerRadius: 1.02,
  spokeMarkerOffset: .15, spokeMarkerHeight: .07, spokeMarkerRadius: 1.015,
} as const;

export interface NippleReferences {
  opening: number;
  calibratedTipReference: number;
  internalStart: number;
  internalEnd: number;
  taperStart: number;
  slotFloor: number;
  headTop: number;
}

/** Axial millimetres from the hub-facing opening. Callers validate the profile first.
 * Taper start is not a measured bearing surface; rim contact remains schematic. */
export function nippleReferences(s: NippleFitSettings): NippleReferences {
  return {opening: 0, calibratedTipReference: s.erdReferenceThread!, internalStart: s.nippleLeadIn!,
    internalEnd: s.nippleLength! - s.nippleSlotDepth!, taperStart: s.nippleLength! - s.nippleHeadHeight!,
    slotFloor: s.nippleLength! - s.nippleSlotDepth!, headTop: s.nippleLength!};
}
export function fitSettingsFrom(config: Partial<NippleFitSettings>): NippleFitSettings {
  return Object.fromEntries(Object.entries(nippleFitDefaults).map(([key, value]) =>
    [key, config[key as keyof NippleFitSettings] === undefined ? value : config[key as keyof NippleFitSettings]])) as NippleFitSettings;
}
export function nippleProfileError(s: NippleFitSettings): string | null {
  const values = [s.erdReferenceThread, s.nippleLength, s.nippleLeadIn, s.nippleSlotDepth, s.nippleHeadHeight,
    s.nippleWrenchLength, s.nippleBarrelLength, s.nippleHeadDiameter, s.nippleBodyDiameter];
  if (!values.every(v => v !== null && Number.isFinite(v)) || s.erdReferenceThread! <= 0 ||
    s.nippleLength! <= 0 || s.nippleLeadIn! < 0 || s.nippleSlotDepth! <= 0 || s.nippleHeadHeight! <= 0 ||
    s.nippleLeadIn! >= s.nippleLength! - s.nippleSlotDepth! || s.nippleHeadHeight! >= s.nippleLength! ||
    s.nippleSlotDepth! >= s.nippleHeadHeight!) return 'Enter a valid nipple profile: entry before thread end, and slot depth smaller than head height.';
  // Limit detailed meshes to useful physical scales, including malformed shared links.
  if (values.some(v => v! > 100)) return 'Nipple and reference dimensions must be at most 100 mm.';
  if (s.nippleWrenchLength! <= 0 || s.nippleBarrelLength! <= 0 ||
    s.nippleWrenchLength! + s.nippleBarrelLength! + s.nippleHeadHeight! > s.nippleLength! + 1e-8 ||
    s.nippleBodyDiameter! <= nippleProfileConstants.minimumBodyDiameter || s.nippleHeadDiameter! < s.nippleBodyDiameter!)
    return 'Nipple sections must fit within the overall length, and the head diameter must be at least the body diameter.';
  return null;
}
export type NippleFit = { valid: false; error: string } | {
  valid: true; purchasedLength: number; threadLength: number; delta: number; traditionalDelta: number;
  references: NippleReferences;
  tip: number; threadStart: number; internalStart: number; internalEnd: number;
  engagement: number; exposedThread: number; slotOffset: number; protrusion: number;
  remainingTravel: number; runoutExceeded: number; taperStart: number;
};
/** All axial coordinates run from the hub-facing opening (0) towards the head. */
export function calculateNippleFit(path: SpokePath, s: NippleFitSettings, spokeDiameter: number = nippleProfileConstants.nominalSpokeDiameter): NippleFit {
  const error = nippleProfileError(s);
  if (error) return { valid: false, error };
  if (!Number.isFinite(spokeDiameter) || Math.abs(spokeDiameter - nippleProfileConstants.nominalSpokeDiameter) > 1e-6)
    return { valid: false, error: 'This nipple profile is for nominal 2 mm spokes. Select a 2 mm physical spoke diameter to inspect fit.' };
  const left = path.side === 'Left';
  const purchasedLength = (left ? s.purchasedLengthLeft : s.purchasedLengthRight) ?? Math.round(path.traditionalLength);
  const threadLength = left ? s.spokeThreadLeft : s.spokeThreadRight;
  if (!path.valid || !Number.isFinite(path.estimatedLength) || !Number.isFinite(purchasedLength) || purchasedLength <= 0 || purchasedLength > 2000 ||
    threadLength === null || !Number.isFinite(threadLength) || threadLength <= 0 || threadLength > 100 || threadLength > purchasedLength)
    return { valid: false, error: 'Enter valid wheel geometry, purchased length and spoke threaded length.' };
  const delta = purchasedLength - path.estimatedLength;
  const finalStart = path.points.at(-2);
  if (!finalStart || Math.hypot(path.end.x-finalStart.x,path.end.y-finalStart.y,path.end.z-finalStart.z) + delta <= 0)
    return { valid: false, error: 'This spoke is too short to reach the final modeled span.' };
  const references = nippleReferences(s);
  const tip = references.calibratedTipReference + delta, threadStart = tip - threadLength;
  const {internalStart, internalEnd, taperStart} = references;
  return { valid: true, purchasedLength, threadLength, delta, traditionalDelta: purchasedLength - path.traditionalLength,
    references, tip, threadStart, internalStart, internalEnd,
    engagement: Math.max(0, Math.min(tip,internalEnd)-Math.max(threadStart,internalStart)),
    exposedThread: Math.max(0, Math.min(tip,references.opening)-threadStart), slotOffset: tip-references.slotFloor,
    protrusion: Math.max(0,tip-references.headTop), remainingTravel: Math.max(0,internalStart-threadStart),
    runoutExceeded: Math.max(0,threadStart-internalStart), taperStart };
}
export function purchasedSpokePoints(path: SpokePath, fit: NippleFit): Point3[] {
  if (!fit.valid) return path.points.map(p => ({...p}));
  const previous = path.points.at(-2)!, end = path.end;
  const length = Math.hypot(end.x-previous.x,end.y-previous.y,end.z-previous.z);
  return [...path.points.slice(0,-1).map(p=>({...p})), {
    x: end.x+(end.x-previous.x)/length*fit.delta,
    y: end.y+(end.y-previous.y)/length*fit.delta,
    z: end.z+(end.z-previous.z)/length*fit.delta,
  }];
}
