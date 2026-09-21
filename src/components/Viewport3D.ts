import { calculateSpokePaths, type SpokePath, type SpokePaths, type Point3 } from '../utils/spokePath';
import { createLacingGuide, guideDirection, guideWorldTurn, guideViewingLabel, guideKey, guideSnapshot, initialGuideState, reconcileGuide, transitionGuide, type GuideAction, type LacingGuide, type LacingTarget } from '../utils/lacingGuide';
import { shallowRimSection } from '../utils/rimProfile';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WheelBuildInputs } from '../utils/physicsCalculator';

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

export class Viewport3D {
  private container: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private spokeMeshes: THREE.Mesh[] = [];
  private currentInputs?: WheelBuildInputs;

  // Render options
  public explodedValue: number = 0; // 0 to 1
  public showLeftSpokes: boolean = true;
  public showRightSpokes: boolean = true;
  public enableInterlacing: boolean = false; // Toggle 3D spoke interlacing/weaving
  public showRuler: boolean = true; // Toggle 3D straight ruler vector
  public showMeasurement: boolean = true; // Global measurement toggle
  public isSpokeDeltaMode: boolean = false; // Focused single spoke path analysis mode
  public colorMode: 'classic' | 'side' | 'tension' = 'classic';
  public spokeThickness: number = 1.0; // Visual diameter multiplier; never used in calculations

  // Interactive Lacing Mode
  public lacingMode: boolean = false;
  private guideState = initialGuideState();
  private guide?: LacingGuide;
  private cachedPaths?: SpokePaths;
  private lastTrackedStep = '';
  private lastInstructionViewKey = '';
  private lastInstructionSide?: 'Left' | 'Right';
  private lastViewingLabel = '';
  private lacingTargets: Partial<Record<LacingTarget, { point: THREE.Vector3; label: string }>> = {};
  private highlightedLacingTarget: LacingTarget | null = null;
  private lacingTargetMarker!: HTMLDivElement;
  public get lacingPlacedCount() { return this.guideState.step; }
  public get lacingCameraTracking() { return this.guideState.cameraTracking; }
  private lacingIndicatorGroup: THREE.Group = new THREE.Group();

  // Lights Groups
  private studioLightGroup: THREE.Group = new THREE.Group();
  private headTorchGroup: THREE.Group = new THREE.Group();

  // Ruler visualization
  private rulerGroup: THREE.Group = new THREE.Group();
  private activeRulerMidpoint: THREE.Vector3 | null = null;
  private activeRulerDirectLength = 0;
  private activeRulerActualLength = 0;

  // Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hoveredSpoke: THREE.Mesh | null = null;
  private originalSpokeColor: THREE.Color | null = null;
  private animationFrame = 0;
  private resizeObserver?: ResizeObserver;
  private readonly resizeHandler = () => this.onWindowResize();

  constructor(container: HTMLElement) {
    this.container = container;
    try {
      this.init();
      this.animate();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private init() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0b); // Deep space black

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight),
      0.1,
      1000
    );
    this.camera.position.set(0, 300, 500);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // Constrain canvas so it never forces the flex/grid container wider than its
    // available space. Without this, a full-page-sized canvas keeps the container
    // (and the whole layout) stuck at that width when exiting full-page mode,
    // preventing the renderer from resizing back down.
    this.renderer.domElement.style.maxWidth = '100%';
    this.renderer.domElement.style.maxHeight = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);
    this.container.style.position = 'relative';
    this.lacingTargetMarker = document.createElement('div');
    this.lacingTargetMarker.className = 'lacing-target-marker';
    this.lacingTargetMarker.hidden = true;
    this.lacingTargetMarker.setAttribute('aria-hidden', 'true');
    const halo = document.createElement('span'); halo.className = 'lacing-target-halo';
    const label = document.createElement('span'); label.className = 'lacing-target-label';
    this.lacingTargetMarker.append(halo, label);
    this.container.append(this.lacingTargetMarker);

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

    // Standard Studio Fixed Lights (Main Wheel Assembly Tab)
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(200, 400, 300);
    this.studioLightGroup.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.5);
    dirLight2.position.set(-200, -100, -300);
    this.studioLightGroup.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.6, 300);
    pointLight.position.set(0, 0, 50);
    this.studioLightGroup.add(pointLight);

    this.scene.add(this.studioLightGroup);

    // Head Torch Light (ONLY active in Interactive Lacing Tab - follows user's camera view)
    const headTorch = new THREE.PointLight(0xfff8e7, 1.3, 1200);
    headTorch.position.set(0, 0, 10);
    this.headTorchGroup.add(headTorch);

    const torchDir = new THREE.DirectionalLight(0xffffff, 0.7);
    torchDir.position.set(20, 40, 30);
    this.headTorchGroup.add(torchDir);

    this.headTorchGroup.add(new THREE.AmbientLight(0xffffff, 0.9));
    this.headTorchGroup.visible = false; // Initially OFF for main tab
    this.camera.add(this.headTorchGroup);

    this.scene.add(this.camera);

    // 6. Handle resizing
    window.addEventListener('resize', this.resizeHandler);
    this.resizeObserver = new ResizeObserver(this.resizeHandler);
    this.resizeObserver.observe(this.container);

    // 7. Raycasting events
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));
  }

  private onWindowResize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
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
    if (this.lacingMode) this.setLacingCameraTracking(false);
    this.setCameraUp(new THREE.Vector3(0, 1, 0));
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
        this.camera.position.set(0, 0, Math.max(420, (this.currentInputs?.erd ?? 280) * 1.5));
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

  public setLacingMode(enabled: boolean) {
    this.lacingMode = enabled;
    if (this.currentInputs) this.update(this.currentInputs);
  }

  private setCameraUp(up: THREE.Vector3) {
    if (this.camera.up.distanceToSquared(up) < 1e-12) return;
    // OrbitControls caches the camera's up-axis at construction. Recreate it
    // when rolling the view so dragging still follows the displayed axes.
    const previous = this.controls;
    const target = previous.target.clone();
    previous.dispose();
    this.camera.up.copy(up);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = previous.enableDamping;
    this.controls.dampingFactor = previous.dampingFactor;
    this.controls.minDistance = previous.minDistance;
    this.controls.maxDistance = previous.maxDistance;
    this.controls.maxPolarAngle = previous.maxPolarAngle;
  }

  /** Restore the instruction's camera framing without changing sequence or
   * tracking state. Auto-Track uses the same framing when the step changes. */
  public resetLacingView() {
    if (!this.lacingMode || !this.guide?.valid || !this.currentInputs) return;
    const snapshot = guideSnapshot(this.guideState, this.guide);
    const spoke = this.guideState.preview ? null : snapshot.activeSpoke;
    // Flush pending orbit/pan damping before applying the requested view.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    const overview = !!snapshot.setup || !spoke;
    this.setCameraUp(new THREE.Vector3(Math.cos(this.guide.valveAngle), Math.sin(this.guide.valveAngle), 0));
    this.camera.zoom = 1;
    if (spoke && !overview) {
      const { hole, end } = spoke.path;
      const midpoint = new THREE.Vector3(hole.x + end.x, hole.y + end.y, hole.z + end.z).multiplyScalar(.5);
      this.controls.target.copy(midpoint);
      this.camera.position.copy(midpoint).add(new THREE.Vector3(0, 0, spoke.side === 'Left' ? -240 : 240));
    } else {
      this.controls.target.set(0, 0, 0);
      const side = snapshot.targetSpoke?.side ?? 'Right';
      this.camera.position.set(0, 0, (side === 'Left' ? -1 : 1) * Math.max(420, this.currentInputs.erd * 1.5));
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.enableDamping = damping;
    this.updateLacingTargetMarker();
  }

  /** Link hover/focus highlights without changing the step or camera. A click
   * can bring an off-screen target into view while preserving the viewing angle. */
  public emphasizeLacingTarget(target: LacingTarget | null, locate = false) {
    const entry = target ? this.lacingTargets[target] : undefined;
    this.highlightedLacingTarget = this.lacingMode && entry ? target : null;
    if (entry && this.highlightedLacingTarget && locate) {
      const projected = entry.point.clone().project(this.camera);
      if (Math.abs(projected.x) > .85 || Math.abs(projected.y) > .8 || projected.z > 1 || projected.z < -1) {
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.copy(entry.point);
        this.camera.position.copy(entry.point).add(offset);
        this.controls.update();
      }
    }
    this.updateLacingTargetMarker();
  }

  private updateLacingTargetMarker() {
    const target = this.highlightedLacingTarget;
    const entry = target ? this.lacingTargets[target] : undefined;
    this.lacingTargetMarker.hidden = !this.lacingMode || !entry;
    if (!entry || !target || !this.lacingMode) return;
    const position = entry.point.clone().project(this.camera);
    const width = this.container.clientWidth, height = this.container.clientHeight;
    const outside = Math.abs(position.x) > 1 || Math.abs(position.y) > 1 || position.z > 1 || position.z < -1;
    const screenX = (position.x + 1) * width / 2, screenY = (1 - position.y) * height / 2;
    // Never shift an on-screen halo away from the actual hole. Only clamp the
    // off-screen prompt; its dashed outline asks the user to locate the hole.
    const x = outside ? Math.max(22, Math.min(width - 22, screenX)) : screenX;
    const y = outside ? Math.max(22, Math.min(height - 22, screenY)) : screenY;
    this.lacingTargetMarker.style.left = `${x}px`;
    this.lacingTargetMarker.style.top = `${y}px`;
    this.lacingTargetMarker.dataset.target = target;
    this.lacingTargetMarker.dataset.offscreen = String(outside);
    this.lacingTargetMarker.style.setProperty('--target-color', target === 'setup-reference' || target === 'reference-flange' || target === 'logo' ? '#fbbf24' :
      target === 'valve' || target === 'alignment' ? '#fde047' : target.includes('flange') ? '#67e8f9' : '#6ee7b7');
    const label = this.lacingTargetMarker.querySelector<HTMLElement>('.lacing-target-label')!;
    label.textContent = outside ? `${entry.label} — click the link to locate` : entry.label;
    label.style.left = `${Math.max(85 - x, Math.min(0, width - 85 - x))}px`;
    label.style.top = y < 60 ? '25px' : '';
    label.style.bottom = y < 60 ? 'auto' : '';
  }

  public navigateLacing(action: GuideAction) {
    if (!this.guide || !this.currentInputs) return;
    this.guideState = transitionGuide(this.guideState, this.guide, action);
    if (action === 'track') this.lastTrackedStep = '';
    this.update(this.currentInputs);
  }

  public setLacingCameraTracking(tracking: boolean) { this.navigateLacing(tracking ? 'track' : 'fixed'); }
  public nextLacingSpoke() { this.navigateLacing('next'); }
  public prevLacingSpoke() { this.navigateLacing('previous'); }
  public nextLacingGroup() { this.navigateLacing('next-group'); }
  public prevLacingGroup() { this.navigateLacing('previous-group'); }

  public update(inputs: WheelBuildInputs, sharedPaths?: SpokePaths) {
    this.emphasizeLacingTarget(null);
    this.lacingTargets = {};
    const changed = this.guide?.key !== guideKey(inputs);
    const pathModel = sharedPaths ?? (changed ? undefined : this.cachedPaths) ?? calculateSpokePaths(inputs);
    this.cachedPaths = pathModel;
    this.guide = createLacingGuide(inputs, pathModel);
    this.guideState = reconcileGuide(this.guideState, this.guide);
    if (changed) this.lastTrackedStep = '';
    this.currentInputs = inputs;
    if (this.lacingMode) window.dispatchEvent(new CustomEvent('lacing-update', { detail: guideSnapshot(this.guideState, this.guide) }));
    this.resetHoveredSpoke();
    window.dispatchEvent(new CustomEvent('spoke-unhover'));
    this.clearScene();
    this.spokeMeshes = [];

    // Toggle lighting mode based on active tab
    if (this.lacingMode) {
      // Interactive Lacing Tab: Head Torch mounted to camera view
      this.headTorchGroup.visible = true;
      this.studioLightGroup.visible = false;
    } else {
      // Main Wheel Assembly Tab: Fixed studio lighting
      this.headTorchGroup.visible = false;
      this.studioLightGroup.visible = true;
    }

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

    if (![erd, flangePcdLeft, flangePcdRight, centerToLeft, centerToRight, spokeCount].every(Number.isFinite) || erd <= 0 || flangePcdLeft <= 0 || flangePcdRight <= 0 || spokeCount < 8 || spokeCount > 64) {
      this.activeRulerMidpoint = null;
      return;
    }

    // --- MATERIALS ---
    const rimMat = new THREE.MeshStandardMaterial({
      color: inputs.rimProfile === 'shallow-double-wall' ? 0x17191c : 0x5a606d, // Brighter Metallic Alloy/Titanium Gray for high contrast on dark background
      roughness: 0.35,
      metalness: 0.75,
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
    let rimShift = 0;
    if (rimFlip === 'Left') rimShift = osb;
    else if (rimFlip === 'Right') rimShift = -osb;
    else {
      if (centerToLeft - hubOffset > centerToRight + hubOffset) rimShift = osb;
      else rimShift = -osb;
    }
    rimMesh.position.z = -rimShift;
    this.scene.add(rimMesh);
    if (shallow) {
      const cavity = new THREE.Mesh(new THREE.LatheGeometry(section.cavity.map(([axial, radial]) => new THREE.Vector2(R_bed + radial, axial)), 96), rimMat);
      cavity.rotation.x = Math.PI / 2;
      cavity.position.z = -rimShift;
      this.scene.add(cavity);
    }

    // Use the same landmark as the guide's ordering and instructions.
    const Ns = spokeCount / 2;
    const valveAngle = this.guide.valveAngle;

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
    const spokeRad = (inputs.spokeDiameter ?? 2) / 2 * this.spokeThickness;

    // Flange geometries with real drilled spoke holes
    const flangeLGeom = this.createFlangeGeometry(
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

    const flangeRGeom = this.createFlangeGeometry(
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

    const discType = inputs.discType || (hubNameLower.includes('cl') || hubNameLower.includes('centerlock') ? 'Centerlock' : '6-Bolt');

    // Hub center tube connecting flanges
    const centerTubeGeom = new THREE.CylinderGeometry(15, 15, Math.max(2, Math.abs(zR - zL) - 4), 32);
    const centerTube = new THREE.Mesh(centerTubeGeom, hubMat);
    centerTube.rotation.x = Math.PI / 2;
    centerTube.position.z = (zL + zR) / 2;
    hubShellGroup.add(centerTube);

    // 3D Hub Brand Logo Badge (Aligned directly with Rim Valve Hole)
    const logoCanvas = document.createElement('canvas');
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
    const logoTexture = new THREE.CanvasTexture(logoCanvas);
    logoTexture.needsUpdate = true;

    const logoMat = new THREE.MeshStandardMaterial({
      map: logoTexture,
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

    this.scene.add(hubShellGroup);

    // --- 3. GENERATE SPOKES & NIPPLES ---
    const N = spokeCount;

    // Exploded view separation shifts left & right spoke webs (+ nipples) apart laterally
    const expOffset = this.lacingMode ? 0 : this.explodedValue * 60.0;

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
    this.scene.add(valveGroup);

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
          groupName: this.guide!.groupNames[groupNum - 1],
          sp,
          crossInfo: model.crossingContact ? { point: displayPoint(model.crossingContact), t: 0 } : undefined,
          wEff: s.wEff,
          colorHex: s.colorHex,
          sequenceIndex: 0,
        });
      }
    });

    const entriesByHole = new Map(rawSpokeEntries.map(entry => [`${entry.side}:${entry.j}`, entry]));
    const lacingOrderedSpokes = this.lacingMode
      ? this.guide.spokes.map(spoke => entriesByHole.get(`${spoke.side}:${spoke.path.index}`)!)
      : rawSpokeEntries;
    lacingOrderedSpokes.forEach((entry, index) => { entry.sequenceIndex = index; });

    // Build 3D Meshes for ordered spokes based on Lacing Mode / Standard Mode
    lacingOrderedSpokes.forEach((entry) => {
      const sp = entry.sp;
      const crossInfo = entry.crossInfo;
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
      this.scene.add(spokeHoleGroup);

      // Evaluate whether this spoke should be rendered
      const isPlaced = !this.lacingMode || this.guideState.preview || (m < this.lacingPlacedCount);
      if (!isPlaced || (!this.lacingMode && !entry.visible)) return; // Unplaced spokes are COMPLETELY hidden (not rendered)

      const isActiveSpoke = this.lacingMode && !this.guideState.preview && (m === this.lacingPlacedCount - 1);

      let spokeMaterial: THREE.MeshStandardMaterial;

      if (isActiveSpoke) {
        // High-contrast glowing Gold for newly placed active spoke
        spokeMaterial = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          roughness: 0.1,
          metalness: 0.9,
          emissive: 0xff8800,
          emissiveIntensity: 0.5,
        });
      } else if (this.isSpokeDeltaMode && !this.lacingMode) {
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
        if (this.colorMode === 'side') {
          sColor = entry.colorHex;
        } else if (this.colorMode === 'tension') {
          sColor = entry.side === 'Left' ? 0x3b82f6 : 0xef4444;
        }
        spokeMaterial = new THREE.MeshStandardMaterial({
          color: sColor,
          roughness: 0.15,
          metalness: 0.9,
        });
      }

      // 1. Spoke Head Cap
      const headGeom = new THREE.CylinderGeometry(spokeRad * 1.8, spokeRad * 1.8, 0.8, 12);
      headGeom.rotateX(Math.PI / 2);
      const headMesh = new THREE.Mesh(headGeom, spokeMaterial);
      headMesh.position.copy(sp.P_head);
      this.scene.add(headMesh);

      // Measured shaft: exactly the shared path, translated only for exploded view.
      const displayShift = (entry.side === 'Left' ? -1 : 1) * expOffset;
      const displayPoint = (p: Point3) => new THREE.Vector3(p.x, p.y, p.z + displayShift);
      const shaftPoints = sp.model.points.map(displayPoint);
      const shaftCurve = new SpokeDisplayCurve(shaftPoints);
      const spokeTubeGeom = new THREE.TubeGeometry(shaftCurve, (shaftPoints.length - 1) * 4, spokeRad, 8, false);
      const spokeMesh = new THREE.Mesh(spokeTubeGeom, spokeMaterial);
      // Decorative manufactured elbow is separate and excluded from shaft length.
      const neck = new THREE.QuadraticBezierCurve3(sp.P_head, new THREE.Vector3(sp.P_head.x, sp.P_head.y, sp.P_holeExit.z), sp.P_holeExit);
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 12, spokeRad, 8, false), spokeMaterial));
      const finalSpan = new THREE.Vector3().subVectors(shaftPoints[shaftPoints.length-1], shaftPoints[shaftPoints.length-2]).normalize();
      const exitBendAngleDeg = Math.acos(Math.min(1, Math.abs(finalSpan.z))) * 180 / Math.PI;
      for (const point of [...sp.model.flangeContacts, ...(sp.model.crossingContact ? [sp.model.crossingContact] : [])]) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(spokeRad * 1.12, 8, 6), new THREE.MeshBasicMaterial({color: 0xfbbf24}));
        marker.position.copy(displayPoint(point)); this.scene.add(marker);
      }
      spokeMesh.userData = {
        side: entry.side, index: j, sequenceIndex: m, group: entry.group, groupName: entry.groupName,
        isLeading: sp.isLeading, length: sp.model.traditionalLength,
        direct3DLength: sp.model.chordLength, actualCurveLength: sp.model.pathLength,
        bendAllowance: sp.model.bendAllowance, estimatedLength: sp.model.estimatedLength,
        holeCenter: sp.P_pureHole, innerKnee: sp.P_holeExit, rimCenter: sp.P_rim,
        bracingAngle: Math.asin(Math.min(1.0, entry.wEff / sp.P_pureHole.distanceTo(sp.P_rim))) * (180.0 / Math.PI),
        flangeExitBendAngle: exitBendAngleDeg, start: sp.P_holeExit, end: sp.P_rim,
      };

      this.scene.add(spokeMesh);
      this.spokeMeshes.push(spokeMesh);

      // 3. Nipple Group
      const nippleGroup = new THREE.Group();
      const nHead = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.7, 2.0, 16), nippleMat);
      nHead.position.y = 1.0;
      nippleGroup.add(nHead);

      const nNeck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.0, 16), nippleMat);
      nNeck.position.y = -1.0;
      nippleGroup.add(nNeck);

      const nBody = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 8.0, 16), nippleMat);
      nBody.position.y = -6.0;
      nippleGroup.add(nBody);

      const nCollar = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.5, 2.7), nippleMat);
      nCollar.position.y = -6.5;
      nippleGroup.add(nCollar);

      const upVec = new THREE.Vector3(0, 1, 0);
      const inwardVector = finalSpan.clone().negate();

      nippleGroup.quaternion.setFromUnitVectors(upVec, inwardVector);
      nippleGroup.position.copy(sp.P_rim);
      this.scene.add(nippleGroup);
    });

    // In Lacing Mode: Draw 3D Target Hole Indicators & Valve Hole Landmark
    this.scene.remove(this.lacingIndicatorGroup);
    this.lacingIndicatorGroup.clear();

    if (this.lacingMode) {
      if (!this.guideState.preview && lacingOrderedSpokes.length > 0) {
        const activeIdx = Math.max(0, Math.min(lacingOrderedSpokes.length - 1, this.lacingPlacedCount - 1));
        const activeEntry = lacingOrderedSpokes[activeIdx];
        const guideSpoke = this.guide.spokes[activeIdx];
        this.lacingTargets.flange = { point: activeEntry.sp.P_pureHole.clone(), label: `${activeEntry.side} flange hole — destination` };
        this.lacingTargets.rim = { point: activeEntry.sp.P_rimBase.clone(), label: 'Rim hole — destination' };
        if (guideSpoke.referenceFlange) {
          const p = guideSpoke.referenceFlange.hole;
          this.lacingTargets['reference-flange'] = { point: new THREE.Vector3(p.x, p.y, p.z), label: `${activeEntry.side} flange — count from here` };
        }
        if (guideSpoke.referenceRim) {
          const p = guideSpoke.referenceRim.end;
          this.lacingTargets['reference-rim'] = { point: new THREE.Vector3(p.x, p.y, p.z), label: 'Rim — count from here' };
        }
        this.lacingTargets.valve = { point: P_valveBed.clone(), label: 'Valve hole — count from here' };

        const setup = guideSnapshot(this.guideState, this.guide).setup;
        if (setup) {
          const p = setup.reference.hole;
          const referencePoint = new THREE.Vector3(p.x, p.y, p.z);
          const radius = Math.hypot(p.x, p.y);
          const alignmentPoint = new THREE.Vector3(radius * Math.cos(valveAngle), radius * Math.sin(valveAngle), p.z);
          this.lacingTargets[setup.referenceTarget] = { point: referencePoint, label: setup.referenceTarget === 'setup-reference' ?
            `${guideSpoke.side} flange — just ${guideDirection(guideSpoke.side, 1)} of the valve line` : `${guideSpoke.side} flange — count from this already used hole` };
          this.lacingTargets.alignment = { point: alignmentPoint, label: `Valve line across the ${guideSpoke.side.toLowerCase()} flange — between holes` };
          // A steady construction line, not a spoke: project the valve direction
          // onto the flange plane, then continue to the axle.
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            P_valveBed, alignmentPoint, new THREE.Vector3(0, 0, p.z)
          ]), new THREE.LineDashedMaterial({ color: 0xfde047, dashSize: 4, gapSize: 3, depthTest: false, transparent: true, opacity: .85 }));
          line.computeLineDistances(); line.renderOrder = 10;
          this.lacingIndicatorGroup.add(line);
          const referenceRing = new THREE.Mesh(new THREE.TorusGeometry(spokeHoleDiameter * 1.4, .65, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false }));
          referenceRing.position.copy(referencePoint); referenceRing.renderOrder = 11;
          this.lacingIndicatorGroup.add(referenceRing);
          if (setup.holeSteps > 0) {
            const turn = guideWorldTurn(setup.first.side, setup.direction);
            const startAngle = Math.atan2(p.y, p.x);
            const sweep = setup.holeSteps * 2 * Math.PI / setup.flangeHoles.length;
            const points = Array.from({ length: 49 }, (_, i) => {
              const angle = startAngle + turn * sweep * i / 48;
              return new THREE.Vector3((radius + 7) * Math.cos(angle), (radius + 7) * Math.sin(angle), p.z);
            });
            const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false }));
            arc.renderOrder = 11; this.lacingIndicatorGroup.add(arc);
            const end = startAngle + turn * sweep;
            const arrow = new THREE.ArrowHelper(new THREE.Vector3(-turn * Math.sin(end), turn * Math.cos(end), 0), points.at(-1)!, 3, 0xfbbf24, 3, 2.5);
            this.lacingIndicatorGroup.add(arrow);
          }
        }

        // 1. Target Flange Hole Ring (Neon Cyan)
        const fRingGeom = new THREE.TorusGeometry(spokeHoleDiameter * 0.9, 0.6, 12, 24);
        const fRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const fRingMesh = new THREE.Mesh(fRingGeom, fRingMat);
        fRingMesh.position.copy(activeEntry.sp.P_pureHole);
        this.lacingIndicatorGroup.add(fRingMesh);

        // 2. Target Rim Hole Ring (Emerald Green)
        const rRingGeom = new THREE.TorusGeometry(3.6, 0.7, 12, 24);
        const rRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const rRingMesh = new THREE.Mesh(rRingGeom, rRingMat);
        const rRadDir = new THREE.Vector3(Math.cos(activeEntry.sp.rimHoleAngle), Math.sin(activeEntry.sp.rimHoleAngle), 0).normalize();
        rRingMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rRadDir);
        rRingMesh.position.copy(activeEntry.sp.P_rimBase);
        this.lacingIndicatorGroup.add(rRingMesh);
      }

      // 3. Valve Hole Reference Marker (Glowing Yellow Pointer)
      const vMarkerGeom = new THREE.ConeGeometry(3.8, 12.0, 16);
      const vMarkerMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
      const vMarkerMesh = new THREE.Mesh(vMarkerGeom, vMarkerMat);
      vMarkerMesh.rotation.z = Math.PI / 2;
      vMarkerMesh.position.copy(P_valveBed).add(inwardRadDir.clone().multiplyScalar(15));
      this.lacingIndicatorGroup.add(vMarkerMesh);

      // 4. Hub Brand Logo Reference Marker (Amber Ring on Hub Shell facing Valve Hole)
      const logoCenterPos = new THREE.Vector3(
        15.6 * Math.cos(valveAngle),
        15.6 * Math.sin(valveAngle),
        (zL + zR) / 2
      );
      const hLogoRingGeom = new THREE.TorusGeometry(8.0, 0.6, 12, 24);
      const hLogoRingMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const hLogoRingMesh = new THREE.Mesh(hLogoRingGeom, hLogoRingMat);
      hLogoRingMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(Math.cos(valveAngle), Math.sin(valveAngle), 0).normalize()
      );
      hLogoRingMesh.position.copy(logoCenterPos);
      this.lacingIndicatorGroup.add(hLogoRingMesh);
      if (this.guide?.valid && !this.guideState.preview && this.lacingPlacedCount <= 1) {
        this.lacingTargets.logo = { point: logoCenterPos, label: 'Logo facing the valve — final orientation' };
      }

      this.scene.add(this.lacingIndicatorGroup);

      // Each group-start diagram faces the active flange with the valve at the
      // top. Match it once on entry, including in Fixed mode; subsequent
      // display changes must not undo a user's camera adjustments.
      const instructionViewKey = `${this.guide.key}:${this.lacingPlacedCount}:${this.guideState.preview}`;
      const snapshot = guideSnapshot(this.guideState, this.guide);
      const enteringGroup = snapshot.setup && this.lastInstructionViewKey !== instructionViewKey;
      // Previous can cross to the end of the other flange's group, too.
      const changingSide = !snapshot.preview && snapshot.targetSpoke && snapshot.targetSpoke.side !== this.lastInstructionSide;
      if (!snapshot.preview) this.lastInstructionSide = snapshot.targetSpoke?.side;
      this.lastInstructionViewKey = instructionViewKey;
      const trackingKey = `${this.guide.key}:${this.lacingPlacedCount}`;
      if (enteringGroup || changingSide || (this.lacingCameraTracking && !this.guideState.preview && this.lacingPlacedCount > 0 && lacingOrderedSpokes.length > 0 && this.lastTrackedStep !== trackingKey)) {
        this.lastTrackedStep = trackingKey;
        this.resetLacingView();
      }

    }

    // Draw initial 3D measurement ruler on primary spoke
    if (this.showMeasurement && this.showRuler && this.spokeMeshes.length > 0) {
      this.drawRulerForSpoke(this.lacingMode && !this.guideState.preview ? this.spokeMeshes[this.spokeMeshes.length - 1] : this.spokeMeshes[0]);
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

  private clearScene() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const child of [...this.scene.children]) {
      if (child === this.camera || child === this.studioLightGroup || child instanceof THREE.Light) continue;
      child.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
          if ('geometry' in obj) geometries.add(obj.geometry);
          for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);
        }
      });
      this.scene.remove(child);
    }
    geometries.forEach(g => g.dispose());
    materials.forEach(m => { if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose(); m.dispose(); });
  }

  public dispose() {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    if (this.scene) this.clearScene();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.lacingTargetMarker?.remove();
  }

  private animate() {
    this.animationFrame = requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.updateLacingTargetMarker();
    if (this.lacingMode && this.currentInputs) {
      const offset = this.camera.position.clone().sub(this.controls.target).normalize();
      const label = Math.abs(offset.z) < .15 ? '3D view: edge-on · rotate to see a flange' :
        `3D view from ${guideViewingLabel(this.currentInputs, offset.z < 0 ? 'Left' : 'Right')} side`;
      if (label !== this.lastViewingLabel) {
        this.lastViewingLabel = label;
        window.dispatchEvent(new CustomEvent('lacing-view-change', { detail: label }));
      }
    }

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
