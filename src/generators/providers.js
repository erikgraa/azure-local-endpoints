/** Terraform provider metadata per generator. Browser safe (copied into dist with the generators). */

// `major` is the default provider major line; `majors` lists every line a generator supports (each is validated in CI).
// A newer major than any listed one is only reported, never used automatically, because it can rename resources.
export const PROVIDERS = {
  paloalto: { source: 'PaloAltoNetworks/panos', name: 'panos', major: 2, majors: [2, 1], fallbacks: { 1: '~> 1.11', 2: '~> 2.0' } },
  cisco: { source: 'CiscoDevNet/fmc', name: 'fmc', major: 2, majors: [2], fallbacks: { 2: '~> 2.0' } },
  nsx: { source: 'vmware/nsxt', name: 'nsxt', major: 3, majors: [3], fallbacks: { 3: '~> 3.6' } },
  fortinet: { source: 'fortinetdev/fortios', name: 'fortios', major: 1, majors: [1], fallbacks: { 1: '~> 1.20' } },
  checkpoint: { source: 'CheckPointSW/checkpoint', name: 'checkpoint', major: 3, majors: [3], fallbacks: { 3: '~> 3.0' } }
};

/** Key under which the resolved version of one major line is stored, e.g. "paloalto@1". */
export const versionKey = (vendorId, major) => `${vendorId}@${major}`;

/** "~> MAJOR.MINOR" from the resolved version of the given major line, or the pinned fallback. */
export function providerConstraint(vendorId, versions = {}, major = PROVIDERS[vendorId].major) {
  const p = PROVIDERS[vendorId];
  const m = /^(\d+)\.(\d+)/.exec(versions[versionKey(vendorId, major)] ?? '');
  return m && Number(m[1]) === Number(major) ? `~> ${m[1]}.${m[2]}` : p.fallbacks[major];
}

/** Comment line describing which provider version the output targets and where it came from. */
export function providerNote(vendorId, versions = {}, major = PROVIDERS[vendorId].major) {
  const p = PROVIDERS[vendorId];
  const constraint = providerConstraint(vendorId, versions, major);
  const resolvedVersion = versions[versionKey(vendorId, major)];
  const resolved = resolvedVersion && Number(resolvedVersion.split('.')[0]) === Number(major);
  return `# Provider: ${p.source} ${constraint} (${resolved ? `latest ${major}.x release is ${resolvedVersion}, resolved from the Terraform Registry at build time` : 'pinned default, Terraform Registry lookup not available'})`;
}
