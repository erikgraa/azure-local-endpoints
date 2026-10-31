// Runs `terraform fmt -check` and `terraform validate` against generated files.
// Usage: node scripts/validate-terraform.js [vendor ...]   (requires terraform on PATH)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadScopes } from '../src/endpoints.js';
import { generators } from '../src/generators/index.js';

const wanted = process.argv.slice(2);
const vendors = generators.filter((g) => !wanted.length || wanted.includes(g.id));
const scopes = loadScopes();
// A region (web and non-web endpoints) and an OEM scope cover the generators' branches.
const sample = ['westeurope', 'dell'].map((n) => scopes.find((s) => s.name === n)).filter(Boolean);

const run = (args, cwd) => spawnSync('terraform', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
const steps = [
  ['fmt', ['fmt', '-check', '-no-color']],
  ['init', ['init', '-backend=false', '-input=false', '-no-color']],
  ['validate', ['validate', '-no-color']]
];
let failed = false;

for (const g of vendors) {
  for (const s of sample) {
    const dir = mkdtempSync(join(tmpdir(), `azlocal-${g.id}-`));
    for (const f of g.generate(s.endpoints, { scope: `${s.type}/${s.name}` })) {
      writeFileSync(join(dir, f.filename), f.content);
    }
    for (const [name, args] of steps) {
      const r = run(args, dir);
      if (r.status !== 0) {
        failed = true;
        console.error(`FAIL ${g.id} / ${s.name}: terraform ${name}\n${r.stdout}${r.stderr}`);
        break;
      }
      if (name === 'validate') console.log(`ok   ${g.id} / ${s.name}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
