// Runs `terraform fmt -check`, `init` and `validate` against generated files, using the provider versions
// the build resolves from the Terraform Registry (falls back to pinned defaults if the lookup fails).
// Usage: node scripts/validate-terraform.js [--offline] [vendor ...]   (requires terraform on PATH)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadScopes } from '../src/endpoints.js';
import { generators } from '../src/generators/index.js';
import { PROVIDERS, providerConstraint } from '../src/generators/providers.js';
import { resolveProviders, describeResolution } from '../src/resolve-providers.js';

const args = process.argv.slice(2);
const offline = args.includes('--offline') || process.env.AZL_OFFLINE === '1';
const wanted = args.filter((a) => !a.startsWith('--'));
const vendors = generators.filter((g) => !wanted.length || wanted.includes(g.id));
const scopes = loadScopes();
// A region (web and non-web endpoints) and an OEM scope cover the generators' branches.
const sample = ['westeurope', 'dell'].map((n) => scopes.find((s) => s.name === n)).filter(Boolean);

const resolution = offline ? { versions: {}, latest: {}, errors: [] } : await resolveProviders();
describeResolution(resolution).forEach((l) => console.warn(`warning: ${l}`));
const providerVersions = resolution.versions;

const run = (cmd, cwd) => spawnSync('terraform', cmd, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
const steps = [
  ['fmt', ['fmt', '-check', '-no-color']],
  ['init', ['init', '-backend=false', '-input=false', '-no-color']],
  ['validate', ['validate', '-no-color']]
];
let failed = false;

for (const g of vendors) {
  const constraint = providerConstraint(g.id, providerVersions);
  for (const s of sample) {
    const dir = mkdtempSync(join(tmpdir(), `azlocal-${g.id}-`));
    for (const f of g.generate(s.endpoints, { scope: `${s.type}/${s.name}`, providerVersions })) {
      writeFileSync(join(dir, f.filename), f.content);
    }
    for (const [name, cmd] of steps) {
      const r = run(cmd, dir);
      if (r.status !== 0) {
        failed = true;
        console.error(`FAIL ${g.id} / ${s.name}: terraform ${name} with ${PROVIDERS[g.id].source} ${constraint}` +
          `${providerVersions[g.id] ? ` (resolved ${providerVersions[g.id]})` : ' (pinned default)'}\n` +
          `A new provider release may have changed the schema; update the generator rather than ignoring this.\n${r.stdout}${r.stderr}`);
        break;
      }
      if (name === 'validate') console.log(`ok   ${g.id} / ${s.name}  ${PROVIDERS[g.id].source} ${constraint}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
