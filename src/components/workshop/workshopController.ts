import { rims } from '../../data/rims';
import { hubs } from '../../data/hubs';
import { serializeConfiguration } from '../../utils/buildConfiguration';
import { buildAssembly, billOfMaterials, bomCsv, loadWorkshop, WORKSHOP_KEY, workshopSnapshot, workshopDefaults, resolveWorkshopWheel, parseStock, profiles, type WorkshopSettings, type Assembly, type BomRow } from '../../utils/workshop';
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
    input('dish-allowance').value=String(settings.dishAllowance);select('measurement').value=settings.mode;select('axle').value=settings.axle;
    input('hub-width').value=settings.hubWidth?.toString()??'';
    input('rim-diameter').value=settings.rimDiameter?.toString()??'';
    input('fit').value=String(settings.fit);
    for(const [id,key] of [['seat-left','seatLeft'],['seat-right','seatRight'],['projection','projection'],['lug-hole','dialLugHole'],['lug-thickness','dialLugThickness'],['lug-offset','dialLugOffset']] as const)input(id).value=settings[key]?.toString()??'';
    input('guide-rod').checked=settings.guideRod;

  }
  function save(){try{localStorage.setItem(WORKSHOP_KEY,workshopSnapshot(settings,config));}catch{storageWarning();}}
  function choose(sku:string){
    selectedSku=sku;
    const row=rows.find(r=>r.sku===sku);if(!row)return;
    viewer?.select(row.ids);
    for(const tr of el('parts-body').querySelectorAll('tr')){
      tr.classList.toggle('selected',tr.dataset.sku===sku);
      tr.querySelector('button')?.setAttribute('aria-pressed',String(tr.dataset.sku===sku));
    }
    const part=assembly.parts.find(p=>p.id===row.ids[0]);
    const print=part?.print;
    el('part-detail').textContent=`${row.name} · ${row.quantity} × ${row.dimensions}. ${row.spec}${print ? ` Print: ${print.bed}. ${print.supports}` : ''}`;
  }
  function render(refit=false){
    assembly=buildAssembly(config,settings);
    reversed=false;input('lift-wheel').checked=false;el('reverse-wheel').setAttribute('aria-pressed','false');viewer?.setWheelPose(false,false);
    el('stand-explainer').hidden=settings.tool!=='stand';
    el('dish-explainer').hidden=settings.tool!=='dish';
    el('dish-model-details').hidden=settings.tool!=='dish';
    el('dish-range-controls').hidden=settings.tool!=='dish';
    el('stand-stock-control').hidden=settings.tool==='dish';el('stand-stock-help').hidden=settings.tool==='dish';
    el('dish-stock-result').hidden=settings.tool!=='dish';
    el('dish-stock-result').textContent='Fixed stock: 300 mm + 100 mm + 100 mm (500 mm total).';
    if(assembly.probe){const r=assembly.probe;el('probe-range').textContent=`Probe 1 reach ${r.nominal.toFixed(1)} mm; usable ${r.min}–${r.max} mm. Reserve ${r.inward.toFixed(1)} mm inward / ${r.outward.toFixed(1)} mm outward.`;}
    input('lift-wheel').title='Retract the probes before lifting or reversing the wheel.';
    el('dial-settings').hidden=settings.mode!=='dials'||settings.tool!=='stand';
    if(invalidStock&&settings.tool==='stand')assembly.errors.unshift('Enter one or more whole stock lengths (100–2000 mm), separated by commas. Preview retains the last valid stock list.');
    const rodRequired=assembly.hubSupport?.rodRequired===true;
    input('guide-rod').checked=rodRequired||settings.guideRod;
    input('guide-rod').disabled=rodRequired;
    el('guide-rod-label').textContent=rodRequired?'Support rod + matched spacers required (minimum upright spacing)':'Optional loose guide rod (no clamping)';
    rows=billOfMaterials(assembly.parts);
    el('assembly-title').textContent=assembly.title;
    document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===settings.tool)));
    select('measurement').disabled=settings.tool==='dish';
    const p=profiles[settings.profile];
    el('profile-note').textContent=`${p.family} · M5 hardware for pictured connectors; ${p.bolt} for other profile fixings. Verify actual supplier slot dimensions; ${settings.profile} alone is not a connector standard.`;
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
    viewer?.update(assembly,refit);
    viewer?.showWheel(input('show-wheel').checked);viewer?.showDimensions(input('show-dimensions').checked);
    if(rows.some(r=>r.sku===selectedSku))choose(selectedSku);else{selectedSku='';el('part-detail').textContent='Select a component to see its dimensions and assembly specification.';}
  }
  fill();render();
  const numberOrNull=(id:string)=>input(id).value.trim()===''?null:input(id).valueAsNumber;
  for(const id of ['dish-allowance','profile','stock','measurement','axle','hub-width','rim-diameter','fit','seat-left','seat-right','projection','guide-rod','lug-hole','lug-thickness','lug-offset']){
    el(id).addEventListener(id==='stock'?'input':'change',()=>{
      const lengths=parseStock(input('stock').value);invalidStock=!lengths;
      settings={...settings,profile:select('profile').value as WorkshopSettings['profile'],lengths:lengths??settings.lengths,
        dishAllowance:input('dish-allowance').valueAsNumber,mode:select('measurement').value as WorkshopSettings['mode'],axle:select('axle').value as WorkshopSettings['axle'],
        seatLeft:numberOrNull('seat-left'),seatRight:numberOrNull('seat-right'),projection:numberOrNull('projection'),guideRod:input('guide-rod').disabled?settings.guideRod:input('guide-rod').checked,dialLugHole:input('lug-hole').valueAsNumber,dialLugThickness:input('lug-thickness').valueAsNumber,dialLugOffset:input('lug-offset').valueAsNumber,hubWidth:numberOrNull('hub-width'),rimDiameter:numberOrNull('rim-diameter'),fit:input('fit').valueAsNumber};
      render(true);if(!invalidStock)save();
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button=>button.addEventListener('click',()=>{
    settings.tool=button.dataset.tool as WorkshopSettings['tool'];input('explode').value='0';viewer?.setExplode(0);render(true);save();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>viewer?.view(button.dataset.view!)));
  document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach(button=>button.addEventListener('click',()=>{
    const focus=button.dataset.focus==='measurement-mount'?(settings.mode==='dials'?'lateral-dial-bracket':'probe1'):button.dataset.focus==='radial-mount'?(settings.mode==='dials'?'radial-dial-bracket':'probe1'):button.dataset.focus!;const row=rows.find(r=>r.sku.startsWith(focus));if(row){choose(row.sku);viewer?.focusParts(focus==='probe1'?assembly.parts.filter(p=>p.probeRole===(settings.tool==='dish'?'dish':button.dataset.focus==='radial-mount'?'radial':'lateral')).map(p=>p.id):focus==='radial-dial-bracket'?rows.filter(r=>r.sku==='radial-dial-bracket'||r.sku==='dial-radial').flatMap(r=>r.ids):row.ids);el('viewer').scrollIntoView({block:'center',behavior:'smooth'});}
  }));
  input('lift-wheel').addEventListener('change',()=>viewer?.setWheelPose(input('lift-wheel').checked,reversed));
  el('reverse-wheel').addEventListener('click',()=>{reversed=!reversed;input('lift-wheel').checked=true;el('reverse-wheel').setAttribute('aria-pressed',String(reversed));viewer?.setWheelPose(true,reversed);});
  input('show-wheel').addEventListener('change',()=>viewer?.showWheel(input('show-wheel').checked));
  input('show-dimensions').addEventListener('change',()=>viewer?.showDimensions(input('show-dimensions').checked));
  input('explode').addEventListener('input',()=>viewer?.setExplode(input('explode').valueAsNumber));
  el('reset-settings').addEventListener('click',()=>{settings=workshopDefaults(config);invalidStock=false;fill();render(true);save();});
  el('export-csv').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([bomCsv(assembly)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`${settings.tool}-${settings.profile}-components.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  el('print-spec').addEventListener('click',()=>window.print());
  const failViewer=()=>{viewer?.dispose();viewer=undefined;el('viewer-message').hidden=false;el('viewer-message').textContent='3D is unavailable in this browser. Dimensions and the component list remain available below.';};
  el('viewer').addEventListener('viewer-lost',failViewer);
  window.addEventListener('pagehide',()=>{disposed=true;viewer?.dispose();},{once:true});
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
