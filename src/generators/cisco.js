import { attrs, defaults, isWeb, nonWebGroups, q, list, slug, unique, wholeLabelWildcard, descr, provenanceComment } from './util.js';
import { DISCLAIMER_COMMENT } from './disclaimer.js';

const PROTO = { tcp: 'TCP', udp: 'UDP' };

function generate(endpoints, options = {}) {
  const o = defaults(options);
  const label = o.scope ? ` (${o.scope})` : '';
  const action = 'ALLOW';
  const out = [];
  const ruleBlocks = [];

  out.push(`# Cisco Secure Firewall (FTD via FMC) objects and rules for Azure Local endpoints${label}
${DISCLAIMER_COMMENT}
${provenanceComment(o)}
terraform {
  required_providers {
    fmc = {
      source  = "CiscoDevNet/fmc"
      version = ">= 2.0.0"
    }
  }
}

variable "fmc_url" { type = string }
variable "fmc_username" { type = string }
variable "fmc_password" {
  type      = string
  sensitive = true
}
variable "access_control_policy_id" {
  type        = string
  description = "ID of the existing FMC access control policy the rules are added to"
}
variable "source_zone_id" {
  type        = string
  default     = null
  description = "Optional security zone ID for the rule source (${o.sourceZone})"
}

provider "fmc" {
  url      = var.fmc_url
  username = var.fmc_username
  password = var.fmc_password
}
`);

  const web = endpoints.filter(isWeb);
  if (web.length) {
    // FMC URL matching is domain-based: "example.com" also matches its subdomains, so "*." is dropped.
    const literals = unique(web.flatMap((e) =>
      e.ports.map((p) => `${p === 80 ? 'http' : 'https'}://${wholeLabelWildcard(e.host).replace(/^\*\./, '')}${e.path}`)
    )).sort();
    out.push(`resource "fmc_url_group" "${o.prefix}" {
  name        = ${q(`${o.prefix}-endpoints`)}
  description = ${q(descr(o, 'Azure Local required URLs'))}
  urls        = []
  literals = ${list(literals.map((u) => `{ url = ${q(u)} }`))}
}
`);
    ruleBlocks.push(`resource "fmc_access_rule" "${o.prefix}_web" {
  access_control_policy_id = var.access_control_policy_id
  name                     = ${q(`${o.prefix}-allow-web`)}
  action                   = ${q(action)}
  source_zones             = var.source_zone_id == null ? null : [{ id = var.source_zone_id }]
  url_objects              = [{ id = fmc_url_group.${o.prefix}.id }]
}
`);
  }

  for (const g of nonWebGroups(endpoints)) {
    const hosts = unique(g.endpoints.filter((e) => !e.wildcard).map((e) => e.host)).sort();
    if (!hosts.length) continue;
    const pid = `${o.prefix}_${g.protocol}_${g.port}`;
    out.push(`resource "fmc_port" "${pid}" {
${attrs(2, [['name', q(`${o.prefix}-${g.protocol}-${g.port}`)], ['description', q(descr(o, `Azure Local ${g.protocol.toUpperCase()}/${g.port}`))], ['protocol', q(g.protocol === 'udp' ? '17' : '6')], ['port', q(g.port)]])}
}
`);
    const refs = hosts.map((h) => {
      const id = `${o.prefix}_${slug(h)}`;
      if (!out.some((c) => c.includes(`"fmc_fqdn" "${id}"`))) {
        out.push(`resource "fmc_fqdn" "${id}" {
${attrs(2, [['name', q(`${o.prefix}-${h}`.slice(0, 63))], ['description', q(descr(o, 'Azure Local endpoint'))], ['fqdn', q(h)]])}
}
`);
      }
      return `{ id = fmc_fqdn.${id}.id, type = fmc_fqdn.${id}.type }`;
    });
    ruleBlocks.push(`resource "fmc_access_rule" "${pid}" {
${attrs(2, [
      ['access_control_policy_id', 'var.access_control_policy_id'],
      ['name', q(`${o.prefix}-allow-${g.protocol}-${g.port}`)],
      ['action', q(action)],
      ['source_zones', 'var.source_zone_id == null ? null : [{ id = var.source_zone_id }]'],
      ['destination_network_objects', list(refs)],
      ['destination_port_objects', `[{ id = fmc_port.${pid}.id }]`]
    ])}
}
`);
  }

  const skipped = nonWebGroups(endpoints).flatMap((g) =>
    g.endpoints.filter((e) => e.wildcard).map((e) => `${e.url} (${PROTO[g.protocol]}/${g.port})`));
  out.push(...ruleBlocks);
  if (skipped.length) {
    out.push(`# Skipped (wildcard FQDNs on non-web ports cannot be expressed as FMC FQDN objects):\n${skipped.map((s) => `#   ${s}`).join('\n')}\n`);
  }
  return [{ filename: `${o.prefix}-cisco.tf`, content: out.join('\n') }];
}

export default {
  id: 'cisco',
  name: 'Cisco (Secure Firewall / FMC)',
  description: 'CiscoDevNet/fmc provider: URL group, FQDN and port objects and access rules.',
  generate
};
