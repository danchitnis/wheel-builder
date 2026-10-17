import { calculateNippleFit, fitNumericFields, nippleProfileError, type NippleFitSettings, type NippleFit } from '../utils/nippleFit.ts';
import type { SpokePaths } from '../utils/spokePath.ts';
import type { WheelBuildInputs } from '../utils/physicsCalculator.ts';
import { calculateWheelBuild, wheelGeometryValid } from '../utils/physicsCalculator.ts';
import type { NippleFitViewer } from './NippleFitViewer.ts';

const sides = ['Left', 'Right'] as const;
type Side = typeof sides[number];

export function readNippleFitSettings(): NippleFitSettings {
  return Object.fromEntries(Object.entries(fitNumericFields).map(([key,id]) => {
    const value = (document.getElementById(id) as HTMLInputElement).value;
    return [key, value.trim() === '' ? null : Number(value)];
  })) as NippleFitSettings;
}

export function initializeNippleFitPanel(onChange: () => void) {
  const heads = document.getElementById('fit-heads') as HTMLSelectElement;
  const section = document.getElementById('fit-section') as HTMLInputElement;
  const retry = document.getElementById('fit-preview-retry')!;
  const states: Record<Side, {viewer?: NippleFitViewer; failed: boolean; reset: boolean}> = {
    Left: {failed: false, reset: true}, Right: {failed: false, reset: true},
  };
  let loading = false, active = false;
  let latest: {inputs: WheelBuildInputs; paths: SpokePaths} | undefined;
  const element = (id: string, side: Side) => document.getElementById(`${id}-${side.toLowerCase()}`)!;

  function selection(side: Side) {
    const {inputs, paths} = latest!;
    const candidates = paths.spokes.filter(path => path.side === side);
    const path = candidates.find(path => path.headsOut === (heads.value === 'out'));
    const fit: NippleFit = path
      ? calculateNippleFit(path, inputs.nippleFit!, inputs.spokeDiameter)
      : {valid: false, error: paths.errors[0] || 'No modeled spoke is available for this selection.'};
    return {path, candidates, fit};
  }

  async function refreshPreview() {
    if (!active || !latest || loading) return;
    loading = true;
    try {
      const {NippleFitViewer} = await import('./NippleFitViewer');
      if (!active || !latest) return;
      for (const side of sides) {
        const state = states[side];
        if (state.failed) continue;
        const previewStatus = element('fit-preview-status', side);
        try {
          state.viewer ??= new NippleFitViewer(element('fit-canvas', side));
          const {fit} = selection(side);
          state.viewer.update(fit, latest.inputs.nippleFit!, section.checked, latest.inputs.rimEyelets === true);
          if (state.reset) {state.viewer.resetView(); state.reset = false;}
          previewStatus.textContent = fit.valid ? '' : fit.error;
        } catch (error) {
          state.failed = true;
          previewStatus.textContent = 'Preview unavailable. Numeric measurements remain available.';
          console.error(`${side} nipple preview:`, error);
        }
      }
    } catch (error) {
      for (const side of sides) {
        states[side].failed = true;
        element('fit-preview-status', side).textContent = 'Preview could not load. Numeric measurements remain available.';
      }
      console.error('Nipple preview module:', error);
    } finally {
      loading = false;
      retry.classList.toggle('hidden', !sides.some(side => states[side].failed));
    }
  }

  for (const id of Object.values(fitNumericFields)) document.getElementById(id)!.addEventListener('input', onChange);
  for (const side of sides) {
    const input = element('fit-length', side) as HTMLInputElement;
    element('fit-reset', side).addEventListener('click', () => {input.value = ''; onChange();});
  }
  for (const control of [heads, section]) control.addEventListener('change', () => {
    for (const side of sides) states[side].reset = true;
    if (latest) refresh(latest.inputs, latest.paths);
  });
  document.getElementById('fit-camera-reset')!.addEventListener('click', () => {
    for (const side of sides) states[side].viewer?.resetView();
  });
  retry.addEventListener('click', () => {
    for (const side of sides) states[side].failed = false;
    retry.classList.add('hidden');
    void refreshPreview();
  });
  window.addEventListener('pagehide', () => {
    for (const side of sides) {
      states[side].viewer?.dispose(); states[side].viewer = undefined; states[side].reset = true;
    }
  });
  window.addEventListener('pageshow', () => {void refreshPreview();});

  function refresh(inputs: WheelBuildInputs, paths: SpokePaths) {
    latest = {inputs, paths};
    const calculations = calculateWheelBuild(inputs), settings = inputs.nippleFit!;
    const profileError = nippleProfileError(settings);
    const allowance = settings.nippleLength! - settings.nippleWrenchLength! - settings.nippleBarrelLength! - settings.nippleHeadHeight!;
    document.getElementById('fit-nipple-section-summary')!.textContent = profileError ? '' :
      `${settings.nippleWrenchLength} mm wrench + ${settings.nippleBarrelLength} mm cylinder + ${settings.nippleHeadHeight} mm tapered head` +
      (allowance > 1e-8 ? ` + ${allowance.toFixed(1)} mm straight allowance` : '') + ` = ${settings.nippleLength} mm.`;
    document.getElementById('fit-nipple-thread-summary')!.textContent = profileError ??
      `Internal thread: ${(settings.nippleLength! - settings.nippleSlotDepth! - settings.nippleLeadIn!).toFixed(1)} mm, starting ${settings.nippleLeadIn!.toFixed(1)} mm inside the opening (estimated).`;
    for (const side of sides) {
      const value = calculations[side === 'Left' ? 'left' : 'right'].calculatedSpokeLength;
      const input = element('fit-length', side) as HTMLInputElement;
      input.placeholder = Number.isFinite(value) ? String(Math.round(value)) : 'Unavailable';
      element('fit-auto', side).textContent = wheelGeometryValid(inputs, calculations)
        ? `Traditional ${value.toFixed(1)} mm · ${input.value ? 'chosen' : 'automatic'} ${input.value || Math.round(value)} mm`
        : 'Calculation unavailable';
      const shortcuts = element('fit-shortcuts', side);
      shortcuts.replaceChildren();
      if (wheelGeometryValid(inputs, calculations)) for (let length = Math.floor(value) - 1; length <= Math.ceil(value) + 1; length++) {
        if (length <= 0) continue;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'guide-button fit-length-shortcut'; button.textContent = `${length} mm`;
        button.setAttribute('aria-pressed', String(Number(input.value || Math.round(value)) === length));
        button.addEventListener('click', () => {input.value = String(length); onChange();});
        shortcuts.append(button);
      }
      refreshMeasurements(side);
    }
    void refreshPreview();
  }

  function refreshMeasurements(side: Side) {
    const {path, candidates, fit} = selection(side);
    const status = element('fit-status', side), list = element('fit-measurements', side), range = element('fit-side-range', side);
    list.replaceChildren(); range.textContent = '';
    if (!fit.valid) {status.textContent = fit.error; return;}
    const observations: string[] = [];
    if (fit.engagement === 0) observations.push('No thread engagement');
    if (fit.exposedThread > .001) observations.push('Thread exposed below opening');
    if (fit.protrusion > .001) observations.push('Tip projects above head');
    if (fit.runoutExceeded > .001) observations.push('Past thread runout; this position may not be achievable');
    if (!observations.length) observations.push('External thread hidden');
    status.textContent = observations.join(' · ');
    const rows = [
      ['Purchased length', `${fit.purchasedLength.toFixed(1)} mm`],
      ['Traditional calculated length', `${path!.traditionalLength.toFixed(2)} mm`],
      ['Modeled bend allowance', `${path!.bendAllowance.toFixed(2)} mm`],
      ['Modeled estimated length', `${path!.estimatedLength.toFixed(2)} mm`],
      ['Purchased − traditional', `${fit.traditionalDelta >= 0 ? '+' : ''}${fit.traditionalDelta.toFixed(2)} mm`],
      ['Purchased − modeled (tip shift)', `${fit.delta >= 0 ? '+' : ''}${fit.delta.toFixed(2)} mm`],
      ['Internal thread engagement', `${fit.engagement.toFixed(2)} mm`],
      ['Exposed spoke thread', `${fit.exposedThread.toFixed(2)} mm`],
      ['Tip relative to slot floor', `${Math.abs(fit.slotOffset).toFixed(2)} mm ${fit.slotOffset < 0 ? 'below' : 'above'}`],
      ['Tip above nipple head', `${fit.protrusion.toFixed(2)} mm`],
      ['Travel before thread runout', `${fit.remainingTravel.toFixed(2)} mm`],
      ['Past thread runout', `${fit.runoutExceeded.toFixed(2)} mm`],
    ];
    for (const [label, value] of rows) {
      const cell = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.className = 'text-titanium-400'; dt.textContent = label;
      dd.className = 'font-mono text-titanium-100 mt-1'; dd.textContent = value;
      cell.append(dt, dd); list.append(cell);
    }
    const fits = candidates.map(path => calculateNippleFit(path, latest!.inputs.nippleFit!, latest!.inputs.spokeDiameter))
      .filter((fit): fit is Extract<NippleFit, {valid: true}> => fit.valid);
    if (fits.length) {
      const values = (key: 'engagement' | 'delta') => {
        const values = fits.map(fit => fit[key]);
        return `${Math.min(...values).toFixed(2)} to ${Math.max(...values).toFixed(2)} mm`;
      };
      range.textContent = `Side range: engagement ${values('engagement')}; tip shift ${values('delta')}. ${fits.length} of ${candidates.length} spokes available.`;
    }
  }

  return {refresh, setVisible(visible: boolean) {
    active = visible;
    if (visible) {
      for (const side of sides) states[side].reset = true;
      void refreshPreview();
    }
  }};
}
