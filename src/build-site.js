// Builds the static site (UI + anonymous JSON API + pre-generated Terraform) into ./dist
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadScopes } from './endpoints.js';
import { generators } from './generators/index.js';

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

write('api/v1/index.json', {
  generated,
  vendors: generators.map(({ id, name, description }) => ({ id, name, description })),
  scopes: scopes.map(({ type, name, updated, count }) => ({
    type, name, updated, count,
    url: `api/v1/${type}/${name}.json`,
    terraform: Object.fromEntries(generators.map((g) => [g.id, `terraform/${g.id}/${type}-${name}.tf`]))
  }))
});

let tfCount = 0;
for (const s of scopes) {
  write(`api/v1/${s.type}/${s.name}.json`, { generated, ...s });
  for (const g of generators) {
    const files = g.generate(s.endpoints, { scope: `${s.type}/${s.name}`, dataUpdated: s.updated, fetched: generated, sourceUrl: s.source });
    // Single-file generators map to a stable name; multi-file ones go into a folder.
    if (files.length === 1) {
      write(`terraform/${g.id}/${s.type}-${s.name}.tf`, files[0].content);
      tfCount++;
    } else {
      files.forEach((f) => { write(`terraform/${g.id}/${s.type}-${s.name}/${f.filename}`, f.content); tfCount++; });
    }
  }
}
console.log(`Built ${DIST}: ${scopes.length} scopes, ${tfCount} Terraform files`);
