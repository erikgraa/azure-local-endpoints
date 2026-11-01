/** Resolves the latest stable provider versions from the Terraform Registry. */
import { PROVIDERS, versionKey } from './generators/providers.js';

const stable = (v) => /^\d+\.\d+\.\d+$/.test(v);
const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};
const maxOf = (list) => list.reduce((best, v) => (best === null || cmp(v, best) > 0 ? v : best), null);
const majorOf = (v) => Number(v.split('.')[0]);

/**
 * Returns { versions, latest, errors }.
 * versions: newest stable release inside every supported major line, keyed "vendor@major" (used for the constraints).
 * latest: newest stable release overall per vendor (reported so a new major can be noticed).
 * A failed lookup never throws; that vendor is simply left out and the generator falls back to its pinned default.
 */
export async function resolveProviders({ fetchImpl = fetch, timeoutMs = 15000, registry = 'https://registry.terraform.io' } = {}) {
  const versions = {};
  const latest = {};
  const errors = [];
  await Promise.all(Object.entries(PROVIDERS).map(async ([id, p]) => {
    try {
      const res = await fetchImpl(`${registry}/v1/providers/${p.source}/versions`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const all = (await res.json()).versions.map((v) => v.version).filter(stable);
      latest[id] = maxOf(all);
      for (const major of p.majors) {
        const inMajor = maxOf(all.filter((v) => majorOf(v) === major));
        if (inMajor) versions[versionKey(id, major)] = inMajor;
        else errors.push(`${p.source}: no stable ${major}.x release found`);
      }
    } catch (e) {
      errors.push(`${p.source}: ${e.message}`);
    }
  }));
  return { versions, latest, errors };
}

/** Human readable warnings: lookup failures and newer major versions that the generators do not support yet. */
export function describeResolution({ latest, errors }) {
  const lines = errors.map((e) => `provider lookup failed, using pinned default: ${e}`);
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (latest[id] && majorOf(latest[id]) > Math.max(...p.majors)) {
      lines.push(`${p.source} ${latest[id]} is a newer major than supported (${p.majors.join('.x, ')}.x); review the generator before adding it.`);
    }
  }
  return lines;
}
