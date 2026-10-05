import { calculateSpokePaths, type SpokePaths } from '../utils/spokePath';
import { createLacingGuide, guideDirection, guideWorldTurn, guideViewingLabel, guideKey, guideSnapshot, initialGuideState, reconcileGuide, transitionGuide, type GuideAction, type LacingGuide, type LacingTarget } from '../utils/lacingGuide';
import { createWheelModel } from './WheelModel';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WheelBuildInputs } from '../utils/physicsCalculator';

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
  public get lacingPlacedCount() { return this.guideState.step * 2; }
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
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
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0xa8b4c4, 1.2);
    this.scene.add(ambientLight);

    // Standard Studio Fixed Lights (Main Wheel Assembly Tab)
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(200, 400, 300);
    this.studioLightGroup.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.5);
    dirLight2.position.set(-200, -100, -300);
    this.studioLightGroup.add(dirLight2);

    this.scene.add(this.studioLightGroup);

    // Camera-relative soft key/fill: directional lights retain their brightness
    // at millimetre-scale zoom distances. Targets must share the camera frame.
    for (const [x,y,z,intensity,color] of [
      [-80,100,60,2.4,0xffffff], [90,-35,40,1.3,0xdbeaff],
    ]) {
      const light = new THREE.DirectionalLight(color,intensity);
      light.position.set(x,y,z);
      light.target.position.set(0,0,-150);
      this.headTorchGroup.add(light,light.target);
    }
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
      const points = snapshot.targetPair ? [snapshot.targetPair.a.path.hole,snapshot.targetPair.a.path.end,snapshot.targetPair.b.path.hole,snapshot.targetPair.b.path.end] : [spoke.path.hole,spoke.path.end];
      const midpoint = points.reduce<THREE.Vector3>((sum,p) => sum.add(new THREE.Vector3(p.x,p.y,p.z)), new THREE.Vector3()).multiplyScalar(1/points.length);
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
    this.lacingTargetMarker.style.setProperty('--target-color', target.includes('crossing-') || target.includes('reference') || target === 'logo' ? '#fbbf24' :
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

    // Keep both flange faces readable while orbiting in either tab.
    this.headTorchGroup.visible = true;
    this.studioLightGroup.visible = true;

    const { erd, spokeCount, spokeHoleDiameter, flangePcdLeft, centerToLeft,
      flangePcdRight, centerToRight } = inputs;

    if (![erd, flangePcdLeft, flangePcdRight, centerToLeft, centerToRight, spokeCount].every(Number.isFinite) || erd <= 0 || flangePcdLeft <= 0 || flangePcdRight <= 0 || spokeCount < 8 || spokeCount > 64) {
      this.activeRulerMidpoint = null;
      return;
    }

    const { group, spokeMeshes, lacingOrderedSpokes, P_valveBed, inwardRadDir, valveAngle, zL, zR } = createWheelModel(inputs, {
      paths: pathModel, guide: this.guide, lacingMode: this.lacingMode,
      preview: this.guideState.preview, lacingPlacedCount: this.lacingPlacedCount,
      explodedValue: this.explodedValue, showLeftSpokes: this.showLeftSpokes,
      showRightSpokes: this.showRightSpokes, isSpokeDeltaMode: this.isSpokeDeltaMode,
      colorMode: this.colorMode, spokeThickness: this.spokeThickness,
    });
    this.scene.add(group);
    this.spokeMeshes = spokeMeshes;

    // In Lacing Mode: Draw 3D Target Hole Indicators & Valve Hole Landmark
    this.scene.remove(this.lacingIndicatorGroup);
    this.lacingIndicatorGroup.clear();

    if (this.lacingMode) {
      if (!this.guideState.preview && lacingOrderedSpokes.length > 0) {
        const activeIdx = Math.max(0, Math.min(lacingOrderedSpokes.length - 1, this.lacingPlacedCount - 2));
        const activeEntry = lacingOrderedSpokes[activeIdx];
        const guideSpoke = this.guide.spokes[activeIdx];
        this.lacingTargets.flange = { point: activeEntry.sp.P_pureHole.clone(), label: `${activeEntry.side} flange hole — destination` };
        this.lacingTargets.rim = { point: activeEntry.sp.P_rimBase.clone(), label: 'Rim hole — destination' };
        if (guideSpoke.referenceFlange) {
          const p = guideSpoke.referenceFlange.hole;
          this.lacingTargets['reference-flange'] = { point: new THREE.Vector3(p.x, p.y, p.z), label: `${guideSpoke.referenceFlange.side} flange — count from here` };
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
            `${guideSpoke.side} flange — just ${guideDirection(guideSpoke.side, 1)} of the valve line` : `${setup.reference.side} flange — installed spoke ${setup.referenceStep}${setup.referenceAcrossHub ? ' (opposite flange)' : ''}` };
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
              const progress = i / 48;
              const arcRadius = radius + (Math.hypot(setup.first.hole.x, setup.first.hole.y) - radius) * progress + 7;
              return new THREE.Vector3(arcRadius * Math.cos(angle), arcRadius * Math.sin(angle), p.z + (setup.first.hole.z - p.z) * progress);
            });
            const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false }));
            arc.renderOrder = 11; this.lacingIndicatorGroup.add(arc);
            const end = startAngle + turn * sweep;
            const arrow = new THREE.ArrowHelper(new THREE.Vector3(-turn * Math.sin(end), turn * Math.cos(end), 0), points.at(-1)!, 3, 0xfbbf24, 3, 2.5);
            this.lacingIndicatorGroup.add(arrow);
          }
        }

        const ring = (point: THREE.Vector3, color: number, radius = 3.5) => {
          const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, .6, 8, 24), new THREE.MeshBasicMaterial({color, depthTest: false}));
          mesh.position.copy(point); mesh.renderOrder = 12; this.lacingIndicatorGroup.add(mesh);
        };
        for (const [target, p] of [['flange',guideSpoke.path.hole],['rim',guideSpoke.path.end],
          ['reference-flange',guideSpoke.referenceFlange?.hole],['reference-rim',guideSpoke.referenceRim?.end]] as const) {
          if (!p) continue;
          ring(new THREE.Vector3(p.x,p.y,p.z), target.includes('reference') ? 0xfbbf24 : 0x67e8f9);
        }
        const partner = this.guide.spokes[activeIdx+1];
        for (const [target,p] of [['b-flange',partner.path.hole],['b-rim',partner.path.end],
          ['b-reference-flange',partner.referenceFlange?.hole],['b-reference-rim',partner.referenceRim?.end]] as const) {
          if (!p) continue;
          this.lacingTargets[target]={point:new THREE.Vector3(p.x,p.y,p.z),label:`B — ${target.replace('b-','')}`};
          ring(new THREE.Vector3(p.x,p.y,p.z),target.includes('reference')?0xfbbf24:0x6ee7b7);
        }
        for (const [i,spoke] of [guideSpoke,partner].entries()) for (const crossing of spoke.crossings) {
          const p=crossing.point, target=(i?`b-${crossing.target}`:crossing.target) as LacingTarget;
          this.lacingTargets[target]={point:new THREE.Vector3(p.x,p.y,p.z),label:`${i?'B':'A'}: ${crossing.description}`};
          ring(new THREE.Vector3(p.x,p.y,p.z),0xfbbf24,4.5);
          if (crossing.other===guideSpoke || crossing.other===partner) continue;
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crossing.other.path.points.map(p=>new THREE.Vector3(p.x,p.y,p.z))),
            new THREE.LineBasicMaterial({color:0xfbbf24,depthTest:false,transparent:true,opacity:.65}));
          line.renderOrder=9; this.lacingIndicatorGroup.add(line);
        }


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
        this.lacingTargets.logo = { point: logoCenterPos, label: 'Illustrative logo position — alignment is cosmetic' };
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
