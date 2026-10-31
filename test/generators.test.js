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

test('paloalto output contains URLs and balanced braces', () => {
  const s = loadScopes().find((x) => x.name === 'westeurope');
  const [{ content }] = generators.find((g) => g.id === 'paloalto').generate(s.endpoints);
  assert.match(content, /mcr\.microsoft\.com/);
  assert.match(content, /panos_security_rule_group/);
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

test('options are honoured', () => {
  const s = loadScopes().find((x) => x.name === 'dell');
  const [{ content }] = generators.find((g) => g.id === 'paloalto').  generate(s.endpoints, { prefix: 'foo' });
  assert.match(content, /"foo-endpoints"/);
    assert.match(content, /action\s+= "allow"/);
});
