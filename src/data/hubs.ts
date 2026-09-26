export interface Hub {
  spokeCount?: number;
  extraOption?: boolean;
  flangeOuterDiameterLeft?: number;
  flangeOuterDiameterRight?: number;
  flangeThicknessLeft?: number;
  flangeThicknessRight?: number;
  geometryProvenance?: string;
  sourceUrl?: string;
  explodedUrl?: string;
  id: string;
  brand: string;
  name: string;
  flangePcdLeft: number;      // dL (Left pitch circle diameter in mm)
  flangePcdRight: number;     // dR (Right pitch circle diameter in mm)
  centerToLeft: number;       // wL (Center-to-left flange distance in mm)
  centerToRight: number;      // wR (Center-to-right flange distance in mm)
  spokeHoleDiameter: number;  // s (Diameter of spoke holes in the hub flange in mm)
  flangeThickness?: number;   // t (Flange thickness in mm, optional)
  category: 'Road' | 'Gravel' | 'MTB' | 'BMX' | 'Urban';
  spacing: string;            // Axle spacing description
  weight?: number;            // in grams
  discType: '6-Bolt' | 'Centerlock' | 'None';
  notes?: string;
}

export const hubs: Hub[] = [
  // --- HOPE PRO 5 REAR HUBS (Official Spec) ---
  {
    id: 'hope-pro5-rear-148-6b',
    brand: 'Hope',
    name: 'Pro 5 Rear 148 6-Bolt (Boost)',
    flangePcdLeft: 57.0,
    flangePcdRight: 59.0,
    centerToLeft: 35.0,
    centerToRight: 22.6,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '12x148mm Boost',
    weight: 310,
    discType: '6-Bolt',
    notes: 'Official Hope Pro 5 Rear 148 6-Bolt specifications.'
  },
  {
    id: 'hope-pro5-rear-135-6b',
    brand: 'Hope',
    name: 'Pro 5 Rear 135 mm — 32 holes — 6-Bolt',
    spokeCount: 32,
    flangeOuterDiameterLeft: 67, flangeOuterDiameterRight: 67,
    flangeThicknessLeft: 4, flangeThicknessRight: 4,
    geometryProvenance: 'User measured: outside diameter 67 mm, flange thickness approximately 4 mm; both sides assumed equal.',
    sourceUrl: 'https://www.hopetech.com/_repository/1/documents/Pro5_PCD_J_Bend_2025.pdf',
    explodedUrl: 'https://www.hopetech.com/_repository/1/documents/PRO5_135_Assembly.pdf',
    flangePcdLeft: 57.0,
    flangePcdRight: 59.0,
    centerToLeft: 32.0,
    centerToRight: 19.6,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '135mm',
    weight: 295,
    discType: '6-Bolt',
    notes: 'Official Hope Pro 5 Rear 135/142 6-Bolt specifications.'
  },
  {
    id: 'hope-pro5-rear-148-cl',
    brand: 'Hope',
    name: 'Pro 5 Rear 148 Centerlock (Boost)',
    flangePcdLeft: 51.0,
    flangePcdRight: 59.0,
    centerToLeft: 35.0,
    centerToRight: 22.6,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '12x148mm Boost',
    weight: 300,
    discType: 'Centerlock',
    notes: 'Official Hope Pro 5 Rear 148 Centerlock specifications.'
  },
  {
    id: 'hope-pro5-rear-135-cl',
    brand: 'Hope',
    name: 'Pro 5 Rear 135/142 Centerlock',
    flangePcdLeft: 51.0,
    flangePcdRight: 59.0,
    centerToLeft: 32.0,
    centerToRight: 19.6,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'Gravel',
    spacing: '12x142mm / 135mm',
    weight: 285,
    discType: 'Centerlock',
    notes: 'Official Hope Pro 5 Rear 135/142 Centerlock specifications.'
  },
  {
    id: 'hope-pro5-rear-157-sb',
    brand: 'Hope',
    name: 'Pro 5 Rear 157 SB 6-Bolt (Super Boost)',
    flangePcdLeft: 57.0,
    flangePcdRight: 59.0,
    centerToLeft: 39.6,
    centerToRight: 27.0,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '12x157mm Super Boost',
    weight: 325,
    discType: '6-Bolt',
    notes: 'Official Hope Pro 5 Rear 157 Super Boost 6-Bolt specifications.'
  },
  {
    id: 'hope-pro5-rear-148-dh',
    brand: 'Hope',
    name: 'Pro 5 Rear 148 DH 6-Bolt',
    flangePcdLeft: 60.0,
    flangePcdRight: 64.0,
    centerToLeft: 28.5,
    centerToRight: 28.5,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.2,
    category: 'MTB',
    spacing: '12x148mm DH',
    weight: 330,
    discType: '6-Bolt',
    notes: 'Official Hope Pro 5 Downhill 148 6-Bolt specifications.'
  },

  // --- HOPE PRO 5 FRONT HUBS (Official Spec) ---
  {
    id: 'hope-pro5-front-110-6b',
    brand: 'Hope',
    name: 'Pro 5 Front 110 6-Bolt (Boost)',
    flangePcdLeft: 58.0,
    flangePcdRight: 52.0,
    centerToLeft: 25.0,
    centerToRight: 34.0,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '15x110mm Boost',
    weight: 185,
    discType: '6-Bolt',
    notes: 'Official Hope Pro 5 Front 110 Boost 6-Bolt specifications.'
  },
  {
    id: 'hope-pro5-front-100-6b',
    brand: 'Hope',
    name: 'Pro 5 Front 100 mm — 32 holes — 6-Bolt',
    spokeCount: 32,
    flangeOuterDiameterLeft: 62, flangeOuterDiameterRight: 62,
    flangeThicknessLeft: 4, flangeThicknessRight: 4,
    geometryProvenance: 'User measured: outside diameter 62 mm, flange thickness approximately 4 mm; both sides assumed equal.',
    sourceUrl: 'https://www.hopetech.com/_repository/1/documents/Pro5_PCD_J_Bend_2025.pdf',
    explodedUrl: 'https://www.hopetech.com/_repository/1/documents/PRO5_Front_Standard.pdf',
    flangePcdLeft: 58.0,
    flangePcdRight: 52.0,
    centerToLeft: 20.0,
    centerToRight: 34.0,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '100mm',
    weight: 175,
    discType: '6-Bolt',
    notes: 'Official Hope Pro 5 Front 100 6-Bolt specifications.'
  },
  {
    id: 'hope-pro5-front-110-cl',
    brand: 'Hope',
    name: 'Pro 5 Front 110 Centerlock (Boost)',
    flangePcdLeft: 43.0,
    flangePcdRight: 43.0,
    centerToLeft: 27.0,
    centerToRight: 35.0,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '15x110mm Boost',
    weight: 170,
    discType: 'Centerlock',
    notes: 'Official Hope Pro 5 Front 110 Centerlock Boost specifications.'
  },
  {
    id: 'hope-pro5-front-100-cl',
    brand: 'Hope',
    name: 'Pro 5 Front 100 Centerlock',
    flangePcdLeft: 43.0,
    flangePcdRight: 43.0,
    centerToLeft: 22.0,
    centerToRight: 33.0,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'Road',
    spacing: '12x100mm / 100mm',
    weight: 160,
    discType: 'Centerlock',
    notes: 'Official Hope Pro 5 Front 100 Centerlock specifications.'
  },

  // --- OTHER POPULAR HUBS ---
  {
    id: 'dt-350-boost-rear',
    brand: 'DT Swiss',
    name: '350 Boost Rear (12x148mm)',
    flangePcdLeft: 58.0,
    flangePcdRight: 52.0,
    centerToLeft: 36.8,
    centerToRight: 21.8,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.2,
    category: 'MTB',
    spacing: '12x148mm Boost',
    weight: 295,
    discType: '6-Bolt',
    notes: 'Legendary reliability with Star Ratchet system, in standard modern Boost spacing.'
  },
  {
    id: 'dt-350-classic-rear',
    brand: 'DT Swiss',
    name: '350 Rear (12x142mm)',
    flangePcdLeft: 58.0,
    flangePcdRight: 52.0,
    centerToLeft: 33.7,
    centerToRight: 19.3,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.2,
    category: 'Road',
    spacing: '12x142mm',
    weight: 260,
    discType: 'Centerlock',
    notes: 'Classic standard thru-axle rear hub for road, gravel, or non-Boost MTB.'
  },
  {
    id: 'dt-350-boost-front',
    brand: 'DT Swiss',
    name: '350 Boost Front (15x110mm)',
    flangePcdLeft: 44.0,
    flangePcdRight: 44.0,
    centerToLeft: 35.8,
    centerToRight: 24.8,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.0,
    category: 'MTB',
    spacing: '15x110mm Boost',
    weight: 172,
    discType: 'Centerlock',
    notes: 'Stiff front Boost hub for modern trail and enduro forks.'
  },
  {
    id: 'chrisking-r45d-rear',
    brand: 'Chris King',
    name: 'R45D Centerlock Rear (12x142mm)',
    flangePcdLeft: 53.0,
    flangePcdRight: 57.0,
    centerToLeft: 34.2,
    centerToRight: 19.3,
    spokeHoleDiameter: 2.5,
    flangeThickness: 3.0,
    category: 'Road',
    spacing: '12x142mm',
    weight: 280,
    discType: 'Centerlock',
    notes: 'Ultimate premium road/gravel hub with in-house made ceramic bearings and RingDrive.'
  },
  {
    id: 'shimano-xt-m8110-rear',
    brand: 'Shimano',
    name: 'Deore XT M8110 Rear (12x148mm)',
    flangePcdLeft: 61.0,
    flangePcdRight: 61.0,
    centerToLeft: 36.0,
    centerToRight: 21.5,
    spokeHoleDiameter: 2.6,
    flangeThickness: 3.2,
    category: 'MTB',
    spacing: '12x148mm Boost',
    weight: 305,
    discType: 'Centerlock',
    notes: 'High value Micro Spline rear hub utilizing Shimano’s cup-and-cone bearing design.'
  },
  {
    id: 'whiteind-cld-rear',
    brand: 'White Industries',
    name: 'CLD Rear (12x142mm)',
    flangePcdLeft: 55.0,
    flangePcdRight: 60.0,
    centerToLeft: 33.5,
    centerToRight: 19.5,
    spokeHoleDiameter: 2.5,
    flangeThickness: 3.0,
    category: 'Gravel',
    spacing: '12x142mm',
    weight: 265,
    discType: 'Centerlock',
    notes: 'Beautifully machined US-made gravel hub with an incredibly durable titanium freehub body.'
  }
];

export const DEFAULT_HUB_ID = 'hope-pro5-rear-135-6b';
const primaryIds = [DEFAULT_HUB_ID, 'hope-pro5-front-100-6b'];
for (const hub of hubs) {
  hub.extraOption = hub.brand === 'Hope' && !primaryIds.includes(hub.id);
  if (primaryIds.includes(hub.id)) hub.flangeThickness = 4;
}
hubs.sort((a, b) => {
  const rank = (h: Hub) => primaryIds.includes(h.id) ? primaryIds.indexOf(h.id) : 2;
  return rank(a) - rank(b);
});
export const defaultHub = hubs.find(h => h.id === DEFAULT_HUB_ID)!;
