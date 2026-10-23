import DOMPurify from 'dompurify';

/** Sanitize RSS HTML -> safe HTML. Never render raw RSS HTML directly. */
export function sanitizeArticleHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
  }).replace(/<a(?![^>]*target=)/g, '<a target="_blank" rel="noopener noreferrer"');
}
