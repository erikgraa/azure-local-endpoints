import { attrs, defaults, isWeb, nonWebGroups, q, list, slug, unique, wholeLabelWildcard, descr, provenanceComment } from './util.js';
import { DISCLAIMER_COMMENT } from './disclaimer.js';
import { providerConstraint } from './providers.js';

const rule = (o, fields) =>
  `    name                  = ${q(fields.name)}
    description           = ${q(fields.description)}
    source_zones          = [${q(o.sourceZone)}]
    source_addresses      = [${q(o.sourceAddress)}]
    source_users          = ["any"]
    destination_zones     = [${q(o.destinationZone)}]
    destination_addresses = ${fields.dest}
    applications          = ${fields.apps}
    services              = ${fields.services}
    categories            = ${fields.categories}
    action                = "allow"`;

function generateV1(endpoints, options = {}) {
  const o = defaults(options);
  const label = o.scope ? ` (${o.scope})` : '';
  const out = [];
  const rules = [];

  out.push(`# Palo Alto PAN-OS rules for Azure Local endpoints${label}
${DISCLAIMER_COMMENT}
${provenanceComment(o, 'paloalto')}
terraform {
  required_providers {
    panos = {
      source  = "PaloAltoNetworks/panos"
      version = ${q(providerConstraint('paloalto', o.providerVersions, 1))}
    }
  }
}

variable "panos_hostname" { type = string }
variable "panos_api_key" {
  type      = string
  sensitive = true
}

provider "panos" {
  hostname = var.panos_hostname
  api_key  = var.panos_api_key
}
`);

  const web = endpoints.filter(isWeb);
  if (web.length) {
    const sites = unique(web.map((e) => wholeLabelWildcard(e.host) + e.path)).sort();
    const ports = unique(web.flatMap((e) => e.ports));
    const services = ports.map((p) => q(p === 80 ? 'service-http' : 'service-https'));
    const apps = unique(ports.map((p) => (p === 80 ? 'web-browsing' : 'ssl')));
    out.push(`resource "panos_custom_url_category" "${o.prefix}" {
  name        = ${q(`${o.prefix}-endpoints`)}
  description = ${q(descr(o, 'Azure Local required URLs'))}
  type        = "URL List"
  sites = ${list(sites.map(q))}
}
`);
    rules.push(rule(o, {
      name: `${o.prefix}-allow-web`,
      description: descr(o, 'Azure Local required web endpoints'),
      dest: '["any"]',
      apps: `[${apps.map(q).join(', ')}]`,
      services: `[${services.join(', ')}]`,
      categories: `[panos_custom_url_category.${o.prefix}.name]`
    }));
  }

  const skipped = [];
  for (const g of nonWebGroups(endpoints)) {
    const hosts = unique(g.endpoints.filter((e) => !e.wildcard).map((e) => e.host)).sort();
    g.endpoints.filter((e) => e.wildcard).forEach((e) => skipped.push(`${e.url} (${g.protocol}/${g.port})`));
    if (!hosts.length) continue;
    const svc = `${o.prefix}-${g.protocol}-${g.port}`;
    out.push(`resource "panos_service_object" "${slug(svc)}" {
${attrs(2, [['name', q(svc)], ['description', q(descr(o, `Azure Local ${g.protocol.toUpperCase()}/${g.port}`))], ['protocol', q(g.protocol)], ['destination_port', q(g.port)]])}
}
`);
    const addrRefs = hosts.map((h) => {
      const id = `${o.prefix}_${slug(h)}`;
      if (!out.some((c) => c.includes(`"panos_address_object" "${id}"`))) {
        out.push(`resource "panos_address_object" "${id}" {
${attrs(2, [['name', q(`${o.prefix}-${h}`.slice(0, 63))], ['description', q(descr(o, 'Azure Local endpoint'))], ['type', '"fqdn"'], ['value', q(h)]])}
}
`);
      }
      return `panos_address_object.${id}.name`;
    });
    rules.push(rule(o, {
      name: `${o.prefix}-allow-${g.protocol}-${g.port}`,
      description: descr(o, `Azure Local ${g.protocol.toUpperCase()}/${g.port} endpoints`),
      dest: `[${addrRefs.join(', ')}]`,
      apps: '["any"]',
      services: `[panos_service_object.${slug(svc)}.name]`,
      categories: '["any"]'
    }));
  }

  out.push(`# panos_security_rule_group only manages the rules below; it does not remove others.
resource "panos_security_rule_group" "${o.prefix}" {
  position_keyword = "bottom"
${rules.map((r) => `  rule {\n${r}\n  }`).join('\n')}
}
`);

  if (skipped.length) {
    out.push(`# Skipped (wildcard FQDNs on non-web ports cannot be expressed as PAN-OS address objects):\n${skipped.map((s) => `#   ${s}`).join('\n')}\n`);
  }
  return [{ filename: `${o.prefix}-paloalto.tf`, content: out.join('\n') }];
}

/** panos provider 2.x: renamed resources (panos_address, panos_service, panos_security_policy_rules) and a `location` attribute. */
function generateV2(endpoints, options = {}) {
  const o = defaults(options);
  const label = o.scope ? ` (${o.scope})` : '';
  const out = [];
  const rules = [];

  out.push(`# Palo Alto PAN-OS rules for Azure Local endpoints${label} (panos provider 2.x)
${DISCLAIMER_COMMENT}
${provenanceComment(o, 'paloalto')}
terraform {
  required_version = ">= 1.8"

  required_providers {
    panos = {
      source  = "PaloAltoNetworks/panos"
      version = ${q(providerConstraint('paloalto', o.providerVersions, 2))}
    }
  }
}

variable "panos_hostname" { type = string }
variable "panos_api_key" {
  type      = string
  sensitive = true
}

variable "location" {
  type        = any
  default     = { vsys = { name = "vsys1" } }
  description = "Where the objects live: { vsys = { name = \\"vsys1\\" } } on a firewall, { device_group = { name = \\"...\\" } } or { shared = {} } on Panorama"
}

provider "panos" {
  hostname = var.panos_hostname
  api_key  = var.panos_api_key
}
`);

  const rule = (fields) => `    {
${attrs(6, [
    ['name', q(fields.name)],
    ['description', q(fields.description)],
    ['source_zones', `[${q(o.sourceZone)}]`],
    ['source_addresses', `[${q(o.sourceAddress)}]`],
    ['source_users', '["any"]'],
    ['destination_zones', `[${q(o.destinationZone)}]`],
    ['destination_addresses', fields.dest],
    ['applications', fields.apps],
    ['services', fields.services],
    ['category', fields.category],
    ['action', '"allow"']
  ])}
    },`;

  const web = endpoints.filter(isWeb);
  if (web.length) {
    const sites = unique(web.map((e) => wholeLabelWildcard(e.host) + e.path)).sort();
    const ports = unique(web.flatMap((e) => e.ports));
    out.push(`resource "panos_custom_url_category" "${o.prefix}" {
${attrs(2, [
    ['location', 'var.location'],
    ['name', q(`${o.prefix}-endpoints`)],
    ['description', q(descr(o, 'Azure Local required URLs'))],
    ['type', '"URL List"'],
    ['list', list(sites.map(q))]
  ])}
}
`);
    rules.push(rule({
      name: `${o.prefix}-allow-web`,
      description: descr(o, 'Azure Local required web endpoints'),
      dest: '["any"]',
      apps: `[${unique(ports.map((p) => (p === 80 ? 'web-browsing' : 'ssl'))).map(q).join(', ')}]`,
      services: `[${ports.map((p) => q(p === 80 ? 'service-http' : 'service-https')).join(', ')}]`,
      category: `[panos_custom_url_category.${o.prefix}.name]`
    }));
  }

  const skipped = [];
  for (const g of nonWebGroups(endpoints)) {
    const hosts = unique(g.endpoints.filter((e) => !e.wildcard).map((e) => e.host)).sort();
    g.endpoints.filter((e) => e.wildcard).forEach((e) => skipped.push(`${e.url} (${g.protocol}/${g.port})`));
    if (!hosts.length) continue;
    const svc = `${o.prefix}-${g.protocol}-${g.port}`;
    out.push(`resource "panos_service" "${slug(svc)}" {
${attrs(2, [['location', 'var.location'], ['name', q(svc)], ['description', q(descr(o, `Azure Local ${g.protocol.toUpperCase()}/${g.port}`))]])}

  protocol = {
    ${g.protocol} = {
      destination_port = ${q(g.port)}
    }
  }
}
`);
    const addrRefs = hosts.map((h) => {
      const id = `${o.prefix}_${slug(h)}`;
      if (!out.some((c) => c.includes(`"panos_address" "${id}"`))) {
        out.push(`resource "panos_address" "${id}" {
${attrs(2, [['location', 'var.location'], ['name', q(`${o.prefix}-${h}`.slice(0, 63))], ['description', q(descr(o, 'Azure Local endpoint'))], ['fqdn', q(h)]])}
}
`);
      }
      return `panos_address.${id}.name`;
    });
    rules.push(rule({
      name: `${o.prefix}-allow-${g.protocol}-${g.port}`,
      description: descr(o, `Azure Local ${g.protocol.toUpperCase()}/${g.port} endpoints`),
      dest: `[${addrRefs.join(', ')}]`,
      apps: '["any"]',
      services: `[panos_service.${slug(svc)}.name]`,
      category: '["any"]'
    }));
  }

  out.push(`# panos_security_policy_rules only manages the rules below; it does not remove others.
resource "panos_security_policy_rules" "${o.prefix}" {
  location = var.location

  position = {
    where = "last"
  }

  rules = [
${rules.join('\n')}
  ]
}
`);

  if (skipped.length) {
    out.push(`# Skipped (wildcard FQDNs on non-web ports cannot be expressed as PAN-OS address objects):\n${skipped.map((s) => `#   ${s}`).join('\n')}\n`);
  }
  return [{ filename: `${o.prefix}-paloalto.tf`, content: out.join('\n') }];
}

function generate(endpoints, options = {}) {
  return Number(options.providerMajor) === 1 ? generateV1(endpoints, options) : generateV2(endpoints, options);
}

export default {
  id: 'paloalto',
  name: 'Palo Alto (PAN-OS)',
  description: 'panos provider 2.x (default) or 1.x: custom URL category, FQDN/service objects and security rules.',
  // The first variant is the default; the others are generated as separate files (e.g. terraform/paloalto-v1/).
  variants: [
    { id: 'v2', name: 'Provider 2.x (current)', default: true, options: { providerMajor: 2 } },
    { id: 'v1', name: 'Provider 1.x (legacy)', options: { providerMajor: 1 } }
  ],
  generate
};
