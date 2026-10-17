import * as THREE from 'three';
import { createNippleGeometry } from './NippleGeometry.ts';
import { calculateNippleFit, purchasedSpokePoints, nippleFitDefaults, nippleReferences, nippleProfileError } from '../utils/nippleFit.ts';
import { calculateSpokePaths, type SpokePath, type SpokePaths, type Point3 } from '../utils/spokePath.ts';
import { createLacingGuide, type LacingGuide } from '../utils/lacingGuide.ts';
import { shallowRimSection } from '../utils/rimProfile.ts';
import { resolveRimShift, type WheelBuildInputs } from '../utils/physicsCalculator.ts';

export interface WheelModelOptions {
  paths?: SpokePaths;
  guide?: LacingGuide;
  lacingMode?: boolean;
  preview?: boolean;
  lacingPlacedCount?: number;
  explodedValue?: number;
  showLeftSpokes?: boolean;
  showRightSpokes?: boolean;
  isSpokeDeltaMode?: boolean;
  colorMode?: 'classic' | 'side' | 'tension';
  spokeThickness?: number;
  axleWidth?: number;
}

/** Parameterise by sample index so TubeGeometry includes every contact point.
 * Uniform arc-length mesh sampling can skip a sub-millimetre flange bend. */
class SpokeDisplayCurve extends THREE.Curve<THREE.Vector3> {
  private points: THREE.Vector3[];
  constructor(points: THREE.Vector3[]) { super(); this.points = points; }
  getPoint(t: number, target = new THREE.Vector3()) {
    const position = Math.max(0, Math.min(1, t)) * (this.points.length - 1);
    const index = Math.min(this.points.length - 2, Math.floor(position));
    return target.copy(this.points[index]).lerp(this.points[index + 1], position - index);
  }
  getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target); }
  getTangentAt(t: number, target = new THREE.Vector3()) {
    return target.copy(this.getPoint(Math.min(1, t + 1e-5))).sub(this.getPoint(Math.max(0, t - 1e-5))).normalize();
  }
}

/** The wheel geometry used by Builder and Workshop, in Builder coordinates (Z axle). */
export function createWheelModel(inputs: WheelBuildInputs, options: WheelModelOptions = {}) {
  const pathModel = options.paths ?? calculateSpokePaths(inputs);
  const guide = options.guide ?? createLacingGuide(inputs, pathModel);
  const { lacingMode = false, preview = false, lacingPlacedCount = 0,
    explodedValue = 0, showLeftSpokes = true, showRightSpokes = true,
    isSpokeDeltaMode = false, colorMode = 'classic', spokeThickness = 1 } = options;
  const { erd, osb, drillingOffsetLeft, drillingOffsetRight, spokeCount,
    spokeHoleDiameter, hubOffset, rimFlip, flangePcdLeft, centerToLeft,
    crossesLeft, flangePcdRight, centerToRight, crossesRight } = inputs;
  const group = new THREE.Group();
  const spokeMeshes: THREE.Mesh[] = [];
  // --- MATERIALS ---
  const rimMat = new THREE.MeshStandardMaterial({
    color: inputs.rimProfile === 'shallow-double-wall' ? 0x17191c : 0x5a606d, // Brighter Metallic Alloy/Titanium Gray for high contrast on dark background
    roughness: 0.35,
    metalness: 0.75,
    side: THREE.DoubleSide,
  });

  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x526b86, // Neutral slate contrasts with amber target rings and cyan/green heads.
    roughness: 0.48,
    metalness: 0.35,
  });

  const freehubMat = new THREE.MeshStandardMaterial({
    color: 0xa6afbb, // Satin silver
    roughness: 0.45,
    metalness: 0.4,
  });

  // --- 1. GENERATE RIM (Lathe Profile for ultra-realism) ---
  // Schematic shell anchored to the calibrated spoke-tip circle. Its walls are
  // illustrative and do not locate the actual nipple bearing or affect fit.
  const R_bed = erd / 2;
  const rimDepth = inputs.rimDepth ?? 22;   // Outer rim depth
  const R_outer = R_bed + rimDepth; // Outer tire hook bead radius
  const rimWidth = (inputs.rimWidthOuter ?? 26) / 2;   // Rim half-width

  // Define profile coordinates relative to inner spoke bed (R_bed, 0)
  let points: THREE.Vector2[] = [];
  points.push(new THREE.Vector2(R_bed, 0)); // Inner spoke bed center channel
  points.push(new THREE.Vector2(R_bed + 2, rimWidth - 3)); // Sloping inner wall
  points.push(new THREE.Vector2(R_outer - 3, rimWidth)); // Outer sidewall
  points.push(new THREE.Vector2(R_outer, rimWidth)); // Hook bead top
  points.push(new THREE.Vector2(R_outer, rimWidth - 1)); // Hook drop
  points.push(new THREE.Vector2(R_bed + 5, rimWidth - 2)); // Center channel bed
  points.push(new THREE.Vector2(R_bed + 5, -(rimWidth - 2)));
  points.push(new THREE.Vector2(R_outer, -(rimWidth - 1)));
  points.push(new THREE.Vector2(R_outer, -rimWidth));
  points.push(new THREE.Vector2(R_outer - 3, -rimWidth));
  points.push(new THREE.Vector2(R_bed + 2, -(rimWidth - 3)));
  points.push(new THREE.Vector2(R_bed, 0));

  const shallow = inputs.rimProfile === 'shallow-double-wall';
  const section = shallowRimSection(rimWidth * 2, inputs.rimWidthInner ?? 22, rimDepth);
  if (shallow) points = section.outline.map(([axial, radial]) => new THREE.Vector2(R_bed + radial, axial));

  // Lathe profile around Y axis, then rotate to face along Z
  const rimGeom = new THREE.LatheGeometry(points, 96);
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  rimMesh.rotation.x = Math.PI / 2;

  // Shift rim bed to account for rimShift/OSB
  const rimShift = resolveRimShift(inputs);
  rimMesh.position.z = -rimShift;
  group.add(rimMesh);
  if (shallow) {
    const cavity = new THREE.Mesh(new THREE.LatheGeometry(section.cavity.map(([axial, radial]) => new THREE.Vector2(R_bed + radial, axial)), 96), rimMat);
    cavity.rotation.x = Math.PI / 2;
    cavity.position.z = -rimShift;
    group.add(cavity);
  }

  // Use the same landmark as the guide's ordering and instructions.
  const Ns = spokeCount / 2;
  const valveAngle = guide.valveAngle;

  // --- 3. GENERATE HUB (CNC Lathe Profile) ---
  // Solid physical hub flange positions (hub geometry remains rigid and un-stretched)
  const zL = -centerToLeft + hubOffset;
  const zR = centerToRight + hubOffset;

  // We build the hub in pieces: Left Flange, Right Flange, Hub Shell Center, Freehub
  const hubShellGroup = new THREE.Group();

  // --- DYNAMIC HUB FLANGE & J-BEND GEOMETRY CALCULATIONS ---
  // Flange thickness derived from hub inputs or scaled proportionally to spoke hole diameter
  const flangeThickness = inputs.flangeThickness ?? Math.max(2.4, spokeHoleDiameter * 1.15);
  // Outer flange margin extending past pitch circle radius
  const flangeOuterMargin = Math.max(3.2, spokeHoleDiameter * 1.25);
  // Spoke wire radius
  const spokeRad = (inputs.spokeDiameter ?? 2) / 2 * spokeThickness;

  // Flange geometries with real drilled spoke holes
  const flangeLGeom = createFlangeGeometry(
    flangePcdLeft / 2,
    Ns,
    spokeHoleDiameter,
    0, // Left holes alignment
    inputs.flangeThicknessLeft ?? flangeThickness,
    (Number.isFinite(inputs.flangeOuterDiameterLeft) && inputs.flangeOuterDiameterLeft! > flangePcdLeft ? inputs.flangeOuterDiameterLeft! : (flangePcdLeft + 2 * flangeOuterMargin)) / 2 - flangePcdLeft / 2
  );
  const flangeL = new THREE.Mesh(flangeLGeom, hubMat);
  flangeL.position.z = zL;
  hubShellGroup.add(flangeL);

  const flangeRGeom = createFlangeGeometry(
    flangePcdRight / 2,
    Ns,
    spokeHoleDiameter,
    Math.PI / Ns, // Right holes staggered by half-hole
    inputs.flangeThicknessRight ?? flangeThickness,
    (Number.isFinite(inputs.flangeOuterDiameterRight) && inputs.flangeOuterDiameterRight! > flangePcdRight ? inputs.flangeOuterDiameterRight! : (flangePcdRight + 2 * flangeOuterMargin)) / 2 - flangePcdRight / 2
  );
  const flangeR = new THREE.Mesh(flangeRGeom, hubMat);
  flangeR.position.z = zR;
  hubShellGroup.add(flangeR);

  // Determine hub type (Front vs Rear), spacing, and disc brake interface
  const hubNameLower = (inputs.hubName || '').toLowerCase();
  const spacingStr = (inputs.spacing || '').toLowerCase();
  const isRearHub = inputs.isRear !== undefined
    ? inputs.isRear
    : (hubNameLower.includes('rear') || spacingStr.includes('148') || spacingStr.includes('142') || spacingStr.includes('135') || spacingStr.includes('157') || spacingStr.includes('150') || (centerToRight < 28 && centerToLeft >= 30));

  let axleWidth = 142;
  if (spacingStr.includes('148') || (isRearHub && spacingStr.includes('boost'))) axleWidth = 148;
  else if (spacingStr.includes('110') || (!isRearHub && spacingStr.includes('boost'))) axleWidth = 110;
  else if (spacingStr.includes('100') || !isRearHub) axleWidth = 100;
  else if (spacingStr.includes('157')) axleWidth = 157;
  else if (spacingStr.includes('150')) axleWidth = 150;
  else if (spacingStr.includes('135')) axleWidth = 135;

  axleWidth = options.axleWidth ?? axleWidth;

  const discType = inputs.discType || (hubNameLower.includes('cl') || hubNameLower.includes('centerlock') ? 'Centerlock' : '6-Bolt');

  // Hub center tube connecting flanges
  const centerTubeGeom = new THREE.CylinderGeometry(15, 15, Math.max(2, Math.abs(zR - zL) - 4), 32);
  const centerTube = new THREE.Mesh(centerTubeGeom, hubMat);
  centerTube.rotation.x = Math.PI / 2;
  centerTube.position.z = (zL + zR) / 2;
  hubShellGroup.add(centerTube);

  // 3D Hub Brand Logo Badge (Aligned directly with Rim Valve Hole)
  const logoCanvas = typeof document === 'undefined' ? undefined : document.createElement('canvas');
  if (logoCanvas) {
    logoCanvas.width = 512;
    logoCanvas.height = 128;
    const logoCtx = logoCanvas.getContext('2d');
    if (logoCtx) {
      logoCtx.fillStyle = '#111116';
      logoCtx.fillRect(0, 0, 512, 128);

      logoCtx.strokeStyle = '#d4af37';
      logoCtx.lineWidth = 5;
      logoCtx.strokeRect(8, 8, 496, 112);

      logoCtx.strokeStyle = '#f59e0b';
      logoCtx.lineWidth = 2;
      logoCtx.strokeRect(16, 16, 480, 96);

      logoCtx.fillStyle = '#f59e0b';
      logoCtx.font = 'bold 20px sans-serif';
      logoCtx.textAlign = 'center';
      logoCtx.textBaseline = 'middle';
      logoCtx.fillText('⚡ CNC PRECISION HUB ⚡', 256, 36);

      logoCtx.fillStyle = '#ffffff';
      logoCtx.font = '900 30px sans-serif';
      logoCtx.fillText((inputs.hubName || 'PRO HUB').toUpperCase(), 256, 78);
    }
  }
  const logoTexture = logoCanvas ? new THREE.CanvasTexture(logoCanvas) : undefined;

  const logoMat = new THREE.MeshStandardMaterial({
    map: logoTexture ?? null,
    roughness: 0.25,
    metalness: 0.85,
  });

  const logoSectorGeom = new THREE.CylinderGeometry(
    15.2,
    15.2,
    Math.max(2, Math.abs(zR - zL) - 8),
    32,
    1,
    true,
    -Math.PI / 3,
    (2 * Math.PI) / 3
  );
  const logoMesh = new THREE.Mesh(logoSectorGeom, logoMat);
  logoMesh.rotation.x = Math.PI / 2;
  logoMesh.rotation.y = valveAngle + Math.PI / 2; // Facing valveAngle
  logoMesh.position.z = (zL + zR) / 2;
  hubShellGroup.add(logoMesh);

  // Drive Side Component:
  // REAR HUBS: Freehub driver body with cassette splines
  if (isRearHub) {
    const fhGeom = new THREE.CylinderGeometry(17.5, 17.5, 26, 32);
    const freehub = new THREE.Mesh(fhGeom, freehubMat);
    freehub.rotation.x = Math.PI / 2;
    freehub.position.z = zR + 14.0;
    hubShellGroup.add(freehub);

    // Freehub lockring lip
    const lockringGeom = new THREE.CylinderGeometry(14, 14, 4, 32);
    const lockring = new THREE.Mesh(lockringGeom, hubMat);
    lockring.rotation.x = Math.PI / 2;
    lockring.position.z = zR + 28.0;
    hubShellGroup.add(lockring);
  } else {
    // FRONT HUBS: Clean tapered front axle barrel (No freehub)
    const frontTaperGeom = new THREE.CylinderGeometry(15, 12, 12, 32);
    const frontTaper = new THREE.Mesh(frontTaperGeom, hubMat);
    frontTaper.rotation.x = -Math.PI / 2;
    frontTaper.position.z = zR + 6.0;
    hubShellGroup.add(frontTaper);
  }

  // Disc Brake Rotor Interface (Left Side):
  if (discType === '6-Bolt') {
    const discMountGeom = new THREE.CylinderGeometry(28, 28, 6, 6); // 6-bolt mounting lobes
    const discMount = new THREE.Mesh(discMountGeom, freehubMat);
    discMount.rotation.x = Math.PI / 2;
    discMount.position.z = zL - 4.5;
    hubShellGroup.add(discMount);
  } else if (discType === 'Centerlock') {
    const clMountGeom = new THREE.CylinderGeometry(22, 22, 8, 32); // Splined Centerlock ring
    const clMount = new THREE.Mesh(clMountGeom, freehubMat);
    clMount.rotation.x = Math.PI / 2;
    clMount.position.z = zL - 4.5;
    hubShellGroup.add(clMount);
  }

  // Axle Tube & Thru-Axle End Caps
  const axleHalfWidth = axleWidth / 2;
  const leftCapZ = -axleHalfWidth + hubOffset;
  const rightCapZ = axleHalfWidth + hubOffset;

  const axleTubeGeom = new THREE.CylinderGeometry(7.5, 7.5, Math.abs(rightCapZ - leftCapZ), 32);
  const axleTube = new THREE.Mesh(axleTubeGeom, freehubMat);
  axleTube.rotation.x = Math.PI / 2;
  axleTube.position.z = (leftCapZ + rightCapZ) / 2;
  hubShellGroup.add(axleTube);

  // Left & Right End Caps
  const capGeom = new THREE.CylinderGeometry(11, 11, 6, 32);
  const leftCap = new THREE.Mesh(capGeom, hubMat);
  leftCap.rotation.x = Math.PI / 2;
  leftCap.position.z = leftCapZ + 3.0;
  hubShellGroup.add(leftCap);

  const rightCap = new THREE.Mesh(capGeom, hubMat);
  rightCap.rotation.x = Math.PI / 2;
  rightCap.position.z = rightCapZ - 3.0;
  hubShellGroup.add(rightCap);

  group.add(hubShellGroup);

  // --- 3. GENERATE SPOKES & NIPPLES ---
  // Exploded view separation shifts left & right spoke webs (+ nipples) apart laterally
  const expOffset = lacingMode ? 0 : explodedValue * 60.0;

  // Loop through sides
  const sides = [
    {
      sideName: 'Left' as const,
      show: showLeftSpokes,
      crosses: crossesLeft,
      fRadius: flangePcdLeft / 2,
      zFlange: zL - expOffset,
      wEff: centerToLeft - hubOffset - rimShift - drillingOffsetLeft,
      rimZ_base: -rimShift - drillingOffsetLeft,
      rimZ: -rimShift - drillingOffsetLeft - expOffset,
      colorHex: 0x3b82f6, // Blue
      flangeOffsetAngle: 0, // Left holes align with standard phase
      rimHoleIndices: (idx: number) => idx * 2 // even indices
    },
    {
      sideName: 'Right' as const,
      show: showRightSpokes,
      crosses: crossesRight,
      fRadius: flangePcdRight / 2,
      zFlange: zR + expOffset,
      wEff: centerToRight + hubOffset + rimShift - drillingOffsetRight,
      rimZ_base: -rimShift + drillingOffsetRight,
      rimZ: -rimShift + drillingOffsetRight + expOffset,
      colorHex: 0xef4444, // Red
      flangeOffsetAngle: Math.PI / Ns, // staggered half-hole
      rimHoleIndices: (idx: number) => idx * 2 + 1 // odd indices
    }
  ];

  // --- 4. GENERATE TUBE PUMP VALVE HOLE & PRESTA VALVE STEM ---
  const inwardRadDir = new THREE.Vector3(-Math.cos(valveAngle), -Math.sin(valveAngle), 0).normalize();
  const P_valveBed = new THREE.Vector3(
    R_bed * Math.cos(valveAngle),
    R_bed * Math.sin(valveAngle),
    -rimShift
  );

  const valveGroup = new THREE.Group();

  // Valve Hole Materials
  const valveRimMat = new THREE.MeshStandardMaterial({
    color: 0x333338,
    roughness: 0.3,
    metalness: 0.8,
  });
  const valveHoleCoreMat = new THREE.MeshBasicMaterial({ color: 0x050508 }); // Dark hollow tube hole interior
  const brassValveMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Metallic Brass Presta valve body
    roughness: 0.25,
    metalness: 0.85,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x111115, // Anodized black valve cap
    roughness: 0.5,
    metalness: 0.3,
  });

  // A. Drilled Rim Valve Hole (6.5mm Presta hole drilled through double-wall rim)
  const vHoleRimGeom = new THREE.CylinderGeometry((inputs.rimValveDiameter ?? 6.5) / 2 + 0.6, (inputs.rimValveDiameter ?? 6.5) / 2 + 0.6, rimDepth + 1.0, 24);
  const vHoleRimMesh = new THREE.Mesh(vHoleRimGeom, valveRimMat);
  vHoleRimMesh.position.y = -rimDepth / 2;
  valveGroup.add(vHoleRimMesh);

  const vHoleCoreGeom = new THREE.CylinderGeometry((inputs.rimValveDiameter ?? 6.5) / 2, (inputs.rimValveDiameter ?? 6.5) / 2, rimDepth + 1.6, 24);
  const vHoleCoreMesh = new THREE.Mesh(vHoleCoreGeom, valveHoleCoreMat);
  vHoleCoreMesh.position.y = -rimDepth / 2;
  valveGroup.add(vHoleCoreMesh);

  // B. Knurled Valve Stem Rim Locknut (Screwed against inner rim bed at R_bed)
  const locknutGeom = new THREE.CylinderGeometry(5.2, 5.2, 3.0, 24);
  const locknut = new THREE.Mesh(locknutGeom, brassValveMat);
  locknut.position.y = 1.5;
  valveGroup.add(locknut);

  // C. Threaded Presta Valve Stem Barrel (Extending radially INWARD towards hub center for pump attachment)
  const valveLength = 32.0;
  const valveBarrelGeom = new THREE.CylinderGeometry(3.0, 3.0, valveLength, 24);
  const valveBarrel = new THREE.Mesh(valveBarrelGeom, brassValveMat);
  valveBarrel.position.y = valveLength / 2;
  valveGroup.add(valveBarrel);

  // D. Presta Valve Core Tip & Brass Lock Nut (at inner end of valve stem)
  const pinGeom = new THREE.CylinderGeometry(1.0, 1.0, 6.0, 12);
  const pinMesh = new THREE.Mesh(pinGeom, brassValveMat);
  pinMesh.position.y = valveLength + 3.0;
  valveGroup.add(pinMesh);

  const pinNutGeom = new THREE.CylinderGeometry(1.8, 1.8, 2.5, 12);
  const pinNut = new THREE.Mesh(pinNutGeom, brassValveMat);
  pinNut.position.y = valveLength + 4.5;
  valveGroup.add(pinNut);

  // E. Removable Valve Dust Cap (Fitted on inner tip of valve stem for pump head interface)
  const valveCapGeom = new THREE.CylinderGeometry(3.5, 3.5, 9.0, 20);
  const valveCapMesh = new THREE.Mesh(valveCapGeom, capMat);
  valveCapMesh.position.y = valveLength + 3.5;
  valveGroup.add(valveCapMesh);

  // Orient valve assembly pointing INWARDS towards hub center
  valveGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inwardRadDir);
  valveGroup.position.copy(P_valveBed);
  group.add(valveGroup);

  // 4. Collect spoke geometries across both sides and organize into 4 Lacing Groups
  interface SpokeEntry {
    side: 'Left' | 'Right';
    visible: boolean;
    j: number;
    isLeading: boolean;
    isHeadsOut: boolean;
    group: number;
    groupName: string;
    sp: { model: SpokePath; P_head: THREE.Vector3; P_holeExit: THREE.Vector3;
      P_pureHole: THREE.Vector3; P_rimBase: THREE.Vector3; P_rim: THREE.Vector3;
      direct3DLength: number; rimHoleAngle: number; isLeading: boolean; isHeadsOut: boolean };
    crossInfo?: { point: THREE.Vector3; t: number };
    wEff: number;
    colorHex: number;
    sequenceIndex: number;
  }

  const rawSpokeEntries: SpokeEntry[] = [];

  sides.forEach((s) => {
    const sideDir = s.sideName === 'Right' ? 1 : -1;
    const displayPoint = (p: Point3) => new THREE.Vector3(p.x, p.y, p.z + sideDir * expOffset);
    for (const model of pathModel.spokes.filter(p => p.side === s.sideName && p.valid)) {
      const j = model.index;
      const head = displayPoint(model.hole);
      const thickness = (s.sideName === 'Left' ? inputs.flangeThicknessLeft : inputs.flangeThicknessRight) ?? flangeThickness;
      head.z += sideDir * (model.headsOut ? 1 : -1) * (thickness / 2 + spokeRad);
      const sp = { model, P_head: head, P_holeExit: displayPoint(model.start),
        P_pureHole: displayPoint(model.hole), P_rimBase: new THREE.Vector3(model.end.x, model.end.y, model.end.z),
        P_rim: displayPoint(model.end), direct3DLength: model.chordLength,
        rimHoleAngle: Math.atan2(model.end.y, model.end.x), isLeading: !model.headsOut, isHeadsOut: model.headsOut };
      const groupNum = (model.headsOut ? 0 : 2) + (s.sideName === 'Right' ? 1 : 2);
      rawSpokeEntries.push({
        side: s.sideName,
        visible: s.show,
        j,
        isLeading: sp.isLeading,
        isHeadsOut: sp.isHeadsOut,
        group: groupNum,
        groupName: guide.groupNames[groupNum - 1],
        sp,
        crossInfo: model.crossingContact ? { point: displayPoint(model.crossingContact), t: 0 } : undefined,
        wEff: s.wEff,
        colorHex: s.colorHex,
        sequenceIndex: 0,
      });
    }
  });

  const entriesByHole = new Map(rawSpokeEntries.map(entry => [`${entry.side}:${entry.j}`, entry]));
  const lacingOrderedSpokes = lacingMode
    ? guide.spokes.map(spoke => entriesByHole.get(`${spoke.side}:${spoke.path.index}`)!)
    : rawSpokeEntries;
  lacingOrderedSpokes.forEach((entry, index) => { entry.sequenceIndex = index; });

  // Build 3D Meshes for ordered spokes based on Lacing Mode / Standard Mode
  lacingOrderedSpokes.forEach((entry) => {
    const sp = entry.sp;
    const j = entry.j;
    const m = entry.sequenceIndex;

    // Always render stationary drilled rim spoke hole at P_rimBase
    const spokeHoleGroup = new THREE.Group();
    const holeDarkMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0e, side: THREE.DoubleSide });
    const holeRimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.4, metalness: 0.8 });

    const innerRimMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 2.2, 16), holeRimMat);
    const innerCoreMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.4, 16), holeDarkMat);
    spokeHoleGroup.add(innerRimMesh);
    spokeHoleGroup.add(innerCoreMesh);
    if (inputs.rimEyelets) {
      const eyelet = new THREE.Mesh(
        new THREE.TorusGeometry(2.8, 0.65, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.9, roughness: 0.24 }),
      );
      eyelet.rotation.x = Math.PI / 2;
      eyelet.position.y = -0.35;
      spokeHoleGroup.add(eyelet);
    }

    const outerHoleGroup = new THREE.Group();
    const outerRimMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 2.2, 16), holeRimMat);
    const outerCoreMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 2.4, 16), holeDarkMat);
    outerHoleGroup.add(outerRimMesh);
    outerHoleGroup.add(outerCoreMesh);
    outerHoleGroup.position.y = shallow ? section.bed : 5.0;
    spokeHoleGroup.add(outerHoleGroup);

    const radDir = new THREE.Vector3(Math.cos(sp.rimHoleAngle), Math.sin(sp.rimHoleAngle), 0).normalize();
    spokeHoleGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radDir);
    spokeHoleGroup.position.copy(sp.P_rimBase);
    group.add(spokeHoleGroup);

    // Evaluate whether this spoke should be rendered
    const isPlaced = !lacingMode || preview || (m < Math.max(2, lacingPlacedCount));
    if (!isPlaced || (!lacingMode && !entry.visible)) return; // Unplaced spokes are COMPLETELY hidden (not rendered)

    const isActiveSpoke = lacingMode && !preview && (m >= Math.max(0, lacingPlacedCount - 2));

    let spokeMaterial: THREE.MeshStandardMaterial;

    if (isActiveSpoke) {
      // Active spoke matches the route diagram; these are intended positions.
      spokeMaterial = new THREE.MeshStandardMaterial({
        color: m % 2 ? 0x6ee7b7 : 0x67e8f9,
        roughness: 0.35,
        metalness: 0.4,
        emissive: 0x166878,
        emissiveIntensity: 0.5,
      });
    } else if (isSpokeDeltaMode && !lacingMode) {
      const isFocusSpoke = entry.side === 'Left' && j === 0;
      spokeMaterial = new THREE.MeshStandardMaterial({
        color: isFocusSpoke ? 0xffd700 : 0x444450,
        roughness: isFocusSpoke ? 0.1 : 0.6,
        metalness: isFocusSpoke ? 0.9 : 0.2,
        transparent: !isFocusSpoke,
        opacity: isFocusSpoke ? 1.0 : 0.12,
      });
    } else {
      let sColor = 0xbabac0;
      if (colorMode === 'side') {
        sColor = entry.colorHex;
      } else if (colorMode === 'tension') {
        sColor = entry.side === 'Left' ? 0x3b82f6 : 0xef4444;
      }
      spokeMaterial = new THREE.MeshStandardMaterial({
        color: sColor,
        roughness: 0.15,
        metalness: 0.9,
      });
    }

    // Colour only the manufactured head/elbow by insertion orientation.
    // Normal depth testing preserves which face actually occludes the head.
    const headColor = sp.isHeadsOut ? 0x36c9f0 : 0x42df91;
    const headMaterial = new THREE.MeshStandardMaterial({
      color: headColor, roughness: .42, metalness: .2,
      emissive: headColor, emissiveIntensity: .12,
      transparent: spokeMaterial.transparent, opacity: spokeMaterial.opacity,
    });
    // 1. Spoke Head Cap
    const headGeom = new THREE.CylinderGeometry(spokeRad * 1.8, spokeRad * 1.8, 0.8, 12);
    headGeom.rotateX(Math.PI / 2);
    const headMesh = new THREE.Mesh(headGeom, headMaterial);
    headMesh.position.copy(sp.P_head);
    group.add(headMesh);

    // Retain the measured route; only its final straight span follows purchased length.
    const displayShift = (entry.side === 'Left' ? -1 : 1) * expOffset;
    const displayPoint = (p: Point3) => new THREE.Vector3(p.x, p.y, p.z + displayShift);
    const fitSettings = inputs.nippleFit ?? nippleFitDefaults;
    const fit = calculateNippleFit(sp.model, fitSettings, inputs.spokeDiameter ?? 2);
    const shaftPoints = purchasedSpokePoints(sp.model, fit).map(displayPoint);
    const shaftCurve = new SpokeDisplayCurve(shaftPoints);
    const spokeTubeGeom = new THREE.TubeGeometry(shaftCurve, (shaftPoints.length - 1) * 4, spokeRad, 8, false);
    const spokeMesh = new THREE.Mesh(spokeTubeGeom, spokeMaterial);
    // Decorative manufactured elbow is separate and excluded from shaft length.
    const neck = new THREE.QuadraticBezierCurve3(sp.P_head, new THREE.Vector3(sp.P_head.x, sp.P_head.y, sp.P_holeExit.z), sp.P_holeExit);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 12, spokeRad, 8, false), headMaterial));
    const finalSpan = new THREE.Vector3().subVectors(shaftPoints[shaftPoints.length-1], shaftPoints[shaftPoints.length-2]).normalize();
    const exitBendAngleDeg = Math.acos(Math.min(1, Math.abs(finalSpan.z))) * 180 / Math.PI;
    for (const point of [...sp.model.flangeContacts, ...(sp.model.crossingContact ? [sp.model.crossingContact] : [])]) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(spokeRad * 1.12, 8, 6), new THREE.MeshBasicMaterial({color: 0xfbbf24}));
      marker.position.copy(displayPoint(point)); group.add(marker);
    }
    spokeMesh.userData = {
      nippleFit: fit, purchasedEnd: shaftPoints.at(-1),
      side: entry.side, index: j, sequenceIndex: m, group: entry.group, groupName: entry.groupName,
      isLeading: sp.isLeading, length: sp.model.traditionalLength,
      direct3DLength: sp.model.chordLength, actualCurveLength: sp.model.pathLength,
      bendAllowance: sp.model.bendAllowance, estimatedLength: sp.model.estimatedLength,
      holeCenter: sp.P_pureHole, innerKnee: sp.P_holeExit, rimCenter: sp.P_rim,
      bracingAngle: Math.asin(Math.min(1.0, entry.wEff / sp.P_pureHole.distanceTo(sp.P_rim))) * (180.0 / Math.PI),
      flangeExitBendAngle: exitBendAngleDeg, start: sp.P_holeExit, end: sp.P_rim,
    };

    group.add(spokeMesh);
    spokeMeshes.push(spokeMesh);

    // ERD is a spoke-tip reference, not an extra nipple-length allowance.
    if (!nippleProfileError(fitSettings)) {
      const references = nippleReferences(fitSettings);
      const nippleGroup = createNippleGeometry(fitSettings);
      nippleGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), finalSpan);
      nippleGroup.position.copy(sp.P_rim).addScaledVector(finalSpan, -references.calibratedTipReference);
      nippleGroup.userData = { side: entry.side, index: j, references };
      group.add(nippleGroup);
    }
  });

  return { group, spokeMeshes, lacingOrderedSpokes, P_valveBed, inwardRadDir, valveAngle, zL, zR };
}

function createFlangeGeometry(
    fRadius: number,
    holeCount: number,
    holeDiameter: number,
    flangeOffsetAngle: number,
    thickness: number = 2.4,
    outerMargin: number = 3.2
  ): THREE.BufferGeometry {
    const outerRadius = fRadius + outerMargin;
    const innerRadius = 15.0;
    const holeRadius = Math.max(0.8, holeDiameter / 2);

    const shape = new THREE.Shape();
    // Outer ring
    shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

    // Inner axle bore cutout
    const innerPath = new THREE.Path();
    innerPath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
    shape.holes.push(innerPath);

    // Drill spoke holes around PCD
    for (let i = 0; i < holeCount; i++) {
      const angle = i * (2 * Math.PI / holeCount) + flangeOffsetAngle;
      const hx = fRadius * Math.cos(angle);
      const hy = fRadius * Math.sin(angle);
      const holePath = new THREE.Path();
      holePath.absarc(hx, hy, holeRadius, 0, Math.PI * 2, true);
      shape.holes.push(holePath);
    }

    const bevelSize = Math.min(0.3, thickness * 0.1);
    const extrudeSettings = {
      depth: thickness,
      bevelEnabled: false,
      bevelThickness: bevelSize,
      bevelSize: bevelSize,
      bevelSegments: 3,
      curveSegments: 32,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center(); // centers depth around Z=0
    return geom;
  }


/** Place the shared wheel between Workshop supports without changing its radial geometry. */
export function createWorkshopWheelModel(inputs: WheelBuildInputs, axleWidth: number) {
  const model = createWheelModel(inputs, { axleWidth });
  model.group.rotation.y = -Math.PI / 2;
  model.group.position.x = inputs.hubOffset;
  return model;
}
