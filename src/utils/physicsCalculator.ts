import type { RimAppearance } from '../data/rims';
import type { NippleFitSettings } from './nippleFit.ts';

export interface WheelBuildInputs extends RimAppearance {
  nippleFit?: NippleFitSettings;
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
  tensionRatioLeft: number;        // Left relative tension %, NaN when unavailable
  tensionRatioRight: number;       // Right relative tension %, NaN when unavailable
  tensionRatioValid: boolean;
}

/** Signed lateral rim shift; shared by the calculator and schematic views. */
export function resolveRimShift(inputs: Pick<WheelBuildInputs, 'rimFlip' | 'osb' | 'centerToLeft' | 'centerToRight' | 'hubOffset'>): number {
  if (inputs.rimFlip === 'Left') return inputs.osb;
  if (inputs.rimFlip === 'Right') return -inputs.osb;
  return inputs.centerToLeft - inputs.hubOffset > inputs.centerToRight + inputs.hubOffset ? inputs.osb : -inputs.osb;
}

/** Traditional geometry validity, independent of optional detailed flange/path inputs. */
export function wheelGeometryValid(inputs: WheelBuildInputs, result: WheelBuildCalculations): boolean {
  const positive = [inputs.erd, inputs.spokeHoleDiameter, inputs.flangePcdLeft, inputs.flangePcdRight,
    inputs.centerToLeft, inputs.centerToRight];
  return positive.every(v => Number.isFinite(v) && v > 0) &&
    [inputs.osb, inputs.hubOffset, inputs.drillingOffsetLeft, inputs.drillingOffsetRight].every(Number.isFinite) &&
    Number.isInteger(inputs.spokeCount) && inputs.spokeCount >= 8 && inputs.spokeCount <= 64 && inputs.spokeCount % 4 === 0 &&
    [inputs.crossesLeft, inputs.crossesRight].every(v => Number.isInteger(v) && v >= 0 && v <= inputs.spokeCount / 8) &&
    inputs.erd > Math.max(inputs.flangePcdLeft, inputs.flangePcdRight) + inputs.spokeHoleDiameter &&
    [result.left, result.right].every(side => side.effectiveFlangeDistanceValid && Number.isFinite(side.rawLength3D) && side.calculatedSpokeLength > 0);
}

/**
 * Calculates bicycle wheel geometry based on first-principles 3D vector physics.
 */
export function calculateWheelBuild(inputs: WheelBuildInputs): WheelBuildCalculations {
  const {
    erd,
    drillingOffsetLeft,
    drillingOffsetRight,
    spokeCount,
    spokeHoleDiameter,
    hubOffset,
    flangePcdLeft,
    centerToLeft,
    crossesLeft,
    flangePcdRight,
    centerToRight,
    crossesRight,
  } = inputs;

  // 1. Determine rim spoke bed lateral shift based on rim flip
  const rimShift = resolveRimShift(inputs);

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

  const result: WheelBuildCalculations = {
    left,
    right,
    tensionRatioLeft: NaN,
    tensionRatioRight: NaN,
    tensionRatioValid: false,
  };
  if (wheelGeometryValid(inputs, result)) {
    // Equal numbers of spokes on each side: T_L sin(beta_L) = T_R sin(beta_R).
    // Use the raw flange-centre chord, before the hub-hole length deduction.
    const sinLeft = wLeftEff / left.rawLength3D, sinRight = wRightEff / right.rawLength3D;
    const normalizer = Math.max(sinLeft, sinRight);
    result.tensionRatioLeft = 100 * sinRight / normalizer;
    result.tensionRatioRight = 100 * sinLeft / normalizer;
    result.tensionRatioValid = true;
  }
  return result;
}
