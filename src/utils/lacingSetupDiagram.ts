import { guideWorldTurn, type GuideSetup } from './lacingGuide.ts';

/** Active-side projection, rotated so the valve is at the top. Distances are
 * enlarged for legibility; every hole angle comes from the shared spoke paths. */
export function lacingSetupDiagram(setup: GuideSetup): string {
  const facing = setup.first.side === 'Right' ? 1 : -1;
  const point = (angle: number, radius: number) => ({ x: 160 - facing * radius * Math.sin(angle - setup.valveAngle), y: 140 - radius * Math.cos(angle - setup.valveAngle) });
  const angleOf = (p: { x: number; y: number }) => Math.atan2(p.y, p.x);
  const referenceAngle = angleOf(setup.reference.hole);
  const first = point(angleOf(setup.first.hole), 58);
  const reference = point(referenceAngle, 58);
  const holes = setup.flangeHoles.map(p => {
    const at = point(angleOf(p.hole), 58);
    return `<circle cx="${at.x}" cy="${at.y}" r="3.5" fill="#0a0a0b" stroke="#94a3b8"/>`;
  }).join('');
  const turn = guideWorldTurn(setup.first.side, setup.direction);
  const sweep = setup.holeSteps * 2 * Math.PI / setup.flangeHoles.length;
  const arc = Array.from({ length: 49 }, (_, i) => point(referenceAngle + turn * sweep * i / 48, 82));
  const counts = Array.from({ length: setup.holeSteps }, (_, i) => {
    const p = point(referenceAngle + turn * (i + 1) * 2 * Math.PI / setup.flangeHoles.length, 101);
    return `<text x="${p.x}" y="${p.y + 4}" fill="#fbbf24" text-anchor="middle" font-size="20">${i + 1}</text>`;
  }).join('');
  return `<svg viewBox="0 0 320 225" role="img" aria-label="${setup.first.side} flange starting hole, viewed from the ${setup.viewingLabel} side with the valve at the top. Yellow dashed valve line, amber counting reference, cyan first spoke hole. ${setup.holeSteps ? `Count ${setup.holeSteps} ${setup.holeSteps === 1 ? 'position' : 'positions'} ${setup.direction}.` : 'Use the reference hole for the first spoke.'}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="setup-clockwise-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24"/></marker></defs>
    <circle cx="160" cy="140" r="70" fill="#20252d" stroke="#64748b"/>
    <circle cx="160" cy="140" r="19" fill="#0a0a0b" stroke="#64748b"/>
    <path d="M160 32 L160 140" stroke="#fde047" stroke-width="2" stroke-dasharray="5 4" data-lacing-target="alignment"/>
    <circle cx="160" cy="32" r="5" fill="#fde047" data-lacing-target="valve"/>
    <text x="160" y="17" text-anchor="middle" fill="#fde047" font-size="20">Valve direction</text>
    ${holes}
    ${setup.holeSteps ? `<polyline points="${arc.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#fbbf24" stroke-width="2" marker-end="url(#setup-clockwise-arrow)"/>${counts}` : ''}
    <circle cx="${reference.x}" cy="${reference.y}" r="8" fill="none" stroke="#fbbf24" stroke-width="2" data-lacing-target="${setup.referenceTarget}"/>
    <circle cx="${first.x}" cy="${first.y}" r="5" fill="#0a0a0b" stroke="#67e8f9" stroke-width="3" data-lacing-target="flange"/>
  </svg>`;
}
