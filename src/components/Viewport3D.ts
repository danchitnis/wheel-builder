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
  public colorMode: 'classic' | 'side' | 'tension' = 'classic';
  public spokeThickness: number = 1.0; // Aero vs Heavy duty

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

  public setCameraPreset(preset: 'isometric' | 'lateral' | 'dish' | 'hub') {
    const duration = 800; // ms transition would be nice, but simple quick jump is robust
    switch (preset) {
      case 'isometric':
        this.camera.position.set(220, 220, 320);
        break;
      case 'lateral':
        this.camera.position.set(0, 0, 420);
        break;
      case 'dish':
        this.camera.position.set(420, 0, 0);
        break;
      case 'hub':
        this.camera.position.set(80, 80, 120);
        break;
    }
    this.controls.target.set(0, 0, 0);
    this.controls.update();
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
    // A modern aero, hook-bead, double-walled rim profile
    const rimR = erd / 2;
    const rimWidth = 14;  // Half width
    const rimDepth = 24;  // Rim depth

    // Define profile coordinates relative to (rimR, 0)
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(rimR - rimDepth, 0)); // inner spoke bed center
    points.push(new THREE.Vector2(rimR - rimDepth + 2, rimWidth - 4)); // sloping wall
    points.push(new THREE.Vector2(rimR - 4, rimWidth)); // outer hook shoulder
    points.push(new THREE.Vector2(rimR, rimWidth));     // hook bead top
    points.push(new THREE.Vector2(rimR, rimWidth - 1)); // inner channel drop
    points.push(new THREE.Vector2(rimR - 10, rimWidth - 2)); // center channel drop
    points.push(new THREE.Vector2(rimR - 10, -(rimWidth - 2))); // symmetric
    points.push(new THREE.Vector2(rimR, -(rimWidth - 1)));
    points.push(new THREE.Vector2(rimR, -rimWidth));
    points.push(new THREE.Vector2(rimR - 4, -rimWidth));
    points.push(new THREE.Vector2(rimR - rimDepth + 2, -(rimWidth - 4)));
    points.push(new THREE.Vector2(rimR - rimDepth, 0));

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
    // Exploded view separation shifts hub flanges apart laterally
    const expSeparation = this.explodedValue * 40.0;
    const zL = -centerToLeft + hubOffset - expSeparation;
    const zR = centerToRight + hubOffset + expSeparation;

    // We build the hub in pieces: Left Flange, Right Flange, Hub Shell Center, Freehub
    const hubShellGroup = new THREE.Group();

    // Flange geometries
    const fLRadius = flangePcdLeft / 2 + 4;
    const fRRadius = flangePcdRight / 2 + 4;

    const flangeLGeom = new THREE.CylinderGeometry(fLRadius, fLRadius, 3.5, 48);
    const flangeL = new THREE.Mesh(flangeLGeom, hubMat);
    flangeL.rotation.x = Math.PI / 2;
    flangeL.position.z = zL;
    hubShellGroup.add(flangeL);

    const flangeRGeom = new THREE.CylinderGeometry(fRRadius, fRRadius, 3.5, 48);
    const flangeR = new THREE.Mesh(flangeRGeom, hubMat);
    flangeR.rotation.x = Math.PI / 2;
    flangeR.position.z = zR;
    hubShellGroup.add(flangeR);

    // Hub center tube connecting flanges
    const centerTubeGeom = new THREE.CylinderGeometry(15, 15, Math.abs(zR - zL) - 4, 32);
    const centerTube = new THREE.Mesh(centerTubeGeom, hubMat);
    centerTube.rotation.x = Math.PI / 2;
    centerTube.position.z = (zL + zR) / 2;
    hubShellGroup.add(centerTube);

    // Freehub body (drive side driver)
    const fhGeom = new THREE.CylinderGeometry(18, 18, 28, 32);
    const freehub = new THREE.Mesh(fhGeom, freehubMat);
    freehub.rotation.x = Math.PI / 2;
    freehub.position.z = zR + 15.0; // projects further right
    hubShellGroup.add(freehub);

    // Disc brake mount (6-bolt flange on left)
    const discMountGeom = new THREE.CylinderGeometry(28, 28, 6, 6); // hexagonal/6-bolt aesthetic
    const discMount = new THREE.Mesh(discMountGeom, freehubMat);
    discMount.rotation.x = Math.PI / 2;
    discMount.position.z = zL - 4.5;
    hubShellGroup.add(discMount);

    this.scene.add(hubShellGroup);

    // --- 3. GENERATE SPOKES & NIPPLES ---
    const N = spokeCount;
    const Ns = N / 2; // spokes per side

    // Spoke diameter
    const spokeRad = 0.5 * this.spokeThickness;

    // Loop through sides
    const sides = [
      {
        sideName: 'Left' as const,
        show: this.showLeftSpokes,
        crosses: crossesLeft,
        fRadius: flangePcdLeft / 2,
        zFlange: zL,
        wEff: centerToLeft - hubOffset - rimShift - drillingOffsetLeft,
        rimZ: -rimShift - drillingOffsetLeft,
        colorHex: 0x3b82f6, // Blue
        flangeOffsetAngle: 0, // Left holes align with standard phase
        rimHoleIndices: (idx: number) => idx * 2 // even indices
      },
      {
        sideName: 'Right' as const,
        show: this.showRightSpokes,
        crosses: crossesRight,
        fRadius: flangePcdRight / 2,
        zFlange: zR,
        wEff: centerToRight + hubOffset + rimShift - drillingOffsetRight,
        rimZ: -rimShift + drillingOffsetRight,
        colorHex: 0xef4444, // Red
        flangeOffsetAngle: Math.PI / Ns, // staggered half-hole
        rimHoleIndices: (idx: number) => idx * 2 + 1 // odd indices
      }
    ];

    sides.forEach((s) => {
      if (!s.show) return;

      const fHolesCount = Ns;

      for (let j = 0; j < fHolesCount; j++) {
        // Flange Hole coordinates
        const flangeAngle = j * (2 * Math.PI / fHolesCount) + s.flangeOffsetAngle;
        const xF = s.fRadius * Math.cos(flangeAngle);
        const yF = s.fRadius * Math.sin(flangeAngle);
        const zF = s.zFlange;

        // Is it leading (even flange index) or trailing (odd flange index)?
        // Leading pulls clockwise, trailing pulls counter-clockwise.
        const isLeading = j % 2 === 0;
        const directionSign = isLeading ? 1.0 : -1.0;

        // Calculate mapped rim hole index
        // Angle offset γ = 720 * crosses / N
        const thetaAngle = (720.0 * s.crosses) / N;
        const thetaRad = thetaAngle * (Math.PI / 180.0);

        const rimHoleAngle = flangeAngle + directionSign * thetaRad;
        
        const xR_rim = rimR * Math.cos(rimHoleAngle);
        const yR_rim = rimR * Math.sin(rimHoleAngle);
        const zR_rim = s.rimZ;

        // Calculate J-bend geometry details: neck direction, elbow, head
        const sideDir = s.sideName === 'Right' ? 1.0 : -1.0;
        const isHeadsOut = j % 2 === 0;

        // Neck displacement
        const offsetDist = 1.8;
        const zHead = zF + (isHeadsOut ? -sideDir : sideDir) * offsetDist;
        const zElbow = zF + (isHeadsOut ? sideDir : -sideDir) * offsetDist;

        // Position vectors
        const startVec = new THREE.Vector3(xF, yF, zElbow); // Spoke shaft starts at the elbow!
        const endVec = new THREE.Vector3(xR_rim, yR_rim, zR_rim);

        // Vector math
        const spokeDir = new THREE.Vector3().subVectors(endVec, startVec);
        const spokeLength = spokeDir.length();
        spokeDir.normalize();

        // Create material
        let sColor = 0xbabac0; // titanium steel
        if (this.colorMode === 'side') {
          sColor = s.colorHex;
        } else if (this.colorMode === 'tension') {
          // Color based on bracing angle or tension balance
          // Higher tension = more red/orange, lower = blue
          if (s.sideName === 'Left') {
            sColor = s.wEff > sides[1].wEff ? 0x3b82f6 : 0x10b981; // Lower vs Balanced
          } else {
            sColor = sides[1].wEff > s.wEff ? 0xef4444 : 0x10b981; // Higher vs Balanced
          }
        }

        const spokeMaterial = new THREE.MeshStandardMaterial({
          color: sColor,
          roughness: 0.15,
          metalness: 0.9,
        });

        // 1. Spoke Neck (through the hub flange)
        const neckGeom = new THREE.CylinderGeometry(spokeRad, spokeRad, 2 * offsetDist, 8);
        neckGeom.rotateX(Math.PI / 2); // parallel to Z-axis
        const neckMesh = new THREE.Mesh(neckGeom, spokeMaterial);
        neckMesh.position.set(xF, yF, (zHead + zElbow) / 2);
        this.scene.add(neckMesh);

        // 2. Spoke Head (flat round cap on the outside/inside of flange)
        const headGeom = new THREE.CylinderGeometry(spokeRad * 1.8, spokeRad * 1.8, 0.8, 12);
        headGeom.rotateX(Math.PI / 2); // parallel to Z-axis
        const headMesh = new THREE.Mesh(headGeom, spokeMaterial);
        headMesh.position.set(xF, yF, zHead);
        this.scene.add(headMesh);

        // 3. Spoke Elbow (smooth curved 90 deg joint)
        const elbowGeom = new THREE.SphereGeometry(spokeRad * 1.1, 8, 8);
        const elbowMesh = new THREE.Mesh(elbowGeom, spokeMaterial);
        elbowMesh.position.set(xF, yF, zElbow);
        this.scene.add(elbowMesh);

        // 4. Spoke Shaft (cylinder from elbow to rim spoke bed)
        // Threaded end goes into the nipple body
        const shaftGeom = new THREE.CylinderGeometry(spokeRad, spokeRad, spokeLength, 8);
        shaftGeom.translate(0, spokeLength / 2, 0); // pivot at base

        const shaftMesh = new THREE.Mesh(shaftGeom, spokeMaterial);
        shaftMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spokeDir);
        shaftMesh.position.copy(startVec);

        // Store metadata on spoke for raycast hovers
        shaftMesh.userData = {
          side: s.sideName,
          index: j,
          isLeading,
          length: spokeLength - spokeHoleDiameter / 2,
          bracingAngle: Math.asin(s.wEff / spokeLength) * (180.0 / Math.PI),
          start: startVec,
          end: endVec,
        };

        this.scene.add(shaftMesh);
        this.spokeMeshes.push(shaftMesh);

        // --- ADD POLISHED BRASS NIPPLE SEATED ON THE RIM ---
        // High fidelity composite nipple with flared head inside the rim bed and barrel extending out
        const nippleGroup = new THREE.Group();

        // Nipple Head (resting in the rim spoke bed)
        const nHeadGeom = new THREE.CylinderGeometry(2.1, 2.1, 2.5, 12);
        const nHead = new THREE.Mesh(nHeadGeom, nippleMat);
        nHead.position.y = -1.25; // seats in the rim hole
        nippleGroup.add(nHead);

        // Nipple Barrel (extending down the spoke towards the hub)
        const nBodyGeom = new THREE.CylinderGeometry(1.6, 1.6, 8.0, 12);
        const nBody = new THREE.Mesh(nBodyGeom, nippleMat);
        nBody.position.y = -6.5; // extends towards hub
        nippleGroup.add(nBody);

        // Align the nipple group with the spoke vector
        const upVec = new THREE.Vector3(0, 1, 0);
        nippleGroup.quaternion.setFromUnitVectors(upVec, spokeDir);
        nippleGroup.position.copy(endVec);
        this.scene.add(nippleGroup);
      }
    });
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
    this.renderer.render(this.scene, this.camera);
  }
}
