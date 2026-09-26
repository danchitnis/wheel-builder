# Spoke length and 3D path estimates

The default build uses the Hope Pro 5 rear 135 mm, 32-hole, 6-bolt hub,
Brompton G Line rim (382.3 mm ERD), 2 mm spokes and two crosses on both sides, without interlacing by default.
The interlacing toggle changes the 3D path allowance, not the traditional length.
Interactive lacing shows the main calculator's traditional length for the active
side, rounded to the nearest whole millimetre, regardless of head orientation or interlacing.
Shared links preserve an explicitly saved interlacing choice.
The Brompton's spoke holes all lie on the same centreline: OSB and both drilling
offsets are zero. Three-cross and radial calculations remain supported.

## Inputs and provenance

Hope's [2025 J-bend chart](https://www.hopetech.com/_repository/1/documents/Pro5_PCD_J_Bend_2025.pdf)
supplies PCD, centre-to-flange distance and spoke-hole diameter. User measurements
supply flange outside diameters (rear 67 mm, front 62 mm), approximately 4 mm flange
thickness, and 2 mm wire diameter. Both flanges initially use the same measured
outside diameter and thickness; each can be edited separately. No outside
diameters are fabricated for the other catalogue hubs.

## Four different measurements

- Traditional length: cosine-rule 3D distance from flange-hole centre to ERD,
  minus half the hub hole diameter.
- Shaft path: from the shaft's exit at the manufactured elbow to the ERD endpoint.
- Bend allowance: shaft path minus its own straight endpoint-to-endpoint chord.
- Estimated adjusted length: traditional length plus bend allowance.

The head and manufactured elbow are not added to the allowance. Shaft length and
traditional length use different starting references and must not be directly
subtracted. The ERD endpoint already includes the intended nipple engagement;
no eyelet or nipple height is added a second time.

## Geometry and limitations

### Lacing orientation

The guide and its setup diagrams show the intended assembled hub position, with
the valve at the top. Amber arrows count flange holes; the green arrow traces the
first connection from hub to rim. Spoke sweep is derived from those endpoints,
and clockwise/counterclockwise wording is mirrored for the viewed side. A radial
spoke has no angular sweep. Matching the diagram does not require an additional
hub twist, and the illustrative hub logo is not a physical hole-index reference.

At halfway, the guide checks both installed groups before group 3. With the
default 32-spoke two-cross pattern, rotating just the hub by 90 degrees from the
illustrated position reverses the first two groups' sweep while preserving their
traditional lengths. Length alone therefore cannot establish orientation. The
guide shows this ambiguity only for equal, nonzero crossing counts; mixed and
radial patterns still get their own direction checks. These checks describe the
model and do not certify a photographed or partially assembled wheel.

`spokePath.ts` operates in assembled wheel coordinates without Three.js. The shaft
starts tangent to its flange face, displaced in the hole by the available wire
clearance. It follows free straight spans and the wire-radius-expanded edge of an
ideal sharp cylindrical flange. The flange route uses a local axial section; its
rounded section is generally not circular when the spoke exits obliquely.
Tangency is solved by bisection and arc length by fixed fine Simpson integration.
Rendering samples do not determine the reported arc length.

At the final mutual interlaced crossing, a shared contact plane normal comes from
the two free-span directions. Both routes are displaced on opposite sides of
that plane and fitted to wire-diameter clearance. This is a point-contact
approximation, not an elastic beam solution. All shaft pairs and flange clearance
are checked; impossible routes have no numerical recommendation.

The renderer consumes these same paths. Camera, exploded view, hidden spokes and
visual thickness multipliers cannot affect measurements. Decorative heads and
elbows are excluded from measurements. Rounded nipples follow the final span.

No tension, stretch, bending stiffness, plastic seating, friction or rim
compression is modelled. These estimates are not validated improvements in
purchase length; comparison against a built wheel is still required.

## Validation

All ten Hope Pro 5 J-bend presets were checked against Hope's linked chart on
2026-09-26. The Front 110 Centerlock right flange offset is 35 mm.
With the 382.3 mm ERD rim, 32 spokes and two crosses, the primary 6-bolt presets give:

| Hub | Left calculated / rounded | Right calculated / rounded |
| --- | --- | --- |
| Front 100 mm | 171.7 / 172 mm (disc) | 175.7 / 176 mm (non-disc) |
| Rear 135 mm | 173.8 / 174 mm (non-drive) | 171.4 / 171 mm (drive) |

These are calculated values for those inputs, not manufacturer-specified spoke lengths.
The group-2 starting reference is an installed group-1 spoke on the opposite
flange, compared along the axle. It must not be rediscovered from the valve line:
a partly laced hub can rotate relative to the rim. The default two-cross guide
uses the spoke installed at step 2, then the first staggered left-flange hole and
the next rim hole counterclockwise, both viewed from the left. Mixed-cross builds
derive their rim offset from the endpoints. The schematic marks the opposite
flange reference explicitly, and orientation text includes the assembled angular
separation. Rotation regression tests keep the rim fixed and rotate the hub to
check that the physical group-2 assignments do not change.
Reference tests independently check Cartesian endpoints for every Hope preset at
24, 28, 32 and 36 spokes, plus the primary front/rear preset-to-lacing flow.

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests include published
three-cross reference lengths, radial/one-/two-cross configurations, both head
orientations, interlacing, independent coordinate checks, contact clearance,
convergence below 0.01 mm and the Brompton centreline. Results display to 0.1 mm;
that precision does not imply equally accurate physical measurements.
