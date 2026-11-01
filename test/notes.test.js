import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanNotes, extractLinks, linkify } from '../src/notes.js';
import { loadScopes } from '../src/endpoints.js';

const HPE = 'Enables SBE download connector support.<br><br>The package and meta files of each SBE release are posted in the repository “h30302.www3.hpe.com/pub/” for download purpose. For example:<br><br>h30302.www3.hpe.com/pub/SBE\\_HPE\\_ProLiant-Standard\\_5.0.2604.21.zip?merchantId=PUB\\_DROPBOX<br><br>h30302.www3.hpe.com/pub/SBE\\_HPE\\_ProLiant-Standard\\_5.0.2604.21.xml?merchantId=PUB\\_DROPBOX';

test('cleanNotes turns <br> into line breaks and drops other markup and escapes', () => {
  const t = cleanNotes(HPE);
  assert.ok(!/<|>/.test(t));
  assert.ok(!t.includes('\\_'));
  assert.equal(t.split('\n\n').length, 4);
  assert.ok(t.startsWith('Enables SBE download connector support.\n\nThe package'));
  assert.equal(cleanNotes('a <b>bold</b> &amp; b'), 'a bold & b');
  assert.equal(cleanNotes(undefined), '');
});

test('extractLinks finds scheme and host/path links but not bare hosts', () => {
  const links = extractLinks(cleanNotes(HPE));
  assert.deepEqual(links, [
    'h30302.www3.hpe.com/pub/',
    'h30302.www3.hpe.com/pub/SBE_HPE_ProLiant-Standard_5.0.2604.21.zip?merchantId=PUB_DROPBOX',
    'h30302.www3.hpe.com/pub/SBE_HPE_ProLiant-Standard_5.0.2604.21.xml?merchantId=PUB_DROPBOX'
  ]);
  assert.deepEqual(extractLinks('see https://example.com/a. Also aka.ms'), ['https://example.com/a']);
});

test('linkify escapes HTML and links URLs', () => {
  const html = linkify('x <script> https://example.com/a?b=1&c=2, ok');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<a href="https://example.com/a?b=1&amp;c=2"'));
  assert.ok(html.includes('</a>, ok'));
  assert.ok(linkify('h30302.www3.hpe.com/pub/x').includes('href="https://h30302.www3.hpe.com/pub/x"'));
});

test('no loaded endpoint keeps HTML tags in notes', () => {
  for (const s of loadScopes()) for (const e of s.endpoints) assert.ok(!/<[a-z/][^>]*>/i.test(e.notes), `${s.name} ${e.id}`);
  const hpe = loadScopes().find((s) => s.name === 'hpe').endpoints.find((e) => e.links.length);
  assert.ok(hpe.links.length >= 3);
});
