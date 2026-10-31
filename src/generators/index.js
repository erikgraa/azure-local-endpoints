// To add a firewall vendor: create <vendor>.js exporting { id, name, description, generate(endpoints, options) }
// (generate returns [{ filename, content }]), then import and register it below. Nothing else changes.
import paloalto from './paloalto.js';
import cisco from './cisco.js';
import nsx from './nsx.js';
import fortinet from './fortinet.js';
import checkpoint from './checkpoint.js';
import azurefirewall from './azurefirewall.js';

export const generators = [paloalto, cisco, nsx, fortinet, checkpoint, azurefirewall];

export const getGenerator = (id) => generators.find((g) => g.id === id);
