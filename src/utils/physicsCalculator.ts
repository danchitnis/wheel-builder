export interface WheelBuildInputs {
  erd: number;                  // ERD in mm
  osb: number;                  // Offset Spoke Bed (asymmetrical rim offset) in mm
  drillingOffsetLeft: number;   // Left drilling offset in mm
  drillingOffsetRight: number;  // Right drilling offset in mm
  spokeCount: number;           // Total spoke count (e.g., 32, 28, 24)
  spokeHoleDiameter: number;    // Hub flange spoke hole diameter in mm (e.g., 2.6)
  flangeThickness?: number;     // Hub flange thickness in mm (optional, e.g. 3.0)
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
}

export interface SideCalculations {
  effectiveFlangeDistance: number; // W_eff in mm
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
    rimShift = osb; // moves spoke bed towards Left (Non-Drive Side)
  } else if (rimFlip === 'Right') {
    rimShift = -osb; // moves spoke bed towards Right (Drive Side)
  } else {
    // 'Auto' mode: align to maximize tension balance.
    // Standard dish is tighter on the right (drive side), so shifting left balances it.
    if (centerToLeft - hubOffset > centerToRight + hubOffset) {
      rimShift = osb; // shift Left
    } else {
      rimShift = -osb; // shift Right
    }
  }

  // 2. Compute effective center-to-flange axial distances (W_eff) in 3D
  // Hub offset (ho) moves the hub to the right (+ direction)
  // RimShift moves the rim spoke bed to the left (- direction)
  // Left drilling offset (oL) moves the left rim hole to the left (- direction)
  // Right drilling offset (oR) moves the right rim hole to the right (+ direction)
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
    // Safe-guard division by zero/invalid values
    const safeW = Math.max(0.1, wEff);

    // Theta angle (rotation angle between flange hole and rim hole in degrees)
    // γ = (720 * crosses) / spokeCount
    const thetaAngle = (720.0 * crosses) / spokeCount;
    const thetaRad = thetaAngle * (Math.PI / 180.0);

    // 2D projection distance (viewed side-on)
    const projectedLength2D = Math.sqrt(
      R * R + rf * rf - 2 * R * rf * Math.cos(thetaRad)
    );

    // Raw 3D distance from flange hole to rim hole
    const rawLength3D = Math.sqrt(
      projectedLength2D * projectedLength2D + safeW * safeW
    );

    // Final calculated spoke length (subtract half of flange spoke hole diameter)
    const calculatedSpokeLength = rawLength3D - spokeHoleDiameter / 2;

    // Bracing Angle α (angle between spoke and wheel center plane)
    // α = arcsin(W_eff / L_raw)
    const bracingAngleRad = Math.asin(Math.min(1.0, safeW / rawLength3D));
    const bracingAngle = bracingAngleRad * (180.0 / Math.PI);

    // Wrap Angle at Rim (angle in 2D between spoke line and radial line at rim)
    // cos(θ_wrap) = (R - rf * cos(γ)) / D2
    let wrapAngle = 0;
    if (projectedLength2D > 0) {
      const cosWrap = (R - rf * Math.cos(thetaRad)) / projectedLength2D;
      wrapAngle = Math.acos(Math.max(-1.0, Math.min(1.0, cosWrap))) * (180.0 / Math.PI);
    }

    // Total Angle at Rim (angle in 3D between spoke line and radial line at rim)
    // cos(θ_total) = (R - rf * cos(γ)) / L_raw
    const cosTotal = (R - rf * Math.cos(thetaRad)) / rawLength3D;
    const totalAngleAtRim = Math.acos(Math.max(-1.0, Math.min(1.0, cosTotal))) * (180.0 / Math.PI);

    // Flange Exit Angle (angle in 2D between spoke line and radial line at flange)
    // cos(θ_exit) = (R * cos(γ) - rf) / D2
    let flangeExitAngle = 0;
    if (projectedLength2D > 0) {
      const cosExit = (R * Math.cos(thetaRad) - rf) / projectedLength2D;
      flangeExitAngle = Math.acos(Math.max(-1.0, Math.min(1.0, cosExit))) * (180.0 / Math.PI);
    }

    // Total 3D Exit Bend Angle (deflection between axial neck axis and 3D spoke tension vector)
    // cos(θ_bend) = W_eff / L_raw
    const cosExit3D = Math.min(1.0, safeW / rawLength3D);
    const totalExitBendAngle = Math.acos(cosExit3D) * (180.0 / Math.PI);

    return {
      effectiveFlangeDistance: wEff,
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

  // 3. Tension distribution calculation
  // Force balance in the lateral direction: T_left * sin(α_left) = T_right * sin(α_right)
  // T_left * (W_left / L_left) = T_right * (W_right / L_right)
  // Tension in the spoke is proportional to the inverse of the lateral bracing projection:
  // Relative tension balance is inversely proportional to effective flange distance (W_eff)
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
