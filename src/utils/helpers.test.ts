import { describe, expect, it, vi } from 'vitest';
import { safeHttpUrl, stripHtml } from './helpers';

describe('stripHtml', () => {
  it('returns plain text with collapsed whitespace', () => {
    expect(stripHtml('<p>Hello   <b>world</b></p>\n<p>!</p>')).toBe('Hello world !');
  });

  it('never assigns untrusted markup through innerHTML (img onerror fires even when detached)', () => {
    const setter = vi.spyOn(Element.prototype, 'innerHTML', 'set');
    expect(stripHtml('<img src=x onerror="alert(1)">text')).toBe('text');
    expect(setter).not.toHaveBeenCalled();
    setter.mockRestore();
  });
});

describe('safeHttpUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>',
    'file:///etc/passwd',
    '/relative',
    '',
    'not a url',
  ])('rejects %s', (raw) => {
    expect(safeHttpUrl(raw)).toBe('');
  });

  it('handles null/undefined', () => {
    expect(safeHttpUrl(undefined)).toBe('');
    expect(safeHttpUrl(null)).toBe('');
  });
});
