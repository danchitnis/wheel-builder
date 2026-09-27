import { parseConfiguration, restoreConfiguration, serializeConfiguration, BUILD_SESSION_KEY, type BuildConfiguration, type BuildStorage } from './buildConfiguration.ts';

export type Vec3 = [number, number, number];
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
  dishStopReach: number | null; dishAllowance: number; dishLayout: 'straight' | 'angled'; mode: 'pointers' | 'dials'; fit: number; tool: ToolKind;
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
    ...inferAxle(config.spacing), seatLeft:null, seatRight:null, projection:null, guideRod:false, dialLugHole:6.5, dialLugThickness:6, dialLugOffset:8, rimDiameter: null, dishStopReach:null, dishAllowance:5, dishLayout:'straight', mode: 'pointers', fit: 0.3, tool: 'stand',
    observations: '', readings: '', reverseA: '', reverseB: '', dishGap: '' };
}
// Fit overrides belong to a wheel snapshot. A different wheel must not inherit them.
export function loadWorkshop(raw: string | null, config: BuildConfiguration): WorkshopSettings {
  const defaults = workshopDefaults(config);
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || saved.version !== 1 || !saved.settings) return defaults;
    const v = saved.settings;
    const same = saved.design === 3 && saved.wheel === serializeConfiguration(config, false);
    const n = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
    return { ...defaults,
      profile: Object.hasOwn(profiles, v.profile) ? v.profile : defaults.profile,
      lengths: Array.isArray(v.lengths) && v.lengths.length > 0 && v.lengths.length <= 50 && v.lengths.every((x: unknown) => n(x, 100, 2000) && Number.isInteger(x)) ? [...new Set<number>(v.lengths)].sort((a,b)=>a-b) : defaults.lengths,
      dialLugHole:n(v.dialLugHole,5.5,10)?v.dialLugHole:6.5, dialLugThickness:n(v.dialLugThickness,3,12)?v.dialLugThickness:6, dialLugOffset:n(v.dialLugOffset,5,15)?v.dialLugOffset:8,
      dishStopReach:n(v.dishStopReach,40,160)&&v.dishStopReach%20===0?v.dishStopReach:null, dishAllowance:n(v.dishAllowance,1,15)?v.dishAllowance:5,
      dishLayout:v.dishLayout==='angled'?'angled':'straight',
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
  return JSON.stringify({ version: 1, design: 3, wheel: serializeConfiguration(config, false), settings });
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
// Reach is measured from the carriage front face to the hub-contact face.
// Reserve 10 mm for the shoe/clearance and 15 mm at the rod rear for nuts/tail.
export function dishingProbeRange(nominal:number,rodLength:number){
  const min=10,max=rodLength-15;
  return {nominal,min,max,inward:nominal-min,outward:max-nominal};
}
export function dishOffset(gap: number) { return gap / 2; }

export interface Part {
  id: string; sku: string; name: string; kind: 'extrusion' | 'pla' | 'metal' | 'gauge' | 'hardware';
  shape: 'box' | 'cylinder' | 'ring' | 'angle' | 'top-cap' | 'rail-mount' | 'clamp' | 'dial' | 'clevis' | 'dial-lug' | 'dish-plate' | 'fork' | 'angle-foot' | 'photo-bracket' | 'contact-cap' | 'fixed-stop'; bore?: number; size: Vec3; position: Vec3; axis?: 'x' | 'y' | 'z';
  stock?: number; spec: string; stage: number;
  rotation?: Vec3; profileSize?: number; fit?: number; seatHeight?: number; mountBore?: number; nose?: number;
  lugWidth?: number; lugOffset?: number;
  endLocated?:boolean; angleReach?:number; angleSign?:number; holes?: {x:number;y:number;r:number}[]; print?: {bed:string; supports:string; accuracy:string}; mountTarget?: Vec3; mountSide?: number;
  movesWithWheel?: boolean; measurementAxis?: 'x' | 'y';
}
export interface Assembly {
  probe?: {nominal:number;min:number;max:number;inward:number;outward:number;allowance:number;rodLength:number;stopReach:number}; parts: Part[]; errors: string[]; notes: string[]; steps: string[];
  wheel: { diameter: number; width: number; depth: number; hubWidth: number; axleDiameter: number; center: Vec3; spokes: number; left: number; right: number; flangeL: number; flangeR: number; offset: number };
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
  if(s.mode==='dials' && (!valid(s.dialLugHole,5.5,10)||!valid(s.dialLugThickness,3,12)||!valid(s.dialLugOffset,5,15)))errors.push('Confirm rear lug dimensions: hole 5.5–10 mm, thickness 3–12 mm, hole centre 5–15 mm behind the case.');
  if (!s.lengths.length || s.lengths.some(n=>!Number.isInteger(n) || n<100 || n>2000)) errors.push('Stock lengths must be whole millimetres between 100 and 2000.');
  const diameter = valid(D,250,850) ? D : 650, R=diameter/2;
  const W=valid(s.hubWidth,70,250)?s.hubWidth:135;
  const rw=valid(config.rimWidthOuter,10,100)?config.rimWidthOuter:25;
  const depth=valid(config.rimDepth,5,100)?config.rimDepth:20;
  if (Math.max(config.flangePcdLeft ?? 0, config.flangePcdRight ?? 0)/2 + depth + 10 >= R) errors.push('Rim and flange envelopes overlap; confirm the wheel dimensions in the builder.');
  if ((config.centerToLeft ?? 0) + 5 >= W/2 || (config.centerToRight ?? 0) + 5 >= W/2) errors.push('Hub flange geometry reaches the axle supports; confirm flange distances and hub spacing.');
  const axleD = s.axle === 'qr9' ? 9 : s.axle === 'qr10' ? 10 : Number(s.axle)||10;
  const offset = Number.isFinite(config.hubOffset) ? config.hubOffset! : 0;
  if (Math.abs(offset) > 15) errors.push('Frame offset exceeds this design’s ±15 mm measurement adjustment.');
  if (Math.abs(offset)+rw/2+10 >= W/2) errors.push('Rim and hub dimensions leave insufficient lateral probe clearance.');
  const a: Assembly = { parts: [], errors, notes, steps: [], estimated:s.rimDiameter===null,
    title:s.tool==='stand'?'Truing stand':'Dishing gauge',
    wheel:{diameter,width:rw,depth,hubWidth:W,axleDiameter:axleD,center:[0,0,0],spokes:config.spokeCount ?? 32,
      left:valid(config.centerToLeft,1,200)?config.centerToLeft:30,right:valid(config.centerToRight,1,200)?config.centerToRight:20,flangeL:valid(config.flangePcdLeft,1,200)?config.flangePcdLeft:55,flangeR:valid(config.flangePcdRight,1,200)?config.flangePcdRight:55,offset} };
  notes.push(`${s.profile}: ${p.family}; use matching ${p.bolt} T-nuts and brackets. Slot sections in the preview are schematic; check your supplier’s profile drawing.`,
    'Bare wheel only: remove tyre, cassette and rotor. All extrusion members are purchased at the listed lengths; no extrusion cutting or end tapping.',
    `PLA clearance: ${fit.toFixed(2)} mm added to nominal hole diameter / mating width. Print a fit coupon first. Use through-bolts and captured metal nuts; do not tap PLA.`,
    'Printed fixtures: 6 mm minimum walls, 5 perimeters, 40% infill as a starting point. Orient layers so clamping loads do not split them. Verify under light measurement load; keep away from heat.',
    'Bracket and fastener envelopes are schematic. Match actual slot depth, bracket thickness and bolt engagement before ordering; listed bolt lengths are preliminary.');
  if (a.estimated) notes.push('Rim outside diameter is estimated as ERD + 2 × rim depth. Confirm with a physical measurement before buying stock.');
  if (offset) notes.push(`Builder frame offset is ${offset} mm. A zero-gap symmetric dishing check is not the final target: verify the required signed offset against the bicycle’s frame specification.`);
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
  function m6Rod(name:string,len:number,pos:Vec3,axis:Part['axis'],sku:string,stage=3) {
    add(sku,name,'metal',[6,len,6],pos,`M6 × ${len} mm purchased threaded rod / fully threaded bolt; metal nut guides. Do not cut extrusion.`,stage,'cylinder',axis);
    for (const delta of [-8,8]) {
      const pt:Vec3=[...pos];pt[{x:0,y:1,z:2}[axis!]]+=delta;
      add('m6-locknut','M6 adjustment / lock nut','hardware',[10,5,10],pt,'Captured steel hex nut or jam nut; lock adjustment without loading rim.',stage,'cylinder',axis);
      add('m6-washer','M6 flat washer','hardware',[12,1,12],pt,'Distribute nut pressure onto fixture.',stage,'cylinder',axis);
    }
  }
  if (s.tool==='stand') {
    const qr = s.axle === '' || s.axle === 'qr9' || s.axle === 'qr10';
    const seatLeft=valid(s.seatLeft,6,35)?s.seatLeft:(qr?axleD:axleD+6);
    const seatRight=valid(s.seatRight,6,35)?s.seatRight:(qr?axleD:axleD+6);
    const projection=valid(s.projection,3,20)?s.projection:3;
    const nose=Math.min(6,projection);
    if(!valid(s.seatLeft,6,35)||!valid(s.seatRight,6,35)||!valid(s.projection,3,20))errors.push('Confirm both hub-end diameters and at least 3 mm usable projection before printing the cradles. Nominal seats are shown provisionally.');
    const ux = W/2 + nose + P/2;
    notes.push(`Coplanar H base: all three base rails sit at Y = ${P/2} mm with their bottoms on the same surface. The crossbar ends butt against the inner faces of the two feet. Both uprights sit on its top face at Y = ${P} mm.`,
      'Base corner brackets are turned into the horizontal plane and bolt into SIDE slots in both rails. They do not bridge a stacked height difference. Upright brackets still bolt into a top slot and an upright side slot.',
      'The supplied 27 × 27 × 19 mm bracket photo does not dimension the slot position or flange thickness. Its 19 mm width must clear the bench when rotated on a 20 mm rail, and both slot holes and nuts must match. The schematic brackets are not confirmation of that product’s fit.');
    // Both uprights use the SAME stock member; axle height is a consequence of
    // the top-end datum, never an independently adjustable slider setting.
    const uprightLength = stockLength(R+140, s.lengths);
    const top = P + (uprightLength ?? R+140);
    const seatBottom = top+10;
    const yAxle = seatBottom+Math.max(seatLeft,seatRight)/2;
    const rimBottom = yAxle-R;
    a.wheel.center=[0,yAxle,0];
    const crossLength=stock('Cross rail',2*ux+3*P+20,'x',[0,P/2,0]);
    const footX=(crossLength??(2*ux+3*P+20))/2+P/2;

    // A bracket's origin is its INSIDE corner. Local +X runs away from the
    // vertical face; local +Y goes up. Rotation mirrors both flanges together.
    function angle(corner:Vec3, axis:'x'|'z', sign:number) {
      const yaw = axis==='x' ? (sign>0?0:Math.PI) : (sign>0?-Math.PI/2:Math.PI/2);
      add(`angle-${P}`,`${P} mm two-flange angle bracket`,'metal',[P,P,P],corner,
        `Two perpendicular 4 mm flanges, ${p.family}. Bottom flange sits on the horizontal rail; upright flange touches the adjoining rail face. Two ${p.bolt} bolts through visible holes. The upright starts on the crossbar top; the bracket fixes its base without a printed spacer. Hole centres here specify required alignment, not a verified vendor drawing.`,1,'angle');
      const part=a.parts[a.parts.length-1];part.rotation=[0,yaw,0];part.bore=Number(p.bolt.slice(1))+.5;
      const q=P/2, d=Number(p.bolt.slice(1));
      // Position actual bolt stacks against each flange, not the bracket box centre.
      for(const horizontal of [true,false]) {
        const pt:Vec3=[...corner];pt[axis==='x'?0:2]+=sign*(horizontal?q:2);
        pt[1]+=horizontal?2:q;
        const boltAxis=horizontal?'y':axis;
        add(`angle-bolt-${p.bolt}`,`${p.bolt} × 12 bracket bolt`,'hardware',[d,12,d],pt,'Through angle flange into matching slot T-nut; verify supplier engagement.',1,'cylinder',boltAxis);
        const washer:Vec3=[...pt],nut:Vec3=[...pt];
        const ai=horizontal?1:(axis==='x'?0:2),direction=horizontal?1:sign;
        washer[ai]+=direction*3;nut[ai]-=direction*5;
        add(`angle-washer-${p.bolt}`,`${p.bolt} bracket washer`,'hardware',[d*2,1,d*2],washer,'Flat washer on outer bracket flange.',1,'cylinder',boltAxis);
        const nutSize:Vec3=horizontal?[P*.6,4,p.slot+2]:axis==='x'?[4,P*.6,p.slot+2]:[p.slot+2,P*.6,4];
        add(`angle-tnut-${s.profile}`,`${p.family} ${p.bolt} bracket T-nut`,'hardware',nutSize,nut,'Seated inside the adjoining extrusion slot.',1);
      }
    }
    function baseAngle(sign:number,front:number){
      const corner:Vec3=[sign*(footX-P/2),P/2,front*P/2],q=P/2,d=Number(p.bolt.slice(1));
      add(`angle-base-${P}`,`${P} mm H-base side-slot corner bracket`,'metal',[P,P,P],corner,
        `Bracket lies in the base plane with its width vertical. Both flanges meet vertical rail faces; two ${p.bolt} bolts enter SIDE-slot T-nuts. Bottom/top of schematic bracket align with the ${P} mm rail. Verify actual bracket width clears the bench.`,1,'angle');
      Object.assign(a.parts[a.parts.length-1],{rotation:[-sign*front*Math.PI/2,0,sign>0?Math.PI:0],bore:d+.5});
      for(const leg of [0,1]){
        const pos:Vec3=leg?[corner[0]-sign*2,P/2,corner[2]+front*q]:[corner[0]-sign*q,P/2,corner[2]+front*2];
        const axis=leg?'x':'z',ai=leg?0:2,normal=leg?-sign:front;
        add(`base-bolt-${p.bolt}`,`${p.bolt} × 12 H-base bracket bolt`,'hardware',[d,12,d],pos,'Through corner bracket into the adjoining rail side slot; confirm engagement with actual flange thickness.',1,'cylinder',axis);
        const washer:Vec3=[...pos],nut:Vec3=[...pos];washer[ai]+=normal*3;nut[ai]-=normal*5;
        add(`base-washer-${p.bolt}`,`${p.bolt} H-base washer`,'hardware',[d*2,1,d*2],washer,'Flat washer outside bracket flange.',1,'cylinder',axis);
        add(`base-tnut-${s.profile}`,`${p.family} ${p.bolt} H-base T-nut`,'hardware',leg?[4,p.slot+2,P*.6]:[P*.6,p.slot+2,4],nut,'Matching T-nut inside the side slot; not an end-tapped connection.',1);
      }
    }
    function throughBolt(pos:Vec3,length:number,axis:'x'|'y'|'z',name='M5 fixture through-bolt') {
      add(`m5-through-${length}`,name,'hardware',[5,length,5],pos,'M5 steel bolt through clearance hole into a captured metal nut; do not tap PLA.',2,'cylinder',axis);
      const n:Vec3=[...pos];n[{x:0,y:1,z:2}[axis]]-=length/2-2;
      add('m5-nut','M5 captured nut','hardware',[8,4,8],n,'Captured steel hex nut.',2,'cylinder',axis);
    }
    for(const sign of [-1,1]) {
      stock('Base foot',Math.max(300,R+60),'z',[sign*footX,P/2,0]);
      if(uprightLength)stock('Upright',R+140,'y',[sign*ux,P+uprightLength/2,0],2);
      else errors.push('Upright needs at least '+Math.ceil(R+140)+' mm; no available stock fits.');
      // Coplanar butt joints, with a bracket on each side of the crossbar.
      for(const front of [-1,1])baseAngle(sign,front);
      for(const side of [-1,1])angle([sign*ux+side*P/2,P,0],'x',side);

      const seatD=sign<0?seatLeft:seatRight;
      add('top-cap-'+(sign<0?'left':'right'),'PLA '+(sign<0?'left':'right')+' top cap with integral cradle','pla',[P+6+nose,69,P+20],[sign*(W/2+nose),top,0],
        `Hollow rail socket ${P+fit} × ${P+fit} mm; 6 mm top shoulder sets datum. Integral ${nose} mm-deep nose supports the stationary ${seatD} mm protrusion in an upward-open rounded indent. Two front/rear side-slot fixing pairs retain the cap. No custom metal components.`,2,'top-cap');
      Object.assign(a.parts[a.parts.length-1],{bore:seatD+fit,profileSize:P,fit,seatHeight:yAxle-top-seatD/2,nose,rotation:[0,sign<0?Math.PI:0,0]});
      for(const front of [-1,1])for(const dy of [-12,-30]) {
        const z=front*(P/2+3);
        add(`cap-bolt-${p.bolt}`,`${p.bolt} × 16 cap fixing bolt`,'hardware',[Number(p.bolt.slice(1)),16,Number(p.bolt.slice(1))],[sign*ux,top+dy,z],
          'Through visible skirt hole into a side-slot T-nut. Tighten only after the cap shoulder is fully seated on the rail end.',2,'cylinder','z');
        add(`cap-nut-${s.profile}`,`${p.family} ${p.bolt} cap T-nut`,'hardware',[p.slot+2,12,4],[sign*ux,top+dy,front*(P/2-3)],'Metal T-nut in front/rear upright slot.',2);
      }
    }
    // Existing protrusions are wheel components, not new purchased adaptors.
    for(const sign of [-1,1]) {
      const d=sign<0?seatLeft:seatRight;
      add('existing-end-'+sign,'Existing stationary hub-end protrusion','metal',[d,projection,d],[sign*(W/2+projection/2),yAxle,0],
        'Part of your hub, not a purchase. This stationary protrusion rests in the printed indent while the shell rotates on its bearings.',2,'cylinder','x');
      a.parts[a.parts.length-1].movesWithWheel=true;
    }
    if(s.guideRod) {
      const rodD=qr?5:axleD===12?10:axleD===15?12:16,length=Math.ceil((W+2*P+40)/50)*50;
      add('loose-guide-rod','Optional loose smooth guide rod','metal',[rodD,length,rodD],[0,yAxle,0],
        `Standard ${rodD} × ${length} mm smooth rod, only if it freely fits the measured hub bore. No nuts, collars or clamping. Cradles carry the wheel; rod is an alignment aid.`,2,'cylinder','x');
      a.parts[a.parts.length-1].movesWithWheel=true;
    }
    const lateralZ=P/2+(s.mode==='dials'?70:45);
    const contactY=yAxle-Math.sqrt(Math.max(1,(R-depth/2)**2-lateralZ**2));
    const lateralX=offset+rw/2+34;
    for(const lateral of [true,false]) {
      const role=lateral?'lateral':'radial', axis=lateral?'x':'y';
      const pos:Vec3=lateral?[lateralX,contactY,lateralZ]:[offset,rimBottom-34,0];
      // Pointer blocks and rear-lug clevises use different short rail brackets.
      const body:Vec3=lateral?[pos[0]+43,pos[1],lateralZ]:[pos[0],pos[1]-43,0];
      const postX=s.mode==='dials'?body[0]:pos[0];
      const postZ=s.mode==='dials'?body[2]-40:pos[2];
      const headBottom=s.mode==='dials'?body[1]-20:pos[1]-16;
      const side=lateral?1:-1, railZ=side*(P/2+6);
      const origin:Vec3=[ux,headBottom-6,railZ];
      const reach:Vec3=[postX-ux,0,postZ-railZ];
      add(`${role}-${s.mode}-rail-mount`,`PLA ${role} ${s.mode==='dials'?'dial':'pointer'} upright bracket`,'pla',
        [Math.abs(reach[0])+40,48,Math.abs(reach[2])+40],origin,
        `Slides directly on the ${lateral?'front':'rear'} slot of the right upright. Two ${p.bolt} bolts, 18 mm vertical pitch, lock height. Short 12 mm-thick horizontal support reaches the ${s.mode==='dials'?'rear-lug clevis':'pointer nut block'}; no freestanding printed post. Print with the broad horizontal ledge underside on the bed; the upright flange grows upwards from it. Check deflection with a known shim.`,3,'rail-mount');
      Object.assign(a.parts[a.parts.length-1],{mountTarget:reach,mountSide:side,bore:Number(p.bolt.slice(1))+.5});
      for(const dy of [14,32])bolt([ux,origin[1]+dy,railZ],3,'z',20,side);
      if(origin[1]-24<2*P)errors.push(`${role} bracket overlaps the upright base bracket; choose longer upright stock.`);
      if(s.mode==='pointers') {
      add(`${role}-holder`, `PLA ${role} pointer nut block`,'pla',[40,32,40],pos,
        'M6 pointer passes through two captured metal nuts on its own axis. Two separate M5 mounting screws are 14 mm off that axis; neither crosses the pointer.',3,'clamp',axis);
      Object.assign(a.parts[a.parts.length-1],{bore:6+fit});
      // These fixings used to cross the horizontal pointer. Offset in Z for
      // the lateral head and in X for the radial head to maintain clearance.
      for(const sign of [-1,1]) {
        const mount:Vec3=lateral?[pos[0],pos[1]-12,pos[2]+sign*14]:[pos[0]+sign*14,pos[1]-12,pos[2]];
        throughBolt(mount,30,'y','M5 × 30 offset head mounting bolt');
      }
        m6Rod(lateral?'Lateral pointer screw':'Radial pointer screw',60,pos,axis,`${role}-pointer`);
        add('pointer-tip','Rounded PLA pointer tip','pla',[6,6,6],lateral?[offset+rw/2+1,contactY,lateralZ]:[offset,rimBottom-1,0],
          'Rounded cap on M6 pointer. Set gap with feeler gauge; retract before lifting the wheel.',3,'cylinder',axis);
      }else {
        add(`dial-${role}`,`${lateral?'Lateral':'Radial'} dial · face toward operator`,'gauge',[55,22,55],body,
          'Standard 8 mm stem dial indicator, 0.01 mm graduation, 10 mm travel. Face points toward +Z operator side. Display is illustrative.',3,'dial','z');
        a.parts[a.parts.length-1].measurementAxis=axis;
        add('dial-stem','Dial stem and plunger (included)','gauge',[8,50,8],lateral?[pos[0]-9,pos[1],lateralZ]:[pos[0],pos[1]+9,0],
          'Included stem and contact tip; adjust the mounting position to give light preload without deflecting the rim.',3,'cylinder',axis);
        const lugHole=Number.isFinite(s.dialLugHole)?s.dialLugHole:6.5;
        const lugWidth=Number.isFinite(s.dialLugThickness)?s.dialLugThickness:6;
        const lugOffset=Number.isFinite(s.dialLugOffset)?s.dialLugOffset:8;
        add('dial-lug','Indicator rear lug (included with dial)','gauge',[lugWidth,18,lugOffset+10],[body[0],body[1],body[2]-11-lugOffset],
          `Existing rear lug of purchased indicator: ${lugHole} mm hole, ${lugWidth} mm thickness; hole centre ${lugOffset} mm behind the case rear face. Confirm these dimensions on your dial. No separate custom metal component.`,3,'dial-lug','x');
        a.parts[a.parts.length-1].bore=lugHole;
        add(`${role}-dial-bracket`,`PLA ${role} rear-lug clevis`,'pla',[40,40,60],[body[0],body[1],body[2]-30],
          `Printed bracket is bolted to the short upright-slot support to the indicator's rear lug. Two 6 mm ears straddle the ${lugWidth} mm lug with +${fit} mm clearance per side. A standard M5 bolt passes through BOTH ears and the existing lug hole. Two M5 base screws secure clevis to upright bracket, away from all plunger travel.`,3,'clevis');
        Object.assign(a.parts[a.parts.length-1],{bore:5.5,lugWidth:lugWidth+2*fit,lugOffset});
        const length=Math.ceil((lugWidth+2*fit+12+10)/5)*5;
        throughBolt([body[0],body[1],body[2]-11-lugOffset],length,'x','M5 rear-lug mounting bolt');
        for(const dx of [-14,14])throughBolt([body[0]+dx,body[1]-25,postZ],30,'y','M5 clevis-to-bracket fixing bolt');

      }
    }
    notes.push(
      `Both top caps seat on equal ${uprightLength??'unavailable'} mm uprights. Their printed cradle depths compensate for the entered left/right protrusion diameters, giving axle height ${yAxle.toFixed(2)} mm.`,
      'Measure the diameter and usable projection of BOTH stationary hub ends. Cradles must support those ends, not bearing seals or rotating hub shell. If either end has no usable protrusion, this seating arrangement is not compatible.',
      'The wheel rotates on its hub bearings; the protruding ends stay stationary in the PLA indents. There is no QR cam, clamping nut, steel dropout, custom shaft collar or metal adaptor sleeve.',
      'Optional smooth rod: slide loosely through the hub bore without nuts, tightening or bearing preload. It is only a guide, not the load-bearing axle or positive wheel retention. Remove it before reversing if it impedes lifting.',
      'Each measurement head is carried directly by an upright slot. Two vertically spaced slot bolts lock each short printed bracket; no parallel PLA towers. Lateral mount is forward of the rail; radial mount reaches under the rim from the rear.',
      'Dial upgrade: keep the extrusion frame and hub cradles. Replace the simple pointer upright brackets and nut blocks with dial-specific upright brackets and rear-lug clevises; reposition the slot fixings. Reuse compatible M5 hardware, add the two rear-lug bolts, then recalibrate.',
      'Printed sections have a maximum 180 mm envelope, allowing a 10 mm margin on a 200 × 200 mm bed. No long printed measurement posts are required. Printer Z clearance and brim settings still need checking.',
      'Calibrate in the actual unclamped condition: compare seat heights, reseat three times, reverse the wheel and use very light probe contact. PLA wear, joint compliance and hub bearing play can limit repeatability; a loose rod does not cancel them.'
    );
    a.steps=[
      'Lay both feet and the crossbar flat as an H. Butt each crossbar end against a foot’s inner face and secure both side-slot corner brackets. Fit the equal-length uprights on the middle crossbar, then square and tighten their base brackets.',
      'Measure both hub-end protrusion diameters and their minimum usable length. Print the matched cradle caps; seat their shoulders fully on the upright ends and retain with side-slot bolts.',
      'Lower the stationary hub ends into the open PLA indents. Check that the hub shell and seals are clear and the wheel spins on its bearings. No wheel clamping is required.',
      'Optionally insert a loose smooth rod through the hub bore. Do not tighten nuts against the hub or supports. Retract probes, lift, reverse and reseat without moving the caps.',
      'Print each short upright bracket and head separately. Slide two T-nuts into the right upright front or rear slot. Set each measurement height and lock both vertically spaced bolts.',
      'Fit M6 pointer screws and captured nuts. Head-mount bolts sit beside the pointer, not through it. For dials bolt the actual rear mounting lug between the printed clevis ears, with faces toward the operator. No stem clamp is used. Check joint rigidity and reseating repeatability.'
    ];
  } else {
    a.wheel.center=[0,R+60,0];
    // Bridge is outside the widest hub face; feet reach back to the same rim side.
    const angled=s.dishLayout==='angled';
    const cy=a.wheel.center[1],contactPlane=rw/2+offset;
    const rodZ=P/2+14;
    const halfSpan=angled?R-depth/2:Math.sqrt((R-depth/2)**2-rodZ**2);
    // Rim stops slide along continuous arms; stock can extend past the rim.
    // Keep the metal outside the wheel until the overhang is beyond its OD.
    const contactStandOff=Math.ceil((depth/2+10)/10)*10;
    const allowance=valid(s.dishAllowance,1,15)?s.dishAllowance:5;
    if(!valid(s.dishAllowance,1,15))errors.push('Dishing setup allowance must be 1–15 mm.');
    const stopReach=s.dishStopReach??Math.max(40,Math.ceil((W/2-contactPlane+18+allowance)/20)*20);
    if(!valid(stopReach,40,160)||stopReach%20!==0)errors.push('Choose a matched stop reach from 40 to 160 mm in 20 mm steps.');
    const minProjection=Math.max(35,W/2+18+allowance-contactPlane-P/Math.sqrt(2)-contactStandOff);
    let selection:{bridge:number;arm:number;mount:number;travel:number;endLocated:boolean}|undefined;
    const candidates:{bridge:number;arm:number;mount:number;travel:number;endLocated:boolean}[]=[];
    for(const bridgeLength of [...s.lengths].sort((a,b)=>a-b)){
      const mount=Math.min(bridgeLength/2-12,halfSpan-minProjection);
      if(mount<82)continue;
      const travel=(halfSpan-mount)*Math.sqrt(2);
      for(const arm of s.lengths)if(arm>=travel+25)candidates.push({bridge:bridgeLength,arm,mount,travel,endLocated:false});
      for(const arm of s.lengths){
        const endMount=halfSpan-arm/Math.sqrt(2);
        if(endMount>=82&&endMount<=bridgeLength/2-12&&arm/Math.sqrt(2)>=minProjection)candidates.push({bridge:bridgeLength,arm,mount:endMount,travel:arm,endLocated:true});
      }
    }
    // Minimise all three stock members, not just the first feasible bridge.
    // Equal totals favour shorter arms, which avoids unnecessary overhang.
    candidates.sort((a,b)=>(a.bridge+2*a.arm)-(b.bridge+2*b.arm)||a.arm-b.arm||Number(b.endLocated)-Number(a.endLocated)||a.bridge-b.bridge);
    selection=candidates[0];
    const armLength=selection?.arm??null;
    const armProjection=(armLength??0)/Math.sqrt(2);
    const mountHalfSpan=selection?.mount??82;
    const contactProjection=halfSpan-mountHalfSpan;
    const bx=angled?contactPlane+contactStandOff+P/Math.sqrt(2)+contactProjection+P/2:contactPlane+stopReach+P/2;
    const plateX=bx-P/2-4;
    const nominalReach=plateX-4-W/2;
    const probeLength=Math.max(60,Math.ceil((nominalReach+allowance+15)/10)*10);
    a.probe={...dishingProbeRange(nominalReach,probeLength),allowance,rodLength:probeLength,stopReach};
    if(a.probe.inward<allowance||a.probe.outward<allowance)errors.push(`Central probe lacks ±${allowance} mm setup reserve. ${angled?'Increase bridge clearance or change stock selection.':'Choose a taller matched stop pair; do not adjust one rim stop independently.'}`);
    notes.push(`Central probe reach from carriage front face: nominal ${nominalReach.toFixed(1)} mm; usable ${a.probe.min}–${a.probe.max} mm with a ${probeLength} mm M6 rod. Reserve ${a.probe.inward.toFixed(1)} mm inward and ${a.probe.outward.toFixed(1)} mm outward. Requested setup variation ±${allowance} mm. Limits are geometric, not certified accuracy.`,
      'The fixed rim contacts are a matched reference, not a prediction of wheel dish. Adjust the centre on the first side, lock both metal nuts, then reverse without changing any setting. If it rocks on the probe, reset from the opposite side to obtain a central gap with both feet seated.',
      'A 2 mm rim offset gives a 4 mm central gap only when both feet remain seated. Do not dial out that gap on the checking side. Probe travel permits initial setup; it is not consumed while measuring the locked gap. Re-zero after adjusting the wheel.',
      'Common stop-height error changes the initial probe setting. Unequal stops, bent rails, loose joints, local rim runout and changing hand pressure require mechanical correction; more independent adjusters would add drift sources.');
    if(angled&&!selection)errors.push('No available stock combination fits. The current 60 mm connectors and centre carriage require a bridge at least 194 mm long (82 mm each side plus 12 mm end margins). Arms must either end at a seated contact cap or leave 25 mm beyond a sliding contact and maintain hub clearance. Shorter lengths can be used as arms with a suitable longer bridge; no unlisted 200 mm member is substituted.');
    if(angled&&selection)notes.push(`Stock choice: ${selection.bridge} mm bridge + 2 × ${selection.arm} mm arms = ${selection.bridge+2*selection.arm} mm total. Compared ${candidates.length} feasible combinations from the entered list; lowest total stock wins, with shorter arms breaking ties. ${selection.endLocated?'Positive end-locating caps seat on both factory rail ends.':'Sliding saddles clamp along the arms.'} Rim-stop position ${selection.travel.toFixed(1)} mm along each arm; ${(selection.arm-selection.travel).toFixed(1)} mm remains beyond the contact.`);
    if(angled)notes.push('Continuous diagonal rails extend beyond the rim. Sliding printed stops set the contact positions; clamp both after wheel-size setup. The stops do not require rails cut to the wheel diameter. Metal overhang clears the wheel envelope in this model; check the actual rim, spokes and surroundings.',
      'The pictured 60 × 60 × 18 × 6 mm open 135° brackets join two extrusion slots with M5 hardware. Verify actual hole positions and slot engagement.');
    const bridge=angled&&!selection?null:stock('Dishing bridge',angled?selection!.bridge:diameter+2*P+40,'y',[bx,cy,0]);
    if(bridge && bridge>1000) notes.push('Long dishing bridge: support gently and verify that hand pressure does not change the reading.');
    const plateDepth=rodZ+30,plateZ=(rodZ-10)/2;
    function carriage(sku:string,name:string,y:number,probe=true){
      add(sku,name,'pla',[8,40,plateDepth],[plateX,y,plateZ],
        `Flat 8 mm PLA plate on the wheel-facing bridge slot. Two ${p.bolt} slot bolts at Y ±12 mm. ${probe?`M6 probe bore at Z ${rodZ} mm clears the extrusion edge; two external metal nuts lock the screw against the plate.`:'Fixed angled foot bolts to the outer wing. No rim adjustment screw.'}`,2,'dish-plate','x');
      a.parts[a.parts.length-1].holes=[{x:plateZ,y:-12,r:(Number(p.bolt.slice(1))+.5)/2},{x:plateZ,y:12,r:(Number(p.bolt.slice(1))+.5)/2},{x:plateZ-rodZ,y:0,r:(6+fit)/2}];
      if(!probe)a.parts[a.parts.length-1].holes!.pop();
      for(const dy of [-12,12])bolt([plateX,y+dy,0],2,'x',20,-1);
    }
    function screw(sku:string,name:string,contactX:number,y:number){
      const len=probeLength;
      add(sku,name,'metal',[6,len,6],[contactX+len/2,y,rodZ],
        `Standard M6 × ${len} mm threaded screw; usable reach ${a.probe!.min}–${a.probe!.max} mm from carriage front to hub face. Runs through the printed plate beside the bridge, never through the extrusion. Front end enters the printed contact shoe; two nuts at the carriage lock reach.`,2,'cylinder','x');
      for(const x of [plateX-7,plateX+7])add('dish-m6-nut','M6 dishing lock nut','hardware',[10,5,10],[x,y,rodZ],'Standard metal nut: pair clamps opposite carriage faces. No hanging counterweight.',2,'cylinder','x');
    }
    for(const sign of [-1,1]) {
      const fy=cy+sign*halfSpan,contactX=rw/2+offset;
      if(angled){
        if(!armLength)continue;
        const my=cy+sign*mountHalfSpan, rootX=bx-P/2;
        const angle=sign>0?Math.PI/4:3*Math.PI/4;
        const startX=rootX-P/(2*Math.sqrt(2));
        stock('Diagonal dishing arm',armLength,'y',[startX-armProjection/2,my+sign*armProjection/2,0],2);
        const arm=a.parts[a.parts.length-1];arm.rotation=[0,0,angle];
        arm.spec+=' Diagonal arm at 45°. Full stock length; metal carries the reach. Join to bridge with the pictured 135° bracket and matching M5 T-nuts.';
        add('dish-foot','Pictured 135° rail-to-rail bracket · 60 × 60 × 18 × 6 mm','metal',[49,109,18],[rootX,my,0],
          'Two 60 mm legs join the bridge slot to the diagonal arm slot. 18 mm width, 6 mm thickness, Ø5.5 mm holes. Hole centres shown at 40 mm are provisional; verify actual bracket dimensions and both slot engagements. M5 hardware on both legs.',2,'photo-bracket');
        a.parts[a.parts.length-1].angleSign=sign;
        for(const leg of [0,1]){
          const point:Vec3=leg?[rootX-40/Math.sqrt(2),my+sign*40/Math.sqrt(2),0]:[rootX-3,my-sign*40,0];
          add('photo-bracket-m5','M5 × 16 rail-joint bolt','hardware',[5,16,5],point,'Through a bracket hole into a profile-compatible M5 T-nut; confirm engagement. Two bolts per connector, one in each rail.',2,'cylinder','x');
          if(leg)a.parts[a.parts.length-1].rotation=[0,0,sign*Math.PI/4];
          const normal:Vec3=leg?[1/Math.sqrt(2),sign/Math.sqrt(2),0]:[1,0,0];
          add('photo-bracket-tnut-'+s.profile,`${p.family} M5 rail-joint T-nut`,'hardware',[4,12,p.slot+2],[point[0]+normal[0]*6,point[1]+normal[1]*6,0],`${p.family}, M5 internal thread. One inside each joined rail.`,2);
          if(leg)a.parts[a.parts.length-1].rotation=[0,0,sign*Math.PI/4];
        }
        const capDepth=P/Math.sqrt(2)+contactStandOff;
        add('angled-rim-cap',selection!.endLocated?'PLA end-locating rim-contact cap':'PLA sliding rim-stop saddle','pla',[capDepth,30,P+6],[contactX+capDepth/2,fy,0],
          selection!.endLocated?`Positive internal shoulder seats on the square-cut metal arm end; two side cheeks register against the extrusion. The side-slot bolt retains the cap rather than setting its depth. Flat rim contact, no V-groove or grip on the rim. Match both assembled contact heights; factory end squareness and PLA compression still affect results.`:`Open-backed sliding stop on the continuous metal arm: ${capDepth.toFixed(2)} mm X envelope, ${contactStandOff.toFixed(2)} mm contact stand-off. Open ends let the rail pass through. Position ${selection!.travel.toFixed(1)} mm along the arm; ${(armLength-selection!.travel).toFixed(1)} mm continues beyond it. Match both contact faces on a flat reference. Lock the saddle to a side-slot T-nut after setting rim span; it is not adjusted while comparing wheel sides.`,2,'contact-cap');
        Object.assign(a.parts[a.parts.length-1],{endLocated:selection!.endLocated,profileSize:P,angleSign:sign});
        bolt([contactX+capDepth-10,fy, P/2+3],2,'z',16);
        continue;
      }
      const stopReach=bx-P/2-contactX;
      add('dish-foot','PLA fixed-height rim stop','pla',[stopReach,56,30],[contactX+stopReach/2,fy,0],
        `Reusable matched stop pair, ${stopReach.toFixed(0)} mm nominal reach (20 mm size steps), from the close-set bridge to the rim. Flat contact face at X ${contactX.toFixed(2)} mm. No adjustment screw. A small rear mounting flange locks its position along the bridge; check both complete stop heights on a flat reference.`,2,'fixed-stop');
      for(const dy of [-22,22])bolt([plateX,fy+dy,0],2,'x',20,-1);
    }
    carriage('dish-center','PLA flat centre carriage',cy);
    const shoeX=W/2+4;
    screw('dish-probe','M6 central hub-face probe',shoeX,cy);
    add('probe-fork','PLA open hub-face reference shoe','pla',[8,40,2*(rodZ+10)],[shoeX,cy,0],
      `Flat fork with ${axleD+2} mm upward-open axle clearance. The inner X face contacts the hub dropout seating face at X ${W/2} mm. M6 screw ends in a rear-access nut pocket in the right-hand ear at Z ${rodZ} mm, with a captured nut on its outer face. Confirm that both lands touch the stationary hub face and clear seals.`,3,'fork','x');
    Object.assign(a.parts[a.parts.length-1],{bore:axleD+2,holes:[{x:-rodZ,y:0,r:(10+fit)/2}]});
    add('fork-captured-nut','M6 hub-shoe captured nut','hardware',[10,5,10],[shoeX+1.5,cy,rodZ],'M6 nut in a rear-access 5 mm-deep pocket. Screw ends inside the shoe; its front contact face remains plastic.',3,'cylinder','x');
    notes.push(angled?'45° layout: two full-stock metal extrusion arms carry the reach. Sliding printed saddles provide equal fixed rim contacts; there are no rim adjustment screws. Only the central hub probe adjusts during measurement. Check matched contact lands on a flat reference; printing error is not cancelled by removing adjusters. The bridge uses the shortest available length covering the inboard mounts; longer stock is allowed.':'Straight layout: use a reusable matched pair of stops in 20 mm reach steps. The central probe absorbs ordinary hub/rim variation; the stops are not printed to the exact dish of this wheel. Only the short central M6 probe adjusts; no outer screws or unnecessary common stand-off.',
      angled?'Print the open-backed saddles contact face down; keep both ends open for the rail to pass through. The metal brackets and diagonal extrusion arms supply the 45° geometry and reach. Print the centre fork on its broad X face. Verify both contact lands against a flat reference before using the gauge.':'All dishing plates and the open reference fork print flat on their broad X face. Their through-holes run vertically in this print orientation. Print the matched fixed rim stops together on their rear mounting faces, with the contact columns growing upwards. No support is intended for these parts; inspect the slicer preview and verify actual hub-face contact.');
    a.steps=[
      angled?'Join two equal full-stock diagonal extrusion arms to the bridge with the pictured 135° brackets. Each bracket bolts into both rails with M5 T-nuts. Position the sliding rim stops along the arms and lock them; unused rail extends past each contact. Only the centre probe remains adjustable.':'Fit two sliding feet to the uncut bridge and set their centres across the rim diameter. Keep bridge clear of both the hub and axle projection.',
      angled?'Check both fixed contact lands against a flat reference. If unequal, correct the printed parts before use; do not compensate by tilting the gauge.':'On a flat reference, check both fixed stop heights and lock their mounting positions. Correct any unequal printed heights before use; check first-layer distortion.',
      'Place both pads on one side of the rim at marked opposite locations. Adjust the forked central probe to the hub dropout seating face and lock it.',
      'Move the gauge to the other side without changing its settings. Seat both rim pads lightly and measure the central gap; if the gauge rocks, reverse the setup side.',
      'Repeat at several marked rim diameters to distinguish dish from local runout. A symmetric wheel has matching contact on both sides; account for intentional frame offset separately.'
    ];
  }
  for(const part of a.parts.filter(p=>p.kind==='pla')) {
    const bed=part.shape==='fixed-stop'?'Broad rear mounting face on bed; integral flange and contact column grow upwards':part.shape==='contact-cap'?'Flat rim-contact X face down; open rail recess upwards, side cheeks grow from the contact face':part.shape==='angle-foot'?'Broad Z face flat on bed; diagonal web and contact land print together, with no overhang':part.shape==='rail-mount'?'Broad ledge underside (−Y) on bed; flange grows upwards':part.shape==='clevis'?'Flat base underside (−Y) on bed; ears grow upwards':part.shape==='top-cap'?'Outer back face on bed; rail socket faces up':part.shape==='clamp'?`Face normal to the ${part.axis?.toUpperCase()} pointer bore on bed; bore vertical`:part.shape==='fork'?'Hub-contact X face down; open axle slot and rear nut pocket face upwards':part.shape==='dish-plate'?'Broad X face on bed; all three through-holes vertical':part.sku==='foot-pad'?'Rim-contact X face down; blind screw socket upwards':'Largest flat face on bed; through-hole axes vertical where present';
    const supports=part.endLocated?'The internal rail-end shoulder may require local support or a separately printed cheek. Check the slicer; keep support scars away from the locating shoulder and rim-contact face.':part.shape==='top-cap'?'Local support may be needed under the cradle nose. Current integral cap is NOT claimed support-free; keep support away from the rail-end datum and seat.':part.shape==='clevis'?'No external support intended. Horizontal 5.5 mm lug holes need a bridge test; drill to final clearance if needed.':'No support intended in the stated orientation; confirm every layer in the slicer before printing.';
    const accuracy=part.shape==='top-cap'?'Check both seating heights and rail shoulders with a reference; remove elephant foot without changing the datum.':'Print a hole/fit coupon, compensate first-layer expansion, and measure mating faces. Drill clearance holes only; preserve contact faces. Check after tightening.';
    part.print={bed,supports,accuracy};part.spec+=` PRINT: ${bed}. ${supports} ${accuracy}`;
  }
  for(const part of a.parts.filter(p=>p.kind==='pla'))if(part.size.some(d=>d>180))errors.push(`${part.name} exceeds the 180 mm print envelope (200 mm bed with margins). This configuration needs a smaller stock step or a split fixture.`);
  return a;
}
