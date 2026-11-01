import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvField, toCsv, toJson } from '../src/export.js';

const ep = (o = {}) => ({
  id: '1', component: 'Azure Local diag & billing', url: 'a.example.com/x', host: 'a.example.com', path: '/x', ports: [80, 443],
  protocol: 'tcp', requiredFor: ['Deployment', 'Post deployment'], arcGateway: 'Yes', wildcard: false, notes: 'Plain note', ...o
});

test('csvField quotes every value and doubles embedded quotes', () => {
  assert.equal(csvField('Azure Local AKS infra'), '"Azure Local AKS infra"');
  assert.equal(csvField('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvField('a\nb'), '"a\nb"');
  assert.equal(csvField(true), '"true"');
  assert.equal(csvField(undefined), '""');
});

test('toCsv quotes the header and the component column, uses CRLF', () => {
  const csv = toCsv([ep(), ep({ component: 'Comma, Inc', notes: 'has "quotes", commas\nand a newline' })]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '"component","endpoint","port","protocol","requiredFor","arcGateway","wildcard","notes"');
  assert.ok(lines[1].startsWith('"Azure Local diag & billing","a.example.com/x","80 443","tcp"'));
  assert.ok(csv.includes('"Comma, Inc"'));
  assert.ok(csv.includes('"has ""quotes"", commas\nand a newline"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('toCsv round-trips through a minimal RFC 4180 parser', () => {
  const rows = [ep({ notes: 'x, "y"\nz' })];
  const csv = toCsv(rows);
  const parsed = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) { if (c === '"') { if (csv[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); parsed.push(row); row = []; field = ''; }
    else field += c;
  }
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1][0], 'Azure Local diag & billing');
  assert.equal(parsed[1][7], 'x, "y"\nz');
});

test('toJson has scope, timestamp, count and endpoints', () => {
  const json = JSON.parse(toJson({ type: 'region', name: 'westeurope', updated: '2025-11-27' }, [ep()], new Date('2026-11-01T12:00:00Z')));
  assert.deepEqual(json.scope, { type: 'region', name: 'westeurope', updated: '2025-11-27' });
  assert.equal(json.exported, '2026-11-01T12:00:00.000Z');
  assert.equal(json.count, 1);
  assert.equal(json.endpoints[0].component, 'Azure Local diag & billing');
  assert.deepEqual(json.endpoints[0].ports, [80, 443]);
});

test('toJson includes the disclaimer', () => {
  const json = JSON.parse(toJson({ type: 'region', name: 'x', updated: '' }, [ep()]));
  assert.match(json.disclaimer, /^Community-driven, unofficial tool\. Not affiliated with/);
  assert.match(json.disclaimer, /verify the generated rules/);
});
