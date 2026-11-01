// Builds the static site (UI + anonymous JSON API + pre-generated Terraform) into ./dist
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadScopes } from './endpoints.js';
import { generators, variantsOf, variantKey } from './generators/index.js';
import { PROVIDERS, providerConstraint, versionKey } from './generators/providers.js';
import { resolveProviders, describeResolution } from './resolve-providers.js';

const DIST = join(ROOT, 'dist');
const write = (rel, data) => {
  const file = join(DIST, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(ROOT, 'site'), DIST, { recursive: true });
cpSync(join(ROOT, 'src', 'generators'), join(DIST, 'generators'), { recursive: true });
cpSync(join(ROOT, 'src', 'export.js'), join(DIST, 'export.js'));
cpSync(join(ROOT, 'src', 'notes.js'), join(DIST, 'notes.js'));

const scopes = loadScopes();
const generated = new Date().toISOString();

// Provider versions come from the Terraform Registry; AZL_OFFLINE=1 skips the lookup (pinned defaults are used).
const resolution = process.env.AZL_OFFLINE === '1'
  ? { versions: {}, latest: {}, errors: ['AZL_OFFLINE=1, registry lookup skipped'] }
  : await resolveProviders();
describeResolution(resolution).forEach((l) => console.warn(`warning: ${l}`));
const providerVersions = resolution.versions;

write('api/v1/providers.json', {
  generated,
  providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, {
    source: p.source,
    defaultMajor: p.major,
    latest: resolution.latest[id] ?? null,
    majors: Object.fromEntries(p.majors.map((m) => [m, {
      constraint: providerConstraint(id, providerVersions, m),
      resolved: providerVersions[versionKey(id, m)] ?? null,
      pinnedFallback: !providerVersions[versionKey(id, m)]
    }]))
  }]))
});

write('api/v1/index.json', {
  generated,
  vendors: generators.map((g) => ({
    id: g.id, name: g.name, description: g.description,
    variants: variantsOf(g).filter((v) => v.id).map((v) => ({ id: v.id, name: v.name, default: Boolean(v.default), key: variantKey(g, v) }))
  })),
  scopes: scopes.map(({ type, name, updated, count }) => ({
    type, name, updated, count,
    url: `api/v1/${type}/${name}.json`,
    terraform: Object.fromEntries(generators.flatMap((g) => variantsOf(g).map((v) => [variantKey(g, v), `terraform/${variantKey(g, v)}/${type}-${name}.tf`])))
  }))
});

let tfCount = 0;
for (const s of scopes) {
  write(`api/v1/${s.type}/${s.name}.json`, { generated, ...s });
  for (const g of generators) {
    for (const v of variantsOf(g)) {
      const files = g.generate(s.endpoints, { scope: `${s.type}/${s.name}`, dataUpdated: s.updated, fetched: generated, sourceUrl: s.source, providerVersions, ...v.options });
      const dir = `terraform/${variantKey(g, v)}`;
      // Single-file generators map to a stable name; multi-file ones go into a folder.
      if (files.length === 1) {
        write(`${dir}/${s.type}-${s.name}.tf`, files[0].content);
        tfCount++;
      } else {
        files.forEach((f) => { write(`${dir}/${s.type}-${s.name}/${f.filename}`, f.content); tfCount++; });
      }
    }
  }
}
console.log(`Built ${DIST}: ${scopes.length} scopes, ${tfCount} Terraform files`);
