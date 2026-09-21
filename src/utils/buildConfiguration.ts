import { defaultHub, hubs } from '../data/hubs.ts';
import { defaultRim, rims } from '../data/rims.ts';

// One allowlist for form capture, restoration and the public sharing format.
// null represents an explicitly blank measurement, never zero or a default.
export const numericFields = {
  erd: 'input-erd', rimWidthOuter: 'input-rim-wo', rimWidthInner: 'input-rim-wi',
  rimDepth: 'input-rim-dep', osb: 'input-osb', drillingOffsetLeft: 'input-ol',
  drillingOffsetRight: 'input-or', flangePcdLeft: 'input-pcdl', flangePcdRight: 'input-pcdr',
  centerToLeft: 'input-wl', centerToRight: 'input-wr', spokeHoleDiameter: 'input-sh',
  flangeThicknessLeft: 'input-ftl', flangeThicknessRight: 'input-ftr',
  flangeOuterDiameterLeft: 'input-odl', flangeOuterDiameterRight: 'input-odr',
  spokeDiameter: 'input-sd', hubOffset: 'input-ho', spokeCount: 'input-count',
  crossesLeft: 'input-crossl', crossesRight: 'input-crossr',
} as const;
export type NumericField = keyof typeof numericFields;
export type BuildConfiguration = Record<NumericField, number | null> & {
  rp: string;
  hp: string;
  rimProfile: 'standard' | 'shallow-double-wall';
  rimEyelets: boolean;
  rimValveDiameter: number;
  rimFlip: 'Auto' | 'Left' | 'Right';
  interlaced: boolean;
  isRear: boolean;
  spacing: string;
  discType: '6-Bolt' | 'Centerlock' | 'None';
};

const rimFields = ['erd', 'rimWidthOuter', 'rimWidthInner', 'rimDepth', 'osb',
  'drillingOffsetLeft', 'drillingOffsetRight', 'rimProfile', 'rimEyelets', 'rimValveDiameter'] as const;
const hubFields = ['flangePcdLeft', 'flangePcdRight', 'centerToLeft', 'centerToRight',
  'spokeHoleDiameter', 'flangeThicknessLeft', 'flangeThicknessRight',
  'flangeOuterDiameterLeft', 'flangeOuterDiameterRight', 'isRear', 'spacing', 'discType'] as const;
const shareFields = [...Object.keys(numericFields), 'rimProfile', 'rimEyelets',
  'rimValveDiameter', 'rimFlip', 'interlaced', 'isRear', 'spacing', 'discType'] as (keyof BuildConfiguration)[];
const legacyFields = ['ol', 'or', 'flangeThickness', 'geometryProvenance', 'hubName'];
const recognizedFields = new Set(['v', 'rp', 'hp', ...shareFields, ...legacyFields]);

export function configurationDefaults(rp = defaultRim.id, hp = defaultHub.id): BuildConfiguration {
  const rim = rp === 'custom' ? defaultRim : rims.find(r => r.id === rp);
  const hub = hp === 'custom' ? defaultHub : hubs.find(h => h.id === hp);
  if (!rim || !hub) throw new Error('This link uses a rim or hub preset that is no longer available.');
  return {
    rp, hp,
    erd: rim.erd, rimWidthOuter: rim.widthOuter ?? defaultRim.widthOuter!,
    rimWidthInner: rim.widthInner ?? defaultRim.widthInner!, rimDepth: rim.depth ?? defaultRim.depth!,
    osb: rim.osb, drillingOffsetLeft: rim.drillingOffsetLeft, drillingOffsetRight: rim.drillingOffsetRight,
    rimProfile: rim.rimProfile ?? 'standard', rimEyelets: rim.rimEyelets ?? false,
    rimValveDiameter: rim.rimValveDiameter ?? 6.5,
    flangePcdLeft: hub.flangePcdLeft, flangePcdRight: hub.flangePcdRight,
    centerToLeft: hub.centerToLeft, centerToRight: hub.centerToRight,
    spokeHoleDiameter: hub.spokeHoleDiameter,
    flangeThicknessLeft: hub.flangeThicknessLeft ?? hub.flangeThickness ?? null,
    flangeThicknessRight: hub.flangeThicknessRight ?? hub.flangeThickness ?? null,
    flangeOuterDiameterLeft: hp === 'custom' ? null : hub.flangeOuterDiameterLeft ?? null,
    flangeOuterDiameterRight: hp === 'custom' ? null : hub.flangeOuterDiameterRight ?? null,
    spokeCount: hub.spokeCount ?? 32, crossesLeft: 2, crossesRight: 2,
    spokeDiameter: 2, hubOffset: 0, rimFlip: 'Auto', interlaced: false,
    isRear: hub.name.toLowerCase().includes('rear'), spacing: hub.spacing, discType: hub.discType ?? '6-Bolt',
  };
}

export function serializeConfiguration(config: BuildConfiguration, compact = true): string {
  const baseline = configurationDefaults(config.rp, config.hp);
  const params = new URLSearchParams({ v: '2', rp: config.rp, hp: config.hp });
  const required = new Set<string>([
    ...(config.rp === 'custom' ? rimFields : []),
    ...(config.hp === 'custom' ? hubFields : []),
  ]);
  for (const key of shareFields) {
    const value = config[key];
    if (!compact || required.has(key) || value !== baseline[key]) {
      params.set(key, value === null ? '' : String(value));
    }
  }
  return params.toString();
}

export type ConfigurationParseResult =
  | { kind: 'unrelated' }
  | { kind: 'error'; message: string }
  | { kind: 'configuration'; config: BuildConfiguration };

export function parseConfiguration(fragment: string): ConfigurationParseResult {
  const raw = fragment.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  if (![...params.keys()].some(key => recognizedFields.has(key))) return { kind: 'unrelated' };
  try {
    if (/%(?![\da-f]{2})/i.test(raw)) throw new Error('The build link has invalid encoding.');
    for (const key of new Set(params.keys())) {
      if (recognizedFields.has(key) && params.getAll(key).length > 1) throw new Error(`Duplicate build field: ${key}.`);
    }
    const version = params.get('v');
    if (version !== null && version !== '2') throw new Error('This build link uses an unsupported version.');
    if (version === '2' && (!params.has('rp') || !params.has('hp'))) throw new Error('The build link is missing its component identifiers.');
    const config = configurationDefaults(params.get('rp') ?? defaultRim.id, params.get('hp') ?? defaultHub.id);
    if (version === '2') {
      for (const key of [...(config.rp === 'custom' ? rimFields : []), ...(config.hp === 'custom' ? hubFields : [])]) {
        if (!params.has(key)) throw new Error(`The custom build link is missing ${key}.`);
      }
    }
    if (version === null && (!params.has('rp') || config.rp === 'custom')) {
      config.rimProfile = 'standard'; config.rimEyelets = false; config.rimValveDiameter = 6.5;
    }
    const numberValue = (key: string): number | null => {
      const value = params.get(key)!;
      if (value === '') return null;
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) {
        throw new Error(`Invalid number in build field: ${key}.`);
      }
      return Number(value);
    };
    for (const [oldKey, keys] of [['ol', ['drillingOffsetLeft']], ['or', ['drillingOffsetRight']],
      ['flangeThickness', ['flangeThicknessLeft', 'flangeThicknessRight']]] as const) {
      if (params.has(oldKey)) {
        const value = numberValue(oldKey);
        for (const key of keys) if (!params.has(key)) config[key] = value;
      }
    }
    for (const key of Object.keys(numericFields) as NumericField[]) if (params.has(key)) config[key] = numberValue(key);
    for (const key of ['crossesLeft', 'crossesRight', 'spokeCount'] as const) {
      const value = config[key];
      if (value === null || !Number.isInteger(value) || (key === 'spokeCount'
        ? value < 16 || value > 40 || value % 4 !== 0 : value < 0 || value > 4)) {
        throw new Error(`Unsupported value in build field: ${key}.`);
      }
    }
    for (const key of ['rimEyelets', 'interlaced', 'isRear'] as const) {
      if (params.has(key)) {
        const value = params.get(key);
        if (value !== 'true' && value !== 'false') throw new Error(`Invalid boolean in build field: ${key}.`);
        config[key] = value === 'true';
      }
    }
    for (const [key, values] of [
      ['rimProfile', ['standard', 'shallow-double-wall']], ['rimFlip', ['Auto', 'Left', 'Right']],
      ['discType', ['6-Bolt', 'Centerlock', 'None']],
    ] as const) {
      const value = params.get(key);
      if (value !== null) {
        if (!(values as readonly string[]).includes(value)) throw new Error(`Unsupported value in build field: ${key}.`);
        Object.assign(config, { [key]: value });
      }
    }
    if (params.has('rimValveDiameter')) {
      const value = numberValue('rimValveDiameter');
      if (value === null || value <= 0) throw new Error('Invalid valve diameter in build link.');
      config.rimValveDiameter = value;
    }
    if (params.has('spacing')) {
      const value = params.get('spacing')!;
      if (value.length > 100 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid hub spacing in build link.');
      config.spacing = value;
    }
    // An overridden preset becomes Custom so fixed preset constraints cannot
    // silently overwrite a shared measurement (notably its spoke count).
    const baseline = configurationDefaults(config.rp, config.hp);
    if (rimFields.some(key => config[key] !== baseline[key])) config.rp = 'custom';
    if (hubFields.some(key => config[key] !== baseline[key]) ||
      (hubs.find(h => h.id === config.hp)?.spokeCount && config.spokeCount !== baseline.spokeCount)) config.hp = 'custom';
    return { kind: 'configuration', config };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Unable to read this build link.' };
  }
}

export const BUILD_SESSION_KEY = 'wheel-builder:build:v2';
export interface BuildStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function saveConfiguration(config: BuildConfiguration, storage: () => BuildStorage): boolean {
  try {
    // Full snapshots keep tab refreshes independent of preset/default changes.
    storage().setItem(BUILD_SESSION_KEY, serializeConfiguration(config, false));
    return true;
  } catch { return false; }
}

export function restoreConfiguration(fragment: string, storage: () => BuildStorage) {
  const shared = parseConfiguration(fragment);
  if (shared.kind === 'configuration') return { config: shared.config, imported: true, error: '' };
  let saved: ConfigurationParseResult = { kind: 'unrelated' };
  try { saved = parseConfiguration(storage().getItem(BUILD_SESSION_KEY) ?? ''); } catch { /* Storage is optional. */ }
  return {
    config: saved.kind === 'configuration' ? saved.config : configurationDefaults(),
    imported: false,
    error: shared.kind === 'error' ? shared.message : '',
  };
}
