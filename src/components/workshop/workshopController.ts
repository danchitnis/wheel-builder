import { rims } from '../../data/rims';
import { hubs } from '../../data/hubs';
import { serializeConfiguration } from '../../utils/buildConfiguration';
import { buildAssembly, billOfMaterials, bomCsv, loadWorkshop, WORKSHOP_KEY, workshopSnapshot, workshopDefaults, resolveWorkshopWheel, parseStock, repeatability, reversal, dishOffset, profiles, type WorkshopSettings, type Assembly, type BomRow } from '../../utils/workshop';
import type { WorkshopViewer } from './WorkshopViewer';

export async function initWorkshop() {
  const el = <T extends HTMLElement = HTMLElement>(id:string)=>document.getElementById(id) as T;
  const input=(id:string)=>el<HTMLInputElement>(id);
  const select=(id:string)=>el<HTMLSelectElement>(id);
  const transferred=resolveWorkshopWheel(location.hash,()=>sessionStorage);
  const config=transferred.config;
  let raw:string|null=null;
  try{raw=localStorage.getItem(WORKSHOP_KEY);}catch{storageWarning();}
  let settings=loadWorkshop(raw,config);
  let assembly:Assembly = buildAssembly(config, settings);
  let rows:BomRow[]=[];
  let viewer:WorkshopViewer|undefined;
  let invalidStock=false;
  let selectedSku='';
  let reversed=false;
  let disposed=false;
  function storageWarning(){el('storage-status').hidden=false;el('storage-status').textContent='Local saving is unavailable. This page still works; workshop settings will last only while it remains open.';}
  const rim=rims.find(r=>r.id===config.rp),hub=hubs.find(h=>h.id===config.hp);
  el('wheel-name').textContent=`${rim ? `${rim.brand} ${rim.name}` : 'Custom rim'} / ${hub ? `${hub.brand} ${hub.name}` : 'Custom hub'}`;
  el('wheel-source').textContent=transferred.source;
  el('wheel-summary').textContent=`${config.spokeCount} spokes · ${config.spacing || 'spacing unspecified'} · ${config.rimWidthOuter ?? '?'} mm rim width`;
  el<HTMLAnchorElement>('builder-return').href='/#'+serializeConfiguration(config,false);
  if(transferred.error){el('import-error').hidden=false;el('import-error').textContent=transferred.error+' A saved or default wheel has been loaded.';}
  function fill(){
    select('profile').value=settings.profile;input('stock').value=settings.lengths.join(', ');
    select('dish-stop').value=settings.dishStopReach?.toString()??'';input('dish-allowance').value=String(settings.dishAllowance);select('dish-layout').value=settings.dishLayout;select('measurement').value=settings.mode;select('axle').value=settings.axle;
    input('hub-width').value=settings.hubWidth?.toString()??'';
    input('rim-diameter').value=settings.rimDiameter?.toString()??'';
    input('fit').value=String(settings.fit);
    for(const [id,key] of [['seat-left','seatLeft'],['seat-right','seatRight'],['projection','projection'],['lug-hole','dialLugHole'],['lug-thickness','dialLugThickness'],['lug-offset','dialLugOffset']] as const)input(id).value=settings[key]?.toString()??'';
    input('guide-rod').checked=settings.guideRod;
    input('readings').value=settings.readings;input('reverse-a').value=settings.reverseA;
    input('reverse-b').value=settings.reverseB;input('dish-gap').value=settings.dishGap;
    el<HTMLTextAreaElement>('observations').value=settings.observations;
  }
  function save(){try{localStorage.setItem(WORKSHOP_KEY,workshopSnapshot(settings,config));}catch{storageWarning();}}
  function calibration(){
    const r=repeatability(settings.readings),out=el<HTMLOutputElement>('repeat-result');
    out.classList.toggle('fail',!!r&&!r.passes);
    out.textContent=r ? `${r.count} readings · spread ${r.spread.toFixed(3)} mm · ${r.passes?'within':'outside'} 0.2 mm target. ${r.passes?'Repeatability only; check bias separately.':'Check seating, bracing and contact pressure; recalibrate.'}` : 'Enter at least three finite readings, separated by commas.';
    const finite=(v:string)=>v.trim()!==''&&Number.isFinite(Number(v));
    if(finite(settings.reverseA)&&finite(settings.reverseB)){
      const rev=reversal(+settings.reverseA,+settings.reverseB);
      el('reverse-result').textContent=`Stand bias ${rev.jigBias.toFixed(3)} mm · signed wheel offset ${rev.wheelOffset.toFixed(3)} mm. Adjust stand bias, then recheck.`;
    }else el('reverse-result').textContent='Enter both signed rim-centre readings.';
    el('dish-result').textContent=finite(settings.dishGap)&&+settings.dishGap>=0 ? `Estimated offset magnitude: ${dishOffset(+settings.dishGap).toFixed(3)} mm. Direction requires knowing which side was the reference.` : 'Enter a non-negative central gap with both feet seated.';
    el('offset-note').textContent=config.hubOffset ? `Intentional frame offset: ${config.hubOffset} mm. Do not chase zero dish. Confirm target direction from the frame specification; asymmetrical rim drilling alone is not a frame offset.` : 'Target: rim centred between hub seating faces. Asymmetric spoke beds do not change this reference.';
  }
  function choose(sku:string){
    selectedSku=sku;
    const row=rows.find(r=>r.sku===sku);if(!row)return;
    viewer?.select(row.ids);
    for(const tr of el('parts-body').querySelectorAll('tr')){
      tr.classList.toggle('selected',tr.dataset.sku===sku);
      tr.querySelector('button')?.setAttribute('aria-pressed',String(tr.dataset.sku===sku));
    }
    el('part-detail').textContent=`${row.name} · ${row.quantity} × ${row.dimensions}. ${row.spec}`;
  }
  function render(refit=false){
    assembly=buildAssembly(config,settings);
    reversed=false;input('lift-wheel').checked=false;el('reverse-wheel').setAttribute('aria-pressed','false');viewer?.setWheelPose(false,false);
    el('stand-explainer').hidden=settings.tool!=='stand';
    el('dish-explainer').hidden=settings.tool!=='dish';
    el('dish-layout-control').hidden=settings.tool!=='dish';
    el('dish-range-controls').hidden=settings.tool!=='dish';el('dish-stop-control').hidden=settings.dishLayout!=='straight';
    el('dish-stock-result').hidden=settings.tool!=='dish'||settings.dishLayout!=='angled';
    el('dish-stock-result').textContent=assembly.notes.find(n=>n.startsWith('Stock choice:'))??'No feasible bridge/arm combination from the entered stock list. See fit details below.';
    if(assembly.probe){const r=assembly.probe;el('probe-range').textContent=`${settings.dishLayout==='straight'?r.stopReach+' mm matched stops. ':''}Probe reach ${r.nominal.toFixed(1)} mm at setup; usable ${r.min}–${r.max} mm. Reserve ${r.inward.toFixed(1)} mm inward / ${r.outward.toFixed(1)} mm outward; target ±${r.allowance} mm.`;}
    el('dish-layout-note').textContent=settings.dishLayout==='angled'?'Two pictured 135° brackets join the bridge to full-length diagonal T-slot arms. When the arm ends reach the rim, printed caps seat against those ends. Otherwise sliding stops use the continuous arms and spare rail extends beyond the rim. M5 bolts and matching T-nuts secure both legs of each connector; verify actual bracket dimensions. Their bolts only secure the parts. Only the central M6 hub-face probe adjusts during measurement. Check equal contact lands before use.':'Use the same matched rim-stop pair across wheels that fit the shown probe travel. Only the central probe is adjusted and locked; stop height is chosen in reusable 20 mm steps, not printed to exact wheel dimensions.';
    el('release-note').textContent='Retract probes, remove the optional loose rod if needed, then lift, reverse and reseat the wheel. No QR cam or clamping nuts; leave the top-cap bolts untouched.';
    el('dial-settings').hidden=settings.mode!=='dials'||settings.tool!=='stand';
    if(invalidStock)assembly.errors.unshift('Enter one or more whole stock lengths (100–2000 mm), separated by commas. Preview retains the last valid stock list.');
    rows=billOfMaterials(assembly.parts);
    const printList=el('print-parts');printList.replaceChildren();
    for(const row of rows.filter(r=>r.kind==='pla')){const p=assembly.parts.find(p=>p.id===row.ids[0])!;const li=document.createElement('li');const name=document.createElement('strong');name.textContent=row.name+': ';li.append(name,`${p.print!.bed}. ${p.print!.supports} ${p.print!.accuracy}`);printList.append(li);}
    el('assembly-title').textContent=assembly.title;
    document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===settings.tool)));
    select('measurement').disabled=settings.tool==='dish';
    const p=profiles[settings.profile];
    el('profile-note').textContent=`${p.family} · ${p.bolt} hardware. Verify actual supplier slot dimensions; ${settings.profile} alone is not a connector standard.`;
    el('diameter-note').textContent=`${assembly.wheel.diameter.toFixed(1)} mm ${assembly.estimated?'estimated from ERD + twice rim depth; measure before ordering.':'user-measured outside diameter.'}`;
    const status=el('fit-status');status.replaceChildren();status.classList.toggle('invalid',assembly.errors.length>0);
    const strong=document.createElement('strong');strong.textContent=assembly.errors.length?'Fit needs attention — preview is provisional.':'Envelope and stock checks passed — physical fit and calibration still required.';status.append(strong);
    const ul=document.createElement('ul');for(const message of assembly.errors){const li=document.createElement('li');li.textContent=message;ul.append(li);}status.append(ul);
    if(assembly.estimated){const para=document.createElement('p');para.textContent='Estimated rim diameter: confirm the measured outside diameter before ordering components.';status.append(para);}
    const body=el('parts-body');body.replaceChildren();
    for(const row of rows){
      const tr=document.createElement('tr');tr.dataset.sku=row.sku;
      const td=document.createElement('td'),btn=document.createElement('button');btn.type='button';btn.className='part-button';btn.textContent=row.name;btn.setAttribute('aria-pressed','false');btn.addEventListener('click',()=>choose(row.sku));td.append(btn);tr.append(td);
      for(const text of [String(row.quantity),row.kind==='pla'?'PLA':row.kind,row.dimensions,row.spec]){const cell=document.createElement('td');cell.textContent=text;tr.append(cell);}body.append(tr);
    }
    el('part-count').textContent=`${rows.length} types / ${assembly.parts.length} pieces`;
    for(const [id,items] of [['assembly-steps',assembly.steps],['assembly-notes',assembly.notes]] as const){const list=el(id);list.replaceChildren();for(const text of items){const li=document.createElement('li');li.textContent=text;list.append(li);}}
    viewer?.update(assembly,refit);
    viewer?.showWheel(input('show-wheel').checked);viewer?.showDimensions(input('show-dimensions').checked);
    if(rows.some(r=>r.sku===selectedSku))choose(selectedSku);else{selectedSku='';el('part-detail').textContent='Select a component to see its dimensions and assembly specification.';}
    calibration();
  }
  fill();render();
  const numberOrNull=(id:string)=>input(id).value.trim()===''?null:input(id).valueAsNumber;
  function resetReadings(){settings.readings='';settings.reverseA='';settings.reverseB='';settings.dishGap='';for(const id of ['readings','reverse-a','reverse-b','dish-gap'])input(id).value='';}
  for(const id of ['dish-stop','dish-allowance','dish-layout','profile','stock','measurement','axle','hub-width','rim-diameter','fit','seat-left','seat-right','projection','guide-rod','lug-hole','lug-thickness','lug-offset']){
    el(id).addEventListener(id==='stock'?'input':'change',()=>{
      const lengths=parseStock(input('stock').value);invalidStock=!lengths;
      settings={...settings,profile:select('profile').value as WorkshopSettings['profile'],lengths:lengths??settings.lengths,
        dishStopReach:select('dish-stop').value?Number(select('dish-stop').value):null,dishAllowance:input('dish-allowance').valueAsNumber,dishLayout:select('dish-layout').value as WorkshopSettings['dishLayout'],mode:select('measurement').value as WorkshopSettings['mode'],axle:select('axle').value as WorkshopSettings['axle'],
        seatLeft:numberOrNull('seat-left'),seatRight:numberOrNull('seat-right'),projection:numberOrNull('projection'),guideRod:input('guide-rod').checked,dialLugHole:input('lug-hole').valueAsNumber,dialLugThickness:input('lug-thickness').valueAsNumber,dialLugOffset:input('lug-offset').valueAsNumber,hubWidth:numberOrNull('hub-width'),rimDiameter:numberOrNull('rim-diameter'),fit:input('fit').valueAsNumber};
      resetReadings();render(true);if(!invalidStock)save();
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button=>button.addEventListener('click',()=>{
    settings.tool=button.dataset.tool as WorkshopSettings['tool'];resetReadings();input('explode').value='0';viewer?.setExplode(0);render(true);save();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>viewer?.view(button.dataset.view!)));
  document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach(button=>button.addEventListener('click',()=>{
    const focus=button.dataset.focus==='measurement-mount'?(settings.mode==='dials'?'lateral-dial-bracket':'lateral-holder'):button.dataset.focus!;const row=rows.find(r=>r.sku.startsWith(focus));if(row){choose(row.sku);viewer?.focusParts(row.ids);el('viewer').scrollIntoView({block:'center',behavior:'smooth'});}
  }));
  input('lift-wheel').addEventListener('change',()=>viewer?.setWheelPose(input('lift-wheel').checked,reversed));
  el('reverse-wheel').addEventListener('click',()=>{reversed=!reversed;input('lift-wheel').checked=true;el('reverse-wheel').setAttribute('aria-pressed',String(reversed));viewer?.setWheelPose(true,reversed);});
  input('show-wheel').addEventListener('change',()=>viewer?.showWheel(input('show-wheel').checked));
  input('show-dimensions').addEventListener('change',()=>viewer?.showDimensions(input('show-dimensions').checked));
  input('explode').addEventListener('input',()=>viewer?.setExplode(input('explode').valueAsNumber));
  for(const[id,key]of [['readings','readings'],['reverse-a','reverseA'],['reverse-b','reverseB'],['dish-gap','dishGap'],['observations','observations']] as const){
    el(id).addEventListener('input',()=>{settings[key]=input(id).value;calibration();save();});
  }
  el('reset-settings').addEventListener('click',()=>{settings=workshopDefaults(config);invalidStock=false;fill();render(true);save();});
  el('export-csv').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([bomCsv(assembly)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`${settings.tool}-${settings.profile}-components.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  let printClosed:HTMLDetailsElement[]=[];
  const beforePrint=()=>{printClosed=[...document.querySelectorAll<HTMLDetailsElement>('.workshop details:not([open])')];printClosed.forEach(d=>d.open=true);};
  const afterPrint=()=>{printClosed.forEach(d=>d.open=false);};
  window.addEventListener('beforeprint',beforePrint);window.addEventListener('afterprint',afterPrint);
  el('print-spec').addEventListener('click',()=>window.print());
  const failViewer=()=>{viewer?.dispose();viewer=undefined;el('viewer-message').hidden=false;el('viewer-message').textContent='3D is unavailable in this browser. Dimensions, component lists, assembly instructions and calibration remain available below.';};
  el('viewer').addEventListener('viewer-lost',failViewer);
  window.addEventListener('pagehide',()=>{disposed=true;viewer?.dispose();window.removeEventListener('beforeprint',beforePrint);window.removeEventListener('afterprint',afterPrint);},{once:true});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  try{
    const {WorkshopViewer}=await import('./WorkshopViewer');
    if(disposed)return;
    viewer=new WorkshopViewer(el('viewer'),id=>{const row=rows.find(r=>r.ids.includes(id));if(row)choose(row.sku);});
    el('viewer-message').hidden=true;viewer.update(assembly,true);
    viewer.showWheel(input('show-wheel').checked);viewer.showDimensions(input('show-dimensions').checked);viewer.setExplode(input('explode').valueAsNumber);
    if(selectedSku)choose(selectedSku);
  }catch{failViewer();}
}
