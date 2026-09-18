import {
  drawCadGrid,
  drawCadDimensionLine,
  drawCadCallout,
  type CadTheme,
  defaultCadTheme,
} from '../utils/cadRenderer';

export interface HubCadData {
  flangePcdLeft: number;      // dL (mm)
  flangePcdRight: number;     // dR (mm)
  centerToLeft: number;       // wL (mm)
  centerToRight: number;      // wR (mm)
  spokeHoleDiameter: number;  // s (mm)
  flangeThicknessLeft?: number;
  flangeThicknessRight?: number;
  flangeOuterDiameterLeft?: number;
  flangeOuterDiameterRight?: number;
  flangeThickness: number;    // t (mm)
  hubOffset: number;          // ho (mm)
  brand?: string;
  name?: string;
  spacing?: string;
}

export class HubCadVisualizer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: HubCadData;
  private theme: CadTheme = defaultCadTheme;

  // Camera / Pan / Zoom
  private zoom: number = 1.0;
  private panX: number = 0;
  private panY: number = 0;

  // Drag interaction
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  constructor(container: HTMLElement, initialData: HubCadData) {
    this.container = container;
    this.data = initialData;

    // Create Canvas Element
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full block cursor-grab active:cursor-grabbing select-none';
    this.container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context for Hub CAD');
    this.ctx = context;

    this.initEvents();
    this.resize();
    this.render();
  }

  public updateData(newData: HubCadData) {
    this.data = { ...newData };
    this.render();
  }

  public resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.render();
  }

  public resetView() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.render();
  }

  private initEvents() {
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.4, Math.min(3.5, this.zoom * zoomFactor));
      
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.render();
    }, { passive: false });
  }

  public render() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Reset transform stack before drawing
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.scale(dpr, dpr);

    const cssW = w / dpr;
    const cssH = h / dpr;

    // Origin (Hub Center) in screen coordinates
    const originX = cssW / 2 + this.panX;
    const originY = cssH / 2 + 30 + this.panY;

    // Scale factor: pixels per mm
    const baseScale = Math.min(cssW, cssH) / 130;
    const scale = baseScale * this.zoom;

    // 1. Draw Grid
    drawCadGrid(this.ctx, cssW, cssH, { x: originX, y: originY }, scale, this.theme);

    // Hub Geometry inputs
    const {
      flangePcdLeft: dL,
      flangePcdRight: dR,
      centerToLeft: wL,
      centerToRight: wR,
      spokeHoleDiameter: s,
      flangeThickness: ft_mm = 3.0,
      hubOffset: ho,
    } = this.data;

    // Compute flange radii in mm
    const rL = dL / 2;
    const rR = dR / 2;
    const ftLeft = this.data.flangeThicknessLeft ?? ft_mm;
    const ftRight = this.data.flangeThicknessRight ?? ft_mm;
    const outerLeft = (this.data.flangeOuterDiameterLeft ?? (dL + 7)) / 2;
    const outerRight = (this.data.flangeOuterDiameterRight ?? (dR + 7)) / 2;

    // Flange Center Positions in CAD space
    const xL_mm = -wL + ho;
    const xR_mm = wR + ho;

    // Flange Outer and Inner Face X positions (straight vertical disc faces)
    const xL_outer_mm = xL_mm - ftLeft / 2;
    const xL_inner_mm = xL_mm + ftLeft / 2;

    const xR_inner_mm = xR_mm - ftRight / 2;
    const xR_outer_mm = xR_mm + ftRight / 2;

    // Convert mm to screen coords
    const toScreenX = (mmX: number) => originX + mmX * scale;
    const toScreenY = (mmY: number) => originY - mmY * scale;

    const xL_scr = toScreenX(xL_mm);
    const xR_scr = toScreenX(xR_mm);

    const xL_outer = toScreenX(xL_outer_mm);
    const xL_inner = toScreenX(xL_inner_mm);
    const xR_inner = toScreenX(xR_inner_mm);
    const xR_outer = toScreenX(xR_outer_mm);

    const xCenter_scr = toScreenX(0);

    // Axle width (default 142mm)
    let totalAxleWidth_mm = 142;
    if (this.data.spacing && this.data.spacing.includes('148')) totalAxleWidth_mm = 148;
    if (this.data.spacing && this.data.spacing.includes('110')) totalAxleWidth_mm = 110;
    if (this.data.spacing && this.data.spacing.includes('100')) totalAxleWidth_mm = 100;
    if (this.data.spacing && this.data.spacing.includes('135')) totalAxleWidth_mm = 135;

    const axleLeft_scr = toScreenX(-totalAxleWidth_mm / 2 + ho);
    const axleRight_scr = toScreenX(totalAxleWidth_mm / 2 + ho);

    // Radii for body and axle
    const bodyRadius_mm = 15; // hub central barrel radius
    const axleRadius_mm = 6;  // 12mm thru axle radius
    const flangeMargin_mm = 3.5; // margin above spoke hole center to outer flange rim

    // Y Screen coordinates
    const yL_top = toScreenY(outerLeft);
    const yR_top = toScreenY(outerRight);
    const yBarrel_top = toScreenY(bodyRadius_mm);

    const yL_bot = toScreenY(-(outerLeft));
    const yR_bot = toScreenY(-(outerRight));
    const yBarrel_bot = toScreenY(-bodyRadius_mm);

    // 2. Draw Hub Axle Tube
    const axleY1 = toScreenY(axleRadius_mm);
    const axleY2 = toScreenY(-axleRadius_mm);
    const axleHeight = axleY2 - axleY1;

    this.ctx.fillStyle = '#1e293b';
    this.ctx.strokeStyle = '#475569';
    this.ctx.lineWidth = 1.5;
    this.ctx.fillRect(axleLeft_scr, axleY1, axleRight_scr - axleLeft_scr, axleHeight);
    this.ctx.strokeRect(axleLeft_scr, axleY1, axleRight_scr - axleLeft_scr, axleHeight);

    // Axle End Caps
    this.ctx.fillStyle = '#334155';
    this.ctx.fillRect(axleLeft_scr - 6 * scale, toScreenY(10), 6 * scale, (10 - -10) * scale);
    this.ctx.strokeRect(axleLeft_scr - 6 * scale, toScreenY(10), 6 * scale, (10 - -10) * scale);

    this.ctx.fillRect(axleRight_scr, toScreenY(10), 6 * scale, (10 - -10) * scale);
    this.ctx.strokeRect(axleRight_scr, toScreenY(10), 6 * scale, (10 - -10) * scale);

    // 3. Draw Realistic Machined Hub Body with Straight Discs for Flanges (No artificial back angles)
    const shellGrad = this.ctx.createLinearGradient(0, toScreenY(rL), 0, toScreenY(-rL));
    shellGrad.addColorStop(0, '#38bdf8');
    shellGrad.addColorStop(0.15, '#1e293b');
    shellGrad.addColorStop(0.5, '#0f172a');
    shellGrad.addColorStop(0.85, '#1e293b');
    shellGrad.addColorStop(1, '#38bdf8');

    this.ctx.fillStyle = shellGrad;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 1.8;

    // Draw Symmetrical Hub Profile Path (Real straight flange discs + cylindrical barrel)
    this.ctx.beginPath();
    
    // Top Outline:
    this.ctx.moveTo(axleLeft_scr, yBarrel_top);
    this.ctx.lineTo(xL_outer, yBarrel_top);   // Outer step up to Left Flange
    this.ctx.lineTo(xL_outer, yL_top);        // Straight vertical outer face of Left Flange
    this.ctx.lineTo(xL_inner, yL_top);        // Top edge of Left Flange (thickness t)
    this.ctx.lineTo(xL_inner, yBarrel_top);   // Straight vertical inner face down to Central Barrel
    this.ctx.lineTo(xR_inner, yBarrel_top);   // Cylindrical central hub barrel
    this.ctx.lineTo(xR_inner, yR_top);        // Straight vertical inner face up to Right Flange
    this.ctx.lineTo(xR_outer, yR_top);        // Top edge of Right Flange (thickness t)
    this.ctx.lineTo(xR_outer, yBarrel_top);   // Straight vertical outer face down to barrel
    this.ctx.lineTo(axleRight_scr, yBarrel_top);

    // Bottom Outline (Mirror reflection):
    this.ctx.lineTo(axleRight_scr, yBarrel_bot);
    this.ctx.lineTo(xR_outer, yBarrel_bot);
    this.ctx.lineTo(xR_outer, yR_bot);        // Straight vertical outer face of Right Flange
    this.ctx.lineTo(xR_inner, yR_bot);        // Bottom edge of Right Flange
    this.ctx.lineTo(xR_inner, yBarrel_bot);   // Straight vertical inner face to barrel
    this.ctx.lineTo(xL_inner, yBarrel_bot);   // Cylindrical central hub barrel bottom
    this.ctx.lineTo(xL_inner, yL_bot);        // Straight vertical inner face down to Left Flange
    this.ctx.lineTo(xL_outer, yL_bot);        // Bottom edge of Left Flange
    this.ctx.lineTo(xL_outer, yBarrel_bot);   // Straight vertical outer face up to barrel
    this.ctx.lineTo(axleLeft_scr, yBarrel_bot);

    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // 4. Draw Pitch Circles & Spoke Holes
    const drawSpokeHole = (scrX: number, scrY: number, holeDia_mm: number) => {
      const holeRadius_px = (holeDia_mm / 2) * scale;
      this.ctx.save();
      this.ctx.fillStyle = '#0f172a';
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1.5;
      
      this.ctx.beginPath();
      this.ctx.arc(scrX, scrY, Math.max(2.5, holeRadius_px), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(scrX - holeRadius_px - 2, scrY);
      this.ctx.lineTo(scrX + holeRadius_px + 2, scrY);
      this.ctx.moveTo(scrX, scrY - holeRadius_px - 2);
      this.ctx.lineTo(scrX, scrY + holeRadius_px + 2);
      this.ctx.stroke();

      this.ctx.restore();
    };

    drawSpokeHole(xL_scr, toScreenY(rL), s);
    drawSpokeHole(xL_scr, toScreenY(-rL), s);
    drawSpokeHole(xR_scr, toScreenY(rR), s);
    drawSpokeHole(xR_scr, toScreenY(-rR), s);

    // Draw PCD Dashed Lines
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.globalAlpha = 0.5;
    this.ctx.setLineDash([4, 3]);

    this.ctx.beginPath();
    this.ctx.moveTo(xL_scr - 12 * scale, toScreenY(rL));
    this.ctx.lineTo(xL_scr + 12 * scale, toScreenY(rL));
    this.ctx.moveTo(xL_scr - 12 * scale, toScreenY(-rL));
    this.ctx.lineTo(xL_scr + 12 * scale, toScreenY(-rL));

    this.ctx.moveTo(xR_scr - 12 * scale, toScreenY(rR));
    this.ctx.lineTo(xR_scr + 12 * scale, toScreenY(rR));
    this.ctx.moveTo(xR_scr - 12 * scale, toScreenY(-rR));
    this.ctx.lineTo(xR_scr + 12 * scale, toScreenY(-rR));
    this.ctx.stroke();

    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = 1.0;

    // 5. Draw CAD Technical Dimension Lines
    // A. Center-to-Left Flange Distance wL
    drawCadDimensionLine(
      this.ctx,
      { x: xCenter_scr, y: toScreenY(0) },
      { x: xL_scr, y: toScreenY(0) },
      `wL: ${wL.toFixed(1)} mm`,
      {
        offset: 45 * scale,
        color: '#38bdf8',
        extLineStart1: { x: xCenter_scr, y: toScreenY(0) },
        extLineStart2: { x: xL_scr, y: yL_top },
      }
    );

    // B. Center-to-Right Flange Distance wR
    drawCadDimensionLine(
      this.ctx,
      { x: xCenter_scr, y: toScreenY(0) },
      { x: xR_scr, y: toScreenY(0) },
      `wR: ${wR.toFixed(1)} mm`,
      {
        offset: 45 * scale,
        color: '#f43f5e',
        extLineStart1: { x: xCenter_scr, y: toScreenY(0) },
        extLineStart2: { x: xR_scr, y: yR_top },
      }
    );

    // C. Left Flange PCD dL
    drawCadDimensionLine(
      this.ctx,
      { x: xL_scr, y: toScreenY(rL) },
      { x: xL_scr, y: toScreenY(-rL) },
      `dL: Ø ${dL.toFixed(1)} mm`,
      {
        offset: -35 * scale,
        color: '#38bdf8',
        extLineStart1: { x: xL_scr, y: toScreenY(rL) },
        extLineStart2: { x: xL_scr, y: toScreenY(-rL) },
      }
    );

    // D. Right Flange PCD dR
    drawCadDimensionLine(
      this.ctx,
      { x: xR_scr, y: toScreenY(rR) },
      { x: xR_scr, y: toScreenY(-rR) },
      `dR: Ø ${dR.toFixed(1)} mm`,
      {
        offset: 35 * scale,
        color: '#f43f5e',
        extLineStart1: { x: xR_scr, y: toScreenY(rR) },
        extLineStart2: { x: xR_scr, y: toScreenY(-rR) },
      }
    );

    // E. Flange Thickness Callout (t)
    drawCadDimensionLine(
      this.ctx,
      { x: xL_outer, y: yL_top },
      { x: xL_inner, y: yL_top },
      `tL: ${ftLeft.toFixed(1)} / tR: ${ftRight.toFixed(1)} mm`,
      {
        offset: 20 * scale,
        color: '#f59e0b',
        extLineStart1: { x: xL_outer, y: yL_top },
        extLineStart2: { x: xL_inner, y: yL_top },
      }
    );

    // F. Spoke Hole Diameter Callout
    drawCadCallout(
      this.ctx,
      { x: xL_scr, y: toScreenY(rL) },
      `Hole s: Ø ${s.toFixed(1)} mm`,
      {
        dirX: -1,
        dirY: -1,
        length: 32 * scale,
        color: '#f59e0b',
      }
    );

    // G. Overall Axle Spacing
    drawCadDimensionLine(
      this.ctx,
      { x: axleLeft_scr, y: toScreenY(-axleRadius_mm) },
      { x: axleRight_scr, y: toScreenY(-axleRadius_mm) },
      `Axle Spacing: ${totalAxleWidth_mm} mm`,
      {
        offset: -65 * scale,
        color: '#10b981',
        extLineStart1: { x: axleLeft_scr, y: toScreenY(-axleRadius_mm) },
        extLineStart2: { x: axleRight_scr, y: toScreenY(-axleRadius_mm) },
      }
    );

    // 6. Title & Info Overlay Badges
    this.ctx.save();
    this.ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    this.ctx.fillStyle = '#f3f4f6';
    
    const titleText = `2D CAD SECTION: ${this.data.brand || 'CUSTOM'} ${this.data.name || 'HUB'}`;
    this.ctx.fillText(titleText, 16, 24);

    this.ctx.font = '10px "JetBrains Mono", monospace';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText(`Scale: 1:${(1 / scale).toFixed(2)} • Thickness t: ${ft_mm.toFixed(1)}mm • Center Offset: ${ho.toFixed(1)}mm`, 16, 40);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillText('◀ NDS (NON-DRIVE SIDE)', 16, cssH - 16);

    this.ctx.fillStyle = '#f43f5e';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('DRIVE SIDE (DS) ▶', cssW - 16, cssH - 16);

    this.ctx.restore();

    // Restore top-level DPR save
    this.ctx.restore();
  }
}
