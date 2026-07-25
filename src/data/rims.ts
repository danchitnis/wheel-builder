export interface Rim {
  id: string;
  brand: string;
  name: string;
  erd: number; // Effective Rim Diameter in mm
  osb: number; // Offset Spoke Bed in mm (positive value moves spoke bed to non-drive/left side)
  drillingOffsetLeft: number; // Left hole lateral offset in mm (usually 0 unless alternating)
  drillingOffsetRight: number; // Right hole lateral offset in mm (usually 0 unless alternating)
  weight?: number; // in grams
  category: 'Road' | 'Gravel' | 'MTB' | 'BMX' | 'Urban';
  maxTension?: number; // in kgf (or N)
  notes?: string;
}

export const rims: Rim[] = [
  {
    id: 'dt-ex511-29',
    brand: 'DT Swiss',
    name: 'EX 511 (29")',
    erd: 601.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    weight: 570,
    category: 'MTB',
    maxTension: 1200,
    notes: 'Super-strong enduro rim. Internal width 30mm.'
  },
  {
    id: 'dt-ex511-275',
    brand: 'DT Swiss',
    name: 'EX 511 (27.5")',
    erd: 563.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
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
    weight: 615,
    category: 'MTB',
    maxTension: 1200,
    notes: 'Dual I-Beam support, extreme enduro/gravity rim with 4.5mm offset.'
  },
  {
    id: 'sun-cr18-20-406',
    brand: 'Sun Ringle',
    name: 'CR18 20" (406)',
    erd: 393.0,
    osb: 0.0,
    drillingOffsetLeft: 0.0,
    drillingOffsetRight: 0.0,
    weight: 360,
    category: 'BMX',
    maxTension: 1100,
    notes: 'Classic, super-durable single-eyelet rim popular for folding bikes, BMX, and recumbents.'
  }
];
