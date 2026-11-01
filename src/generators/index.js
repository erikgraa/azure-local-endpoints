// To add a firewall vendor: create <vendor>.js exporting { id, name, description, generate(endpoints, options) }
// (generate returns [{ filename, content }]), then import and register it below. Nothing else changes.
import paloalto from './paloalto.js';
import cisco from './cisco.js';
import nsx from './nsx.js';
import fortinet from './fortinet.js';
import checkpoint from './checkpoint.js';

export const generators = [paloalto, cisco, nsx, fortinet, checkpoint];

export const getGenerator = (id) => generators.find((g) => g.id === id);

/** A generator's variants (e.g. provider major versions); generators without variants have a single unnamed default one. */
export const variantsOf = (g) => g.variants ?? [{ id: '', name: '', default: true, options: {} }];

/** Output key of a variant: the default variant keeps the plain generator id, others get a suffix ("paloalto-v1"). */
export const variantKey = (g, v) => (v.default ? g.id : `${g.id}-${v.id}`);
