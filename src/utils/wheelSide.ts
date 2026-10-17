export interface WheelSideContext { isRear?: boolean; discType?: '6-Bolt' | 'Centerlock' | 'None' }

export function wheelSideLabel(inputs: WheelSideContext, side: 'Left' | 'Right'): string {
  if (inputs.isRear !== false) return `${side} / ${side === 'Left' ? 'non-drive' : 'drive'}`;
  if (!inputs.discType || inputs.discType === 'None') return `${side} / front`;
  return `${side} / ${side === 'Left' ? 'disc' : 'non-disc'}`;
}
