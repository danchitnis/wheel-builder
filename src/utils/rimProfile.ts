// Schematic extrusion: axial position and radial height above the ERD seat, mm.
// Body depth excludes the eyelet. Internal wall thicknesses are illustrative.
export function shallowRimSection(outerWidth: number, innerWidth: number, depth: number) {
  const half = outerWidth / 2;
  const inner = Math.min(innerWidth / 2, half - 0.5);
  const wall = Math.min(1.2, depth / 8);
  const bed = depth * 0.48;
  const outline: [number, number][] = [
    [-half + wall, 0], [half - wall, 0], [half, wall], [half, depth],
    [inner, depth], [inner, depth - wall], [inner + wall / 2, depth - wall],
    [inner, bed + wall], [inner * 0.55, bed], [-inner * 0.55, bed],
    [-inner, bed + wall], [-inner - wall / 2, depth - wall],
    [-inner, depth - wall], [-inner, depth], [-half, depth], [-half, wall],
    [-half + wall, 0],
  ];
  const cavity: [number, number][] = [
    [-half + 2 * wall, wall], [-inner + wall, bed - wall],
    [inner - wall, bed - wall], [half - 2 * wall, wall], [-half + 2 * wall, wall],
  ];
  return { outline, cavity, bed };
}
