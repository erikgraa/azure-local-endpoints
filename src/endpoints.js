import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_DIR = join(ROOT, 'json');

const UDP_PORTS = new Set([123]);

/** Normalises one raw endpoint from the source JSON. */
export function normalizeEndpoint(raw) {
  const url = String(raw.endpointUrl ?? '').trim();
  const noScheme = url.replace(/^[a-z]+:\/\//i, '');
  const slash = noScheme.indexOf('/');
  const host = (slash === -1 ? noScheme : noScheme.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? '' : noScheme.slice(slash);
  const ports = [...new Set(
    String(raw.port ?? '').split(/[,\s]+/).map(Number).filter((p) => Number.isInteger(p) && p > 0 && p < 65536)
  )];
  return {
    id: String(raw.id),
    component: raw.azureLocalComponent ?? raw.description ?? '',
    host,
    path,
    url: host + path,
    ports,
    protocol: ports.length && ports.every((p) => UDP_PORTS.has(p)) ? 'udp' : 'tcp',
    wildcard: Boolean(raw.wildcard) || host.startsWith('*.'),
    requiredFor: raw.requiredFor ?? [],
    arcGateway: raw.arcGatewaySupport ?? '',
    notes: raw.notes ?? ''
  };
}

/** Loads every region and OEM scope from the json folder. */
export function loadScopes(jsonDir = JSON_DIR) {
  const scopes = [];
  for (const [folder, type] of [['regions', 'region'], ['oem', 'oem']]) {
    const base = join(jsonDir, folder);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const file = join(base, name, `azure-local-endpoints-${name}.json`);
      if (!existsSync(file)) continue;
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const endpoints = (data.endpoints ?? []).map(normalizeEndpoint);
      scopes.push({
        type,
        name,
        updated: data.updated ?? '',
        source: data.url ?? '',
        count: endpoints.length,
        endpoints
      });
    }
  }
  return scopes;
}

export function findScope(scopes, name) {
  return scopes.find((s) => s.name === name || `${s.type}/${s.name}` === name);
}
