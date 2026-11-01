export const REPO_URL = 'https://github.com/erikgraa/azure-local-endpoints';
export const DOCS_URL = 'https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements';
export const SOURCE_URL = 'https://github.com/Azure/AzureStack-Tools/tree/master/HCI';

/** Plain-text disclaimer lines, reused by the generated Terraform, the JSON export and the site footer. */
export const DISCLAIMER_LINES = [
  'Community-driven, unofficial tool. Not affiliated with, endorsed by, or sponsored by Microsoft.',
  `Data comes from Microsoft's public Azure Local firewall documentation (${DOCS_URL}) and AzureStack-Tools (${SOURCE_URL}).`,
  'Always verify the generated rules against the official documentation before deploying. Provided as-is, without warranty.',
  `Source: ${REPO_URL}`
];

export const DISCLAIMER = DISCLAIMER_LINES.join(' ');

/** Disclaimer as a Terraform/HCL comment block. */
export const DISCLAIMER_COMMENT = DISCLAIMER_LINES.map((l) => `# ${l}`).join('\n');
