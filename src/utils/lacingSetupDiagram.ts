import { guideWorldTurn, spokeOrientationText, type GuideSetup } from './lacingGuide.ts';

/** Active-side projection, rotated so the valve is at the top. Distances are
 * enlarged for legibility; every hole angle comes from the shared spoke paths. */
export function lacingSetupDiagram(setup: GuideSetup): string {
  const facing = setup.first.side === 'Right' ? 1 : -1;
  const point = (angle: number, radius: number) => ({ x: 160 - facing * radius * Math.sin(angle - setup.valveAngle), y: 140 - radius * Math.cos(angle - setup.valveAngle) });
  const angleOf = (p: { x: number; y: number }) => Math.atan2(p.y, p.x);
  const referenceAngle = angleOf(setup.reference.hole);
  const first = point(angleOf(setup.first.hole), 58);
  const rim = point(angleOf(setup.first.end), 108);
  const reference = point(referenceAngle, 58);
  const holes = setup.flangeHoles.map(p => {
    const at = point(angleOf(p.hole), 58);
    return `<circle cx="${at.x}" cy="${at.y}" r="3.5" fill="#0a0a0b" stroke="#94a3b8"/>`;
  }).join('');
  const turn = guideWorldTurn(setup.first.side, setup.direction);
  const sweep = setup.holeSteps * 2 * Math.PI / setup.flangeHoles.length;
  const arc = Array.from({ length: 49 }, (_, i) => point(referenceAngle + turn * sweep * i / 48, 82));
  const referenceDescription = setup.referenceAcrossHub ?
    `Amber ring: the opposite ${setup.reference.side.toLowerCase()} flange hole of installed spoke ${setup.referenceStep}, projected along the axle. Use the first staggered hole ${setup.direction} on the ${setup.first.side.toLowerCase()} flange.` :
    setup.holeSteps ? `Amber arrow: count ${setup.holeSteps} ${setup.holeSteps === 1 ? 'position' : 'positions'} ${setup.direction}.` : 'Use the reference hole for the first spoke.';
  const counts = Array.from({ length: setup.referenceAcrossHub ? 0 : setup.holeSteps }, (_, i) => {
    const p = point(referenceAngle + turn * (i + 1) * 2 * Math.PI / setup.flangeHoles.length, 101);
    return `<text x="${p.x}" y="${p.y + 4}" fill="#fbbf24" text-anchor="middle" font-size="20">${i + 1}</text>`;
  }).join('');
  return `<svg viewBox="0 0 320 270" role="img" aria-label="Intended assembled hub position. ${setup.first.side} flange starting hole, viewed from the ${setup.viewingLabel} side with the valve at the top. Yellow dashed valve line, amber counting reference, cyan first spoke hole. Cyan arrow traces the active spoke from hub to rim. ${spokeOrientationText(setup.first, setup.viewingLabel)} ${referenceDescription}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="setup-clockwise-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24"/></marker>
    <marker id="setup-spoke-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#67e8f9"/></marker></defs>
    <circle cx="160" cy="140" r="108" fill="none" stroke="#64748b" stroke-dasharray="3 4"/>
    <circle cx="160" cy="140" r="70" fill="#20252d" stroke="#64748b"/>
    <circle cx="160" cy="140" r="19" fill="#0a0a0b" stroke="#64748b"/>
    <path d="M160 32 L160 140" stroke="#fde047" stroke-width="2" stroke-dasharray="5 4" data-lacing-target="alignment"/>
    <circle cx="160" cy="32" r="5" fill="#fde047" data-lacing-target="valve"/>
    <text x="160" y="17" text-anchor="middle" fill="#fde047" font-size="20">Valve direction</text>
    ${holes}
    ${setup.holeSteps ? `<polyline points="${arc.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#fbbf24" stroke-width="2" marker-end="url(#setup-clockwise-arrow)"/>${counts}` : ''}
    <line x1="${first.x}" y1="${first.y}" x2="${rim.x}" y2="${rim.y}" stroke="#67e8f9" stroke-width="3" marker-end="url(#setup-spoke-arrow)"/>
    <circle cx="${rim.x}" cy="${rim.y}" r="6" fill="none" stroke="#67e8f9" stroke-width="2" data-lacing-target="rim"/>
    <circle cx="${reference.x}" cy="${reference.y}" r="8" fill="none" stroke="#fbbf24" stroke-width="2" ${setup.referenceAcrossHub ? 'stroke-dasharray="3 2"' : ''} data-lacing-target="${setup.referenceTarget}"/>
    <circle cx="${first.x}" cy="${first.y}" r="5" fill="#0a0a0b" stroke="#67e8f9" stroke-width="3" data-lacing-target="flange"/>
    ${setup.referenceAcrossHub ? `<text x="160" y="264" text-anchor="middle" fill="#fbbf24" font-size="12">Amber: opposite ${setup.reference.side.toLowerCase()} flange · spoke ${setup.referenceStep}</text>` : ''}
  </svg>`;
}

import type { GuideSpoke } from './lacingGuide.ts';
import type { Point3 } from './spokePath.ts';

/** Actual shaft geometry in the named outside view. Bridges indicate layering,
 * not simulated insertion movements or a guarantee of contact at each crossing. */
export function lacingSpokeDiagram(spoke: GuideSpoke, valveAngle: number, installed: GuideSpoke[], partner?: GuideSpoke): string {
  const radius = Math.hypot(spoke.path.end.x,spoke.path.end.y), scale = 112/radius;
  const facing = spoke.side === 'Right' ? 1 : -1;
  const project = (p: Point3) => ({x: 160-facing*scale*(p.y*Math.cos(valveAngle)-p.x*Math.sin(valveAngle)),
    y: 145-scale*(p.x*Math.cos(valveAngle)+p.y*Math.sin(valveAngle))});
  const coords = (points: Point3[]) => points.map(project).map(p => `${p.x},${p.y}`).join(' ');
  const color = (s: GuideSpoke) => s === spoke ? '#67e8f9' : s===partner ? '#6ee7b7' : '#fbbf24';
  const referenced = new Set([spoke,...(partner?[partner]:[])].flatMap(s=>s.crossings.map(c => c.other)));
  const background = installed.filter(s=>s.side===spoke.side).map(s =>
    `<polyline points="${coords(s.path.points)}" fill="none" stroke="${referenced.has(s)?'#fbbf24':'#64748b'}" stroke-width="1.5" opacity=".65"/>`).join('');
  const active = [spoke,...(partner?[partner]:[])];
  const line = active.map((s,i)=>{
    const h=project(s.path.hole),r=project(s.path.end),prefix=i?'b-':'';
    return `<polyline points="${coords([s.path.hole,...s.path.points])}" fill="none" stroke="${color(s)}" stroke-width="2.5"/>
      <circle cx="${h.x}" cy="${h.y}" r="4" fill="#141418" stroke="${color(s)}" data-lacing-target="${prefix}flange"/>
      <circle cx="${r.x}" cy="${r.y}" r="5" fill="#141418" stroke="${color(s)}" data-lacing-target="${prefix}rim"/>
      <text x="${r.x+8}" y="${r.y}" fill="${color(s)}" font-size="13">${i?'B':'A'}</text>`;
  }).join('');
  const crossings = active.flatMap((s,i)=>s.crossings.filter(c=>!i || c.other!==spoke).map(c=>({s,i,c}))).map(({s,i,c}) => {
    const at=project(c.point), top=c.towardOutside?s:c.other;
    const start=project(top.path.start), end=project(top.path.end);
    const length=Math.hypot(end.x-start.x,end.y-start.y), dx=(end.x-start.x)/length*5, dy=(end.y-start.y)/length*5;
    const segment=`x1="${at.x-dx}" y1="${at.y-dy}" x2="${at.x+dx}" y2="${at.y+dy}"`;
    return `<g data-lacing-target="${i?'b-':''}${c.target}"><circle cx="${at.x}" cy="${at.y}" r="7" fill="none" stroke="#fbbf24" stroke-dasharray="${c.outermost?'none':'2 2'}"/>
      <line ${segment} stroke="#141418" stroke-width="6"/><line ${segment} stroke="${color(top)}" stroke-width="2.5"/>
      <text x="${at.x+10}" y="${at.y-7}" fill="#fbbf24" stroke="#141418" stroke-width="2" paint-order="stroke" font-size="13">${i?'B':'A'}${c.number}</text></g>`;
  }).join('');
  const description = `${partner?`Pair ${Math.floor(spoke.sequenceIndex/2)+1}. A heads-out, B heads-in. B flange hole ${partner.flangeHoleIndex} to rim hole ${partner.rimHoleIndex}. ${partner.orientationText} ${partner.crossings.map(c=>c.description).join(' ')}. `:''}Intended positions, not insertion movements. Spoke ${spoke.sequenceIndex+1}, group ${spoke.group}, viewed from the ${spoke.viewingLabel} side. Flange hole ${spoke.flangeHoleIndex} to rim hole ${spoke.rimHoleIndex}. ${spoke.headsDir}. Spoke length ${Math.round(spoke.length)} mm. ${spoke.orientationText} ${spoke.pattern} ${spoke.crossings.map(c=>c.description).join(' ')}`;
  return `<svg viewBox="0 0 320 285" role="img" aria-label="${description}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="route-spoke-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#67e8f9"/></marker></defs>
    <circle cx="160" cy="145" r="112" fill="none" stroke="#64748b"/>
    <circle cx="160" cy="145" r="${Math.hypot(spoke.path.hole.x,spoke.path.hole.y)*scale}" fill="#20252d" stroke="#64748b"/>
    <path d="M160 33 L160 145" stroke="#fde047" stroke-dasharray="4 4" opacity=".5"/>
    <circle cx="160" cy="33" r="4" fill="#fde047" data-lacing-target="valve"/>
    <text x="160" y="16" text-anchor="middle" fill="#fde047" font-size="12">Valve</text>
    ${background}${line}${crossings}
    <text x="160" y="280" text-anchor="middle" fill="#fbbf24" font-size="11">${spoke.crosses===0?'Radial: no crossings':spoke.crossings.length?'Numbered crossings: follow hub → rim':'Position both spokes before attaching nipples'}</text>
  </svg>`;
}
