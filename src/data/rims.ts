export interface RimAppearance {
  rimProfile?: 'shallow-double-wall' | 'standard';
  rimEyelets?: boolean;
  rimValveDiameter?: number; // Nominal drilling diameter, mm
}

export interface Rim extends RimAppearance {
  id: string;
  brand: string;
  name: string;
  erd: number;                // Effective Rim Diameter in mm
  osb: number;                // Offset Spoke Bed in mm
  drillingOffsetLeft: number;  // Left hole lateral offset in mm
  drillingOffsetRight: number; // Right hole lateral offset in mm
  widthOuter?: number;        // Rim profile outer width in mm
  widthInner?: number;        // Rim profile inner well width in mm
  depth?: number;             // Rim profile height / depth in mm
  weight?: number;            // in grams
  category: 'Road' | 'Gravel' | 'MTB' | 'BMX' | 'Urban';
  maxTension?: number;        // in kgf
  notes?: string;
}

export const DEFAULT_RIM_ID = 'brompton-g-line-20-406-rear-presta';

export const rims: Rim[] = [
  {
    id: DEFAULT_RIM_ID,
    brand: 'Brompton',
    name: 'G Line 20" (406), 32-hole rear — eyelets, Presta',
    erd: 382.3,
    osb: 0,
    drillingOffsetLeft: 0,
    drillingOffsetRight: 0,
    widthOuter: 28,
    widthInner: 22,
    depth: 12.3,
    category: 'Urban',
    rimProfile: 'shallow-double-wall',
    rimEyelets: true,
    rimValveDiameter: 6.5,
    notes: 'User-measured ERD: 382.3 mm; approximate body depth: 12.3 mm excluding eyelets. Published widths: 28 mm outer / 22 mm inner (SJS Cycles G Line rear rim listing). User-specified Presta drilling, nominal 6.5 mm. User confirmed all spoke holes share the rim centreline: zero spoke-bed and left/right drilling offsets. Internal wall and eyelet geometry are visual approximations.'
  },
  {
    id: 'sun-cr18-20-406',
    brand: 'Sun Ringle',
    name: 'CR18 20" (406)',
    erd: 392.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 22.5,
    widthInner: 17.5,
    depth: 15.5,
    weight: 350,
    category: 'BMX',
    maxTension: 1100,
    notes: '22.5mm outer width, 17.5mm inner well width, 15.5mm profile depth. Measured ERD 392mm.'
  },
  {
    id: 'dt-ex511-29',
    brand: 'DT Swiss',
    name: 'EX 511 (29")',
    erd: 601.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 35.0,
    widthInner: 30.0,
    depth: 21.0,
    weight: 570,
    category: 'MTB',
    maxTension: 1200,
    notes: 'Super-strong enduro rim. Internal width 30mm, outer width 35mm, depth 21mm.'
  },
  {
    id: 'dt-ex511-275',
    brand: 'DT Swiss',
    name: 'EX 511 (27.5")',
    erd: 563.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 35.0,
    widthInner: 30.0,
    depth: 21.0,
    weight: 535,
    category: 'MTB',
    maxTension: 1200,
    notes: 'Enduro and downhill standard in 27.5 inch.'
  },
  {
    id: 'stans-flow-mk4-29',
    brand: "Stan's NoTubes",
    name: 'Flow MK4 (29")',
    erd: 600.0,
    osb: 3.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 33.6,
    widthInner: 30.0,
    depth: 18.9,
    weight: 527,
    category: 'MTB',
    maxTension: 1300,
    notes: 'Asymmetrical spoke bed with 3.0mm offset for balanced spoke tension.'
  },
  {
    id: 'stans-arch-mk4-29',
    brand: "Stan's NoTubes",
    name: 'Arch MK4 (29")',
    erd: 603.0,
    osb: 2.5,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 31.4,
    widthInner: 28.0,
    depth: 18.9,
    weight: 480,
    category: 'MTB',
    maxTension: 1300,
    notes: 'Trail riding rim with 2.5mm asymmetric offset.'
  },
  {
    id: 'hplus-archetype-700c',
    brand: 'H Plus Son',
    name: 'Archetype (700c)',
    erd: 595.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 23.0,
    widthInner: 17.5,
    depth: 25.0,
    weight: 470,
    category: 'Road',
    maxTension: 1200,
    notes: 'Classic V-profile road rim, renowned for stiffness and clean aesthetics.'
  },
  {
    id: 'hplus-hydra-700c',
    brand: 'H Plus Son',
    name: 'The Hydra (700c)',
    erd: 589.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 25.0,
    widthInner: 20.0,
    depth: 23.0,
    weight: 440,
    category: 'Gravel',
    maxTension: 1250,
    notes: 'Lightweight tubeless-ready road/gravel rim.'
  },
  {
    id: 'dt-gr531-700c',
    brand: 'DT Swiss',
    name: 'GR 531 (700c)',
    erd: 581.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 28.0,
    widthInner: 24.0,
    depth: 25.0,
    weight: 500,
    category: 'Gravel',
    maxTension: 1300,
    notes: 'Heavy-duty gravel rim, 24mm internal width.'
  },
  {
    id: 'velocity-bluntss-29',
    brand: 'Velocity',
    name: 'Blunt SS (29")',
    erd: 602.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 30.0,
    widthInner: 26.6,
    depth: 20.0,
    weight: 425,
    category: 'MTB',
    maxTension: 110,
    notes: 'Ultralight XC racing rim.'
  },
  {
    id: 'wtb-kom-tough-i30-29',
    brand: 'WTB',
    name: 'KOM Tough i30 (29")',
    erd: 589.0,
    osb: 4.5,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    widthOuter: 34.0,
    widthInner: 30.0,
    depth: 20.0,
    weight: 615,
    category: 'MTB',
    maxTension: 1200,
    notes: 'Dual I-Beam support, extreme enduro/gravity rim with 4.5mm offset.'
  }
];

export const defaultRim = rims.find(rim => rim.id === DEFAULT_RIM_ID)!;
