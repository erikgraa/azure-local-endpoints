/** Export helpers shared by the web UI (copied into dist by the build) and the tests. */

/** RFC 4180 field: always quoted, quotes doubled. Newlines inside notes stay inside the quoted field. */
export const csvField = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const COLUMNS = [
  ['component', (e) => e.component],
  ['endpoint', (e) => e.url],
  ['port', (e) => e.ports.join(' ')],
  ['protocol', (e) => e.protocol],
  ['requiredFor', (e) => e.requiredFor.join('/')],
  ['arcGateway', (e) => e.arcGateway],
  ['wildcard', (e) => e.wildcard],
  ['notes', (e) => e.notes]
];

/** CSV text with CRLF line endings (RFC 4180). */
export function toCsv(endpoints) {
  const lines = [COLUMNS.map(([h]) => csvField(h)), ...endpoints.map((e) => COLUMNS.map(([, get]) => csvField(get(e))))];
  return lines.map((l) => l.join(',')).join('\r\n') + '\r\n';
}

/** JSON document with scope, generation timestamp and the endpoints array. */
export function toJson(scope, endpoints, generated = new Date()) {
  return JSON.stringify({
    scope: { type: scope.type, name: scope.name, updated: scope.updated },
    exported: generated.toISOString(),
    count: endpoints.length,
    endpoints: endpoints.map((e) => ({
      id: e.id, component: e.component, endpoint: e.url, host: e.host, path: e.path, ports: e.ports, protocol: e.protocol,
      requiredFor: e.requiredFor, arcGateway: e.arcGateway, wildcard: e.wildcard, notes: e.notes
    }))
  }, null, 2) + '\n';
}
