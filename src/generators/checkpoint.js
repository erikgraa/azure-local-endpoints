import { attrs, defaults, isWeb, nonWebGroups, q, list, slug, unique, wholeLabelWildcard } from './util.js';
import { DISCLAIMER_COMMENT } from './disclaimer.js';

const domainIndex = (eps) => {
  // Check Point domain objects are ".example.com"; is_sub_domain covers subdomains (wildcards).
  const map = new Map();
  for (const e of eps) {
    const h = wholeLabelWildcard(e.host);
    const wild = h.startsWith('*.');
    const name = `.${wild ? h.slice(2) : h}`;
    map.set(name, map.get(name) || wild);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
};

function generate(endpoints, options = {}) {
  const o = defaults(options);
  const label = o.scope ? ` (${o.scope})` : '';
  const out = [];
  const rules = [];

  out.push(`# Check Point (Management API) objects and rules for Azure Local endpoints${label}
${DISCLAIMER_COMMENT}
# Check Point domain objects match domains only, so URL paths are dropped.
terraform {
  required_providers {
    checkpoint = {
      source  = "CheckPointSW/checkpoint"
      version = ">= 2.8"
    }
  }
}

variable "checkpoint_server" { type = string }
variable "checkpoint_username" { type = string }
variable "checkpoint_password" {
  type      = string
  sensitive = true
}
variable "access_layer" {
  type        = string
  default     = "Network"
  description = "Access control layer the rules are added to"
}

provider "checkpoint" {
  server   = var.checkpoint_server
  username = var.checkpoint_username
  password = var.checkpoint_password
  context  = "web_api"
}
`);

  const seen = new Set();
  const domainsFor = (eps) => domainIndex(eps).map(([name, sub]) => {
    const id = `${o.prefix}_${slug(name)}${sub ? '_sub' : ''}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(`resource "checkpoint_management_dns_domain" "${id}" {
${attrs(2, [['name', q(name)], ['is_sub_domain', String(sub)]])}
}
`);
    }
    return `checkpoint_management_dns_domain.${id}.name`;
  });

  const web = endpoints.filter(isWeb);
  if (web.length) {
    const ports = unique(web.flatMap((e) => e.ports)).sort((a, b) => a - b);
    rules.push({
      id: `${o.prefix}_web`,
      name: `${o.prefix}-allow-web`,
      destination: domainsFor(web),
      services: ports.map((p) => q(p === 80 ? 'http' : 'https'))
    });
  }

  for (const g of nonWebGroups(endpoints)) {
    const sid = `${o.prefix}_${g.protocol}_${g.port}`;
    out.push(`resource "checkpoint_management_service_${g.protocol}" "${sid}" {
${attrs(2, [['name', q(`${o.prefix}-${g.protocol}-${g.port}`)], ['port', q(g.port)]])}
}
`);
    rules.push({
      id: sid,
      name: `${o.prefix}-allow-${g.protocol}-${g.port}`,
      destination: domainsFor(g.endpoints),
      services: [`checkpoint_management_service_${g.protocol}.${sid}.name`]
    });
  }

  const src = o.sourceAddress === 'any' ? 'Any' : o.sourceAddress;
  for (const r of rules) {
    out.push(`resource "checkpoint_management_access_rule" "${r.id}" {
${attrs(2, [
      ['layer', 'var.access_layer'],
      ['name', q(r.name)],
      ['action', '"Accept"'],
      ['source', `[${q(src)}]`],
      ['destination', list(r.destination)],
      ['service', `[${r.services.join(', ')}]`]
    ])}

  position {
    top = "top"
  }

  track {
    type = "Log"
  }
}
`);
  }
  return [{ filename: `${o.prefix}-checkpoint.tf`, content: out.join('\n') }];
}

export default {
  id: 'checkpoint',
  name: 'Check Point',
  description: 'CheckPointSW/checkpoint provider: domain objects, services and access rules.',
  generate
};
