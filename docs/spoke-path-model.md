# Spoke length and 3D path estimates

The default build uses the Hope Pro 5 rear 135 mm, 32-hole, 6-bolt hub,
Brompton G Line rim (382.3 mm ERD), 2 mm spokes and two crosses on both sides, without interlacing by default.
The interlacing toggle changes the 3D path allowance, not the traditional length.
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

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests include published
three-cross reference lengths, radial/one-/two-cross configurations, both head
orientations, interlacing, independent coordinate checks, contact clearance,
convergence below 0.01 mm and the Brompton centreline. Results display to 0.1 mm;
that precision does not imply equally accurate physical measurements.
