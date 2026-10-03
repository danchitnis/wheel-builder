# Workshop tools

`/workshop` is independent of the wheel renderer, but consumes the same versioned
`BuildConfiguration` fragment. The header link is refreshed whenever the builder
captures its form, including invalid/blank measurements. The return link carries
the untouched wheel snapshot. No workshop control writes to the builder session.

## Design data

`src/utils/workshop.ts` is the source of truth for member selection, assembly part
instances, specifications and BOM grouping. Coordinates are mm:
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
protrusions. The 2020 caps are identical friction-fit V caps; 3030/4040 caps retain
their side-slot bolts and independently sized round seats. No steel dropouts or clamping skewer
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

Most PLA parts have dimensional envelopes, hole/mating clearances, nut capture and
mounting descriptions. The 2020 V hub cap, fit coupon and radial dial holder have actual
Fusion solids and printable STL exports in `cad/`; the other envelopes are not printable STL files. Bolt lengths are a
preliminary stack estimate, not a substitute for supplier engagement dimensions.
The assembly has not been built or physically certified to any tolerance.

## Page layout and persistence

The 3D viewer, fit status and component list share one column beside the settings.
On narrow screens that column appears first. Select a component to inspect its
dimensions, mounting specification and print orientation. Assembly instructions,
the standalone print guide and the calibration notebook have been removed from
the page; there are no measurement-entry fields or calibration disclosures.

Settings live in localStorage under `wheel-builder:workshop:v1`. Design revision
13 and the saved wheel fingerprint invalidate fit overrides from an earlier
design or a different wheel. Legacy calibration fields remain in the storage
format for compatibility, but the page does not collect or display them.
Storage failure leaves the in-memory configuration usable; WebGL failure leaves
dimensions and the component list available.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. The Cloudflare build
adapter requires local socket access. `PORT=4336 node tests/production-server.mjs`
serves the generated pages on loopback. `/workshop?verify=webgl-once` forces a
renderer initialization failure; `/workshop?verify=storage` denies build session
storage. The latter does not deny workshop localStorage.

Browser checks cover builder transfer and return navigation, profiles, whole-stock
failure, pointer/dial substitution, tool switching, component selection, exploded
views, WebGL failure, and responsive widths. CSV
content is covered by unit tests; the in-app browser did not expose a completed
download event during verification. Print CSS excludes interactive controls and
includes fit status and the component list.

## Print review

Each PLA instance carries bed orientation, support assessment and accuracy checks,
shown when selecting the component and included in CSV specifications. The rail
mount has a flat-bottom ledge and an upward-growing flange. The clevis has a broad
base under both ears; its horizontal holes require a bridging coupon or drilling.
The legacy 3030/4040 top-cap noses can need local support; the V2 2020 cap
prints upright with its 45° cavity roof and sloped outer pedestal.
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


## Fusion lateral holder V3

The workshop renders the redesigned Fusion solid directly, without stretching.
The 82 × 40 × 8 mm upper plate has two horizontal 65.5 × 5.5 mm slots: bolt
centres travel from X −42 to 18 mm, at Y 43 and 61 mm above the dial centre.
A 24 × 8 mm descending web carries the original fork below the mounting plate.
The full printed envelope is 82 × 82 × 27 mm. The fork retains 6 mm cheeks,
5.8 mm gap, Ø5.5 mm holes and the original root fillets. Three M5 bolts total.

For the Hope front 100 mm hub, 28 mm rim and 2020 upright, with provisional
3 mm hub-seat projection, the dial centre is 24.5 mm right of the upright centre with the centred V2 cap.
At 5 mm compression its tip touches the rim sidewall. Lower washer-to-case clearance is
11 mm; the case rear is 30 mm ahead of the upright front. This is a geometric
fit check, not a stiffness or manufacturing certification. Physical projection,
rounded lug shape and rear offset still need fit verification.

The measured relaxed probe has a 20 mm fixed sleeve plus 20 mm exposed pin,
40 mm total from the case. The display compresses the pin 5 mm, giving a 35 mm case-to-tip reach and 15 mm exposed pin. The 60 mm slot
travel lets the user retract for wheel insertion and add light preload after
contact. Out-of-range configurations are flagged rather than resized.

Fusion retains the old holder hidden and adds `PRINT - V3 symmetric upper slots lower dial
fork`. The imported web/plate/fork is a single valid solid; the original fork's
holes and roots are preserved. The radial holder is now a separate Fusion T-bridge design, described below.

The vertical plate/web outline has 3 mm corner fillets, including the two web
shoulders. The 8 mm thickness edges, slots, fork cheeks and holes are unchanged.
Fusion parameter: `holder_outline_radius`.


V3 centres the upper plate, slots and web on the fork at X −12 mm. Both slot
end margins remain 8.25 mm. With 5 mm preload, the front100 and rear135 rigs use
local slot positions −36.5 and −19 mm respectively (28 mm rim, 3 mm provisional
hub-seat projection). The dial sits 24.5 mm right of the front upright and 7 mm
right of the rear upright. Both positions leave adjustment for setup and removal.
Ten millimetres of indicator travel at 5 mm preload provides nominal ±5 mm;
actual working excursion should stay inside the end stops. Reposition and
re-zero for each wheel. This is geometry verification, not stiffness validation.


## Fusion 2020 centred V hub caps — revision 4

The V sits directly above the upright centre. Move the uprights under the hub-end
projections: upright X = ±(hub seating width/2 + usable projection/2). The 3 mm
axial contact band must fit entirely under each stationary end. Two copies of the same
cap support equal-diameter ends; unequal ends are explicitly flagged.

Print upright, collar opening on the bed and V up. The exported STL is already
oriented this way. The short collar is 10 mm deep, with a 20.3 mm clearance socket
and 3 mm walls. Four 6.1 mm-wide tongues enter the nominal 6 mm slots by 1.85 mm
past the aluminium exterior, providing nominal 0.1 mm width interference and
preventing rotation. Their tips have 0.4 mm lead-in chamfers. Check actual profile
slot lips and print the separate 5 mm coupon before making two caps.

The rail seats against a 1.5 mm inward ledge. Above it, a 17.3 mm square cavity
closes as a 45° pyramid over 8.65 mm of height. There is no wide horizontal socket
roof. The outer pedestal rises 12 mm while spreading to the 44 mm-wide V, giving
53.6° outward slopes above horizontal. It narrows axially to a 5 mm fin root.
Both faces taper equally (1.79° from vertical) to 3 mm at the tips, keeping
the fin centred at every height. The V remains 90° and its apex stays centred.
The fin is thicker below its tips; short hub protrusions require a fresh
hub-shell clearance check, especially below the V contact. V apex is 26 mm above the bar; top is 44 mm. Raising the apex also clears
the workshop's 32 mm-diameter hub-shell reference for supported end diameters.
Overall cap envelope is 26.3 × 54 × 44 mm; the 90° V supports diameters 6–35 mm.
Axle height = rail top + 26 + diameter/(2 sin45°). Check actual hub-shell and flange
clearance, especially for hubs whose flanges extend close to the seating faces.

Use supports OFF. The only horizontal overhang above the bed is the small
1.5 mm rail seating ledge; inspect that layer and use appropriate cooling for PLA.
The cavity slopes close progressively and the outer cheeks grow from sloped
material. The model has no suspended islands. A brim may help adhesion without
adding support underneath the part. Physical print, fit and load performance
remain untested.

`src/data/hubSupportCap.json` is the dimensional source. Inject it as `CAP_SPEC`
into `cad/create_hub_cap.py` through Fusion MCP. The build can start in an empty
design or replace the previous V1 cap visibly; V1 geometry is retained hidden.
The new design has two linked V2 cap occurrences and a separate coupon.
`cad/export_hub_cap.py` exports measured Fusion meshes and parameter metadata;
`cad/export_hub_cap_stl.py` regenerates both STL files in upright print orientation.
Regenerate exports after CAD edits. The roof-rise parameter is linked to half the
roof opening so clearance changes preserve its 45° slope.

The workshop renders the solid at its actual size with the rail-top centre as
origin (Fusion X,Y,Z maps to workshop X,Z,−Y in millimetres). The caps form one
BOM row, quantity two, with no cap bolts or nuts. Exploded view lifts them clear
of the uprights. The 3030/4040 bolted designs are unchanged. Workshop design
revision 8 clears earlier cap fit/calibration data.

Verification includes watertight positive-volume meshes, shared parameters,
centred hub contact, 45° minimum downward-face slopes (except the seating ledge
and bed), supported diameter range, BOM, and legacy profile behaviour. CuraEngine
5.13.0 successfully sliced the cap at 0.2 mm layers / 0.4 mm nominal line width
with support disabled: 270 layers, no support paths. This is a geometry validation
slice, not printer-specific production G-code. See `cad/print-verification.json`.


## Fusion radial dial holder V8 — double-sided M5 pivot

Two ordinary printed parts replace the rail and flexible socket: a slotted T
bridge and a flat dial arm. The bridge has two fixed fork cheeks, with the arm
between them. A **single M5 × 25 bolt, two washers and a nut** clamp both flat
bearing faces to lock tilt. The two cheeks and arm are each 4 mm thick; 0.2 mm
assembly clearance on each side gives a 12.4 mm open stack. The longer pivot
bolt is intentional. The three frame fixings and the dial-lug fixing retain
8 mm stacks and short M5 × 16 bolts.

The whole bridge slides sideways in **three horizontal mounting slots**, like
the lateral holder. Left bolt centres travel −21 to +16 mm in two slots at
18 mm vertical pitch; the right bolt travels 108–145 mm in its slot. Both are
local coordinates on the printed bridge. The dial centre can sit 46–83 mm from
the left upright. This covers the primary Hope front100 and rear135 hubs, ±5 mm
wheel offset and 3–20 mm hub-end projection. Changing hub width requires sliding
the bridge as well as repositioning the right bolt. This replaces the earlier
fixed-left-hole arrangement so two simple printed pieces suffice. Tighten the
frame bolts to lock sideways position; the pivot bolt independently locks tilt.

The pivot is 4 mm further left than V6, and the dial-fixing hole is 2 mm
further right within part 2. The dial reference is now local X=62. Assembly
positioning compensates for this so the probe remains on the wheel centreline.
R4 concave fillets reinforce both outer fork roots; the supporting foot extends equally 6 mm beyond each outer cheek while leaving the rotating
arm gap clear. A 10 mm diameter driver envelope clears the lug screw approach,
both cheeks and pivot hardware throughout the verified 0–25° range. The assembled
design, including its dial and hardware, remains active in Fusion; the separated
print layout is only an additional export.

The pivot has a 24 mm nominal bearing diameter. The moving arm prints on its
broad 4 mm face, with the reinforced lug ear growing directly from that face.
The bridge prints on its flat 8 mm back, with both fork cheeks growing upward.
Horizontal pivot clearances have 45° roofs; the moving arm's pivot bore prints
vertically. There are no enclosed unsupported ceilings, snap fits or flexible
clamping features. Rounded beam openings remove unused material. Total solid
volume is 45,853.5 mm³, 32.3% below V2. The combined oriented STL occupies
**180 × 110.4 × 32 mm**. Use the individual STLs if bed margins require separation.

The reference dial is unchanged: Ø54 × 25 mm case, 5.2 mm lug, Ø6.85 mm hole
and inferred 10.25 mm rear offset. Its metal lug bears against a 2.8 mm reinforced
printed ear for an 8 mm stack. The 20 mm sleeve and 15 mm exposed pin represent
5 mm preload. No contact-tip attachment is included. Aim the pin through the
wheel axle centre, tighten the pivot, adjust bridge height for preload, and
re-zero. Recheck after any hub, lateral-position or angle change.

`src/data/radialHolder.json` is the named dimensional specification. Run
`cad/create_radial_holder.py` through Fusion MCP with `RADIAL_SPEC` injected and
`OUTPUT_ROOT` set to the repository directory. It imports the checked-in
`cad/radial-dial-holder.f3d`, copies its measured reference dial, closes that
temporary import and creates a separate radial design. No open lateral document
is required, and the saved source assembly is not modified.
`cad/export_radial_holder.py` exports actual neutral Fusion meshes, oriented
individual and combined STLs, one assembly STEP and the F3D assembly. The
combined STL places both printable solids on the same Z=0 bed. Individual STEP
files, a second print-layout F3D, old design revisions and review screenshots are
excluded to keep a single current CAD assembly. The workshop uses only
rigid translations and rotations; it never stretches meshes. Revision 13 clears
old calibration readings. Pointer mode and lateral geometry remain unchanged.

The workshop computes the tilt needed for the actual rim radius from the probe
axis and pivot location. The pivot is local Y=−26, Z=20; its axis is horizontal
across the stand. Travel is checked over 0–25°. Unsupported hub widths, offsets,
slot travel, base clearance and probe alignment produce explicit fit warnings.

Validation includes two connected closed Fusion solids; zero interference over
114 component/hardware checks; manifold STL meshes; overhang-angle checks in
actual print orientation; both Hope hubs, ±5 mm offsets and 3/20 mm end projection;
and unchanged mesh dimensions. CuraEngine 5.13.0 also generates a generic
supports-off validation slice at 0.2 mm layers. The slice is for geometric review,
not machine-specific production G-code. Physical print fit, tightening torque,
creep and measurement repeatability still require testing on the actual stand.

Assembly: place the arm between the fork cheeks, fit the longer M5 pivot bolt
with washers and nut, and leave it loose. Attach the bridge using its three
frame slots and centre the dial. Tighten the frame bolts, set tilt and tighten
the pivot, then set 5 mm preload and re-zero. Retract probes before lifting the
wheel; lower the bridge in the upright slots to retract the radial probe.
