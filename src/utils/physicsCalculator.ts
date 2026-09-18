import type { RimAppearance } from '../data/rims';

export interface WheelBuildInputs extends RimAppearance {
  erd: number;                  // ERD in mm
  osb: number;                  // Offset Spoke Bed (asymmetrical rim offset) in mm
  drillingOffsetLeft: number;   // Left drilling offset in mm
  drillingOffsetRight: number;  // Right drilling offset in mm
  spokeCount: number;           // Total spoke count (e.g., 32, 28, 24)
  spokeHoleDiameter: number;    // Hub flange spoke hole diameter in mm (e.g., 2.6)
  flangeThickness?: number;     // Hub flange thickness in mm (optional, e.g. 3.0)
  flangeThicknessLeft?: number;
  flangeThicknessRight?: number;
  flangeOuterDiameterLeft?: number;
  flangeOuterDiameterRight?: number;
  spokeDiameter?: number;
  interlaced?: boolean;
  geometryProvenance?: string;
  hubOffset: number;            // Frame offset in mm (e.g., 0)
  rimFlip: 'Auto' | 'Left' | 'Right'; // Orientation of asymmetric rim spoke bed
  
  // Left side hub specs
  flangePcdLeft: number;        // dL (pitch circle diameter) in mm
  centerToLeft: number;         // wL (center-to-flange) in mm
  crossesLeft: number;          // xL (e.g., 3, 2, 1, 0 for radial)

  // Right side hub specs
  flangePcdRight: number;       // dR (pitch circle diameter) in mm
  centerToRight: number;        // wR (center-to-flange) in mm
  crossesRight: number;         // xR (e.g., 3, 2, 1, 0)

  // Component metadata for 3D/2D CAD rendering
  hubName?: string;
  spacing?: string;
  discType?: '6-Bolt' | 'Centerlock' | 'None';
  isRear?: boolean;
  rimWidthOuter?: number;
  rimWidthInner?: number;
  rimDepth?: number;
}

export interface SideCalculations {
  effectiveFlangeDistance: number; // W_eff in mm
  effectiveFlangeDistanceValid: boolean; // false when W_eff <= 0 (invalid input)
  thetaAngle: number;              // γ in degrees
  projectedLength2D: number;       // D2 in mm
  rawLength3D: number;             // L_raw in mm
  calculatedSpokeLength: number;   // L in mm
  bracingAngle: number;            // α in degrees
  wrapAngleAtRim: number;          // θ_wrap in degrees
  totalAngleAtRim: number;         // θ_total in degrees
  flangeExitAngle: number;         // θ_exit in degrees
  totalExitBendAngle: number;      // 3D deflection angle at flange exit in degrees
}

export interface WheelBuildCalculations {
  left: SideCalculations;
  right: SideCalculations;
  tensionRatioLeft: number;        // NDS relative tension %
  tensionRatioRight: number;       // DS relative tension %
}

/**
 * Calculates bicycle wheel geometry based on first-principles 3D vector physics.
 */
export function calculateWheelBuild(inputs: WheelBuildInputs): WheelBuildCalculations {
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

  // 1. Determine rim spoke bed lateral shift based on rim flip
  let rimShift = 0;
  if (rimFlip === 'Left') {
    rimShift = osb;
  } else if (rimFlip === 'Right') {
    rimShift = -osb;
  } else {
    if (centerToLeft - hubOffset > centerToRight + hubOffset) {
      rimShift = osb;
    } else {
      rimShift = -osb;
    }
  }

  // 2. Compute effective center-to-flange axial distances (W_eff) in 3D
  const wLeftEff = centerToLeft - hubOffset - rimShift - drillingOffsetLeft;
  const wRightEff = centerToRight + hubOffset + rimShift - drillingOffsetRight;

  const R = erd / 2;
  const rfL = flangePcdLeft / 2;
  const rfR = flangePcdRight / 2;

  // Helper for single-side calculation
  const calcSide = (
    rf: number,
    wEff: number,
    crosses: number
  ): SideCalculations => {
    const safeW = Math.max(0.1, wEff);

    const thetaAngle = (720.0 * crosses) / spokeCount;
    const thetaRad = thetaAngle * (Math.PI / 180.0);

    const projectedLength2D = Math.sqrt(
      R * R + rf * rf - 2 * R * rf * Math.cos(thetaRad)
    );

    const rawLength3D = Math.sqrt(
      projectedLength2D * projectedLength2D + safeW * safeW
    );

    const calculatedSpokeLength = rawLength3D - spokeHoleDiameter / 2;

    const bracingAngleRad = Math.asin(Math.min(1.0, safeW / rawLength3D));
    const bracingAngle = bracingAngleRad * (180.0 / Math.PI);

    let wrapAngle = 0;
    if (projectedLength2D > 0) {
      const cosWrap = (R - rf * Math.cos(thetaRad)) / projectedLength2D;
      wrapAngle = Math.acos(Math.max(-1.0, Math.min(1.0, cosWrap))) * (180.0 / Math.PI);
    }

    const cosTotal = (R - rf * Math.cos(thetaRad)) / rawLength3D;
    const totalAngleAtRim = Math.acos(Math.max(-1.0, Math.min(1.0, cosTotal))) * (180.0 / Math.PI);

    let flangeExitAngle = 0;
    if (projectedLength2D > 0) {
      const cosExit = (R * Math.cos(thetaRad) - rf) / projectedLength2D;
      flangeExitAngle = Math.acos(Math.max(-1.0, Math.min(1.0, cosExit))) * (180.0 / Math.PI);
    }

    const cosExit3D = Math.min(1.0, safeW / rawLength3D);
    const totalExitBendAngle = Math.acos(cosExit3D) * (180.0 / Math.PI);

    return {
      effectiveFlangeDistance: wEff,
      effectiveFlangeDistanceValid: wEff > 0,
      thetaAngle,
      projectedLength2D,
      rawLength3D,
      calculatedSpokeLength,
      bracingAngle,
      wrapAngleAtRim: wrapAngle,
      totalAngleAtRim,
      flangeExitAngle,
      totalExitBendAngle,
    };
  };

  const left = calcSide(rfL, wLeftEff, crossesLeft);
  const right = calcSide(rfR, wRightEff, crossesRight);

  let tensionRatioLeft = 100.0;
  let tensionRatioRight = 100.0;

  if (wLeftEff > 0 && wRightEff > 0) {
    if (wLeftEff > wRightEff) {
      tensionRatioLeft = (wRightEff / wLeftEff) * 100.0;
      tensionRatioRight = 100.0;
    } else if (wRightEff > wLeftEff) {
      tensionRatioRight = (wLeftEff / wRightEff) * 100.0;
      tensionRatioLeft = 100.0;
    }
  }

  return {
    left,
    right,
    tensionRatioLeft,
    tensionRatioRight,
  };
}
