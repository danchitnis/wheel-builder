export interface CadPoint {
  x: number;
  y: number;
}

export interface CadTheme {
  bg: string;
  gridMajor: string;
  gridMinor: string;
  axis: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  dimLine: string;
  dimTextBg: string;
}

export const defaultCadTheme: CadTheme = {
  bg: '#0a0a0b',
  gridMajor: '#1e2638',
  gridMinor: '#121824',
  axis: '#00f3ff',
  primary: '#38bdf8',
  secondary: '#f59e0b',
  accent: '#10b981',
  text: '#f3f4f6',
  dimLine: '#38bdf8',
  dimTextBg: '#0f172a',
};

/**
 * Draws a CAD technical grid background with coordinate crosshairs.
 */
export function drawCadGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  origin: CadPoint,
  scale: number,
  theme: CadTheme = defaultCadTheme
) {
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  // Minor grid step (e.g. 5mm)
  const minorStep = 5 * scale;
  // Major grid step (e.g. 20mm)
  const majorStep = 20 * scale;

  ctx.lineWidth = 1;

  // Minor grid
  if (minorStep > 4) {
    ctx.strokeStyle = theme.gridMinor;
    ctx.beginPath();
    
    // Vertical minor
    const startX = (origin.x % minorStep) - minorStep;
    for (let x = startX; x < width; x += minorStep) {
      ctx.moveTo(Math.floor(x) + 0.5, 0);
      ctx.lineTo(Math.floor(x) + 0.5, height);
    }
    
    // Horizontal minor
    const startY = (origin.y % minorStep) - minorStep;
    for (let y = startY; y < height; y += minorStep) {
      ctx.moveTo(0, Math.floor(y) + 0.5);
      ctx.lineTo(width, Math.floor(y) + 0.5);
    }
    ctx.stroke();
  }

  // Major grid
  ctx.strokeStyle = theme.gridMajor;
  ctx.beginPath();
  const startMajorX = (origin.x % majorStep) - majorStep;
  for (let x = startMajorX; x < width; x += majorStep) {
    ctx.moveTo(Math.floor(x) + 0.5, 0);
    ctx.lineTo(Math.floor(x) + 0.5, height);
  }
  const startMajorY = (origin.y % majorStep) - majorStep;
  for (let y = startMajorY; y < height; y += majorStep) {
    ctx.moveTo(0, Math.floor(y) + 0.5);
    ctx.lineTo(width, Math.floor(y) + 0.5);
  }
  ctx.stroke();

  // Draw Center Axis Crosshairs (Origin lines)
  ctx.strokeStyle = theme.axis;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  // Vertical axis (X = 0 center plane)
  ctx.moveTo(Math.floor(origin.x) + 0.5, 0);
  ctx.lineTo(Math.floor(origin.x) + 0.5, height);
  // Horizontal axis (Y = 0 center line)
  ctx.moveTo(0, Math.floor(origin.y) + 0.5);
  ctx.lineTo(width, Math.floor(origin.y) + 0.5);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

/**
 * Draws a CAD dimension line with arrows and a text badge.
 */
export function drawCadDimensionLine(
  ctx: CanvasRenderingContext2D,
  p1: CadPoint,
  p2: CadPoint,
  labelText: string,
  options: {
    offset?: number;          // Perpendicular offset distance in pixels
    color?: string;
    arrowSize?: number;
    extensionLines?: boolean;
    extLineStart1?: CadPoint;
    extLineStart2?: CadPoint;
  } = {}
) {
  const {
    offset = 0,
    color = '#38bdf8',
    arrowSize = 6,
    extensionLines = true,
    extLineStart1,
    extLineStart2,
  } = options;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;

  // Vector from p1 to p2
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) {
    ctx.restore();
    return;
  }

  const ux = dx / dist;
  const uy = dy / dist;

  // Normal vector (perpendicular)
  const nx = -uy;
  const ny = ux;

  // Shifted dimension line points
  const d1 = { x: p1.x + nx * offset, y: p1.y + ny * offset };
  const d2 = { x: p2.x + nx * offset, y: p2.y + ny * offset };

  // 1. Extension lines
  if (extensionLines) {
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([2, 2]);
    const s1 = extLineStart1 || p1;
    const s2 = extLineStart2 || p2;

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(d1.x + nx * (offset >= 0 ? 3 : -3), d1.y + ny * (offset >= 0 ? 3 : -3));
    ctx.moveTo(s2.x, s2.y);
    ctx.lineTo(d2.x + nx * (offset >= 0 ? 3 : -3), d2.y + ny * (offset >= 0 ? 3 : -3));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  // 2. Dimension line
  ctx.beginPath();
  ctx.moveTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.stroke();

  // 3. Arrows
  const drawArrow = (from: CadPoint, to: CadPoint) => {
    const adx = to.x - from.x;
    const ady = to.y - from.y;
    const len = Math.hypot(adx, ady);
    if (len < 1) return;
    const ax = adx / len;
    const ay = ady / len;

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ax * arrowSize + ay * (arrowSize * 0.4), to.y - ay * arrowSize - ax * (arrowSize * 0.4));
    ctx.lineTo(to.x - ax * arrowSize - ay * (arrowSize * 0.4), to.y - ay * arrowSize + ax * (arrowSize * 0.4));
    ctx.closePath();
    ctx.fill();
  };

  drawArrow(d2, d1);
  drawArrow(d1, d2);

  // 4. Label Badge
  if (labelText) {
    const midX = (d1.x + d2.x) / 2;
    const midY = (d1.y + d2.y) / 2;

    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    const textMetrics = ctx.measureText(labelText);
    const textWidth = textMetrics.width;
    const padX = 6;
    const padY = 3;
    const badgeW = textWidth + padX * 2;
    const badgeH = 16;

    // Draw pill background
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 4);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = defaultCadTheme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, midX, midY + 0.5);
  }

  ctx.restore();
}

/**
 * Draws a leader line with callout text.
 */
export function drawCadCallout(
  ctx: CanvasRenderingContext2D,
  target: CadPoint,
  label: string,
  options: {
    dirX?: number;
    dirY?: number;
    length?: number;
    color?: string;
  } = {}
) {
  const { dirX = 1, dirY = -1, length = 35, color = '#f59e0b' } = options;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;

  const elbow = {
    x: target.x + dirX * length * 0.7,
    y: target.y + dirY * length * 0.7,
  };
  const end = {
    x: elbow.x + (dirX >= 0 ? 25 : -25),
    y: elbow.y,
  };

  // Target dot
  ctx.beginPath();
  ctx.arc(target.x, target.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Leader lines
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Text
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f3f4f6';
  ctx.textAlign = dirX >= 0 ? 'left' : 'right';
  ctx.textBaseline = 'bottom';

  // Badge background for text
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  const tx = dirX >= 0 ? end.x + 4 : end.x - 4 - textWidth;
  ctx.roundRect(tx - 3, end.y - 14, textWidth + 6, 15, 3);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(label, dirX >= 0 ? end.x + 4 : end.x - 4, end.y - 2);

  ctx.restore();
}
