import { calculateWheelBuild, wheelGeometryValid, type WheelBuildInputs } from './physicsCalculator.ts';

export const sensitivityInputs = [
  ['erd', 'ERD'],
  ['flangePcdLeft', 'Left flange PCD'], ['flangePcdRight', 'Right flange PCD'],
  ['centerToLeft', 'Left centre-to-flange'], ['centerToRight', 'Right centre-to-flange'],
  ['spokeHoleDiameter', 'Hub-hole diameter'],
] as const;

export interface InputSensitivity {
  key: typeof sensitivityInputs[number][0];
  label: string;
  left: number | null;
  right: number | null;
}

/** Actual traditional-length changes for +1 mm, including Auto rim orientation. */
export function calculateInputSensitivity(inputs: WheelBuildInputs): InputSensitivity[] {
  const baseline = calculateWheelBuild(inputs);
  const valid = wheelGeometryValid(inputs, baseline);
  return sensitivityInputs.map(([key, label]) => {
    const perturbed = {...inputs, [key]: inputs[key] + 1};
    const result = calculateWheelBuild(perturbed);
    const available = valid && wheelGeometryValid(perturbed, result);
    return {key, label,
      left: available ? result.left.calculatedSpokeLength - baseline.left.calculatedSpokeLength : null,
      right: available ? result.right.calculatedSpokeLength - baseline.right.calculatedSpokeLength : null};
  });
}
