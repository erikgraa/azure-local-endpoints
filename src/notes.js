/** Notes helpers; browser safe (the build copies this file next to the site). */

/** Turns the Markdown/HTML-ish notes cell into plain text: <br> becomes a line break, other tags and escapes are removed. */
export function cleanNotes(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, '&')
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Links with a scheme, or host names followed by a path (a bare "aka.ms" is not treated as a link).
const LINK_RE = /\bhttps?:\/\/[^\s"“”<>]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s"“”<>]*/gi;
const trimLink = (s) => s.replace(/[.,;:!?)\]]+$/, '');

/** Distinct links found in the notes, in order of appearance. */
export function extractLinks(notes) {
  return [...new Set((String(notes).match(LINK_RE) ?? []).map(trimLink))];
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Escaped HTML for the notes with links made clickable; line breaks are left for CSS (white-space: pre-line). */
export function linkify(notes) {
  const text = String(notes);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const url = trimLink(m[0]);
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out += escapeHtml(text.slice(last, m.index)) + `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    last = m.index + url.length;
  }
  return out + escapeHtml(text.slice(last));
}
