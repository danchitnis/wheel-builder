# Spoke length and 3D path estimates

The default build uses the Hope Pro 5 rear 135 mm, 32-hole, 6-bolt hub,
Brompton G Line rim (382.3 mm ERD), 2 mm spokes and two crosses on both sides, with non-interlaced routing on both sides by default.
The interlacing toggle changes the 3D path allowance, not the traditional length.
Interactive lacing shows the main calculator's traditional length for the active
side, rounded to the nearest whole millimetre, regardless of head orientation or interlacing.
Saved builds retain their explicit routing choice. Interlacing remains an optional
setting. In either pattern, adjacent flange holes alternate heads-out and heads-in;
non-interlaced does not mean putting all heads on one face. Radial sides have no weave.
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

The guide shows intended assembled positions, not simulated insertion movements.
The sequence works with crossing pairs, finishing the right flange before the left.
Each pair contains A heads-out (insert from outside) and B heads-in (insert from
inside). Adjacent flange holes still alternate head orientation. Crossed pairs
are mutual outermost crossing partners derived from endpoints; radial pairs use
adjacent opposite-head holes. Pairs follow the existing heads-out rim order.
Individual flange/rim assignments and calculated lengths do not change.

Support the rim with axle clearance and work with only two loose spokes. Hold A
while tilting the supported wheel to access the inside flange face for B. Position
both routes before attaching either nipple loosely. The instructions identify
both flange and rim holes, the loose partner, and crossings with installed spokes.
Later pairs complete remaining crossings. Stop and reposition if obstructed.

Non-interlaced routing is the default: A stays towards the wheel centre and B
towards the flange outside at every crossing. Optional interlacing changes layers
only at the outermost crossing. Directions always use the named outside view.
The diagram and 3D view show A in cyan, B in green, and installed crossing
references in amber. Bridges show the outside layer. Hole-counting arrows in the
flange inset are distinct from spoke directions.

A 32-spoke wheel has Setup plus 16 pair steps. Previous side / Next side navigation
jumps between flanges; the four spoke-type counts remain available. Preview
preserves progress, geometry or interlacing changes reset it, and invalid or
incomplete pairing blocks navigation. Checkpoints appear after the right flange
and at completion, checking routing and alternating head orientation. The left
start remains anchored to an installed right heads-out spoke at both hub and rim;
it must not be rediscovered from the valve after hub rotation.

Geometry tests verify intended connections and layering. Physical handling effort
and J-bend seating have not been verified by this model. The guide does not
certify a photographed or partially built wheel.

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
elbows are excluded from measurements. Their positions are prescribed: head tilt,
elbow deformation and seating against the flange are not solved. In the default
Hope two-cross model, the first projected crossing remains separated; only the
outermost interlaced crossing is fitted to contact. Thus the model does not
represent two-contact bending if that occurs on a physical wheel, and enabling
interlacing does not certify that its J-bends will seat flush. Rounded nipples follow the final span.

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
The left-side starting reference is an installed right-side heads-out spoke,
compared along the axle. It must not be rediscovered from the valve line. The
default two-cross guide uses A of pair 2 (spoke 3), then the first staggered left-flange
hole and the next rim hole counterclockwise, viewed from the left. Mixed-cross
builds derive their rim offset from the endpoints. The inset explicitly marks
the opposite-flange reference. Rotation tests verify the reference's angular
relationship remains fixed when the hub rotates.
Reference tests independently check Cartesian endpoints for every Hope preset at
24, 28, 32 and 36 spokes, plus the primary front/rear preset-to-lacing flow.

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests include published
three-cross reference lengths, radial/one-/two-cross configurations, both head
orientations, interlacing, independent coordinate checks, contact clearance,
convergence below 0.01 mm and the Brompton centreline. Results display to 0.1 mm;
that precision does not imply equally accurate physical measurements.
