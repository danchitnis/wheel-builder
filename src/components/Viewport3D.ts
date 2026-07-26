import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WheelBuildInputs } from '../utils/physicsCalculator';

export class Viewport3D {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: THREE.OrbitControls;
  private spokeMeshes: THREE.Mesh[] = [];
  private currentInputs?: WheelBuildInputs;

  // Render options
  public explodedValue: number = 0; // 0 to 1
  public showLeftSpokes: boolean = true;
  public showRightSpokes: boolean = true;
  public enableInterlacing: boolean = true; // Toggle 3D spoke interlacing/weaving
  public showRuler: boolean = true; // Toggle 3D straight ruler vector
  public showMeasurement: boolean = true; // Global measurement toggle
  public isSpokeDeltaMode: boolean = false; // Focused single spoke path analysis mode
  public colorMode: 'classic' | 'side' | 'tension' = 'classic';
  public spokeThickness: number = 1.0; // Aero vs Heavy duty

  // Ruler visualization
  private rulerGroup: THREE.Group = new THREE.Group();

  // Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hoveredSpoke: THREE.Mesh | null = null;
  private originalSpokeColor: THREE.Color | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
    this.animate();
  }

  private init() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0b); // Deep space black

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 300, 500);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI; // Full rotation
    this.controls.minDistance = 50;
    this.controls.maxDistance = 800;

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(200, 400, 300);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.5);
    dirLight2.position.set(-200, -100, -300);
    this.scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.6, 300);
    pointLight.position.set(0, 0, 50);
    this.scene.add(pointLight);

    // 6. Handle resizing
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // 7. Raycasting events
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));
  }

  private onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / this.renderer.domElement.clientWidth) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / this.renderer.domElement.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.spokeMeshes);

    if (intersects.length > 0) {
      const intersected = intersects[0].object as THREE.Mesh;
      if (this.hoveredSpoke !== intersected) {
        this.resetHoveredSpoke();

        this.hoveredSpoke = intersected;
        const mat = this.hoveredSpoke.material as THREE.MeshStandardMaterial;
        this.originalSpokeColor = mat.color.clone();
        mat.color.setHex(0x00f3ff); // Neon Cyan glow on hover
        mat.emissive.setHex(0x004455);
        this.renderer.domElement.style.cursor = 'pointer';

        // Dispatch spoke hover details
        const info = this.hoveredSpoke.userData;
        const domEvent = new CustomEvent('spoke-hover', { detail: { ...info, event } });
        window.dispatchEvent(domEvent);

        // Draw 3D measurement ruler for hovered spoke
        if (this.showRuler) {
          this.drawRulerForSpoke(this.hoveredSpoke);
        }
      }
    } else {
      if (this.hoveredSpoke) {
        this.resetHoveredSpoke();
        const domEvent = new CustomEvent('spoke-unhover');
        window.dispatchEvent(domEvent);
      }
    }
  }

  private onMouseClick() {
    if (this.hoveredSpoke) {
      const info = this.hoveredSpoke.userData;
      const domEvent = new CustomEvent('spoke-select', { detail: info });
      window.dispatchEvent(domEvent);
    }
  }

  private resetHoveredSpoke() {
    if (this.hoveredSpoke && this.originalSpokeColor) {
      const mat = this.hoveredSpoke.material as THREE.MeshStandardMaterial;
      mat.color.copy(this.originalSpokeColor);
      mat.emissive.setHex(0x000000);
      this.hoveredSpoke = null;
      this.originalSpokeColor = null;
      this.renderer.domElement.style.cursor = 'auto';
    }
  }

  public setCameraPreset(preset: 'isometric' | 'lateral' | 'dish' | 'hub' | 'spoke-delta') {
    const wasDeltaMode = this.isSpokeDeltaMode;
    if (preset === 'spoke-delta') {
      this.isSpokeDeltaMode = true;
      this.showMeasurement = true;
      this.showRuler = true;
    } else {
      this.isSpokeDeltaMode = false;
    }

    switch (preset) {
      case 'isometric':
        this.camera.position.set(220, 220, 320);
        this.controls.target.set(0, 0, 0);
        break;
      case 'lateral':
        this.camera.position.set(0, 0, 420);
        this.controls.target.set(0, 0, 0);
        break;
      case 'dish':
        this.camera.position.set(420, 0, 0);
        this.controls.target.set(0, 0, 0);
        break;
      case 'hub':
        this.camera.position.set(80, 80, 120);
        this.controls.target.set(0, 0, 0);
        break;
      case 'spoke-delta':
        if (this.spokeMeshes.length > 0) {
          const sp1 = this.spokeMeshes[0];
          if (sp1 && sp1.userData && sp1.userData.holeCenter && sp1.userData.rimCenter) {
            const hole = sp1.userData.holeCenter as THREE.Vector3;
            const rim = sp1.userData.rimCenter as THREE.Vector3;
            const mid = new THREE.Vector3().addVectors(hole, rim).multiplyScalar(0.5);

            // Spoke direction vector (from hole to rim)
            const spokeVec = new THREE.Vector3().subVectors(rim, hole).normalize();

            // Tangential normal vector perpendicular to spoke in the wheel plane
            // Looking at the spoke from the side (edge-on tangential side view)
            const sideNormal = new THREE.Vector3(-spokeVec.y, spokeVec.x, 0).normalize();

            // Position camera looking side-on at the spoke from distance 170mm
            const camPos = new THREE.Vector3().addVectors(
              mid,
              sideNormal.multiplyScalar(170)
            );
            // Slight axial angle so both line and wire are clearly separated
            camPos.z += 25;

            this.camera.position.copy(camPos);
            this.controls.target.copy(mid);
          }
        }
        break;
    }

    this.controls.update();
    if ((wasDeltaMode !== this.isSpokeDeltaMode) && this.currentInputs) {
      this.update(this.currentInputs);
    }
  }

  public update(inputs: WheelBuildInputs) {
    this.currentInputs = inputs;
    this.clearScene();
    this.spokeMeshes = [];

    const {
      erd,
      osb,
      drillingOffsetLeft,
      drillingOffsetRight,
      spokeCount,
      spokeHoleDiameter,
      hubOffset,
      rimFlip,
      flangePcdLeft,
      centerToLeft,
      crossesLeft,
      flangePcdRight,
      centerToRight,
      crossesRight,
    } = inputs;

    // --- MATERIALS ---
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x222224, // Carbon/Dark Titanium
      roughness: 0.4,
      metalness: 0.8,
      side: THREE.DoubleSide,
    });

    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xdd8800, // Anodized gold/orange accents
      roughness: 0.2,
      metalness: 0.9,
    });

    const freehubMat = new THREE.MeshStandardMaterial({
      color: 0x777780, // Silver chrome
      roughness: 0.3,
      metalness: 0.8,
    });

    const nippleMat = new THREE.MeshStandardMaterial({
      color: 0xcca050, // Polished brass
      roughness: 0.2,
      metalness: 0.9,
    });

    // --- 1. GENERATE RIM (Lathe Profile for ultra-realism) ---
    // A modern aero, double-walled rim profile centered around ERD spoke bed (R_bed)
    const R_bed = erd / 2; // Exact Spoke Bed radius (where nipples seat)
    const rimDepth = 22;   // Outer rim depth
    const R_outer = R_bed + rimDepth; // Outer tire hook bead radius
    const rimWidth = 13;   // Rim half-width

    // Define profile coordinates relative to inner spoke bed (R_bed, 0)
    const points: THREE.Vector2[] = [];
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

    // Lathe profile around Y axis, then rotate to face along Z
    const rimGeom = new THREE.LatheGeometry(points, 96);
    const rimMesh = new THREE.Mesh(rimGeom, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    
    // Shift rim bed to account for rimShift/OSB
    let rimShift = 0;
    if (rimFlip === 'Left') rimShift = osb;
    else if (rimFlip === 'Right') rimShift = -osb;
    else {
      if (centerToLeft - hubOffset > centerToRight + hubOffset) rimShift = osb;
      else rimShift = -osb;
    }
    rimMesh.position.z = -rimShift;
    this.scene.add(rimMesh);

    // --- 2. GENERATE HUB (CNC Lathe Profile) ---
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
    const spokeRad = 0.5 * this.spokeThickness;
    // Dynamic axial displacement for J-bend elbow to guarantee clear physical air gap over flange face
    const offsetDist = (flangeThickness / 2) + spokeRad + 0.3;

    // Flange geometries with real drilled spoke holes
    const Ns = spokeCount / 2;

    const flangeLGeom = this.createFlangeGeometry(
      flangePcdLeft / 2,
      Ns,
      spokeHoleDiameter,
      0, // Left holes alignment
      flangeThickness,
      flangeOuterMargin
    );
    const flangeL = new THREE.Mesh(flangeLGeom, hubMat);
    flangeL.position.z = zL;
    hubShellGroup.add(flangeL);

    const flangeRGeom = this.createFlangeGeometry(
      flangePcdRight / 2,
      Ns,
      spokeHoleDiameter,
      Math.PI / Ns, // Right holes staggered by half-hole
      flangeThickness,
      flangeOuterMargin
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

    const discType = inputs.discType || (hubNameLower.includes('cl') || hubNameLower.includes('centerlock') ? 'Centerlock' : '6-Bolt');

    // Hub center tube connecting flanges
    const centerTubeGeom = new THREE.CylinderGeometry(15, 15, Math.max(2, Math.abs(zR - zL) - 4), 32);
    const centerTube = new THREE.Mesh(centerTubeGeom, hubMat);
    centerTube.rotation.x = Math.PI / 2;
    centerTube.position.z = (zL + zR) / 2;
    hubShellGroup.add(centerTube);

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

    this.scene.add(hubShellGroup);

    // --- 3. GENERATE SPOKES & NIPPLES ---
    const N = spokeCount;

    // Exploded view separation shifts left & right spoke webs (+ nipples) apart laterally
    const expOffset = this.explodedValue * 60.0;

    // Loop through sides
    const sides = [
      {
        sideName: 'Left' as const,
        show: this.showLeftSpokes,
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
        show: this.showRightSpokes,
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

    // Helper function for 2D segment intersection
    const intersect2D = (
      p1: THREE.Vector2,
      p2: THREE.Vector2,
      p3: THREE.Vector2,
      p4: THREE.Vector2
    ) => {
      const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
      if (Math.abs(denom) < 1e-6) return null;
      const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
      const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
      if (ua >= 0.05 && ua <= 0.95 && ub >= 0.05 && ub <= 0.95) {
        return {
          point: new THREE.Vector2(p1.x + ua * (p2.x - p1.x), p1.y + ua * (p2.y - p1.y)),
          t1: ua,
          t2: ub,
        };
      }
      return null;
    };

    sides.forEach((s) => {
      if (!s.show) return;

      const fHolesCount = Ns;

      // 1. Precompute spoke base trajectories
      const spokeData: Array<{
        j: number;
        isLeading: boolean;
        flangeAngle: number;
        rimHoleAngle: number;
        P_head: THREE.Vector3;
        P_holeCenter: THREE.Vector3;
        P_holeExit: THREE.Vector3;
        P_pureHole: THREE.Vector3;
        P_innerKnee: THREE.Vector3;
        P_flangeRim: THREE.Vector3;
        P_shaftStart: THREE.Vector3;
        P_rimBase: THREE.Vector3;
        P_rim: THREE.Vector3;
        direct3DLength: number;
        zHead: number;
        zElbow: number;
        isHeadsOut: boolean;
      }> = [];

      for (let j = 0; j < fHolesCount; j++) {
        const flangeAngle = j * (2 * Math.PI / fHolesCount) + s.flangeOffsetAngle;
        const xF = s.fRadius * Math.cos(flangeAngle);
        const yF = s.fRadius * Math.sin(flangeAngle);
        const zF = s.zFlange;

        const isLeading = j % 2 === 0;
        const directionSign = isLeading ? 1.0 : -1.0;

        const thetaAngle = (720.0 * s.crosses) / N;
        const thetaRad = thetaAngle * (Math.PI / 180.0);
        const rimHoleAngle = flangeAngle + directionSign * thetaRad;

        const xR_rim = R_bed * Math.cos(rimHoleAngle);
        const yR_rim = R_bed * Math.sin(rimHoleAngle);
        const zR_rim_base = s.rimZ_base;
        const zR_rim = s.rimZ;

        const sideDir = s.sideName === 'Right' ? 1.0 : -1.0;
        const isHeadsOut = j % 2 === 0;
        const zHead = isHeadsOut ? zF + sideDir * offsetDist : zF - sideDir * offsetDist;
        const zElbow = isHeadsOut ? zF - sideDir * offsetDist : zF + sideDir * offsetDist;

        // 2D vector in direction of spoke pull towards rim
        const dir2D = new THREE.Vector2(xR_rim - xF, yR_rim - yF).normalize();

        // Hole clearance pivot shift inside the flange hole (d_h vs d_spoke)
        const holeRadius = spokeHoleDiameter / 2;
        const deltaClearance = Math.min(0.4, Math.max(0.1, holeRadius - spokeRad));

        // Pivoted J-bend positions: head seats at rear rim edge, elbow pivots toward pull direction
        const P_head = new THREE.Vector3(
          xF - dir2D.x * deltaClearance,
          yF - dir2D.y * deltaClearance,
          zHead
        );
        const P_holeExit = new THREE.Vector3(
          xF + dir2D.x * deltaClearance,
          yF + dir2D.y * deltaClearance,
          zElbow
        );
        const P_holeCenter = new THREE.Vector3().addVectors(P_head, P_holeExit).multiplyScalar(0.5);

        // For heads-in spokes (elbow on outer face), clear the outer flange edge dynamically
        const clearanceMargin = flangeOuterMargin + spokeRad + 0.5;
        const P_flangeRim = new THREE.Vector3(
          xF + dir2D.x * clearanceMargin,
          yF + dir2D.y * clearanceMargin,
          zElbow
        );

        const P_pureHole = new THREE.Vector3(xF, yF, zF);
        const P_rimBase = new THREE.Vector3(xR_rim, yR_rim, zR_rim_base);
        const P_rim = new THREE.Vector3(xR_rim, yR_rim, zR_rim);

        // Vector direction from flange hole center to rim spoke bed
        const dirToRim = new THREE.Vector3().subVectors(P_rim, P_pureHole).normalize();

        // Inner knee point: contact point at inner edge of flange hole where J-bend rests
        const P_innerKnee = new THREE.Vector3().addVectors(
          P_pureHole,
          dirToRim.clone().multiplyScalar(spokeHoleDiameter / 2)
        );

        // Straight 3D length from inner knee of J-bend to point inside nipple at rim (matches calculatedSpokeLength)
        const direct3DLength = P_innerKnee.distanceTo(P_rim);
        const P_shaftStart = isHeadsOut ? P_holeExit : P_flangeRim;

        spokeData.push({
          j,
          isLeading,
          flangeAngle,
          rimHoleAngle,
          P_head,
          P_holeCenter,
          P_holeExit,
          P_pureHole,
          P_innerKnee,
          P_flangeRim,
          P_shaftStart,
          P_rimBase,
          P_rim,
          direct3DLength,
          zHead,
          zElbow,
          isHeadsOut,
        });
      }

      // 2. Compute 3D interlacing crossing points
      const crossingMap = new Map<number, { point: THREE.Vector3; t: number }>();

      if (s.crosses >= 1 && this.enableInterlacing) {
        for (let a = 0; a < fHolesCount; a++) {
          const spA = spokeData[a];
          if (!spA.isLeading) continue; // Leading vs Trailing

          for (let b = 0; b < fHolesCount; b++) {
            const spB = spokeData[b];
            if (spB.isLeading) continue;

            const segA_p1 = new THREE.Vector2(spA.P_shaftStart.x, spA.P_shaftStart.y);
            const segA_p2 = new THREE.Vector2(spA.P_rim.x, spA.P_rim.y);
            const segB_p1 = new THREE.Vector2(spB.P_shaftStart.x, spB.P_shaftStart.y);
            const segB_p2 = new THREE.Vector2(spB.P_rim.x, spB.P_rim.y);

            const res = intersect2D(segA_p1, segA_p2, segB_p1, segB_p2);
            if (res) {
              const curA = crossingMap.get(a);
              if (!curA || res.t1 > curA.t) {
                const zA_raw = spA.P_shaftStart.z + res.t1 * (spA.P_rim.z - spA.P_shaftStart.z);
                const zB_raw = spB.P_shaftStart.z + res.t2 * (spB.P_rim.z - spB.P_shaftStart.z);

                const zMid = (zA_raw + zB_raw) / 2;
                const sideDir = s.sideName === 'Right' ? 1.0 : -1.0;
                
                // Interlacing over/under weave displacement proportional to spoke thickness
                const weaveOffsetVal = Math.max(0.8, spokeRad * 1.5);
                const weaveOffsetA = (spA.j % 2 === 0) ? sideDir * weaveOffsetVal : -sideDir * weaveOffsetVal;
                const weaveOffsetB = (spB.j % 2 === 0) ? sideDir * weaveOffsetVal : -sideDir * weaveOffsetVal;

                const ptA = new THREE.Vector3(res.point.x, res.point.y, zMid + weaveOffsetA);
                const ptB = new THREE.Vector3(res.point.x, res.point.y, zMid + weaveOffsetB);

                crossingMap.set(a, { point: ptA, t: res.t1 });
                crossingMap.set(b, { point: ptB, t: res.t2 });
              }
            }
          }
        }
      }

      // 3. Build spoke neck, head, elbow, and main shaft for each spoke
      for (let j = 0; j < fHolesCount; j++) {
        const sp = spokeData[j];

        const isFocusSpoke = this.isSpokeDeltaMode && (s.sideName === 'Left' && j === 0);

        let spokeMaterial: THREE.MeshStandardMaterial;

        if (this.isSpokeDeltaMode) {
          if (isFocusSpoke) {
            // High contrast glowing Gold wire for the single inspected spoke
            spokeMaterial = new THREE.MeshStandardMaterial({
              color: 0xffd700, // Bright Gold
              roughness: 0.1,
              metalness: 0.9,
            });
          } else {
            // Ghosted background spoke (12% opacity)
            spokeMaterial = new THREE.MeshStandardMaterial({
              color: 0x444450,
              roughness: 0.6,
              metalness: 0.2,
              transparent: true,
              opacity: 0.12,
            });
          }
        } else {
          let sColor = 0xbabac0; // titanium steel
          if (this.colorMode === 'side') {
            sColor = s.colorHex;
          } else if (this.colorMode === 'tension') {
            if (s.sideName === 'Left') {
              sColor = s.wEff > sides[1].wEff ? 0x3b82f6 : 0x10b981;
            } else {
              sColor = sides[1].wEff > s.wEff ? 0xef4444 : 0x10b981;
            }
          }

          spokeMaterial = new THREE.MeshStandardMaterial({
            color: sColor,
            roughness: 0.15,
            metalness: 0.9,
          });
        }

        // 1. Spoke Head Cap (button cap at zHead)
        const headGeom = new THREE.CylinderGeometry(spokeRad * 1.8, spokeRad * 1.8, 0.8, 12);
        headGeom.rotateX(Math.PI / 2); // parallel to Z-axis
        const headMesh = new THREE.Mesh(headGeom, spokeMaterial);
        headMesh.position.copy(sp.P_head);
        this.scene.add(headMesh);

        // 2. Continuous 3D Spoke Mesh with Stiff, Constant-Radius J-Hook Arc
        const crossInfo = crossingMap.get(j);

        const neckDir = new THREE.Vector3().subVectors(sp.P_holeExit, sp.P_head).normalize();
        const targetPoint = !sp.isHeadsOut ? sp.P_flangeRim : (crossInfo ? crossInfo.point : sp.P_rim);
        const shaftDir = new THREE.Vector3().subVectors(targetPoint, sp.P_holeExit).normalize();

        // Stiff, manufactured bend radius of cold-formed J-hook wire (2.4mm)
        const Rbend = Math.max(2.2, spokeRad * 2.6);

        // Tangent points where the J-hook arc begins and ends
        const P_arcStart = new THREE.Vector3().subVectors(sp.P_holeExit, neckDir.clone().multiplyScalar(Rbend * 0.8));
        const P_arcEnd = new THREE.Vector3().addVectors(sp.P_holeExit, shaftDir.clone().multiplyScalar(Rbend * 0.8));

        // Exact arc midpoint along bisector vector for stiff circular arc profile
        const bisector = new THREE.Vector3().subVectors(shaftDir, neckDir).normalize();
        const P_arcMid = new THREE.Vector3().addVectors(sp.P_holeExit, bisector.multiplyScalar(Rbend * 0.7));

        // Complete control point sequence for the continuous J-bend spoke curve
        const spokeCurvePoints: THREE.Vector3[] = [
          sp.P_head,
          P_arcStart,
          P_arcMid,
          P_arcEnd,
        ];

        if (!sp.isHeadsOut) {
          // Heads-in spokes pass over outer flange rim edge
          spokeCurvePoints.push(sp.P_flangeRim);
        }
        if (crossInfo) {
          // 3D interlacing crossing point
          spokeCurvePoints.push(crossInfo.point);
        }
        spokeCurvePoints.push(sp.P_rim);

        // Centripetal spline preserving constant arc curvature at the J-bend and stiff wire alignment
        const spokeCurve = new THREE.CatmullRomCurve3(spokeCurvePoints, false, 'centripetal');
        const spokeTubeGeom = new THREE.TubeGeometry(spokeCurve, 56, spokeRad, 8, false);
        const spokeMesh = new THREE.Mesh(spokeTubeGeom, spokeMaterial);

        const dirToRim = new THREE.Vector3().subVectors(sp.P_rim, sp.P_holeExit).normalize();
        const totalSpokeLength = sp.direct3DLength;
        const exitBendAngleDeg = Math.acos(Math.abs(dirToRim.z)) * (180.0 / Math.PI);

        // Real 3D wire path starting from the inner knee of the J-bend (P_arcMid) along all 3D bends to rim inside nipple
        const shaftCurvePoints: THREE.Vector3[] = [
          P_arcMid,
          P_arcEnd,
        ];
        if (!sp.isHeadsOut) {
          shaftCurvePoints.push(sp.P_flangeRim);
        }
        if (crossInfo) {
          shaftCurvePoints.push(crossInfo.point);
        }
        shaftCurvePoints.push(sp.P_rim);

        const shaftCurve = new THREE.CatmullRomCurve3(shaftCurvePoints, false, 'centripetal');
        const actualCurveLength = shaftCurve.getLength();

        spokeMesh.userData = {
          side: s.sideName,
          index: j,
          isLeading: sp.isLeading,
          length: totalSpokeLength,
          direct3DLength: sp.direct3DLength, // Value 1: Distance from inner knee of J-bend to rim inside nipple
          actualCurveLength: actualCurveLength, // Value 2: Actual Wire Path length from inner knee along 3D bends to rim inside nipple
          holeCenter: sp.P_pureHole,
          innerKnee: sp.P_innerKnee,
          rimCenter: sp.P_rim,
          bracingAngle: Math.asin(Math.min(1.0, s.wEff / sp.P_pureHole.distanceTo(sp.P_rim))) * (180.0 / Math.PI),
          flangeExitBendAngle: exitBendAngleDeg,
          start: sp.P_holeExit,
          end: sp.P_rim,
        };

        this.scene.add(spokeMesh);
        this.spokeMeshes.push(spokeMesh);

        // --- ACCURATE 3D NIPPLE SEATED INSIDE THE RIM SPOKE BED ---
        const nippleGroup = new THREE.Group();

        // 1. Nipple Head (Flared domed head resting inside rim spoke bed channel)
        const nHeadGeom = new THREE.CylinderGeometry(2.1, 1.7, 2.0, 16);
        const nHead = new THREE.Mesh(nHeadGeom, nippleMat);
        nHead.position.y = 1.0;
        nippleGroup.add(nHead);

        // 2. Nipple Neck (Shoulder passing through rim wall hole)
        const nNeckGeom = new THREE.CylinderGeometry(1.6, 1.6, 2.0, 16);
        const nNeck = new THREE.Mesh(nNeckGeom, nippleMat);
        nNeck.position.y = -1.0;
        nippleGroup.add(nNeck);

        // 3. Nipple Barrel (Extending down spoke shaft towards hub)
        const nBodyGeom = new THREE.CylinderGeometry(1.5, 1.5, 8.0, 16);
        const nBody = new THREE.Mesh(nBodyGeom, nippleMat);
        nBody.position.y = -6.0;
        nippleGroup.add(nBody);

        // 4. Square Wrench Flat Collar (14G 3.2mm square key)
        const nCollarGeom = new THREE.BoxGeometry(2.7, 3.5, 2.7);
        const nCollar = new THREE.Mesh(nCollarGeom, nippleMat);
        nCollar.position.y = -6.5;
        nippleGroup.add(nCollar);

        const upVec = new THREE.Vector3(0, 1, 0);
        // Vector along spoke inward towards hub
        const inwardVector = new THREE.Vector3().subVectors(
          sp.P_rim,
          crossInfo ? crossInfo.point : sp.P_holeExit
        ).negate().normalize();

        nippleGroup.quaternion.setFromUnitVectors(upVec, inwardVector);
        nippleGroup.position.copy(sp.P_rim);
        this.scene.add(nippleGroup);

        // --- 3D DRILLED RIM SPOKE HOLES (Double-Wall Inner & Outer Channel Cutouts) ---
        const spokeHoleGroup = new THREE.Group();

        // Hole Materials
        const holeDarkMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0e, side: THREE.DoubleSide }); // Dark hollow interior
        const holeRimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.4, metalness: 0.8 }); // Metallic hole eyelet

        // 1. Inner Spoke Bed Hole (where nipple shoulder seats)
        const innerRimGeom = new THREE.CylinderGeometry(2.8, 2.8, 2.2, 16);
        const innerCoreGeom = new THREE.CylinderGeometry(2.1, 2.1, 2.4, 16);

        const innerRimMesh = new THREE.Mesh(innerRimGeom, holeRimMat);
        const innerCoreMesh = new THREE.Mesh(innerCoreGeom, holeDarkMat);

        spokeHoleGroup.add(innerRimMesh);
        spokeHoleGroup.add(innerCoreMesh);

        // 2. Outer Tire Channel Access Hole (where nipple driver enters outer wall)
        const outerHoleGroup = new THREE.Group();
        const outerRimGeom = new THREE.CylinderGeometry(4.2, 4.2, 2.2, 16);
        const outerCoreGeom = new THREE.CylinderGeometry(3.6, 3.6, 2.4, 16);

        const outerRimMesh = new THREE.Mesh(outerRimGeom, holeRimMat);
        const outerCoreMesh = new THREE.Mesh(outerCoreGeom, holeDarkMat);

        outerHoleGroup.add(outerRimMesh);
        outerHoleGroup.add(outerCoreMesh);
        outerHoleGroup.position.y = 5.0; // 5mm radially outward into tire channel bed
        spokeHoleGroup.add(outerHoleGroup);

        const radDir = new THREE.Vector3(Math.cos(sp.rimHoleAngle), Math.sin(sp.rimHoleAngle), 0).normalize();
        spokeHoleGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radDir);
        spokeHoleGroup.position.copy(sp.P_rimBase); // Anchored to stationary rim bed
        this.scene.add(spokeHoleGroup);
      }
    });

    // --- 4. GENERATE TUBE PUMP VALVE HOLE & PRESTA VALVE STEM ---
    // Dynamically calculate the widest open angular gap between spokes on the rim to prevent collision
    const allRimAngles: number[] = [];
    sides.forEach((s) => {
      if (!s.show) return;
      for (let j = 0; j < Ns; j++) {
        const flangeAngle = j * (2 * Math.PI / Ns) + s.flangeOffsetAngle;
        const isLeading = j % 2 === 0;
        const directionSign = isLeading ? 1.0 : -1.0;
        const thetaAngle = (720.0 * s.crosses) / N;
        const thetaRad = thetaAngle * (Math.PI / 180.0);
        let rimAngle = flangeAngle + directionSign * thetaRad;
        
        // Normalize angle to [0, 2PI)
        rimAngle = ((rimAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        allRimAngles.push(rimAngle);
      }
    });

    allRimAngles.sort((a, b) => a - b);

    let maxGap = 0;
    let valveAngle = Math.PI / Ns;

    if (allRimAngles.length > 0) {
      for (let k = 0; k < allRimAngles.length; k++) {
        const nextAngle = (k === allRimAngles.length - 1)
          ? allRimAngles[0] + 2 * Math.PI
          : allRimAngles[k + 1];
        const gap = nextAngle - allRimAngles[k];
        if (gap > maxGap) {
          maxGap = gap;
          let mid = allRimAngles[k] + gap / 2;
          if (mid >= 2 * Math.PI) mid -= 2 * Math.PI;
          valveAngle = mid;
        }
      }
    }

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
    const vHoleRimGeom = new THREE.CylinderGeometry(4.0, 4.0, rimDepth + 1.0, 24);
    const vHoleRimMesh = new THREE.Mesh(vHoleRimGeom, valveRimMat);
    vHoleRimMesh.position.y = -rimDepth / 2;
    valveGroup.add(vHoleRimMesh);

    const vHoleCoreGeom = new THREE.CylinderGeometry(3.2, 3.2, rimDepth + 1.6, 24);
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
    this.scene.add(valveGroup);

    // Draw initial 3D measurement ruler on primary spoke
    if (this.showMeasurement && this.showRuler && this.spokeMeshes.length > 0) {
      this.drawRulerForSpoke(this.spokeMeshes[0]);
    } else if (this.rulerGroup) {
      this.scene.remove(this.rulerGroup);
      this.rulerGroup.clear();
      this.activeRulerMidpoint = null;
    }
  }

  public drawRulerForSpoke(spokeMesh: THREE.Mesh | null) {
    if (this.rulerGroup) {
      this.scene.remove(this.rulerGroup);
      this.rulerGroup.clear();
    }

    if (!this.showMeasurement || !this.showRuler || !spokeMesh || !spokeMesh.userData) {
      this.activeRulerMidpoint = null;
      return;
    }

    this.rulerGroup = new THREE.Group();

    const startPoint: THREE.Vector3 = spokeMesh.userData.innerKnee || spokeMesh.userData.holeCenter;
    const rimCenter: THREE.Vector3 = spokeMesh.userData.rimCenter;
    if (!startPoint || !rimCenter) {
      this.activeRulerMidpoint = null;
      return;
    }

    this.activeRulerMidpoint = new THREE.Vector3().addVectors(startPoint, rimCenter).multiplyScalar(0.5);
    this.activeRulerDirectLength = spokeMesh.userData.direct3DLength;
    this.activeRulerActualLength = spokeMesh.userData.actualCurveLength;

    const rulerDir = new THREE.Vector3().subVectors(rimCenter, startPoint);
    const rulerLength = rulerDir.length();
    rulerDir.normalize();

    // 1. Straight glowing neon laser line connecting inner knee of J-bend directly to rim inside nipple
    const lineGeom = new THREE.CylinderGeometry(0.35, 0.35, rulerLength, 8);
    lineGeom.translate(0, rulerLength / 2, 0); // pivot at base

    const lineMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, // Glowing Neon Cyan
    });

    const lineMesh = new THREE.Mesh(lineGeom, lineMat);
    lineMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rulerDir);
    lineMesh.position.copy(startPoint);
    this.rulerGroup.add(lineMesh);

    // 2. Target endpoints at J-bend inner knee and rim hole center inside nipple
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffea00 }); // Neon Yellow
    const startRingGeom = new THREE.SphereGeometry(1.4, 12, 12);
    const startRing = new THREE.Mesh(startRingGeom, ringMat);
    startRing.position.copy(startPoint);
    this.rulerGroup.add(startRing);

    const endRingGeom = new THREE.SphereGeometry(1.4, 12, 12);
    const endRing = new THREE.Mesh(endRingGeom, ringMat);
    endRing.position.copy(rimCenter);
    this.rulerGroup.add(endRing);

    // 3. Ruler Tick Marks every 25mm along the direct straight vector
    const perpVec = new THREE.Vector3(-rulerDir.y, rulerDir.x, 0).normalize();
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const tickGeom = new THREE.CylinderGeometry(0.25, 0.25, 3.5, 6);

    for (let dist = 25; dist < rulerLength - 5; dist += 25) {
      const tickPos = new THREE.Vector3().addVectors(
        startPoint,
        rulerDir.clone().multiplyScalar(dist)
      );
      const tickMesh = new THREE.Mesh(tickGeom, tickMat);
      tickMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), perpVec);
      tickMesh.position.copy(tickPos);
      this.rulerGroup.add(tickMesh);
    }

    // 4. Highlight path offset bridge lines in Spoke Delta mode
    if (this.isSpokeDeltaMode && spokeMesh.userData.start) {
      const elbowPt: THREE.Vector3 = spokeMesh.userData.start;
      
      // Project elbow position onto straight ruler vector
      const vElbow = new THREE.Vector3().subVectors(elbowPt, startPoint);
      const projDist = vElbow.dot(rulerDir);
      const projPt = new THREE.Vector3().addVectors(
        startPoint,
        rulerDir.clone().multiplyScalar(projDist)
      );

      const bridgeVec = new THREE.Vector3().subVectors(elbowPt, projPt);
      const bridgeLen = bridgeVec.length();

      if (bridgeLen > 0.1) {
        bridgeVec.normalize();
        const bridgeGeom = new THREE.CylinderGeometry(0.3, 0.3, bridgeLen, 6);
        bridgeGeom.translate(0, bridgeLen / 2, 0);
        const bridgeMat = new THREE.MeshBasicMaterial({ color: 0xff3366 }); // Neon Red/Pink
        const bridgeMesh = new THREE.Mesh(bridgeGeom, bridgeMat);
        bridgeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bridgeVec);
        bridgeMesh.position.copy(projPt);
        this.rulerGroup.add(bridgeMesh);
      }
    }

    this.scene.add(this.rulerGroup);
  }

  private createFlangeGeometry(
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
      bevelEnabled: true,
      bevelThickness: bevelSize,
      bevelSize: bevelSize,
      bevelSegments: 3,
      curveSegments: 32,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center(); // centers depth around Z=0
    return geom;
  }

  private clearScene() {
    // Clear all existing objects except lights
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Group
      ) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => this.scene.remove(obj));
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();

    // Update screen badge position for active 3D ruler midpoint
    if (this.showMeasurement && this.showRuler && this.activeRulerMidpoint && this.container) {
      const projVec = this.activeRulerMidpoint.clone();
      projVec.project(this.camera);

      const isBehind = projVec.z > 1.0;
      const screenX = (projVec.x * 0.5 + 0.5) * this.container.clientWidth;
      const screenY = (-(projVec.y * 0.5) + 0.5) * this.container.clientHeight;

      const event = new CustomEvent('ruler-screen-update', {
        detail: {
          visible: !isBehind,
          x: screenX,
          y: screenY,
          direct3DLength: this.activeRulerDirectLength,
          actualCurveLength: this.activeRulerActualLength,
        },
      });
      window.dispatchEvent(event);
    } else {
      const event = new CustomEvent('ruler-screen-update', {
        detail: { visible: false, x: 0, y: 0, direct3DLength: 0, actualCurveLength: 0 },
      });
      window.dispatchEvent(event);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
