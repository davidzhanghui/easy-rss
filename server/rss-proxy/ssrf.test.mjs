import { describe, expect, it } from 'vitest';
import { hostIsPublic, isBlockedIp, pinnedLookup } from './ssrf.mjs';

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.5',
    '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1',
    '64:ff9b::7f00:1', '2002:7f00:1::1', '::127.0.0.1',
    'not-an-ip', '',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808'])(
    'allows %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe('hostIsPublic', () => {
  it('vets IP literals without DNS (incl. bracketed IPv6)', async () => {
    expect(await hostIsPublic('127.0.0.1')).toBe(false);
    expect(await hostIsPublic('[::1]')).toBe(false);
    expect(await hostIsPublic('[::ffff:7f00:1]')).toBe(false);
    expect(await hostIsPublic('8.8.8.8')).toBe(true);
  });

  it('blocks localhost and unresolvable names', async () => {
    expect(await hostIsPublic('localhost')).toBe(false);
    expect(await hostIsPublic('no-such-host.invalid')).toBe(false);
  });
});

describe('pinnedLookup', () => {
  it('refuses to hand out a loopback address', async () => {
    const err = await new Promise((resolve) => pinnedLookup('localhost', { all: true }, (e) => resolve(e)));
    expect(err).toMatchObject({ code: 'EBLOCKED' });
  });
});

describe('alternative IPv4 spellings (normalized by WHATWG URL before our check)', () => {
  it.each([
    ['http://2130706433/', false], // decimal 127.0.0.1
    ['http://0177.0.0.1/', false], // octal 127.0.0.1
    ['http://0x7f.0.0.1/', false], // hex 127.0.0.1
    ['http://127.1/', false], // short form
    ['http://2852039166/', false], // decimal 169.254.169.254
    ['http://[::ffff:7f00:1]/', false],
    ['http://[0:0:0:0:0:0:0:1]/', false],
    ['http://134744072/', true], // decimal 8.8.8.8
  ])('%s -> public=%s', async (url, expected) => {
    expect(await hostIsPublic(new URL(url).hostname)).toBe(expected);
  });
});
