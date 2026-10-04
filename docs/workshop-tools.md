# Workshop tools

`/workshop` is independent of the wheel renderer, but consumes the same versioned
`BuildConfiguration` fragment. The header link is refreshed whenever the builder
captures its form, including invalid/blank measurements. The return link carries
the untouched wheel snapshot. No workshop control writes to the builder session.

## Design data

`src/utils/workshop.ts` is the source of truth for member selection, assembly part
instances, specifications and BOM grouping. Coordinates are mm:
X is the axle direction, Y is vertical and Z is fore/aft. Each stand extrusion instance
uses a member from the available stock set. The dishing frame uses its fixed
300 + 100 + 100 mm members. Missing lengths produce a provisional
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
their side-slot bolts and independently sized round seats. Narrow hubs automatically use a through-hub support rod and matched spacer
sleeves on the V caps to preserve the bracket minimum spacing. The optional loose
guide rod on wider hubs remains an alignment aid. Neither rod clamps the hub.
Measure both diameters and usable protrusion; unsupported ends are flagged.

The adjustment pointers use the exact `probe1` body exported from the open Fusion
Design through MCP: 105 × 15 × 15 mm, 5 mm base, 90 × 5 mm straight slot,
thick rear flange and native fillets. Both stand probes are identical copies with the thin end to the left and thick flange to the right
on the front of the same upright. The narrow lateral tip approaches the rim sidewall;
the radial copy slides farther inward to the wheel centre plane below the rim, using its upper edge.
There is no separate radial adapter plate. M4 bolts with wide washers clamp the
native slot to profile-compatible M4 T-nuts. The dial mode retains its own Fusion
holders. All printed envelopes are checked against the 180 mm print envelope.

The dishing bridge remains independent, with equal-reach metal feet and the unchanged Probe 1
referencing the dropout seating face. Its measurement basis follows
https://www.parktool.com/en-us/blog/repair-help/wheel-dishing-centering.

Most PLA parts have dimensional envelopes, hole/mating clearances, nut capture and
mounting descriptions. The 2020 V hub cap, fit coupon and radial dial holder have actual
Fusion solids and printable STL exports in `cad/`, as do Probe 1 and the lateral dial holder; the other envelopes are not printable STL files. Bolt lengths are a
preliminary stack estimate, not a substitute for supplier engagement dimensions.
The assembly has not been built or physically certified to any tolerance.

## Page layout and persistence

The 3D viewer, fit status and component list share one column beside the settings.
On narrow screens that column appears first. Select a component to inspect its
dimensions, mounting specification and print orientation. Assembly instructions,
the standalone print guide and the calibration notebook have been removed from
the page; there are no measurement-entry fields or calibration disclosures.

Settings live in localStorage under `wheel-builder:workshop:v1`. Design revision
15 and the saved wheel fingerprint invalidate fit overrides from an earlier
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
shown when selecting the component and included in CSV specifications. Probe 1
prints on its native flat back; the dial-holder fork cheeks grow upwards.
Horizontal lug holes require a bridging coupon or drilling.
The legacy 3030/4040 top-cap noses can need local support; the V2 2020 cap
prints upright with its 45° cavity roof and sloped outer pedestal.
No support-free or dimensional-accuracy claim has been physically validated.

## Photographed dishing tool

Only the supplied three-rail mechanism is supported. It uses a 300 mm centre
rail, two 100 mm arms, four open 135° metal brackets, and the exact Fusion Probe 1
bolted directly across the centre rail. The two outer brackets are the rim feet;
there are no printed stops, forked hub shoe, shoe arm or centre adapter.
The stand's stock list does not resize this fixed dishing frame.

The supplied bracket dimensions are 60 mm legs, 18 mm width, 6 mm thickness and
Ø5.5 mm holes. The preview includes the relieved gusset. Hole centres at 40 mm
from the bend and the undimensioned cutout are approximate. Two bolts secure
each inner bracket; one secures each outer foot, leaving its contact-leg hole
empty. All six bracket bolts use M5 profile-compatible T-nuts. Probe 1 retains
its M4 wide-washer clamp and unmodified native 5 mm slot.

The 135° included-angle brackets make 45° rail turns. A 45° connector can be used
with complementary mounting faces; verify the actual faces and contact positions.
The preview represents the photographed 135° hardware, not a second mechanism.

Both arm joints slide symmetrically along the centre rail; full 100 mm arm
lengths are preserved. The reference contacts must fall on the free 60 mm foot
legs, leaving 5 mm end margins. Out-of-range rims are flagged rather than
stretching the frame or inventing different stock. Probe reach uses its actual
7–93 mm bolt-centre travel, with the narrow end towards the hub.

The shared mesh is `src/components/workshop/fusionProbe1Mesh.json`, with the
native printable body in `cad/probe1.stl`. Its body is always 105 × 15 × 15 mm.
There is no forked shoe: check actual stationary hub-face, axle and seal clearance.
Seat both metal feet, set and lock the probe on the first wheel side, and reverse
without changing any settings. Check at several rim positions to distinguish
local runout from dish. Confirm foot coplanarity and clamp repeatability physically.

Legacy straight-layout and printed-stop settings are discarded when loading this single model. The UI exposes
neither the old straight alternative nor its printed-stop reach selector.

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
applies. All eight 90° connectors use the supplied gusseted bracket: 50 × 50 mm
legs, 18 mm width, 9 mm flanges, and two Ø6 mm clearance holes for M5 hardware.
Hole centres are 10 mm from each free end and 9 mm across the width. The preview
includes the diagonal gusset, relieved opening and open central boss; their
undimensioned contours are approximate. The 18 mm width leaves 1 mm bench
clearance on a 2020 rail. M5 × 16 bolts are preliminary lengths for the 9 mm
flanges; select M5 T-nuts compatible with the chosen profile and confirm engagement.
Crossbar stock must support the full outer bracket legs. Upright spacing is clamped to a hard minimum: 100 mm between inner faces,
so 120 mm centre-to-centre on 2020 rails. Bracket tips can meet but cannot overlap.
For a narrower hub, the assembly automatically includes a through-hub support rod
and two equal-OD metal spacer sleeves. The rod control is checked and locked while
required; returning to a wider hub restores the optional guide-rod preference.
Each sleeve has a hub-side counterbore for the existing axle protrusion and a
smaller through-bore for the rod, and extends across the holder. The unchanged V
caps carry the sleeves; axle height follows their outside diameter. The hub stays
centred and the measurement mounts follow the actual upright spacing. Sleeve
lengths and rod length are listed in the BOM. These adapter dimensions are
provisional: verify the actual hub bore, stationary end contact, rod stiffness
and retention before use; do not clamp through the printed holders.

Tests check all three base rails are coplanar, feet meet rather than intersect
the crossbar, upright bottoms land on its top face, and base bolts enter side
slots at rail-centre height. Rigidity and repeatability still need physical tests.


## Fusion lateral holder V5

The workshop renders the redesigned Fusion solid directly, without stretching.
The 82 × 40 × 8 mm upper plate has two horizontal 65.5 × 5.5 mm slots: bolt
centres travel from X −42 to 18 mm, at Y 43 and 61 mm above the dial centre.
A 24 × 8 mm descending web carries one 8 mm mounting ear below the plate.
The printed envelope is 82 × 82 × 28 mm. The ear has a Ø5.5 mm hole with a
45° print roof, an R8 free-side fillet and an R2 dial-side fillet. Three M5 bolts total.

For the Hope front 100 mm hub, 28 mm rim and 2020 upright, with provisional
3 mm hub-seat projection, the uprights stop at the 120 mm bracket minimum and the dial centre is
16 mm right of the upright centre.
At 5 mm compression its tip touches the rim sidewall. Lower washer-to-case clearance is
11 mm; the case rear is 30 mm ahead of the upright front. This is a geometric
fit check, not a stiffness or manufacturing certification. Physical projection,
rounded lug shape and rear offset still need fit verification.

The measured relaxed probe has a 20 mm fixed sleeve plus 20 mm exposed pin,
40 mm total from the case. The display compresses the pin 5 mm, giving a 35 mm case-to-tip reach and 15 mm exposed pin. The 60 mm slot
travel lets the user retract for wheel insertion and add light preload after
contact. Out-of-range configurations are flagged rather than resized.

The V4 fork and rear lug are rotated 90° about the case axis. The lateral
probe points along X and the lug screw along Y, so the two are perpendicular.
`cad/correct_lateral_lug.py` updates the open original `probe-dial-lateral`,
exports the mesh and printable STL, and leaves the assembled design visible.
The flat mounting plate, pin preload and case position are preserved.

The vertical plate/web outline has 3 mm corner fillets, including the two web
shoulders. The 8 mm thickness edges, slots, fork cheeks and holes are unchanged.
Fusion parameter: `holder_outline_radius`.


## Fusion 2020 centred V hub caps — revision 4

The V sits directly above the upright centre. Upright spacing is the larger of
the hub seating width plus usable projection and the bracket minimum (120 mm
for 2020). Narrow hubs use matched spacer sleeves on a through-hub support rod;
wider hubs seat their stationary ends directly on the V. The 3 mm
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
Axle height = rail top + 26 + supported diameter/(2 sin45°), using the sleeve
outer diameter when a support rod is required. Check actual hub-shell and flange
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
revision 15 clears earlier fit/calibration data.

Verification includes watertight positive-volume meshes, shared parameters,
centred hub contact, 45° minimum downward-face slopes (except the seating ledge
and bed), supported diameter range, BOM, and legacy profile behaviour. CuraEngine
5.13.0 successfully sliced the cap at 0.2 mm layers / 0.4 mm nominal line width
with support disabled: 270 layers, no support paths. This is a geometry validation
slice, not printer-specific production G-code. See `cad/print-verification.json`.


## Fusion radial dial holder V13 — reinforced single ear

One flat-backed print carries the dial against one 8 mm ear. No fitted gap or
shims are needed. R6 outer and R3 dial-side root fillets reinforce the ear. The transverse M5 × 25 lug bolt also locks
0–25° tilt. No separate arm or second pivot is needed. The lug screw is
perpendicular to the measuring pin on both radial and lateral holders.

The pivot is 20.75 mm above the print bed and 40 mm from the mounting line. An R6.75 concave web with R6 outer and R3 dial-side root fillets
reinforces the single ear. Two R8 concave fillets blend the foot into the crossbar. The two exposed arm-end corners have the user-added R2.5 fillets from Fusion v9. Frame lands remain 8 mm for the three M5 × 16 bolts.
The print envelope is **180 × 68 × 30.75 mm**. The projecting arm is solid and 8 mm thick throughout. The raised ear and
its local fillets sit above that arm; there is no recessed 2 mm floor.

Left bolt centres travel −21 to +16 mm at 18 mm pitch; right travel is
108–145 mm. Sliding the bridge places the dial at 46–83 mm from the left upright.
The workshop checks both Hope hubs, ±5 mm offsets and 3–20 mm end projections,
retaining the actual upright spacing and reporting fits outside the travel.
Meshes only translate and rotate. Pointer mode remains available.

The fixed reference is Ø54 × 25 mm, 5.2 mm lug and Ø6.85 mm lug hole, with
inferred 10.25 mm rear offset. The 20 mm sleeve and 15 mm exposed pin show
5 mm preload. Aim the pin through the axle, tighten the lug bolt, adjust frame
height for preload and re-zero. Lower the bridge to retract before wheel removal.

Generate with `cad/create_radial_holder.py` through Fusion MCP, injecting
`RADIAL_SPEC` from `src/data/radialHolder.json` and `OUTPUT_ROOT` as the repository
path. Open the original `probe-dial-radial` document first. Regeneration updates
that document, preserving an automatic temporary backup; save it normally to
create a Fusion version. The existing document supplies the reference dial. `cad/export_radial_holder.py`
exports the assembled F3D, one millimetre STL and measured workshop meshes.
`cad/correct_lateral_lug.py` reproduces the matching lateral V5 single-ear correction.

Validation uses `cad/verify_radial_holder.py` for one closed solid, perpendicular
lug/pin axes and 83 interference checks through the tilt and fixing ranges.
Mesh tests check manifold edges and print overhangs. `cad/slice_radial_holder.py`
runs a generic 0.2 mm CuraEngine slice without supports; this is not production
printer G-code. Physical print fit, clamping friction and stiffness need testing.

## Retained CAD files

`cad/` retains current printable STL parts, editable F3D assemblies, verification
reports and scripts needed to reproduce them. Workshop preview meshes live in
`src/components/workshop/`. The old split radial bridge and C-holder STL files
and duplicate radial STEP assembly are removed; the exporter produces the native
assembly and printable part without regenerating the STEP copy. Generated Fusion
`_XRef_` sidecars and Python caches are ignored. Regeneration backups and validation G-code stay in the
system temporary directory and are not commit assets; validation slices clean
up their temporary G-code and logs automatically.

The physical lateral V4 print failed at a fork ear when fitted over the dial lug.
V5 removes the second ear and fitted-gap constraint, retaining one 8 mm ear
with a 28 mm overall projection and R2 top shoulders. Both holders retain the
original dial position and require physical print and clamp testing.

Root fillets are local: R8 free-side and R2 dial-side on the lateral holder;
R6 outer and R3 dial-side on the radial holder. A local Ø16 mm circular relief
around each lug bolt clears washers up to Ø15 mm while retaining a flat seat.
Both CAD checks verify full support of the outer washer bearing annulus.
