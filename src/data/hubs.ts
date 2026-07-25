export interface Hub {
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
  {
    id: 'dt-350-boost-rear',
    brand: 'DT Swiss',
    name: '350 Boost Rear (12x148mm)',
    flangePcdLeft: 58.0,
    flangePcdRight: 52.0,
    centerToLeft: 36.8,
    centerToRight: 21.8,
    spokeHoleDiameter: 2.6,
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
    category: 'MTB',
    spacing: '15x110mm Boost',
    weight: 172,
    discType: 'Centerlock',
    notes: 'Stiff front Boost hub for modern trail and enduro forks.'
  },
  {
    id: 'hope-pro5-boost-rear',
    brand: 'Hope',
    name: 'Pro 5 Boost Rear (12x148mm)',
    flangePcdLeft: 57.0,
    flangePcdRight: 57.0,
    centerToLeft: 35.0,
    centerToRight: 22.0,
    spokeHoleDiameter: 2.6,
    category: 'MTB',
    spacing: '12x148mm Boost',
    weight: 310,
    discType: '6-Bolt',
    notes: 'Hope’s latest high-engagement 108-click hub, machined in Barnoldswick, UK.'
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
    category: 'Gravel',
    spacing: '12x142mm',
    weight: 265,
    discType: 'Centerlock',
    notes: 'Beautifully machined US-made gravel hub with an incredibly durable titanium freehub body.'
  },
  {
    id: 'hope-pro5-front-135',
    brand: 'Hope',
    name: 'Pro 5 Front (9x135mm / 15x135mm)',
    flangePcdLeft: 57.0,
    flangePcdRight: 57.0,
    centerToLeft: 42.5,
    centerToRight: 42.5,
    spokeHoleDiameter: 2.6,
    category: 'MTB',
    spacing: '135mm Front',
    weight: 245,
    discType: '6-Bolt',
    notes: 'High quality 135mm front disc hub, standard Front Disc Spacing (FDS).'
  },
  {
    id: 'hope-pro5-rear-135',
    brand: 'Hope',
    name: 'Pro 5 Rear (10x135mm / 12x135mm)',
    flangePcdLeft: 57.0,
    flangePcdRight: 57.0,
    centerToLeft: 33.0,
    centerToRight: 20.0,
    spokeHoleDiameter: 2.6,
    category: 'MTB',
    spacing: '135mm Rear',
    weight: 315,
    discType: '6-Bolt',
    notes: 'Premium rear hub in classic 135mm mountain/urban spacing, featuring Hope’s latest high engagement driver.'
  }
];
