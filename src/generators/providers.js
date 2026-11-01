/** Terraform provider metadata per generator. Browser safe (copied into dist with the generators). */

// `major` is the provider major line the generator was written and validated against.
// A newer major is only reported, never used automatically, because it can rename resources.
export const PROVIDERS = {
  paloalto: { source: 'PaloAltoNetworks/panos', name: 'panos', major: 1, fallback: '~> 1.11' },
  cisco: { source: 'CiscoDevNet/fmc', name: 'fmc', major: 2, fallback: '~> 2.0' },
  nsx: { source: 'vmware/nsxt', name: 'nsxt', major: 3, fallback: '~> 3.6' },
  fortinet: { source: 'fortinetdev/fortios', name: 'fortios', major: 1, fallback: '~> 1.20' },
  checkpoint: { source: 'CheckPointSW/checkpoint', name: 'checkpoint', major: 3, fallback: '~> 3.0' }
};

/** "~> MAJOR.MINOR" from a resolved version such as 2.6.1, or the pinned fallback. */
export function providerConstraint(vendorId, versions = {}) {
  const p = PROVIDERS[vendorId];
  const m = /^(\d+)\.(\d+)/.exec(versions[vendorId] ?? '');
  return m && Number(m[1]) === p.major ? `~> ${m[1]}.${m[2]}` : p.fallback;
}

/** Comment line describing which provider version the output targets and where it came from. */
export function providerNote(vendorId, versions = {}) {
  const p = PROVIDERS[vendorId];
  const constraint = providerConstraint(vendorId, versions);
  const resolved = versions[vendorId] && constraint !== p.fallback;
  return `# Provider: ${p.source} ${constraint} (${resolved ? `latest ${p.major}.x release is ${versions[vendorId]}, resolved from the Terraform Registry at build time` : 'pinned default, Terraform Registry lookup not available'})`;
}
