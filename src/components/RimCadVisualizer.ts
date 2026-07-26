import {
  drawCadGrid,
  drawCadDimensionLine,
  drawCadCallout,
  type CadTheme,
  defaultCadTheme,
} from '../utils/cadRenderer';

export interface RimCadData {
  erd: number;                  // ERD in mm
  osb: number;                  // Offset Spoke Bed in mm
  drillingOffsetLeft: number;   // Left drilling offset in mm
  drillingOffsetRight: number;  // Right drilling offset in mm
  rimWidthOuter?: number;       // Outer width in mm
  rimWidthInner?: number;       // Inner well width in mm
  rimDepth?: number;            // Profile depth in mm
  rimFlip: 'Auto' | 'Left' | 'Right';
  brand?: string;
  name?: string;
  category?: string;
}

export class RimCadVisualizer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: RimCadData;
  private theme: CadTheme = defaultCadTheme;

  // Camera / Pan / Zoom
  private zoom: number = 1.0;
  private panX: number = 0;
  private panY: number = 0;

  // Drag interaction
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  constructor(container: HTMLElement, initialData: RimCadData) {
    this.container = container;
    this.data = initialData;

    // Create Canvas Element
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full block cursor-grab active:cursor-grabbing select-none';
    this.container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context for Rim CAD');
    this.ctx = context;

    this.initEvents();
    this.resize();
    this.render();
  }

  public updateData(newData: RimCadData) {
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

    // Reset matrix transform stack to prevent scaling accumulation
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.scale(dpr, dpr);

    const cssW = w / dpr;
    const cssH = h / dpr;

    // Origin (Rim Centerline at Spoke Bed Level) in screen coordinates
    const originX = cssW / 2 + this.panX;
    const originY = cssH / 2 + 20 + this.panY;

    // Scale factor: pixels per mm
    const baseScale = Math.min(cssW, cssH) / 75;
    const scale = baseScale * this.zoom;

    // 1. Draw Grid
    drawCadGrid(this.ctx, cssW, cssH, { x: originX, y: originY }, scale, this.theme);

    const {
      erd,
      osb,
      drillingOffsetLeft: oL,
      drillingOffsetRight: oR,
      rimWidthOuter = 22.5,
      rimWidthInner = 17.5,
      rimDepth = 15.5,
      rimFlip,
    } = this.data;

    // Effective shift of spoke bed based on rim flip
    let rimShift = 0;
    if (rimFlip === 'Left') rimShift = osb;
    else if (rimFlip === 'Right') rimShift = -osb;
    else rimShift = osb; // default auto left shift

    // Convert mm to screen
    const toScreenX = (mmX: number) => originX + mmX * scale;
    const toScreenY = (mmY: number) => originY - mmY * scale;

    const wallThickness = 2.0;

    const xOuterLeft = -rimWidthOuter / 2;
    const xOuterRight = rimWidthOuter / 2;
    const xInnerLeft = -rimWidthInner / 2;
    const xInnerRight = rimWidthInner / 2;

    // Asymmetric Spoke Bed Center Line (mm)
    const xSpokeBedCenter_mm = -rimShift;
    const xSpokeBedCenter_scr = toScreenX(xSpokeBedCenter_mm);

    // Left and Right drilling hole positions (mm)
    const xHoleLeft_mm = xSpokeBedCenter_mm - oL;
    const xHoleRight_mm = xSpokeBedCenter_mm + oR;

    const xHoleLeft_scr = toScreenX(xHoleLeft_mm);
    const xHoleRight_scr = toScreenX(xHoleRight_mm);

    // 2. Draw Rim Profile Section (Double-Walled Extrusion Profile)
    const yNippleSeat = 0;
    const yAeroTip = -rimDepth;
    const yTireBed = 7.0;
    const yBeadTop = 13.0;

    // Gradient fill for Carbon/Alloy Rim extrusion
    const rimGrad = this.ctx.createLinearGradient(0, toScreenY(yBeadTop), 0, toScreenY(yAeroTip));
    rimGrad.addColorStop(0, '#1e293b');
    rimGrad.addColorStop(0.3, '#334155');
    rimGrad.addColorStop(0.7, '#0f172a');
    rimGrad.addColorStop(1, '#020617');

    this.ctx.fillStyle = rimGrad;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 1.8;

    // Outer Boundary Path
    this.ctx.beginPath();
    this.ctx.moveTo(toScreenX(xOuterLeft), toScreenY(yBeadTop));
    this.ctx.lineTo(toScreenX(xInnerLeft), toScreenY(yBeadTop));
    this.ctx.lineTo(toScreenX(xInnerLeft), toScreenY(yTireBed + 1.5));
    this.ctx.lineTo(toScreenX(-5), toScreenY(yTireBed));
    this.ctx.lineTo(toScreenX(5), toScreenY(yTireBed));
    this.ctx.lineTo(toScreenX(xInnerRight), toScreenY(yTireBed + 1.5));
    this.ctx.lineTo(toScreenX(xInnerRight), toScreenY(yBeadTop));
    this.ctx.lineTo(toScreenX(xOuterRight), toScreenY(yBeadTop));

    this.ctx.lineTo(toScreenX(xOuterRight + 0.8), toScreenY(yTireBed));
    this.ctx.quadraticCurveTo(
      toScreenX(xOuterRight),
      toScreenY(yAeroTip * 0.6),
      toScreenX(xSpokeBedCenter_mm + (xOuterRight - xSpokeBedCenter_mm) * 0.35),
      toScreenY(yAeroTip)
    );
    this.ctx.lineTo(
      toScreenX(xSpokeBedCenter_mm - (xOuterRight - xSpokeBedCenter_mm) * 0.35),
      toScreenY(yAeroTip)
    );
    this.ctx.quadraticCurveTo(
      toScreenX(xOuterLeft),
      toScreenY(yAeroTip * 0.6),
      toScreenX(xOuterLeft - 0.8),
      toScreenY(yTireBed)
    );
    this.ctx.closePath();

    this.ctx.fill();
    this.ctx.stroke();

    // Inner Cavity Hollow Void (Air Chamber)
    this.ctx.fillStyle = '#0a0a0b';
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 1.2;

    this.ctx.beginPath();
    this.ctx.moveTo(toScreenX(xInnerLeft + wallThickness), toScreenY(yTireBed - wallThickness));
    this.ctx.lineTo(toScreenX(xInnerRight - wallThickness), toScreenY(yTireBed - wallThickness));
    this.ctx.lineTo(toScreenX(xOuterRight - wallThickness * 1.5), toScreenY(yAeroTip * 0.5));
    this.ctx.lineTo(toScreenX(xOuterLeft + wallThickness * 1.5), toScreenY(yAeroTip * 0.5));
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // 3. Draw Asymmetric Spoke Bed Center Line & Drilling Holes
    this.ctx.strokeStyle = '#f59e0b';
    this.ctx.lineWidth = 1.2;
    this.ctx.setLineDash([4, 3]);

    this.ctx.beginPath();
    this.ctx.moveTo(xSpokeBedCenter_scr, toScreenY(yBeadTop + 10));
    this.ctx.lineTo(xSpokeBedCenter_scr, toScreenY(yAeroTip - 15));
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw Nipples and Spoke Exit Vectors
    const drawNippleAndSpoke = (
      scrX: number,
      scrY: number,
      label: string,
      color: string,
      angleDeg: number
    ) => {
      this.ctx.save();
      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1;

      const nipW = 4 * scale;
      const nipH = 8 * scale;

      this.ctx.fillRect(scrX - nipW / 2, scrY - nipH / 2, nipW, nipH);
      this.ctx.strokeRect(scrX - nipW / 2, scrY - nipH / 2, nipW, nipH);

      const angleRad = (angleDeg * Math.PI) / 180;
      const spokeLen = 60 * scale;
      const endX = scrX + Math.sin(angleRad) * spokeLen;
      const endY = scrY + Math.cos(angleRad) * spokeLen;

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.moveTo(scrX, scrY + nipH / 2);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    };

    drawNippleAndSpoke(xHoleLeft_scr, toScreenY(yAeroTip), 'NDS Spoke', '#38bdf8', -12);
    drawNippleAndSpoke(xHoleRight_scr, toScreenY(yAeroTip), 'DS Spoke', '#f43f5e', 14);

    // 4. ERD Reference Line
    this.ctx.strokeStyle = '#f59e0b';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([6, 4]);

    const erdY_scr = toScreenY(yNippleSeat);
    this.ctx.beginPath();
    this.ctx.moveTo(toScreenX(xOuterLeft - 15), erdY_scr);
    this.ctx.lineTo(toScreenX(xOuterRight + 15), erdY_scr);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // 5. Draw CAD Technical Dimension Lines
    if (Math.abs(osb) > 0.01) {
      drawCadDimensionLine(
        this.ctx,
        { x: originX, y: toScreenY(yBeadTop + 15) },
        { x: xSpokeBedCenter_scr, y: toScreenY(yBeadTop + 15) },
        `OSB: ${osb.toFixed(1)} mm`,
        {
          offset: 0,
          color: '#f59e0b',
          extLineStart1: { x: originX, y: toScreenY(yBeadTop) },
          extLineStart2: { x: xSpokeBedCenter_scr, y: toScreenY(yBeadTop) },
        }
      );
    }

    if (oL > 0.1) {
      drawCadDimensionLine(
        this.ctx,
        { x: xSpokeBedCenter_scr, y: toScreenY(yAeroTip - 20) },
        { x: xHoleLeft_scr, y: toScreenY(yAeroTip - 20) },
        `oL: ${oL.toFixed(1)} mm`,
        { offset: 0, color: '#38bdf8' }
      );
    }

    if (oR > 0.1) {
      drawCadDimensionLine(
        this.ctx,
        { x: xSpokeBedCenter_scr, y: toScreenY(yAeroTip - 20) },
        { x: xHoleRight_scr, y: toScreenY(yAeroTip - 20) },
        `oR: ${oR.toFixed(1)} mm`,
        { offset: 0, color: '#f43f5e' }
      );
    }

    drawCadCallout(
      this.ctx,
      { x: toScreenX(xOuterRight + 10), y: erdY_scr },
      `ERD Nipple Bed Ref: ${erd.toFixed(1)} mm`,
      {
        dirX: 1,
        dirY: -1,
        length: 35 * scale,
        color: '#f59e0b',
      }
    );

    // Outer Width Dimension
    drawCadDimensionLine(
      this.ctx,
      { x: toScreenX(xOuterLeft), y: toScreenY(yBeadTop) },
      { x: toScreenX(xOuterRight), y: toScreenY(yBeadTop) },
      `Outer Width: ${rimWidthOuter.toFixed(1)} mm`,
      {
        offset: 35 * scale,
        color: '#10b981',
        extLineStart1: { x: toScreenX(xOuterLeft), y: toScreenY(yBeadTop) },
        extLineStart2: { x: toScreenX(xOuterRight), y: toScreenY(yBeadTop) },
      }
    );

    // Inner Width Dimension
    drawCadDimensionLine(
      this.ctx,
      { x: toScreenX(xInnerLeft), y: toScreenY(yTireBed) },
      { x: toScreenX(xInnerRight), y: toScreenY(yTireBed) },
      `Inner: ${rimWidthInner.toFixed(1)} mm`,
      {
        offset: -20 * scale,
        color: '#38bdf8',
        extLineStart1: { x: toScreenX(xInnerLeft), y: toScreenY(yTireBed) },
        extLineStart2: { x: toScreenX(xInnerRight), y: toScreenY(yTireBed) },
      }
    );

    // Depth Dimension
    drawCadDimensionLine(
      this.ctx,
      { x: toScreenX(xOuterLeft), y: toScreenY(yBeadTop) },
      { x: toScreenX(xOuterLeft), y: toScreenY(yAeroTip) },
      `Depth: ${rimDepth.toFixed(1)} mm`,
      {
        offset: -25 * scale,
        color: '#38bdf8',
        extLineStart1: { x: toScreenX(xOuterLeft), y: toScreenY(yBeadTop) },
        extLineStart2: { x: toScreenX(xOuterLeft), y: toScreenY(yAeroTip) },
      }
    );

    // 6. Header & Badges Overlay
    this.ctx.save();
    this.ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    this.ctx.fillStyle = '#f3f4f6';

    const titleText = `2D CAD SECTION: ${this.data.brand || 'CUSTOM'} ${this.data.name || 'RIM'}`;
    this.ctx.fillText(titleText, 16, 24);

    this.ctx.font = '10px "JetBrains Mono", monospace';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText(`ERD: ${erd.toFixed(1)}mm • Profile: ${rimWidthOuter.toFixed(1)}×${rimDepth.toFixed(1)}mm (Inner: ${rimWidthInner.toFixed(1)}mm) • OSB: ${osb.toFixed(1)}mm`, 16, 40);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillText('◀ NDS (LEFT)', 16, cssH - 16);

    this.ctx.fillStyle = '#f43f5e';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('DRIVE SIDE (DS) ▶', cssW - 16, cssH - 16);

    this.ctx.restore();

    // Restore top-level DPR save
    this.ctx.restore();
  }
}
