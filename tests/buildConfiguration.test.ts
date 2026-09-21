import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationDefaults, serializeConfiguration, parseConfiguration, restoreConfiguration,
  saveConfiguration, BUILD_SESSION_KEY, type BuildConfiguration } from '../src/utils/buildConfiguration.ts';
import { rims } from '../src/data/rims.ts';
import { hubs } from '../src/data/hubs.ts';

function decode(fragment: string) {
  const result = parseConfiguration(fragment);
  assert.equal(result.kind, 'configuration', JSON.stringify(result));
  if (result.kind !== 'configuration') throw new Error('Expected configuration');
  return result.config;
}

test('preset links contain only version and identifiers and round-trip the catalogue', () => {
  for (const rim of rims) for (const hub of hubs) {
    const config = configurationDefaults(rim.id, hub.id);
    const fragment = serializeConfiguration(config);
    assert.deepEqual([...new URLSearchParams(fragment).keys()], ['v', 'rp', 'hp']);
    assert.deepEqual(decode(fragment), config);
  }
  assert.ok(serializeConfiguration(configurationDefaults()).length < 120);
});

test('assembly overrides round-trip without redundant geometry or descriptive text', () => {
  const config = { ...configurationDefaults(), crossesLeft: 3, interlaced: true, hubOffset: -1.5, rimFlip: 'Right' as const };
  const fragment = serializeConfiguration({ ...config, geometryProvenance: 'Do not share this note', hubName: 'Long display name' } as BuildConfiguration);
  assert.deepEqual(decode(fragment), config);
  assert.ok(!fragment.includes('geometryProvenance') && !fragment.includes('hubName') && !fragment.includes('flangeThickness'));
});

test('overridden presets become custom without losing measurements or fixed-count overrides', () => {
  const config = { ...configurationDefaults(), erd: 390.125, flangeThicknessLeft: null, spokeCount: 28 };
  const restored = decode(serializeConfiguration(config));
  assert.deepEqual(restored, { ...config, rp: 'custom', hp: 'custom' });
  assert.deepEqual(decode(serializeConfiguration(restored)), restored);
});

test('custom front hubs and rim appearance retain all geometry including blanks and zero', () => {
  const config: BuildConfiguration = {
    ...configurationDefaults('custom', 'custom'), isRear: false, spacing: '100mm', discType: 'None',
    erd: null, rimDepth: null, flangeOuterDiameterLeft: null, flangeOuterDiameterRight: 65,
    flangeThicknessLeft: 0, flangeThicknessRight: null, osb: 0, spokeCount: 24,
    rimProfile: 'shallow-double-wall', rimEyelets: true, rimValveDiameter: 8.5,
  };
  const fragment = serializeConfiguration(config);
  assert.match(fragment, /(?:^|&)erd=&/);
  assert.match(fragment, /flangeThicknessLeft=0/);
  assert.deepEqual(decode(fragment), config);
  assert.deepEqual(decode(serializeConfiguration(config, false)), config);
});

test('legacy links preserve aliases, side thickness precedence and appearance fallback', () => {
  const restored = decode('#erd=400&ol=1&or=2&flangeThickness=3&flangeThicknessLeft=4&hp=custom&isRear=false&interlaced=true');
  assert.equal(restored.erd, 400);
  assert.equal(restored.drillingOffsetLeft, 1);
  assert.equal(restored.drillingOffsetRight, 2);
  assert.equal(restored.flangeThicknessLeft, 4);
  assert.equal(restored.flangeThicknessRight, 3);
  assert.equal(restored.flangeOuterDiameterLeft, null);
  assert.equal(restored.rimProfile, 'standard');
  assert.equal(restored.isRear, false);
  assert.equal(restored.interlaced, true);
  assert.equal(decode('#ol=1&drillingOffsetLeft=2').drillingOffsetLeft, 2);
});

test('unrelated anchors are ignored and malformed recognized configuration is rejected', () => {
  for (const fragment of ['', '#about', '#section=help']) assert.equal(parseConfiguration(fragment).kind, 'unrelated');
  const defaults = serializeConfiguration(configurationDefaults());
  for (const fragment of [
    '#v=3', '#v=2', '#rp=not-a-rim', '#erd=NaN', '#erd=Infinity', '#erd=0x10',
    '#erd=bad', '#erd=1&erd=2', '#rimValveDiameter=', '#rimValveDiameter=-1', '#crossesLeft=1.5',
    '#crossesLeft=5', '#spokeCount=31', '#isRear=0', '#interlaced=maybe', '#rimProfile=carbon',
    '#rimFlip=unknown', '#discType=bad', '#spacing=%00', '#spacing=%ZZ',
    '#v=2&rp=custom&hp=custom', defaults + '&crossesRight=',
  ]) assert.equal(parseConfiguration(fragment).kind, 'error', fragment);
});

test('shared state takes precedence over tab storage; corrupt or blocked storage falls back safely', () => {
  const saved = { ...configurationDefaults(), crossesLeft: 1 };
  const shared = { ...configurationDefaults(), crossesLeft: 3 };
  const data = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } });
  assert.equal(saveConfiguration(saved, storage), true);
  assert.equal(restoreConfiguration('', storage).config.crossesLeft, 1);
  const imported = restoreConfiguration(serializeConfiguration(shared), storage);
  assert.equal(imported.imported, true);
  assert.equal(imported.config.crossesLeft, 3);
  assert.equal(restoreConfiguration('#help', storage).imported, false);
  assert.equal(restoreConfiguration('#erd=bad', storage).config.crossesLeft, 1);
  assert.ok(restoreConfiguration('#erd=bad', storage).error);
  data.set(BUILD_SESSION_KEY, 'corrupt');
  assert.deepEqual(restoreConfiguration('', storage).config, configurationDefaults());
  const blocked = () => { throw new Error('Storage denied'); };
  assert.equal(saveConfiguration(saved, blocked), false);
  assert.deepEqual(restoreConfiguration('', blocked).config, configurationDefaults());
  assert.deepEqual(restoreConfiguration(serializeConfiguration(shared), blocked).config, shared);
});
