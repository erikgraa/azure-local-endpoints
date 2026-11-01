import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, providerConstraint, providerNote, versionKey } from '../src/generators/providers.js';
import { resolveProviders, describeResolution } from '../src/resolve-providers.js';
import { generators, variantsOf, variantKey } from '../src/generators/index.js';
import { loadScopes } from '../src/endpoints.js';

const registry = (table) => async (url) => {
  const hit = Object.entries(table).find(([src]) => url.includes(`/providers/${src}/versions`));
  if (!hit) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ versions: hit[1].map((version) => ({ version })) }) };
};

test('providerConstraint uses ~> MAJOR.MINOR of the resolved version for that major, else the pinned fallback', () => {
  assert.equal(providerConstraint('cisco', { 'cisco@2': '2.6.1' }), '~> 2.6');
  assert.equal(providerConstraint('paloalto', { 'paloalto@1': '1.11.3', 'paloalto@2': '2.0.14' }, 1), '~> 1.11');
  assert.equal(providerConstraint('paloalto', { 'paloalto@1': '1.11.3', 'paloalto@2': '2.0.14' }), '~> 2.0');
  assert.equal(providerConstraint('paloalto', { 'paloalto@2': '1.9.9' }), PROVIDERS.paloalto.fallbacks[2]);
  assert.equal(providerConstraint('nsx', {}), PROVIDERS.nsx.fallbacks[3]);
  assert.match(providerNote('cisco', { 'cisco@2': '2.6.1' }), /~> 2\.6 \(latest 2\.x release is 2\.6\.1, resolved from the Terraform Registry/);
  assert.match(providerNote('cisco', {}), /pinned default/);
});

test('providerNote says "resolved" even when the resolved constraint equals the pinned default', () => {
  assert.equal(PROVIDERS.paloalto.fallbacks[1], '~> 1.11');
  assert.match(providerNote('paloalto', { 'paloalto@1': '1.11.1' }, 1), /latest 1\.x release is 1\.11\.1, resolved from the Terraform Registry/);
  assert.match(providerNote('paloalto', {}, 1), /pinned default/);
});

test('resolveProviders resolves every supported major line and reports newer majors', async () => {
  const fetchImpl = registry({
    'PaloAltoNetworks/panos': ['1.10.0', '1.11.1', '2.0.14', '2.1.0-beta1', '3.0.0'],
    'CiscoDevNet/fmc': ['2.5.0', '2.6.1', '3.0.0-rc1'],
    'vmware/nsxt': ['3.9.0', '3.12.1'],
    'fortinetdev/fortios': ['1.25.0', '1.26.2'],
    'CheckPointSW/checkpoint': ['3.3.1', '3.4.0']
  });
  const r = await resolveProviders({ fetchImpl });
  assert.deepEqual(r.errors, []);
  assert.equal(r.versions[versionKey('paloalto', 1)], '1.11.1');
  assert.equal(r.versions[versionKey('paloalto', 2)], '2.0.14');
  assert.equal(r.latest.paloalto, '3.0.0');
  assert.equal(r.versions[versionKey('cisco', 2)], '2.6.1');
  const text = describeResolution(r).join('\n');
  assert.match(text, /panos 3\.0\.0 is a newer major than supported \(2\.x, 1\.x\)/);
  assert.doesNotMatch(text, /fmc/);
});

test('resolveProviders never throws: failed lookups fall back to pinned defaults', async () => {
  const r = await resolveProviders({ fetchImpl: async () => { throw new Error('network down'); } });
  assert.deepEqual(r.versions, {});
  assert.equal(r.errors.length, Object.keys(PROVIDERS).length);
  assert.match(describeResolution(r)[0], /using pinned default/);
  const partial = await resolveProviders({ fetchImpl: registry({ 'CiscoDevNet/fmc': ['2.6.1'] }) });
  assert.equal(partial.versions[versionKey('cisco', 2)], '2.6.1');
  assert.equal(partial.versions[versionKey('nsx', 3)], undefined);
});

test('generators render the resolved constraint and the provider header for every variant', () => {
  const s = loadScopes().find((x) => x.name === 'dell');
  const versions = {
    'paloalto@1': '1.12.0', 'paloalto@2': '2.3.4', 'cisco@2': '2.9.0', 'nsx@3': '3.20.1', 'fortinet@1': '1.30.0', 'checkpoint@3': '3.9.2'
  };
  const expected = { paloalto: { 1: '~> 1.12', 2: '~> 2.3' }, cisco: { 2: '~> 2.9' }, nsx: { 3: '~> 3.20' }, fortinet: { 1: '~> 1.30' }, checkpoint: { 3: '~> 3.9' } };
  for (const g of generators) {
    for (const v of variantsOf(g)) {
      const major = v.options.providerMajor ?? PROVIDERS[g.id].major;
      const want = expected[g.id][major].replace('~', '\\~');
      const [{ content }] = g.generate(s.endpoints, { providerVersions: versions, ...v.options });
      assert.match(content, new RegExp(`version = "${want}"`), `${g.id} ${v.id}`);
      assert.match(content, new RegExp(`# Provider: ${PROVIDERS[g.id].source} ${want} \\(latest ${major}\\.x`), `${g.id} ${v.id}`);
      const [{ content: fallback }] = g.generate(s.endpoints, { ...v.options });
      assert.match(fallback, /pinned default/, g.id);
      assert.ok(fallback.includes(`version = "${PROVIDERS[g.id].fallbacks[major]}"`), `${g.id} ${v.id}`);
    }
  }
});

test('variant keys: the default variant keeps the plain id, others are suffixed', () => {
  const pa = generators.find((g) => g.id === 'paloalto');
  assert.deepEqual(variantsOf(pa).map((v) => variantKey(pa, v)), ['paloalto', 'paloalto-v1']);
  const cisco = generators.find((g) => g.id === 'cisco');
  assert.deepEqual(variantsOf(cisco).map((v) => variantKey(cisco, v)), ['cisco']);
});
