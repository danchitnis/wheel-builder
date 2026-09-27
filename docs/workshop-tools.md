# Workshop tools

`/workshop` is independent of the wheel renderer, but consumes the same versioned
`BuildConfiguration` fragment. The header link is refreshed whenever the builder
captures its form, including invalid/blank measurements. The return link carries
the untouched wheel snapshot. No workshop control writes to the builder session.

## Design data

`src/utils/workshop.ts` is the source of truth for member selection, assembly part
instances, specifications, BOM grouping and calibration maths. Coordinates are mm:
X is the axle direction, Y is vertical and Z is fore/aft. Each extrusion instance
uses a member from the available stock set. Missing lengths produce a provisional
assembly with errors, never a stretched member. Missing interface information is
visible rather than guessed from a hub's nominal spacing.

Profile presets identify actual families: 2020 B-type slot 6, 3030 B-type slot 8,
and 4040 I-type slot 8. Sources: https://www.motedis.com/en/cad-database.
Cross-sections, bracket and hardware shapes are simplified envelopes. Components
are not manufacturing drawings, and a nominal profile size is not a compatibility
claim. Validate actual vendor drawings, fastener engagement, end-cap contact faces
and printed fit before procurement. Only printed parts are bespoke; use standard extrusion, brackets, bolts, nuts and optional loose rod.

The stand has two feet, one cross rail and equal uprights. Hollow PLA top caps seat
on the upright ends; open integral cradles support measured stationary hub-end
protrusions. Side-slot bolts retain the caps. No steel dropouts or clamping skewer
are needed. A loose optional rod is an alignment aid, not a clamp or wheel retention.
Measure both diameters and usable protrusion; unsupported ends are flagged.

The vertical extrusion itself supports the measurement heads. Each short printed
bracket locks directly to an upright slot with two vertically spaced bolts. Pointer
blocks use M6 screws and captured nuts; their mounting bolts are offset from the
pointer axes. The dial upgrade replaces the printed brackets and heads, preserving
the frame. Its clevis ears straddle the indicator's existing rear lug, with a visible
M5 bolt through the measured lug hole. Both dial faces point toward the operator.
No parallel printed towers or floating stem mounts are used. All printed envelopes
are checked against 180 mm, leaving margins on a 200 × 200 mm bed.

The dishing bridge remains independent, with equal-reach feet and a forked probe
referencing the dropout seating face. Its measurement basis follows
https://www.parktool.com/en-us/blog/repair-help/wheel-dishing-centering.

PLA parts have dimensional envelopes, hole/mating clearances, nut capture and
mounting descriptions. They are not printable STL files. Bolt lengths are a
preliminary stack estimate, not a substitute for supplier engagement dimensions.
The assembly has not been built or physically certified to any tolerance.

## Calibration and persistence

Target repeatability is a max-minus-min spread of at most 0.2 mm from at least
three reseatings at one marked location. It does not prove absolute accuracy.
Signed centre measurements A and B after reversal give constant stand bias
(A+B)/2 and wheel offset (A-B)/2. One-sided pointer gaps must first be converted
to centre measurements. A dishing central gap gives offset magnitude gap/2 only
while both rim feet are seated and opposite hub seating faces are referenced.
The UI explicitly warns about intentional nonzero frame offset.

Settings live in localStorage under `wheel-builder:workshop:v1`. Design revision 2 also invalidates old fit/calibration readings. The saved wheel
fingerprint invalidates fit overrides and calibration observations on a different
wheel. Measurements reset when the physical configuration or selected tool changes;
free-text observations remain available as context. Storage failure and WebGL
failure leave the in-memory configuration, parts list and instructions usable.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. The Cloudflare build
adapter requires local socket access. `PORT=4336 node tests/production-server.mjs`
serves the generated pages on loopback. `/workshop?verify=webgl-once` forces a
renderer initialization failure; `/workshop?verify=storage` denies build session
storage. The latter does not deny workshop localStorage.

Browser checks cover builder transfer and return navigation, profiles, whole-stock
failure, pointer/dial substitution, tool switching, component selection, exploded
views, calibration, WebGL failure, and 390px/1360px responsive widths. CSV
content is covered by unit tests; the in-app browser did not expose a completed
download event during verification. Print CSS
excludes interactive controls and expands calibration disclosures before printing.

## Print review

Each PLA instance carries bed orientation, support assessment and accuracy checks,
shown in a dedicated print guide and included in CSV/print specifications. The rail
mount has a flat-bottom ledge and an upward-growing flange. The clevis has a broad
base under both ears; its horizontal holes require a bridging coupon or drilling.
Integral top-cap noses are explicitly flagged as potentially needing local support.
No support-free or dimensional-accuracy claim has been physically validated.

Dishing uses three flat drilled carriage plates. M6 adjustment rods run beside the
extrusion and lock against both faces of each carriage. The two equal rim shoes
have blind sockets; the central open fork references the hub seating face and
clears the axle. Print flat contact plates with through-holes vertical, and rim
shoes contact-face down. Check full assembled reach, not just screw length.

## Dishing layout options

`dishLayout` selects straight or angled. Both have two fixed rim-contact surfaces
and only one adjustment screw: the central hub-face probe. Straight stops are reusable matched pairs in 20 mm reach steps; the bridge
position follows the chosen pair, rather than encoding exact wheel geometry. Two identical printed stops incorporate mounting flanges;
their reach is fixed by geometry and checked on a flat reference.

The angled layout uses one bridge and two full-stock diagonal T-slot arms. The
user's pictured 60 × 60 × 18 × 6 mm open 135° brackets join both rails using M5
bolts and matching T-nuts through 5.5 mm holes. Actual hole centres and slot
engagement require verification. Sliding, open-ended printed rim-stop saddles
clamp partway along the arms; unused metal extends beyond the rim. Selection
checks joint/centre clearance, hub clearance, contact travel and end margin,
without requiring arm ends to coincide with the rim. For the approximately
406 mm wheel, both three 200 mm members and three 300 mm members fit the model.
The stop stand-off accounts for rim depth so the continuing rail clears the
wheel envelope. Confirm actual spoke/rim and workspace clearance physically.

Print straight stops rear-face down, and saddle contact faces down with the
rail channel open. Both contact surfaces must have equal reach; fixed geometry
removes settings, not manufacturing error. Recalibrate after moving any mount.

## Shared probe range and adjustment review

Both designs use the same single lockable M6 centre probe. Probe reach is measured
from the wheel-facing carriage face to the hub-contact face. The model reserves
10 mm minimum reach for shoe/clearance and 15 mm of rod for rear nuts and tail.
Rod length is rounded up to maintain the requested initial setup allowance
(default ±5 mm). Insufficient retraction is flagged instead of silently resizing
a manually selected stop pair. The UI, specifications and CSV show range and
reserve; these are geometric limits, not experimentally verified repeatability.

The same 80 mm stop pair is tested with 130/135 mm hub spacing and 25/28/32 mm
rim widths. Only the centre probe changes setting. Round-size angled saddle
stand-offs replace exact rim-depth-dependent prints. Equal contact heights matter;
a common height change is absorbed by initial probe setting. Unequal heights,
flexure and joint movement require correction and physical calibration.

Set on side A, lock the centre and compare side B without changing anything.
If the gauge rocks on the probe, use B as the initial reference and recheck A for
a central gap. A 2 mm rim offset produces a 4 mm central gap only with both feet
seated. Travel is for initial setup, not for dialling out the measured error.
Source: https://www.parktool.com/en-us/blog/repair-help/wheel-dishing-centering.
Prefer the straight layout when simplicity is the priority: it has fewer structural
joints. The angled layout trades additional joints for shorter reusable stock.

## Stock selection

Valid stock edits rebuild immediately on input. The angled selector compares every
feasible bridge/arm combination, minimises bridge + 2 × arm stock length, and
prefers shorter arms on equal totals. It no longer stops at the shortest feasible
bridge. The UI reports the selected combination and remaining arm overhang.
With the current connectors and central carriage, bridge clearance still requires
194 mm; a list containing only 100/150 mm members is explicitly unsupported.
No unavailable bridge is retained or invented. Short arms can combine with a
longer bridge: on the 406.9 mm example, 300 + 150 + 150 and 400 + 100 + 100
both use 600 mm total stock, while a 200-only list still uses three 200 mm rails.

## Positive end location

The selector also evaluates moving each arm joint so its factory end lies at the
rim-contact cap. Where feasible, an internal shoulder seats on that end and side
cheeks register on the profile; the side-slot bolt retains rather than positions
the cap. Equal stock totals prefer end location. Other combinations keep open
sliding saddles with overhang. On the 406.9 mm example, a 300 mm bridge and two
100 mm arms now use end caps, reducing total stock to 500 mm. These newer end-cap
candidates supersede the earlier sliding-only stock examples above.

A flat pad references the rim; it does not cradle or clamp the wheel. End location
improves repeatable placement but does not certify accuracy. Check factory end
squareness, equal assembled pad heights and loaded deflection. The added shoulder
may need local print support or a separate cheek; slicer validation is required.

## Coplanar H base

The crossbar runs between the two feet rather than over them. All three base
members have centre height P/2 and bottom height zero; each crossbar end butts
against the corresponding foot inner face. Foot spacing follows the selected
uncut crossbar stock, while upright spacing still follows the hub supports.
Both uprights start at Y=P on the crossbar top. This lowers a 2020 frame by 20 mm
relative to the former stacked arrangement.

Four corner brackets lie in the horizontal base plane. Their flanges bolt into
side slots in the crossbar and feet, with bolt centres at P/2 above the bench.
The four upright brackets remain upright and connect crossbar top slots to
upright side slots. The previous stacked-joint slot-height requirement no longer
applies. Check actual connector width, hole position and bench clearance: the
pictured 19 mm bracket width would leave only 0.5 mm per side when centred on
20 mm rail height. That is a dimensional observation, not confirmed product fit.

Tests check all three base rails are coplanar, feet meet rather than intersect
the crossbar, upright bottoms land on its top face, and base bolts enter side
slots at rail-centre height. Rigidity and repeatability still need physical tests.
