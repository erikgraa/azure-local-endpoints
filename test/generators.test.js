import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScopes, normalizeEndpoint } from '../src/endpoints.js';
import { generators } from '../src/generators/index.js';

test('normalizes URLs, ports and protocol', () => {
  const e = normalizeEndpoint({ id: 1, endpointUrl: 'https://westeurope.obo.arc.azure.com/x', port: '80, 443', wildcard: false });
  assert.equal(e.host, 'westeurope.obo.arc.azure.com');
  assert.equal(e.path, '/x');
  assert.deepEqual(e.ports, [80, 443]);
  assert.equal(normalizeEndpoint({ id: 2, endpointUrl: 'time.windows.com', port: '123' }).protocol, 'udp');
  assert.equal(normalizeEndpoint({ id: 3, endpointUrl: '*.a.com', port: '443' }).wildcard, true);
});

test('requiredFor is always a clean array', () => {
  const f = (v) => normalizeEndpoint({ id: 1, endpointUrl: 'a.com', port: '443', requiredFor: v }).requiredFor;
  assert.deepEqual(f('Deployment & Post deployment'), ['Deployment', 'Post deployment']);
  assert.deepEqual(f('Post Deployment'), ['Post deployment']);
  assert.deepEqual(f(['Deployment']), ['Deployment']);
  assert.deepEqual(f('443'), []);
});

test('every loaded endpoint has array requiredFor and a valid host', () => {
  for (const s of loadScopes()) {
    for (const e of s.endpoints) {
      assert.ok(Array.isArray(e.requiredFor));
      assert.match(e.host, /^[a-z0-9*][a-z0-9*.-]*\.[a-z0-9*-]+$/);
    }
  }
});

test('loads all scopes with endpoints', () => {
  const scopes = loadScopes();
  assert.ok(scopes.length >= 10);
  assert.ok(scopes.every((s) => s.endpoints.length > 0));
});

test('every generator produces terraform for every scope', () => {
  const scopes = loadScopes();
  for (const g of generators) {
    for (const s of scopes) {
      const files = g.generate(s.endpoints, { scope: s.name });
      assert.ok(files.length >= 1 && files.every((f) => f.filename.endsWith('.tf') && f.content.length > 50));
    }
  }
});

test('paloalto v1 output (panos provider 1.x) contains URLs and balanced braces', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  const [{ content }] = generators.find((g) => g.id === 'paloalto').generate(s.endpoints, { providerMajor: 1 });
  assert.match(content, /mcr\.microsoft\.com/);
  assert.match(content, /panos_security_rule_group/);
  assert.match(content, /panos_address_object/);
  assert.match(content, /version = "~> 1\.11"/);
  assert.equal(content.split('{').length, content.split('}').length);
});

test('paloalto v2 output (panos provider 2.x) uses the new resources and location variable', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  const pa = generators.find((g) => g.id === 'paloalto');
  assert.deepEqual(pa.variants.map((v) => v.id), ['v2', 'v1']);
  assert.ok(pa.variants[0].default);
  const [{ content }] = pa.generate(s.endpoints);
  assert.match(content, /# Palo Alto PAN-OS rules .*\(panos provider 2\.x\)/);
  assert.match(content, /version = "~> 2\.0"/);
  assert.match(content, /required_version = ">= 1\.8"/);
  assert.match(content, /resource "panos_custom_url_category"/);
  assert.match(content, /resource "panos_security_policy_rules"/);
  assert.match(content, /resource "panos_address"/);
  assert.match(content, /resource "panos_service"/);
  assert.match(content, /variable "location"/);
  assert.match(content, /location\s+= var\.location/);
  assert.match(content, /mcr\.microsoft\.com/);
  assert.doesNotMatch(content, /panos_security_rule_group|panos_address_object|panos_service_object/);
  assert.equal(content.split('{').length, content.split('}').length);
});

test('cisco output drops wildcard prefix and balances braces', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  const [{ content }] = generators.find((g) => g.id === 'cisco').generate(s.endpoints);
  assert.match(content, /fmc_access_rule/);
  assert.doesNotMatch(content, /url = "https?:\/\/\*/);
  assert.equal(content.split('{').length, content.split('}').length);
});

test('nsx output has context profiles and policy, balanced braces', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  const [{ content }] = generators.find((g) => g.id === 'nsx').generate(s.endpoints);
  assert.match(content, /nsxt_policy_context_profile/);
  assert.match(content, /nsxt_policy_security_policy/);
  assert.match(content, /"\*\.servicebus\.windows\.net"/);
  assert.equal(content.split('{').length, content.split('}').length);
});

test('generated Terraform carries data date, fetch time, source and descriptions', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  const opts = { scope: 'region/westeurope', dataUpdated: '2025-11-27', fetched: '2026-11-01T11:00:00.000Z', sourceUrl: 'https://example.test/src.md' };
  for (const g of generators) {
    const [{ content }] = g.generate(s.endpoints, opts);
    assert.match(content, /# Data last updated: 2025-11-27 · fetched 2026-11-01T11:00:00\.000Z/, g.id);
    assert.match(content, /# Data source: https:\/\/example\.test\/src\.md/, g.id);
    assert.match(content, /official Microsoft documentation is authoritative/, g.id);
    assert.match(content, /"[^"\n]*data updated 2025-11-27"/, `${g.id} description`);
  }
});

test('options are honoured', () => {
  const s = loadScopes().find((x) => x.name === 'dell');
  const [{ content }] = generators.find((g) => g.id === 'paloalto').  generate(s.endpoints, { prefix: 'foo' });
  assert.match(content, /"foo-endpoints"/);
    assert.match(content, /action\s+= "allow"/);
});

test('every generator output starts with the disclaimer comment', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  for (const g of generators) {
    const [{ content }] = g.generate(s.endpoints);
    assert.match(content, /# Community-driven, unofficial tool\. Not affiliated with, endorsed by, or sponsored by Microsoft\./, g.id);
    assert.match(content, /Always verify the generated rules against the official documentation/, g.id);
    assert.match(content, /# Source: https:\/\/github\.com\/erikgraa\/azure-local-endpoints/, g.id);
  }
});
