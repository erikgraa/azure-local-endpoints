import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, providerConstraint, providerNote } from '../src/generators/providers.js';
import { resolveProviders, describeResolution } from '../src/resolve-providers.js';
import { generators } from '../src/generators/index.js';
import { loadScopes } from '../src/endpoints.js';

const registry = (table) => async (url) => {
  const hit = Object.entries(table).find(([src]) => url.includes(`/providers/${src}/versions`));
  if (!hit) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ versions: hit[1].map((version) => ({ version })) }) };
};

test('providerConstraint uses ~> MAJOR.MINOR within the supported major, else the pinned fallback', () => {
  assert.equal(providerConstraint('cisco', { cisco: '2.6.1' }), '~> 2.6');
  assert.equal(providerConstraint('paloalto', { paloalto: '1.11.3' }), '~> 1.11');
  assert.equal(providerConstraint('paloalto', { paloalto: '2.0.14' }), PROVIDERS.paloalto.fallback);
  assert.equal(providerConstraint('nsx', {}), PROVIDERS.nsx.fallback);
  assert.match(providerNote('cisco', { cisco: '2.6.1' }), /~> 2\.6 \(latest 2\.x release is 2\.6.1, resolved from the Terraform Registry/);
  assert.match(providerNote('cisco', {}), /pinned default/);
});

test('resolveProviders picks the newest stable release inside the supported major and reports newer majors', async () => {
  const fetchImpl = registry({
    'PaloAltoNetworks/panos': ['1.10.0', '1.11.1', '2.0.14', '2.1.0-beta1'],
    'CiscoDevNet/fmc': ['2.5.0', '2.6.1', '3.0.0-rc1'],
    'vmware/nsxt': ['3.9.0', '3.12.1'],
    'fortinetdev/fortios': ['1.25.0', '1.26.2'],
    'CheckPointSW/checkpoint': ['3.3.1', '3.4.0']
  });
  const r = await resolveProviders({ fetchImpl });
  assert.deepEqual(r.errors, []);
  assert.equal(r.versions.paloalto, '1.11.1');
  assert.equal(r.latest.paloalto, '2.0.14');
  assert.equal(r.versions.cisco, '2.6.1');
  assert.equal(r.latest.cisco, '2.6.1');
  const text = describeResolution(r).join('\n');
  assert.match(text, /panos 2\.0\.14 is a newer major than supported \(1\.x\)/);
  assert.doesNotMatch(text, /fmc/);
});

test('resolveProviders never throws: failed lookups fall back to pinned defaults', async () => {
  const r = await resolveProviders({ fetchImpl: async () => { throw new Error('network down'); } });
  assert.deepEqual(r.versions, {});
  assert.equal(r.errors.length, Object.keys(PROVIDERS).length);
  assert.match(describeResolution(r)[0], /using pinned default/);
  const partial = await resolveProviders({ fetchImpl: registry({ 'CiscoDevNet/fmc': ['2.6.1'] }) });
  assert.equal(partial.versions.cisco, '2.6.1');
  assert.equal(partial.versions.nsx, undefined);
});

test('generators render the resolved constraint and the provider header', () => {
  const s = loadScopes().find((x) => x.name === 'dell');
  const versions = { paloalto: '1.12.0', cisco: '2.9.0', nsx: '3.20.1', fortinet: '1.30.0', checkpoint: '3.9.2' };
  const expected = { paloalto: '~> 1.12', cisco: '~> 2.9', nsx: '~> 3.20', fortinet: '~> 1.30', checkpoint: '~> 3.9' };
  for (const g of generators) {
    const [{ content }] = g.generate(s.endpoints, { providerVersions: versions });
    assert.match(content, new RegExp(`version = "${expected[g.id].replace('~', '\\~')}"`), g.id);
    assert.match(content, new RegExp(`# Provider: ${PROVIDERS[g.id].source} ${expected[g.id].replace('~', '\\~')} \\(latest`), g.id);
    const [{ content: fallback }] = g.generate(s.endpoints, {});
    assert.match(fallback, /pinned default/, g.id);
    assert.ok(fallback.includes(`version = "${PROVIDERS[g.id].fallback}"`), g.id);
  }
});
