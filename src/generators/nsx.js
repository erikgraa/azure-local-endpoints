import { attrs, defaults, isWeb, nonWebGroups, q, list, slug, unique, wholeLabelWildcard } from './util.js';
import { DISCLAIMER_COMMENT } from './disclaimer.js';

const domainBlock = (description, domains) =>
  `  domain_name {
${attrs(4, [['description', q(description)], ['value', list(domains.map(q), 6)]])}
  }`;

function generate(endpoints, options = {}) {
  const o = defaults(options);
  const label = o.scope ? ` (${o.scope})` : '';
  const action = 'ALLOW';
  const out = [];
  const rules = [];

  out.push(`# VMware NSX distributed firewall rules for Azure Local endpoints${label}
${DISCLAIMER_COMMENT}
# FQDN filtering in NSX is domain based (URL paths are dropped) and requires DNS snooping/FQDN analysis.
terraform {
  required_providers {
    nsxt = {
      source  = "vmware/nsxt"
      version = ">= 3.6"
    }
  }
}

variable "nsx_host" { type = string }
variable "nsx_username" { type = string }
variable "nsx_password" {
  type      = string
  sensitive = true
}
variable "source_group_paths" {
  type        = list(string)
  default     = []
  description = "NSX group paths for the Azure Local nodes (${o.sourceAddress}); empty means any"
}

provider "nsxt" {
  host     = var.nsx_host
  username = var.nsx_username
  password = var.nsx_password
}
`);

  const domains = (eps) => unique(eps.map((e) => wholeLabelWildcard(e.host))).sort();

  const web = endpoints.filter(isWeb);
  if (web.length) {
    const ports = unique(web.flatMap((e) => e.ports)).sort((a, b) => a - b);
    out.push(`resource "nsxt_policy_context_profile" "${o.prefix}_web" {
  display_name = ${q(`${o.prefix}-web-fqdns`)}
  description  = "Azure Local required web FQDNs${label}"
${domainBlock('Azure Local required FQDNs', domains(web))}
}

resource "nsxt_policy_service" "${o.prefix}_web" {
  display_name = ${q(`${o.prefix}-web`)}
  l4_port_set_entry {
    display_name      = "tcp-web"
    protocol          = "TCP"
    destination_ports = [${ports.map((p) => q(p)).join(', ')}]
  }
}
`);
    rules.push({
      name: `${o.prefix}-allow-web`,
      services: `[nsxt_policy_service.${o.prefix}_web.path]`,
      profiles: `[nsxt_policy_context_profile.${o.prefix}_web.path]`
    });
  }

  for (const g of nonWebGroups(endpoints)) {
    const id = `${o.prefix}_${g.protocol}_${g.port}`;
    out.push(`resource "nsxt_policy_context_profile" "${id}" {
  display_name = ${q(`${o.prefix}-${g.protocol}-${g.port}-fqdns`)}
${domainBlock(`Azure Local ${g.protocol.toUpperCase()}/${g.port} FQDNs`, domains(g.endpoints))}
}

resource "nsxt_policy_service" "${id}" {
  display_name = ${q(`${o.prefix}-${g.protocol}-${g.port}`)}
  l4_port_set_entry {
    display_name      = ${q(`${g.protocol}-${g.port}`)}
    protocol          = ${q(g.protocol.toUpperCase())}
    destination_ports = [${q(g.port)}]
  }
}
`);
    rules.push({
      name: `${o.prefix}-allow-${g.protocol}-${g.port}`,
      services: `[nsxt_policy_service.${id}.path]`,
      profiles: `[nsxt_policy_context_profile.${id}.path]`
    });
  }

  out.push(`resource "nsxt_policy_security_policy" "${slug(o.prefix)}" {
  display_name = ${q(`${o.prefix}-azure-local`)}
  description  = "Azure Local required endpoints${label}"
  category     = "Application"
${rules.map((r) => `
  rule {
    display_name  = ${q(r.name)}
    action        = ${q(action)}
    direction     = "OUT"
    source_groups = var.source_group_paths
    services      = ${r.services}
    profiles      = ${r.profiles}
    logged        = true
  }`).join('\n')}
}
`);
  return [{ filename: `${o.prefix}-nsx.tf`, content: out.join('\n') }];
}

export default {
  id: 'nsx',
  name: 'VMware NSX (distributed firewall)',
  description: 'vmware/nsxt provider: FQDN context profiles, port services and a security policy.',
  generate
};
