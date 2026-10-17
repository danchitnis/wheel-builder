import probe1Export from '../components/workshop/fusionProbe1Mesh.json' with { type: 'json' };
import fusionHolderMeshes from '../components/workshop/fusionHolderMeshes.json' with { type: 'json' };
import radialExport from '../components/workshop/fusionRadialHolderMeshes.json' with { type: 'json' };
import radialSpec from '../data/radialHolder.json' with { type: 'json' };
import hubCapSpec from '../data/hubSupportCap.json' with { type: 'json' };
import hubCapExport from '../components/workshop/fusionHubCapMeshes.json' with { type: 'json' };
import { hubs } from '../data/hubs.ts';
import type { WheelBuildInputs } from './physicsCalculator.ts';
import { fitSettingsFrom } from './nippleFit.ts';
import { parseConfiguration, restoreConfiguration, serializeConfiguration, BUILD_SESSION_KEY, type BuildConfiguration, type BuildStorage } from './buildConfiguration.ts';

export const cornerBracketDimensions = { leg:50, width:18, thickness:9, holeOffset:40, bore:6 } as const;
export type Vec3 = [number, number, number];
export const radialHolderDimensions = radialSpec.parameters;
export const hubCapDimensions = {
  ...hubCapSpec.parameters,
  outer: hubCapSpec.parameters.profile_width + hubCapSpec.parameters.socket_clearance + 2 * hubCapSpec.parameters.wall,
  seatCenterHeight: (diameter:number) => hubCapSpec.parameters.v_apex + diameter / (2 * Math.sin(Math.PI / 4)),
};
export type ToolKind = 'stand' | 'dish';
export type Axle = '' | 'qr9' | 'qr10' | '12' | '15' | '20';
// Profile families verified against https://www.motedis.com/en/cad-database
export const profiles = {
  '2020': { size: 20, slot: 6, family: 'B-type slot 6', bolt: 'M5', bracket: 20 },
  '3030': { size: 30, slot: 8, family: 'B-type slot 8', bolt: 'M6', bracket: 30 },
  '4040': { size: 40, slot: 8, family: 'I-type slot 8', bolt: 'M8', bracket: 40 },
} as const;
export type Profile = keyof typeof profiles;
export interface WorkshopSettings {
  version: 1; profile: Profile; lengths: number[]; axle: Axle;
  hubWidth: number | null; rimDiameter: number | null;
  seatLeft: number | null; seatRight: number | null; projection: number | null; guideRod: boolean; dialLugHole: number; dialLugThickness: number; dialLugOffset: number;
  dishAllowance: number; mode: 'pointers' | 'dials'; fit: number; tool: ToolKind;
  observations: string; readings: string; reverseA: string; reverseB: string; dishGap: string;
}
export const WORKSHOP_KEY = 'wheel-builder:workshop:v1';
export function inferAxle(spacing: string): { axle: Axle; hubWidth: number | null } {
  if (spacing.includes('/')) return { axle: '', hubWidth: null };
  const through = spacing.match(/^\s*(12|15|20)\s*x\s*(\d+)\s*mm/i);
  if (through) return { axle: through[1] as Axle, hubWidth: +through[2] };
  const width = spacing.match(/^\s*(\d+)\s*mm\s*$/i);
  return { axle: '', hubWidth: width ? +width[1] : null };
}
export function workshopDefaults(config: BuildConfiguration): WorkshopSettings {
  return { version: 1, profile: '2020', lengths: [300,400,500,600,700,800,900,1000],
    ...inferAxle(config.spacing), seatLeft:null, seatRight:null, projection:null, guideRod:false, dialLugHole:6.85, dialLugThickness:5.2, dialLugOffset:10.25, rimDiameter: null, dishAllowance:5, mode: 'pointers', fit: 0.3, tool: 'stand',
    observations: '', readings: '', reverseA: '', reverseB: '', dishGap: '' };
}
// Fit overrides belong to a wheel snapshot. A different wheel must not inherit them.
export function loadWorkshop(raw: string | null, config: BuildConfiguration): WorkshopSettings {
  const defaults = workshopDefaults(config);
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || saved.version !== 1 || !saved.settings) return defaults;
    const v = saved.settings;
    const same = saved.design === 16 && saved.wheel === serializeConfiguration(config, false);
    const n = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
    return { ...defaults,
      profile: Object.hasOwn(profiles, v.profile) ? v.profile : defaults.profile,
      lengths: Array.isArray(v.lengths) && v.lengths.length > 0 && v.lengths.length <= 50 && v.lengths.every((x: unknown) => n(x, 100, 2000) && Number.isInteger(x)) ? [...new Set<number>(v.lengths)].sort((a,b)=>a-b) : defaults.lengths,
      dialLugHole:6.85, dialLugThickness:5.2, dialLugOffset:10.25,
      dishAllowance:n(v.dishAllowance,1,15)?v.dishAllowance:5,
      mode: v.mode === 'dials' ? 'dials' : 'pointers', tool: v.tool === 'dish' ? 'dish' : 'stand',
      fit: n(v.fit, 0, 1) ? v.fit : defaults.fit,
      ...(same ? { axle: ['', 'qr9', 'qr10', '12', '15', '20'].includes(v.axle) ? v.axle : defaults.axle,
        seatLeft:n(v.seatLeft,6,35)?v.seatLeft:null, seatRight:n(v.seatRight,6,35)?v.seatRight:null, projection:n(v.projection,3,20)?v.projection:null, guideRod:v.guideRod===true,
        hubWidth: n(v.hubWidth, 70, 250) ? v.hubWidth : defaults.hubWidth,
        rimDiameter: n(v.rimDiameter, 250, 850) ? v.rimDiameter : null,
        ...Object.fromEntries(['observations','readings','reverseA','reverseB','dishGap'].map(k => [k, typeof v[k] === 'string' ? v[k].slice(0, 4000) : ''])) } : {}),
    };
  } catch { return defaults; }
}
export function workshopSnapshot(settings: WorkshopSettings, config: BuildConfiguration) {
  return JSON.stringify({ version: 1, design: 16, wheel: serializeConfiguration(config, false), settings });
}
export function resolveWorkshopWheel(fragment: string, storage: () => BuildStorage) {
  const restored = restoreConfiguration(fragment, storage);
  let source = restored.imported ? 'Wheel transferred from builder' : 'Default wheel — no saved build';
  if (!restored.imported) {
    try { if (parseConfiguration(storage().getItem(BUILD_SESSION_KEY) ?? '').kind === 'configuration') source = 'Saved wheel from this tab'; } catch { /* optional storage */ }
  }
  return { ...restored, source };
}
export function stockLength(required: number, available: number[]) {
  return [...available].sort((a,b)=>a-b).find(n => Number.isFinite(n) && n >= required) ?? null;
}
export function parseStock(text: string): number[] | null {
  const tokens = text.trim().split(/[\s,]+/);
  if (tokens.length > 50 || tokens.some(x => !/^\d+$/.test(x) || +x < 100 || +x > 2000)) return null;
  return [...new Set(tokens.map(Number))].sort((a,b)=>a-b);
}
export function repeatability(raw: string) {
  const entries = raw.trim().split(/[\s,;]+/);
  const valid = entries.every(x=>x !== '' && Number.isFinite(Number(x)));
  if (!valid || entries.length < 3) return null;
  const values = entries.map(Number), spread = Math.max(...values)-Math.min(...values);
  return { count: values.length, spread, passes: spread <= 0.2 + 1e-9 };
}
export function reversal(a: number, b: number) { return { jigBias: (a+b)/2, wheelOffset: (a-b)/2 }; }
export function dishOffset(gap: number) { return gap / 2; }

export interface Part {
  id: string; sku: string; name: string; kind: 'extrusion' | 'pla' | 'metal' | 'gauge' | 'hardware';
  probeRole?: 'lateral'|'radial'|'dish'; probeBolt?:number;
  meshKey?: keyof typeof fusionHolderMeshes;
  radialMeshKey?: keyof typeof radialExport.meshes;
  capDesign?: 'centred-v2';
  shape: 'probe1' | 'fusion-mesh' | 'box' | 'cylinder' | 'ring' | 'hub-spacer' | 'angle' | 'top-cap' | 'photo-bracket'; bore?: number; size: Vec3; position: Vec3; axis?: 'x' | 'y' | 'z';
  stock?: number; spec: string; stage: number;
  rotation?: Vec3; profileSize?: number; fit?: number; seatHeight?: number; nose?: number;
  counterbore?:number; counterboreDepth?:number;
  bendLegs?: [[number,number],[number,number]];
  print?: {bed:string; supports:string; accuracy:string};
  movesWithWheel?: boolean; measurementAxis?: 'x' | 'y';
}
export interface Assembly {
  dishing?: {bridgeLength:number;armLength:number;jointHalfSpan:number;contactAlongFoot:number;connectorAngle:135};
  hubSupport?: { minimumUprightSpacing:number; uprightSpacing:number; rodRequired:boolean; spacerLength:number; spacerDiameter:number };
  radialMount?: { uprightSpan:number; leftBolt:number; bridgeShift:number; rightBolt:number; desiredDialX:number; dialX:number; origin:Vec3; tip:Vec3; direction:Vec3; tiltDegrees:number; alignmentErrorDegrees:number };
  probe?: {nominal:number;min:number;max:number;inward:number;outward:number;allowance:number;rodLength:number;stopReach:number}; parts: Part[]; errors: string[]; notes: string[]; steps: string[];
  wheel: { inputs: WheelBuildInputs; diameter: number; width: number; depth: number; hubWidth: number; axleDiameter: number; center: Vec3; spokes: number; left: number; right: number; flangeL: number; flangeR: number; offset: number };
  title: string; estimated: boolean;
}
export interface BomRow { sku: string; name: string; kind: Part['kind']; quantity: number; dimensions: string; spec: string; ids: string[] }
export function billOfMaterials(parts: Part[]): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const p of parts) {
    const row = rows.get(p.sku);
    if (row) { row.quantity++; row.ids.push(p.id); }
    else rows.set(p.sku, { sku:p.sku, name:p.name, kind:p.kind, quantity:1,
      dimensions:p.stock ? `${Math.min(...p.size)} × ${Math.min(...p.size)} × ${p.stock} mm stock` : `${p.size.map(n=>+n.toFixed(2)).join(' × ')} mm`, spec:p.spec, ids:[p.id] });
  }
  return [...rows.values()];
}
export function bomCsv(assembly: Assembly) {
  const quote = (v: string | number) => `"${String(v).replaceAll('"','""')}"`;
  const rows: (string|number)[][] = [['Design', assembly.title], ['Status', assembly.errors.length ? 'UNRESOLVED — '+assembly.errors.join('; ') : 'Geometry checked; physically calibrate before use'],
    ['Rim diameter', `${assembly.wheel.diameter} mm (${assembly.estimated?'estimated':'user measured'})`],
    ...(assembly.probe?[['Probe reach',`${assembly.probe.min}–${assembly.probe.max} mm; setup ${assembly.probe.nominal.toFixed(1)} mm; requested reserve ±${assembly.probe.allowance} mm`]]:[]),
    ['Part','Quantity','Type','Dimensions / stock','Specification'], ...billOfMaterials(assembly.parts).map(r=>[r.name,r.quantity,r.kind,r.dimensions,r.spec])];
  return rows.map(r=>r.map(quote).join(',')).join('\r\n');
}

export function buildAssembly(config: BuildConfiguration, s: WorkshopSettings): Assembly {
  const p = profiles[s.profile], P = p.size;
  const fit = Number.isFinite(s.fit) && s.fit >= 0 && s.fit <= 1 ? s.fit : 0.3;
  const errors: string[] = [], notes: string[] = [];
  const valid = (v: number | null, min: number, max: number): v is number => v !== null && Number.isFinite(v) && v >= min && v <= max;
  const estimate = (config.erd ?? 0) + 2 * (config.rimDepth ?? 0);
  const D = s.rimDiameter ?? estimate;
  if (!valid(D, 250, 850)) errors.push('Enter a rim outside diameter between 250 and 850 mm.');
  if (!valid(config.rimWidthOuter, 10, 100)) errors.push('The builder needs a valid rim width (10–100 mm).');
  if (!valid(config.rimDepth, 5, 100)) errors.push('The builder needs a valid rim depth (5–100 mm).');
  if (!s.axle) errors.push('Choose the axle interface; hub spacing alone does not identify it.');
  for (const [label, value] of [['left flange distance',config.centerToLeft],['right flange distance',config.centerToRight],['left flange PCD',config.flangePcdLeft],['right flange PCD',config.flangePcdRight]] as const) {
    if (!valid(value, 1, 200)) errors.push(`The builder needs a valid ${label} (1–200 mm).`);
  }
  if (!valid(s.hubWidth, 70, 250)) errors.push('Confirm the distance between hub dropout seating faces (70–250 mm).');
  if (!Number.isFinite(s.fit) || s.fit < 0 || s.fit > 1) errors.push('Printer diametral fit allowance must be 0–1 mm.');
  if (s.tool==='stand' && (!s.lengths.length || s.lengths.some(n=>!Number.isInteger(n) || n<100 || n>2000))) errors.push('Stock lengths must be whole millimetres between 100 and 2000.');
  if(s.mode==='dials' && (Math.abs(s.dialLugHole-6.85)>.01||Math.abs(s.dialLugThickness-5.2)>.01||Math.abs(s.dialLugOffset-10.25)>.01))errors.push('Both Fusion holders require the fixed reference rear lug dimensions: 5.20 mm thickness, Ø6.85 mm hole and 10.25 mm rear offset.');
  const diameter = valid(D,250,850) ? D : 650, R=diameter/2;
  const W=valid(s.hubWidth,70,250)?s.hubWidth:135;
  const rw=valid(config.rimWidthOuter,10,100)?config.rimWidthOuter:25;
  const depth=valid(config.rimDepth,5,100)?config.rimDepth:20;
  if (Math.max(config.flangePcdLeft ?? 0, config.flangePcdRight ?? 0)/2 + depth + 10 >= R) errors.push('Rim and flange envelopes overlap; confirm the wheel dimensions in the builder.');
  if ((config.centerToLeft ?? 0) + 5 >= W/2 || (config.centerToRight ?? 0) + 5 >= W/2) errors.push('Hub flange geometry reaches the axle supports; confirm flange distances and hub spacing.');
  const axleD = s.axle === 'qr9' ? 9 : s.axle === 'qr10' ? 10 : Number(s.axle)||10;
  const frameOffset = Number.isFinite(config.hubOffset) ? config.hubOffset! : 0;
  if (Math.abs(frameOffset) > 15) errors.push('Frame offset exceeds this design’s ±15 mm measurement adjustment.');
  const hub = hubs.find(h => h.id === config.hp);
  const wheelInputs: WheelBuildInputs = {
    nippleFit: fitSettingsFrom(config),
    erd: diameter - 2 * depth, rimWidthOuter: rw,
    rimWidthInner: config.rimWidthInner ?? 22, rimDepth: depth,
    rimProfile: config.rimProfile, rimEyelets: config.rimEyelets, rimValveDiameter: config.rimValveDiameter,
    osb: config.osb ?? 0, drillingOffsetLeft: config.drillingOffsetLeft ?? 0,
    drillingOffsetRight: config.drillingOffsetRight ?? 0, rimFlip: config.rimFlip,
    flangePcdLeft: valid(config.flangePcdLeft,1,200)?config.flangePcdLeft:55, flangePcdRight: valid(config.flangePcdRight,1,200)?config.flangePcdRight:55,
    centerToLeft: valid(config.centerToLeft,1,200)?config.centerToLeft:30, centerToRight: valid(config.centerToRight,1,200)?config.centerToRight:20,
    spokeCount: config.spokeCount ?? 32, spokeHoleDiameter: config.spokeHoleDiameter ?? 2.6,
    flangeThicknessLeft: config.flangeThicknessLeft ?? undefined,
    flangeThicknessRight: config.flangeThicknessRight ?? undefined,
    flangeOuterDiameterLeft: config.flangeOuterDiameterLeft ?? undefined,
    flangeOuterDiameterRight: config.flangeOuterDiameterRight ?? undefined,
    spokeDiameter: config.spokeDiameter ?? 2, interlaced: config.interlaced,
    crossesLeft: config.crossesLeft ?? 2, crossesRight: config.crossesRight ?? 2,
    hubOffset: frameOffset, isRear: config.isRear, spacing: config.spacing, discType: config.discType,
    hubName: hub ? `${hub.brand} ${hub.name}` : 'Custom Hub',
  };
  const a: Assembly = { parts: [], errors, notes, steps: [], estimated:s.rimDiameter===null,
    title:s.tool==='stand'?'Truing stand':'Dishing gauge',
    wheel:{inputs:wheelInputs,diameter,width:rw,depth,hubWidth:W,axleDiameter:axleD,center:[0,0,0],spokes:config.spokeCount ?? 32,
      left:wheelInputs.centerToLeft,right:wheelInputs.centerToRight,flangeL:wheelInputs.flangePcdLeft,flangeR:wheelInputs.flangePcdRight,offset:frameOffset} };
  // Workshop's axle points along -Builder Z; keep probes on the actual rim sidewall.
  const osb = a.wheel.inputs.osb;
  const rimShift = config.rimFlip === 'Left' ? osb : config.rimFlip === 'Right' ? -osb :
    a.wheel.left - frameOffset > a.wheel.right + frameOffset ? osb : -osb;
  const offset = frameOffset + rimShift;
  a.wheel.offset = offset;
  if (Math.abs(offset)+rw/2+10 >= W/2) errors.push('Rim and hub dimensions leave insufficient lateral probe clearance.');
  notes.push(`${s.profile}: ${p.family}; use profile-compatible T-nuts. The pictured 90° connectors use M5 hardware for every profile. Slot sections in the preview are schematic; check your supplier’s profile drawing.`,
    'Bare wheel only: remove tyre, cassette and rotor. All extrusion members are purchased at the listed lengths; no extrusion cutting or end tapping.',
    `PLA clearance: ${fit.toFixed(2)} mm added to nominal hole diameter / mating width, excluding the fixed Fusion 2020 cap socket and slot tongues. Print a fit coupon first. Use through-bolts and captured metal nuts; do not tap PLA.`,
    'Printed fixtures: 5 perimeters, 40% infill as a starting point. The 2020 friction cap has 3 mm collar walls, a 1.5 mm seating ledge and a sloped hollow pedestal; other fixture envelopes use 6 mm walls. Verify under light measurement load; keep away from heat.',
    'Bracket and fastener envelopes are schematic. Match actual slot depth, bracket thickness and bolt engagement before ordering; listed bolt lengths are preliminary.');
  if (a.estimated) notes.push('Rim outside diameter is estimated as ERD + 2 × rim depth. Confirm with a physical measurement before buying stock.');
  if (frameOffset) notes.push(`Builder frame offset is ${frameOffset} mm. A zero-gap symmetric dishing check is not the final target: verify the required signed offset against the bicycle’s frame specification.`);
  let seq=0;
  function add(sku:string,name:string,kind:Part['kind'],size:Vec3,position:Vec3,spec:string,stage=1,shape:Part['shape']='box',axis:Part['axis']='y',stock?:number) {
    a.parts.push({id:`${sku}-${++seq}`,sku,name,kind,size,position,spec,stage,shape,axis,stock,
      ...(shape==='ring'?{bore:axleD+fit}:{})});
  }
  function stock(label:string,required:number,axis:'x'|'y'|'z',pos:Vec3,stage=1) {
    const length=stockLength(required,s.lengths);
    if (!length) { errors.push(`${label} needs at least ${Math.ceil(required)} mm; no available stock fits.`); return null; }
    const size:Vec3=[P,P,P]; size[{x:0,y:1,z:2}[axis]]=length;
    add(`rail-${s.profile}-${length}`,`${s.profile} extrusion · ${length} mm`,'extrusion',size,pos,`${p.family}. Square factory ends; retain full stock length.`,stage,'box',axis,length);
    return length;
  }
  function bolt(pos:Vec3,stage:number,axis:Part['axis']='y',length=16,direction=1) {
    const d=Number(p.bolt.slice(1));
    add(`bolt-${p.bolt}-${length}`,`${p.bolt} × ${length} socket bolt`,'hardware',[d,length,d],pos,'Preliminary length; confirm bracket stack and T-nut engagement.',stage,'cylinder',axis);
    const ai={x:0,y:1,z:2}[axis!], washer:Vec3=[...pos], nut:Vec3=[...pos];
    washer[ai]+=direction*7; nut[ai]-=direction*(length/2-3);
    add(`washer-${p.bolt}`,`${p.bolt} washer`,'hardware',[d*2,1.5,d*2],washer,'Steel flat washer; one per slot bolt.',stage,'cylinder',axis);
    add(`tnut-${s.profile}`,`${p.family} ${p.bolt} T-nut`,'hardware',axis==='z'?[P*.65,p.slot+2,5]:[P*.65,5,p.slot+2],nut,'Profile-family-specific roll-in T-nut; not interchangeable by nominal size alone.',stage);
  }
  function printed(sku:string,name:string,size:Vec3,pos:Vec3,spec:string,stage=2,mount:'slot'|'through'|'none'='slot',axis:Part['axis']='y') {
    add(sku,name,'pla',size,pos,`${spec} Envelope ${size.map(n=>+n.toFixed(2)).join(' × ')} mm. Clearance +${fit.toFixed(2)} mm; 6 mm minimum walls; captured nuts.`,stage);
    if(mount==='none')return;
    const ai={x:0,y:1,z:2}[axis!];
    const length=Math.ceil((size[ai]+12)/5)*5;
    for(const sign of [-1,1]){
      const point:Vec3=[...pos]; point[axis==='x'?1:2]+=sign*(axis==='x'?17.5:size[2]/4);
      if(mount==='slot')bolt(point,stage,axis,length);
      else {
        add(`fixture-m6-${length}`,`M6 × ${length} fixture through-bolt`,'hardware',[6,length,6],point,'Through-bolt through fixture and mounting plate; no printed threads.',stage,'cylinder',axis);
        const end:Vec3=[...point];end[ai]-=length/2-3;
        add('m6-locknut','M6 adjustment / lock nut','hardware',[10,5,10],end,'Captured steel hex nut; lock without crushing PLA.',stage,'cylinder',axis);
        end[ai]+=5;add('m6-washer','M6 flat washer','hardware',[12,1,12],[...end],'Steel flat washer on PLA fixture.',stage,'cylinder',axis);
      }
    }
  }
  function probe1(role:'lateral'|'radial'|'dish',position:Vec3,rotation:Vec3,q:number) {
    const mesh=probe1Export.mesh;
    add('probe1','PLA Fusion Probe 1 · common adjustment pointer','pla',mesh.max.map((v,i)=>v-mesh.min[i]) as Vec3,position,
      'Exact unscaled Fusion probe1 solid: 105 × 15 × 15 mm, 5 mm base, 90 × 5 mm straight slot and thick rear flange. The narrow X=100 mm end faces the wheel; the thick end stays to the right. Same part for lateral, radial and dishing use. Slide and lock with an M4 bolt and washer; allowable bolt centres X 7–93 mm. Print flat native Z=0 face on the bed; verify slot fit.',3,'probe1');
    Object.assign(a.parts[a.parts.length-1],{rotation,probeRole:role,probeBolt:q});
    if(q<7||q>93)errors.push(`Probe 1 ${role} mounting position ${q.toFixed(1)} mm exceeds its fixed 7–93 mm slot travel; reposition the mount. The CAD part is not stretched.`);
  }
  function probeClamp(pos:Vec3,axis:'y'|'z',intoSlot:boolean) {
    add('probe1-m4-bolt', 'M4 × 20 Probe 1 clamp bolt','hardware',[4,20,4],pos,'M4 clears the native 5 mm slot. Clamp with a wide washer; verify thread engagement.',3,'cylinder',axis);
    const ai=axis==='y'?1:2,washer:Vec3=[...pos],nut:Vec3=[...pos];washer[ai]+=3;nut[ai]-=8;
    add('probe1-m4-washer','M4 wide Probe 1 washer','hardware',[9,1,9],washer,'9 mm OD washer spans both sides of the 5 mm slot.',3,'cylinder',axis);
    add(intoSlot?'probe1-tnut-'+s.profile:'probe1-m4-nut',intoSlot?`${p.family} M4 Probe 1 T-nut`:'M4 Probe 1 captive nut','hardware',axis==='z'?[7,7,4]:[7,4,7],nut,intoSlot?'M4 internal thread, compatible with selected extrusion slot.':'Captured metal M4 nut behind the probe adapter plate.',3);
  }
  if (s.tool==='stand') {
    const frictionCap=s.profile==='2020';
    const qr = s.axle === '' || s.axle === 'qr9' || s.axle === 'qr10';
    const seatLeft=valid(s.seatLeft,6,35)?s.seatLeft:(qr?axleD:axleD+6);
    const seatRight=valid(s.seatRight,6,35)?s.seatRight:(qr?axleD:axleD+6);
    const projection=valid(s.projection,3,20)?s.projection:3;
    const nose=frictionCap?hubCapDimensions.saddle_depth:Math.min(6,projection);
    if(!valid(s.seatLeft,6,35)||!valid(s.seatRight,6,35)||!valid(s.projection,3,20))errors.push('Confirm both hub-end diameters and at least 3 mm usable projection before printing the cradles. Nominal seats are shown provisionally.');
    if(frictionCap && Math.abs(seatLeft-seatRight)>1e-6) errors.push('Identical 2020 V caps on equal uprights require equal hub-end diameters for a level axle. Unequal ends cannot be compensated by these caps; preview is provisional.');
    const directUx = frictionCap ? W/2 + projection/2 : W/2 + nose + P/2;
    const minimumUprightSpacing=P+2*cornerBracketDimensions.leg;
    const ux=Math.max(directUx,minimumUprightSpacing/2);
    const rodRequired=ux>directUx+1e-6;
    const rodD=qr?5:axleD===12?10:axleD===15?12:16;
    const supportD=rodRequired?Math.max(seatLeft+4,seatRight+4,rodD+4):Math.max(seatLeft,seatRight);
    const supportX=frictionCap?ux:ux-P/2-nose/2;
    const spacerStart=W/2;
    const spacerEnd=Math.max(supportX+(frictionCap?hubCapDimensions.fin_root_depth:nose)/2+2,spacerStart+projection+2);
    const spacerLength=rodRequired?spacerEnd-spacerStart:0;
    a.hubSupport={minimumUprightSpacing,uprightSpacing:2*ux,rodRequired,spacerLength,spacerDiameter:supportD};
    notes.push(`Upright centres cannot be closer than ${minimumUprightSpacing} mm: two 50 mm inner bracket legs plus the ${P} mm profile. Current spacing: ${2*ux} mm.`,
      rodRequired?`Narrow hub: automatically fit a through-hub support rod and two equal ${spacerLength.toFixed(2)} mm-long, Ø${supportD} mm spacer sleeves. The sleeves rest on the holders; the hub remains centred. Confirm rod fit and stiffness and sleeve contact with the stationary axle ends before use.`:'The stationary hub ends sit directly on the holders.');
    notes.push(`Coplanar H base: all three base rails sit at Y = ${P/2} mm with their bottoms on the same surface. The crossbar ends butt against the inner faces of the two feet. Both uprights sit on its top face at Y = ${P} mm.`,
      'Base corner brackets are turned into the horizontal plane and bolt into SIDE slots in both rails. They do not bridge a stacked height difference. Upright brackets still bolt into a top slot and an upright side slot.',
      'Pictured 90° gusseted connectors: 50 × 50 × 18 mm, 9 mm flanges, two Ø6 mm holes for M5 bolts. Hole centres are 10 mm from the free ends and centred across the 18 mm width. Base brackets leave 1 mm bench clearance on 2020 rails. The undimensioned gusset opening is illustrative.');
    // Both uprights use the SAME stock member; axle height is a consequence of
    // the top-end datum, never an independently adjustable slider setting.
    const uprightLength = stockLength(R+140, s.lengths);
    const top = P + (uprightLength ?? R+140);
    const seatBottom = top+10;
    const yAxle = frictionCap?top+hubCapDimensions.seatCenterHeight(supportD):seatBottom+supportD/2;
    a.wheel.center=[0,yAxle,0];
    const crossRequired=Math.max(2*ux+3*P+20,2*ux+P+2*cornerBracketDimensions.leg);
    const crossLength=stock('Cross rail',crossRequired,'x',[0,P/2,0]);
    const footX=(crossLength??crossRequired)/2+P/2;

    // A bracket's origin is its INSIDE corner. Local +X runs away from the
    // vertical face; local +Y goes up. Rotation mirrors both flanges together.
    function angle(corner:Vec3, axis:'x'|'z', sign:number) {
      const yaw = axis==='x' ? (sign>0?0:Math.PI) : (sign>0?-Math.PI/2:Math.PI/2);
      add('angle-gusset-50','50 mm gusseted 90° bracket','metal',[50,50,18],corner,
        `Pictured 50 × 50 × 18 mm gusseted connector; 9 mm flanges, two Ø6 mm holes centred 10 mm from the free ends. M5 bolts and ${p.family} M5 T-nuts. Undimensioned gusset opening is approximate.`,1,'angle');
      const part=a.parts[a.parts.length-1];part.rotation=[0,yaw,0];part.bore=6;
      const q=cornerBracketDimensions.holeOffset, d=5;
      // Position actual bolt stacks against each flange, not the bracket box centre.
      for(const horizontal of [true,false]) {
        const pt:Vec3=[...corner];pt[axis==='x'?0:2]+=sign*(horizontal?q:4);
        pt[1]+=horizontal?4:q;
        const boltAxis=horizontal?'y':axis;
        add(`angle-bolt-M5`,`M5 × 16 bracket bolt`,'hardware',[d,16,d],pt,'Through angle flange into matching slot T-nut; verify supplier engagement.',1,'cylinder',boltAxis);
        const washer:Vec3=[...pt],nut:Vec3=[...pt];
        const ai=horizontal?1:(axis==='x'?0:2),direction=horizontal?1:sign;
        washer[ai]+=direction*5.5;nut[ai]-=direction*7;
        add(`angle-washer-M5`,`M5 bracket washer`,'hardware',[d*2,1,d*2],washer,'Flat washer on outer bracket flange.',1,'cylinder',boltAxis);
        const nutSize:Vec3=horizontal?[P*.6,4,p.slot+2]:axis==='x'?[4,P*.6,p.slot+2]:[p.slot+2,P*.6,4];
        add(`angle-tnut-${s.profile}`,`${p.family} M5 bracket T-nut`,'hardware',nutSize,nut,'Seated inside the adjoining extrusion slot.',1);
      }
    }
    function baseAngle(sign:number,front:number){
      const corner:Vec3=[sign*(footX-P/2),P/2,front*P/2],q=cornerBracketDimensions.holeOffset,d=5;
      add('angle-base-gusset-50','50 mm gusseted 90° H-base bracket','metal',[50,50,18],corner,
        `Pictured 50 × 50 × 18 mm gusseted connector; 9 mm flanges, two Ø6 mm holes centred 10 mm from the free ends. Width vertical, centred on the side slots; ${(P-18)/2} mm bench clearance. M5 bolts and ${p.family} M5 T-nuts. Undimensioned gusset opening is approximate.`,1,'angle');
      Object.assign(a.parts[a.parts.length-1],{rotation:[-sign*front*Math.PI/2,0,sign>0?Math.PI:0],bore:6});
      for(const leg of [0,1]){
        const pos:Vec3=leg?[corner[0]-sign*4,P/2,corner[2]+front*q]:[corner[0]-sign*q,P/2,corner[2]+front*4];
        const axis=leg?'x':'z',ai=leg?0:2,normal=leg?-sign:front;
        add(`base-bolt-M5`,`M5 × 16 H-base bracket bolt`,'hardware',[d,16,d],pos,'Through corner bracket into the adjoining rail side slot; confirm engagement with actual flange thickness.',1,'cylinder',axis);
        const washer:Vec3=[...pos],nut:Vec3=[...pos];washer[ai]+=normal*5.5;nut[ai]-=normal*7;
        add(`base-washer-M5`,`M5 H-base washer`,'hardware',[d*2,1,d*2],washer,'Flat washer outside bracket flange.',1,'cylinder',axis);
        add(`base-tnut-${s.profile}`,`${p.family} M5 H-base T-nut`,'hardware',leg?[4,p.slot+2,P*.6]:[P*.6,p.slot+2,4],nut,'Matching T-nut inside the side slot; not an end-tapped connection.',1);
      }
    }
    for(const sign of [-1,1]) {
      stock('Base foot',Math.max(300,R+60),'z',[sign*footX,P/2,0]);
      if(uprightLength)stock('Upright',R+140,'y',[sign*ux,P+uprightLength/2,0],2);
      else errors.push('Upright needs at least '+Math.ceil(R+140)+' mm; no available stock fits.');
      // Coplanar butt joints, with a bracket on each side of the crossbar.
      for(const front of [-1,1])baseAngle(sign,front);
      for(const side of [-1,1])angle([sign*ux+side*P/2,P,0],'x',side);

      const seatD=rodRequired?supportD:sign<0?seatLeft:seatRight;
      if(frictionCap) {
        const mesh=hubCapExport.meshes.cap;
        add('top-cap-2020-v2','PLA 2020 friction-fit V hub cap (identical pair)','pla',mesh.max.map((v,i)=>v-mesh.min[i]) as Vec3,[sign*ux,top,0],
          'Fusion V2 solid, unscaled. Top-centred upward-open 90° V carries the hub directly over the bar. Centred fin tapers symmetrically from 5 mm root to 3 mm tips; both faces slope inward equally (1.79° from vertical). Check hub-shell clearance with short protrusions: the fin is thicker than 3 mm below its tips. 44 mm width, apex 26 mm above rail end. Keep uprights at or above the bracket minimum spacing; seat spacer sleeves in the V when a support rod is required. Short 10 mm collar with 20.3 mm clearance socket; four 6.1 mm-wide tongues engage slot-6 openings, nominal 0.1 mm interference. 45° internal roof closes progressively, with only a 1.5 mm seating ledge. Sloped saddle sides grow at 53.6° above horizontal. Print upright in one piece with supports OFF; test the 5 mm slot coupon first. Print the same cap twice. No cap bolts or T-nuts; slot fit is independent of general hole clearance.',2,'top-cap');
        Object.assign(a.parts[a.parts.length-1],{capDesign:'centred-v2',profileSize:P,seatHeight:hubCapDimensions.seatCenterHeight(seatD)-seatD/2,nose,rotation:[0,sign<0?Math.PI:0,0]});
      } else {
      add('top-cap-'+(sign<0?'left':'right'),'PLA '+(sign<0?'left':'right')+' top cap with integral cradle','pla',[P+6+nose,69,P+20],[sign*(ux-P/2),top,0],
        `Hollow rail socket ${P+fit} × ${P+fit} mm; 6 mm top shoulder sets datum. Integral ${nose} mm-deep nose supports the stationary ${seatD} mm protrusion in an upward-open rounded indent. Two front/rear side-slot fixing pairs retain the cap. No custom metal components.`,2,'top-cap');
      Object.assign(a.parts[a.parts.length-1],{bore:seatD+fit,profileSize:P,fit,seatHeight:yAxle-top-seatD/2,nose,rotation:[0,sign<0?Math.PI:0,0]});
      for(const front of [-1,1])for(const dy of [-12,-30]) {
        const z=front*(P/2+3);
        add(`cap-bolt-${p.bolt}`,`${p.bolt} × 16 cap fixing bolt`,'hardware',[Number(p.bolt.slice(1)),16,Number(p.bolt.slice(1))],[sign*ux,top+dy,z],
          'Through visible skirt hole into a side-slot T-nut. Tighten only after the cap shoulder is fully seated on the rail end.',2,'cylinder','z');
        add(`cap-nut-${s.profile}`,`${p.family} ${p.bolt} cap T-nut`,'hardware',[p.slot+2,12,4],[sign*ux,top+dy,front*(P/2-3)],'Metal T-nut in front/rear upright slot.',2);
      }
      }
    }
    // Existing protrusions are wheel components, not new purchased adaptors.
    for(const sign of [-1,1]) {
      const d=sign<0?seatLeft:seatRight;
      add('existing-end-'+sign,'Existing stationary hub-end protrusion','metal',[d,projection,d],[sign*(W/2+projection/2),yAxle,0],
        rodRequired?'Part of your hub, not a purchase. The support rod passes through the axle bore; a counterbored spacer sleeve fits over each stationary end.':'Part of your hub, not a purchase. This stationary protrusion rests in the printed indent while the shell rotates on its bearings.',2,'cylinder','x');
      a.parts[a.parts.length-1].movesWithWheel=true;
    }
    if(rodRequired) {
      for(const sign of [-1,1]) {
        add('hub-support-spacer','Matched metal hub-support spacer sleeve','metal',[spacerLength,supportD,supportD],[sign*(spacerStart+spacerLength/2),yAxle,0],
          `Length ${spacerLength.toFixed(2)} mm, OD ${supportD} mm, bore ${rodD+.5} mm. Counterbore Ø${(sign<0?seatLeft:seatRight)+.5} mm × ${projection} mm deep at the hub end accepts the existing protrusion. One each side: seat against the stationary hub end face, span the holder and carry the through-hub rod. Equal outside diameters keep the axle level. Confirm actual bore fit and end contact; no contact with seals or rotating shell.`,2,'hub-spacer','x');
        Object.assign(a.parts[a.parts.length-1],{bore:rodD+.5,counterbore:(sign<0?seatLeft:seatRight)+.5,counterboreDepth:projection,rotation:[0,sign<0?Math.PI:0,0],movesWithWheel:true});
      }
    }
    if(s.guideRod||rodRequired) {
      const length=Math.ceil(Math.max(W+2*P+40,2*spacerEnd+20)/50)*50;
      add(rodRequired?'hub-support-rod':'loose-guide-rod',rodRequired?'Through-hub support rod / skewer':'Optional loose smooth guide rod','metal',[rodD,length,rodD],[0,yAxle,0],
        rodRequired?`Required for this hub spacing: Ø${rodD} × ${length} mm rod through the hub and both spacer sleeves. Sleeves sit on the holders. Verify bore fit, bending stiffness and retention with the actual hub; a loose guide rod alone is not a verified load-bearing support. Do not apply bearing preload through the printed holders.`:
        `Standard ${rodD} × ${length} mm smooth rod, only if it freely fits the measured hub bore. No nuts, collars or clamping. Cradles carry the wheel; rod is an alignment aid.`,2,'cylinder','x');
      a.parts[a.parts.length-1].movesWithWheel=true;
    }
    const lateralZ=P/2+(s.mode==='dials'?42.5:45);
    const contactY=yAxle-Math.sqrt(Math.max(1,(R-depth/2)**2-lateralZ**2));
    for(const lateral of [true,false]) {
      const role=lateral?'lateral':'radial', axis=lateral?'x':'y';
      if(lateral && s.mode==='dials') {
        // Preserve the CAD geometry. Only slide within its actual 60 mm range;
        // incompatible rig reach is reported instead of stretching the holder.
        const desiredMountX=ux-(offset+rw/2+74);
        const mountX=Math.max(-42,Math.min(18,desiredMountX));
        const origin:Vec3=[ux-mountX,contactY,P/2];
        for(const [key,mesh] of Object.entries(fusionHolderMeshes)) {
          if(key.startsWith('Illustrative'))continue; // dial artwork is rendered as a texture, not a BOM item
          const holder=key==='Printable holder',dial=key==='Dial case and rear lug';
          const isDial=key.startsWith('Dial')||key.startsWith('Illustrative');
          const slotHardware=key.startsWith('Lower')||key.startsWith('Upper');
          const center=mesh.min.map((v,i)=>(v+mesh.max[i])/2) as Vec3;
          const size=mesh.min.map((v,i)=>mesh.max[i]-v) as Vec3;
          const position=center.map((v,i)=>v+origin[i]+(slotHardware&&i===0?mountX-55:0)) as Vec3;
          const sku=holder?'lateral-dial-bracket':dial?'dial-lateral':`lateral-${key.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-')}`;
          const spec=holder?'Fusion holder: 82 × 40 × 8 mm upper plate; two 65.5 × 5.5 mm horizontal slots at 18 mm pitch, 60 mm usable travel. Plate and slots are symmetrical about the dial ear centreline. Slots sit 43 and 61 mm above the dial centre. A descending 24 × 8 mm web connects to the lower mounting ear. Transverse lug screw perpendicular to the probe pin. One 8 mm mounting ear with Ø5.5 mm clearance, a local R8 outer-root fillet, R2 dial-side fillet and a flat Ø16 mm seat for washers up to Ø15 mm. Ear projection is 28 mm to clear the larger washer. R3 corner fillets round the vertical plate/web outline only; 8.25 mm material remains beyond each slot end. Two M5 × 16 upright bolts and one M5 × 25 lug bolt. Upper mounting plate and descending web are 8 mm; the mounting ear is 8 mm. Confirm bolt engagement and bottoming with the actual T-nuts.':
            isDial?'Fusion KATSU reference: Ø54 × 25 mm case, 5.20 mm lug, Ø6.85 mm hole, inferred 10.25 mm rear offset. Relaxed probe reach is measured at 40 mm from the case: 20 mm fixed sleeve plus 20 mm exposed moving pin. Shown with 5 mm preload, leaving 15 mm exposed pin. Rounded lug geometry remains an assumption for physical fit verification. Face points toward the operator.':
            'Fusion hardware reference. Three M5 bolts total for this lateral holder; matching T-nuts, washers and nut. Verify purchased hardware engagement.';
          add(sku,holder?'PLA lateral upper-slot holder · Fusion V5':dial?'Lateral dial · face toward operator':key==='Lug M5x25 shank'?'M5 rear-lug mounting bolt':key,
            holder?'pla':isDial?'gauge':'hardware',size,position,spec,3,'fusion-mesh',dial?'z':slotHardware?'z':'y');
          a.parts[a.parts.length-1].meshKey=key as keyof typeof fusionHolderMeshes;
          if(dial)a.parts[a.parts.length-1].measurementAxis='x';
        }
        notes.push(`Dial centre is ${(origin[0]-12-ux).toFixed(1)} mm relative to the right upright centre (positive = right). The lower bolt washer clears the case top by 11 mm; the case rear clears the upright front by 30 mm.`, `Lateral holder uses the redesigned Fusion V5 solid, with ${mountX.toFixed(1)} mm slot position (−42–18 mm bolt-centre range). Loosen its two upright M5 bolts for 60 mm horizontal travel. The integrated ear uses one M5 lug bolt. The dial ear is below both mounting bolts. The measured 40 mm relaxed probe is shown compressed by 5 mm (35 mm case-to-tip, 15 mm exposed pin), touching the rim sidewall. This leaves nominal 5 mm travel in either direction; keep clearance from both travel limits. Reposition and re-zero when changing hubs. Geometry is never stretched to fit.`);
        if(desiredMountX < -42||desiredMountX > 18)errors.push(`Exact Fusion lateral holder cannot reach the shown rim within its slots: required bolt position ${desiredMountX.toFixed(1)} mm, available −42–18 mm. Shown at 5 mm compression at the nearest limit; ${desiredMountX < -42?`the tip overruns the rim sidewall by ${(-42-desiredMountX).toFixed(1)} mm`:`the tip is ${(desiredMountX-18).toFixed(1)} mm short of the rim`}. Probe travel is only 10 mm; contact is not a valid fit. Verify upright-to-rim reach before printing.`);
        if(s.profile!=='2020')notes.push('The Fusion lateral holder retains M5 hardware. Larger-profile uprights require compatible M5-thread T-nuts; the normal profile bolt size does not fit its Ø5.5 mm slots.');
        continue;
      }

      if(!lateral && s.mode==='dials') {
        const d=radialHolderDimensions;
        // Seat the dial lug against the left face of the same 8 mm ear.
        // The rim's left bead edge is solid; its centre channel is open.
        const dialShift=-(d.ear_thickness+d.lug_thickness);
        const dialReferenceX=d.dial_reference_x+dialShift;
        const earCentreX=d.dial_reference_x+dialShift/2;
        const dialSlotMin=d.dial_slot_min+dialShift, dialSlotMax=d.dial_slot_max+dialShift;
        const span=2*ux, desiredDialX=ux+offset-rw/2;
        const dialX=Math.max(dialSlotMin,Math.min(dialSlotMax,desiredDialX));
        const bridgeShift=dialX-dialReferenceX, leftBolt=-bridgeShift, desiredRightBolt=span-bridgeShift;
        const rightBolt=Math.max(d.right_slot_min,Math.min(d.right_slot_max,desiredRightBolt));
        const originZ=P/2;
        const setback=d.case_rear+d.carriage_back+d.dial_thickness/2-d.pivot_z;
        const reach=d.dial_diameter/2+d.probe_sleeve+d.probe_pin_relaxed-d.preload-d.pivot_y;
        const desiredTilt=Math.atan2(setback,R+reach)+Math.asin((originZ+d.pivot_z)/Math.hypot(R+reach,setback));
        const tilt=Math.max(d.angle_min,Math.min(d.angle_max,desiredTilt*180/Math.PI))*Math.PI/180;
        const cs=Math.cos(tilt),sn=Math.sin(tilt);
        const probeZ=originZ+d.pivot_z+setback*cs-reach*sn;
        const radialY=yAxle-Math.sqrt(Math.max(0,R*R-probeZ*probeZ));
        const origin:Vec3=[-ux+bridgeShift,radialY-d.pivot_y-setback*sn-reach*cs,originZ];
        const alignmentErrorDegrees=Math.abs(Math.atan2(probeZ,yAxle-radialY)-tilt)*180/Math.PI;
        a.radialMount={uprightSpan:span,leftBolt,bridgeShift,rightBolt,desiredDialX,dialX,origin,tip:[origin[0]+dialReferenceX,radialY,probeZ],direction:[0,cs,-sn],tiltDegrees:tilt*180/Math.PI,alignmentErrorDegrees};
        for(const [key,mesh] of Object.entries(radialExport.meshes)) {
          const bridge=key==='Radial printable bridge', holder=bridge, dial=key==='Radial dial case and rear lug';
          const rotating=mesh.motion.includes('tilt');
          const lugHardware=key.startsWith('Lug ');
          const centreX=(mesh.min[0]+mesh.max[0])/2;
          const shiftX=dial?dialShift:lugHardware?2*(earCentreX-centreX):
            key.startsWith('Left ')?leftBolt:key.startsWith('Right ')?rightBolt-125:0;
          const size=mesh.min.map((v,i)=>mesh.max[i]-v) as Vec3;
          const centre=mesh.min.map((v,i)=>(v+mesh.max[i])/2) as Vec3;
          const position:Vec3=[centre[0]+origin[0]+shiftX,origin[1]+(rotating?d.pivot_y+(centre[1]-d.pivot_y)*cs+(centre[2]-d.pivot_z)*sn:centre[1]),origin[2]+(rotating?d.pivot_z-(centre[1]-d.pivot_y)*sn+(centre[2]-d.pivot_z)*cs:centre[2])];
          const spec=bridge?'One-piece slotted T bridge with a solid 8 mm projecting arm beneath the raised dial-lug ear. Three M5 × 16 frame bolts clamp 8 mm lands. One 8 mm ear supports the lug on its left face, with local R6 and R3 root fillets; no fitted fork gap or shims. The transverse M5 × 25 lug bolt also sets the 0–25° dial angle; tighten it after aiming the pin at the axle. R8 side junction fillets reinforce the solid web; a flat Ø16 mm seat clears washers up to Ø15 mm.':dial?'Same fixed measured reference as lateral: Ø54 × 25 mm case, 5.20 mm lug, Ø6.85 mm lug hole. 20 mm sleeve and 15 mm exposed pin at 5 mm preload. The lug mounts on the left face of the holder ear. Lug-bolt tilt aims the pin radially at the left rim edge, clear of the hollow centre channel; face toward operator.':key.includes('head')?'Included head of the corresponding bolt, shown separately as a CAD reference.':key.includes('T-nut')?'M5 slot-6 T-nut envelope; confirm engagement in the actual upright.':'Radial M5 reference hardware; tighten against the flat bearing faces without crushing the plastic. Check actual nut and washer dimensions.';
          const sku=bridge?'radial-dial-bracket':dial?'dial-radial':`radial-${key.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-')}`;
          const hardwareName=key==='Lug left washer'?'Lug right washer':key==='Lug right washer'?'Lug left washer':key;
          add(sku,bridge?'PLA radial slotted bridge · Fusion V13':dial?'Radial dial · left rim edge':hardwareName,
            holder?'pla':dial?'gauge':'hardware',size,position,spec,3,'fusion-mesh',key.startsWith('Pivot ')||key.startsWith('Lug ')?'x':'z');
          const part=a.parts[a.parts.length-1];part.radialMeshKey=key as keyof typeof radialExport.meshes;
          if(rotating)part.rotation=[-tilt,0,0];
          else if(lugHardware)part.rotation=[0,0,Math.PI];
          if(dial)part.measurementAxis='y';
        }
        if(s.profile!=='2020')errors.push('Fusion radial holder is verified for 2020 slot-6 uprights only; other profiles require a fit review.');
        if(alignmentErrorDegrees>.1)errors.push(`Fusion radial probe is not normal to this rim: ${alignmentErrorDegrees.toFixed(2)}° error at the 0–25° tilt limit. Not a valid measurement setup.`);
        if(W!==100&&W!==135)errors.push('Fusion radial holder is verified for the Hope front 100 mm and rear 135 mm hubs only. Other hub spacings require a fit review.');
        if(Math.abs(offset)>d.offset_allowance)errors.push(`Fusion radial dial offset exceeds the verified ±${d.offset_allowance} mm allowance.`);
        if(desiredRightBolt<d.right_slot_min||desiredRightBolt>d.right_slot_max)errors.push(`Fusion radial right fixing cannot reach the upright: required local bolt position ${desiredRightBolt.toFixed(1)} mm, available ${d.right_slot_min}–${d.right_slot_max} mm. Bolt shown at nearest slot limit; not a valid fit.`);
        if(desiredDialX<dialSlotMin||desiredDialX>dialSlotMax)errors.push(`Fusion radial dial cannot reach the left rim edge: required ${desiredDialX.toFixed(1)} mm from left upright, available ${dialSlotMin.toFixed(1)}–${dialSlotMax.toFixed(1)} mm. Shown at nearest limit; not a valid contact.`);
        if(origin[1]+radialExport.meshes['Radial printable bridge'].min[1]<P+cornerBracketDimensions.leg)errors.push('Fusion radial bridge overlaps the base-bracket zone; choose longer upright stock.');
        if(dialX-d.dial_diameter/2<P/2||dialX+d.dial_diameter/2>span-P/2)errors.push('Fusion radial dial case reaches an upright; confirm rim offset and hub spacing.');
        notes.push(`Radial: one printed part, 8 mm frame fixing lands and M5 × 16 frame bolts. Left slot ${leftBolt.toFixed(1)} mm (−21–16 mm), right slot ${rightBolt.toFixed(1)} mm (108–145 mm), dial centre ${dialX.toFixed(1)} mm from the left upright (${dialSlotMin.toFixed(1)}–${dialSlotMax.toFixed(1)} mm), tilt ${(tilt*180/Math.PI).toFixed(2)}° (0–25°). The dial mounts on the left face of the ear, with the lug bolt inserted from the right. Slide the holder so the pin touches the left rim edge, ${(rw/2).toFixed(1)} mm left of its centre, clear of the hollow channel. Frame slots set lateral position; the M5 × 25 dial-lug bolt locks tilt; exported meshes only translate and rotate.`,
          `The single bridge prints on its flat back. The horizontal lug holes have 45° roofs for supports-off printing. Rounded openings reduce solid volume by ${radialExport.metadata.volumeReductionPercent.toFixed(1)}% against V2; actual filament and time depend on slicing. The radial holder uses three M5 × 16 frame bolts and one M5 × 25 dial-lug bolt. Frame lands remain 8 mm; the ear and lug stack is 13.2 mm before outer washers. Re-zero after tightening. No contact-tip attachment is included. Lower the three frame fixings to retract before wheel removal. Physical stiffness and print fit remain unverified.`);
        continue;
      }

      if(lateral){
        const z=P/2+2.5,y=yAxle-Math.sqrt(Math.max(1,(R-depth/2)**2-z*z));
        const origin:Vec3=[offset+rw/2+101,y,P/2];
        probe1('lateral',origin,[0,0,Math.PI],origin[0]-ux);
        probeClamp([ux,y,P/2+2.5],'z',true);
      }else{
        // Same orientation and direct upright clamp as the lateral probe.
        // The thin end reaches the wheel centre plane; its upper edge gauges radial runout.
        const z=P/2,y=yAxle-Math.sqrt(Math.max(1,R*R-z*z))-1;
        const origin:Vec3=[offset+100,y-7.5,z];
        probe1('radial',origin,[0,0,Math.PI],origin[0]-ux);
        probeClamp([ux,origin[1],P/2+2.5],'z',true);
        if(origin[1]-7.5<P+cornerBracketDimensions.leg)errors.push('Radial Probe 1 overlaps the base bracket zone; use longer uprights.');
      }
    }
    notes.push(
      frictionCap?`Two identical top-centred Fusion V caps seat on equal ${uprightLength??'unavailable'} mm uprights. Axle height is rail top + 26 mm + supported end or sleeve radius / sin(45°): ${yAxle.toFixed(2)} mm for the supported diameter. Equal end diameters are required for a level axle. Four tongues locate in the slots. Load passes through the centred pedestal and seating ledge into the rail end. Upright centres respect the bracket minimum; narrow hubs use matched sleeves on a through-hub rod; check the supplier section and test the coupon.`:`Both top caps seat on equal ${uprightLength??'unavailable'} mm uprights. Their printed cradle depths compensate for the entered left/right protrusion diameters, giving axle height ${yAxle.toFixed(2)} mm.`,
      'Measure the diameter and usable projection of BOTH stationary hub ends. Cradles must support those ends, not bearing seals or rotating hub shell. If either end has no usable protrusion, this seating arrangement is not compatible.',
      rodRequired?'The hub rotates on its bearings around the stationary axle; the required through-hub rod and matched sleeves bridge the extra holder spacing.': 'The wheel rotates on its hub bearings; the protruding ends stay stationary in the PLA indents. There is no QR cam, clamping nut, steel dropout, custom shaft collar or metal adaptor sleeve.',
      rodRequired?'Rod and spacer sleeves are required at this spacing and cannot be disabled. Verify fit and support stiffness before calibration.':'Optional smooth rod: slide loosely through the hub bore without nuts, tightening or bearing preload. It is only a guide, not the load-bearing axle or positive wheel retention. Remove it before reversing if it impedes lifting.',
      'Probe 1 mounts directly on the front upright for lateral measurement and another identical, unrotated copy on the same upright for radial measurement. The lateral Fusion dial holder mounts on the right front slot; the radial Fusion T bridge spans both front slots, with two left horizontal slots and a slotted right fixing. Mount the radial dial on the left face of its ear and slide the bridge to place the pin on the left rim edge.',
      'Dial upgrade: keep the extrusion frame and hub cradles. Print the one-piece lateral holder and the one-piece radial bridge. The radial assembly uses three M5 × 16 frame bolts and one M5 × 25 dial-lug bolt; the lateral holder retains its three M5 bolts. Both dials use the same fixed reference dimensions. Reposition, tighten and recalibrate.',
      'Printed sections have a maximum 180 mm envelope, allowing a 10 mm margin on a 200 × 200 mm bed. No long printed measurement posts are required. Printer Z clearance and brim settings still need checking.',
      'Calibrate in the actual unclamped condition: compare seat heights, reseat three times, reverse the wheel and use very light probe contact. PLA wear, joint compliance and hub bearing play can limit repeatability; a loose rod does not cancel them.'
    );
    a.steps=[
      'Lay both feet and the crossbar flat as an H. Butt each crossbar end against a foot’s inner face and secure both side-slot corner brackets. Fit the equal-length uprights on the middle crossbar, then square and tighten their base brackets.',
      frictionCap?'Measure both stationary hub-end diameters (6–35 mm, equal on both sides) and at least 3 mm usable projection. Print the 5 mm four-slot coupon first and tune tongue width if needed. Print two identical caps upright with supports OFF. Slide their tongues into the slots until the seating ledges meet the rail ends. Respect the minimum upright spacing. For a narrow hub, install the through-hub rod and matched spacer sleeves, then seat the sleeves in the V holders; otherwise seat the hub ends directly.':'Measure both hub-end protrusion diameters and their minimum usable length. Print the matched cradle caps; seat their shoulders fully on the upright ends and retain with side-slot bolts.',
      rodRequired?'Insert the rod through the hub, fit one counterbored spacer sleeve over each stationary end and lower both sleeves into the holders. Check that the hub is centred and spins freely.':'Lower the stationary hub ends into the open PLA indents. Check that the hub shell and seals are clear and the wheel spins on its bearings. No wheel clamping is required.',
      rodRequired?'Keep the required rod and both sleeves with the wheel when lifting and reversing. Recheck seating and zero after each reversal.':'Optionally insert a loose smooth rod through the hub bore. Do not tighten nuts against the hub or supports. Retract probes, lift, reverse and reseat without moving the caps.',
      'Print the one-piece radial holder flat on its back. Centre it using the three frame slots and tighten the frame bolts. Bolt the dial lug against the single ear using the M5 × 25 bolt, washers and nut. Aim the pin through the axle centre, tighten the lug bolt, set 5 mm preload and re-zero.',
      'Fit identical Probe 1 parts for both pointers. Slide their native slots under M4 washers, set a light gap, and lock the clamps. For dials bolt the actual rear mounting lug against the single printed mounting ear, with faces toward the operator. No stem clamp is used. Check joint rigidity and reseating repeatability.'
    ];
  } else {
    a.wheel.center=[0,R+60,0];
    // One photographed design: a 300 mm rail, two 100 mm arms, four
    // 135-degree brackets and an unchanged Probe 1 clamped directly to the rail.
    const cy=a.wheel.center[1],contactPlane=rw/2+offset,c=Math.SQRT1_2;
    const bridgeLength=300,armLength=100,footLength=60;
    const halfSpan=R-depth/2;
    const jointHalfSpan=Math.max(60,Math.min(bridgeLength/2-P*c,halfSpan-(armLength+2*P)*c-footLength/2));
    const contactAlongFoot=halfSpan-jointHalfSpan-(armLength+2*P)*c;
    a.dishing={bridgeLength,armLength,jointHalfSpan,contactAlongFoot,connectorAngle:135};
    if(contactAlongFoot<5||contactAlongFoot>55)errors.push('The fixed 300 mm centre rail and 100 mm arms cannot place both metal feet on this rim. The photo model keeps its real lengths; it is not stretched to fit.');
    const rootX=contactPlane+armLength*c,bx=rootX+P/2;
    function rail(length:number,pos:Vec3,rotation?:Vec3){
      add(`dish-rail-${s.profile}-${length}`,`${s.profile} dishing extrusion · ${length} mm`,'extrusion',[P,length,P],pos,
        `Photographed dishing frame: ${length} mm uncut member, ${p.family}. Fixed 300 + 100 + 100 mm configuration, independent of stand stock.`,1,'box','y',length);
      a.parts[a.parts.length-1].rotation=rotation;
    }
    rail(bridgeLength,[bx,cy,0]);
    function bend(sku:string,name:string,origin:Vec3,legs:[[number,number],[number,number]],attached:number){
      const points=legs.flatMap(d=>[[0,0],[d[0]*60,d[1]*60]]);
      const dims:Vec3=[Math.max(...points.map(v=>v[0]))-Math.min(...points.map(v=>v[0]))+12,Math.max(...points.map(v=>v[1]))-Math.min(...points.map(v=>v[1]))+12,18];
      add(sku,name,'metal',dims,origin,'Pictured open 135° bracket: two 60 mm legs, 18 mm width, 6 mm thickness, Ø5.5 mm holes. M5 bolt and profile-compatible T-nut in each attached leg. Hole centres shown 40 mm from the bend are provisional. Relieved gusset follows the photo approximately. Outer free legs are the metal rim contacts.',2,'photo-bracket');
      a.parts[a.parts.length-1].bendLegs=legs;
      const sum=[legs[0][0]+legs[1][0],legs[0][1]+legs[1][1]];
      for(let i=0;i<attached;i++){
        const d=legs[i],raw=[-d[1],d[0]],flip=raw[0]*sum[0]+raw[1]*sum[1]>=0?1:-1,n=[raw[0]*flip,raw[1]*flip];
        const point:Vec3=[origin[0]+d[0]*40+n[0]*3,origin[1]+d[1]*40+n[1]*3,0];
        add('dish-bracket-m5','M5 × 16 dishing bracket bolt','hardware',[5,16,5],point,'Through Ø5.5 mm bracket hole into an M5 T-nut. Six occupied holes total; the two free foot holes remain empty.',2,'cylinder','x');
        a.parts[a.parts.length-1].rotation=[0,0,Math.atan2(n[1],n[0])];
        add('dish-bracket-tnut-'+s.profile,`${p.family} M5 dishing bracket T-nut`,'hardware',[4,10,p.slot+2],[point[0]-n[0]*6,point[1]-n[1]*6,0],'M5 thread matching the chosen extrusion family.',2);
        a.parts[a.parts.length-1].rotation=[0,0,Math.atan2(n[1],n[0])];
      }
    }
    for(const sign of [-1,1]){
      const root:Vec3=[rootX,cy+sign*jointHalfSpan,0];
      const dir:[number,number]=[-c,sign*c];
      // Both square arm ends retain their stock length; offset to the two
      // adjoining faces leaves the gussets in the open corners, not in the rails.
      rail(armLength,[rootX-(P+armLength)*c/2,root[1]+sign*(3*P+armLength)*c/2,0],[0,0,sign>0?Math.PI/4:3*Math.PI/4]);
      bend('dish-joint-bracket','135° centre-to-arm bracket',root,[[0,-sign],dir],2);
      const end:Vec3=[contactPlane,root[1]+sign*(armLength+2*P)*c,0];
      bend('dish-foot','135° metal rim-contact foot',end,[[c,-sign*c],[0,sign]],1);
    }
    const allowance=valid(s.dishAllowance,1,15)?s.dishAllowance:5;
    const q=W/2+100-bx,reach=100-q;
    a.probe={nominal:reach,min:7,max:93,inward:reach-7,outward:93-reach,allowance,rodLength:105,stopReach:0};
    probe1('dish',[W/2+100,cy,P/2],[0,0,Math.PI],q);
    probeClamp([bx,cy,P/2+2.5],'z',true);
    if(a.probe.inward<allowance||a.probe.outward<allowance)errors.push(`Probe 1 lacks ±${allowance} mm reserve at this hub spacing. Its 105 mm body and native slot remain unchanged.`);
    notes.push('Photographed dishing model only: 300 mm centre rail + 2 × 100 mm angled arms; four metal bend brackets, six M5 bracket bolts, and one unchanged Probe 1 with its direct M4 slot clamp. No printed rim stops, contact shoe or centre adapter.',
      'The preview uses the supplied 135° included-angle brackets, producing 45° rail turns. A 45° bracket can be used for the complementary mounting arrangement; confirm its mounting faces and matched foot positions. This is the same three-rail mechanism, not a second straight design.',
      `Rim contact is on the free metal foot legs, ${contactAlongFoot.toFixed(1)} mm from each outer bend. Set both arm joints equally along the centre rail and lock them. The 60 mm foot legs and gussets are schematic around the dimensions supplied; verify actual hole centres.`,
      'Probe 1 bolts directly across the centre rail as in the photos. Its narrow end references the stationary hub face; verify axle and seal clearance on the real hub. Slide its existing slot and lock the M4 washer. Do not adjust it while comparing wheel sides.');
    a.steps=[
      'Use one 300 mm centre rail and two 100 mm arms. Fit the two inner 135° brackets and set the arm joints symmetrically along the centre rail.',
      'Attach one 135° bracket to the outer end of each arm. Leave each outward leg free to serve as a metal rim-contact foot. Verify that both contact faces are coplanar.',
      'Bolt the unchanged Probe 1 directly through its existing slot to the centre rail with an M4 bolt, wide washer and matching T-nut.',
      'Seat both metal feet on one rim side, slide the narrow probe end to the stationary hub face and lock it. Reverse the tool without changing the setting; compare the central gap.',
      'Repeat at several rim positions. If the gauge rocks, establish the reference from the opposite side; check seals, axle clearance, joint rigidity and equal foot contact.'
    ];
  }
  for(const part of a.parts.filter(p=>p.kind==='pla')) {
    if(part.radialMeshKey==='Radial printable bridge') {
      part.print={bed:'Flat mounting back on bed; STL at Z=0',supports:'Supports OFF. One connected solid; horizontal lug holes have 45° roofs.',accuracy:'Print envelope 180 × 68 × 30.75 mm. Three frame bolts clamp 8 mm lands; the direct lug ear uses one M5 × 25. Verify friction and fit after printing.'};
      part.spec+=` PRINT: ${part.print.bed}. ${part.print.supports} ${part.print.accuracy}`;
      continue;
    }
    if(part.capDesign==='centred-v2') {
      part.print={bed:'Upright, collar opening on bed and V pointing up; STL already has this orientation',supports:'Supports OFF. Internal roof is 45°, outward saddle slopes are 53.6° above horizontal. Only the 1.5 mm rail seating ledge is a small horizontal overhang; inspect that layer in the slicer.',accuracy:'Print the 5 mm four-slot coupon upright first. Measure actual slot mouths and tune tongue interference independently. Check full seating and equal V heights. Keep elephant-foot expansion off the slot keys. Physical print and fit remain unverified.'};
      part.spec+=` PRINT: ${part.print.bed}. ${part.print.supports} ${part.print.accuracy}`;
      continue;
    }
    const bed=part.shape==='probe1'?'Native Fusion Z=0 flat back on bed; rear flange upwards':part.sku==='lateral-dial-bracket'?'Flat mounting back (−Z) on bed; single mounting ear grows upwards':part.shape==='top-cap'?'Outer back face on bed; rail socket faces up':'Largest flat face on bed; through-hole axes vertical where present';
    const supports=part.shape==='top-cap'?'Local support may be needed under the cradle nose. Current integral cap is NOT claimed support-free; keep support away from the rail-end datum and seat.':part.sku==='lateral-dial-bracket'?'No external support intended. Horizontal 5.5 mm lug holes need a bridge test; drill to final clearance if needed.':'No support intended in the stated orientation; confirm every layer in the slicer before printing.';
    const accuracy=part.shape==='top-cap'?'Check both seating heights and rail shoulders with a reference; remove elephant foot without changing the datum.':'Print a hole/fit coupon, compensate first-layer expansion, and measure mating faces. Drill clearance holes only; preserve contact faces. Check after tightening.';
    part.print={bed,supports,accuracy};part.spec+=` PRINT: ${bed}. ${supports} ${accuracy}`;
  }
  for(const part of a.parts.filter(p=>p.kind==='pla'))if(part.size.some(d=>d>180))errors.push(`${part.name} exceeds the 180 mm print envelope (200 mm bed with margins). This configuration needs a smaller stock step or a split fixture.`);
  return a;
}
