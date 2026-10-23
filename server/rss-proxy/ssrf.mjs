/**
 * SSRF guard helpers for rss-proxy (zero dependencies, unit-tested).
 *
 *  - isBlockedIp:   true if an address must never be fetched
 *  - hostIsPublic:  resolve a hostname (or vet an IP literal) -> all public?
 *  - pinnedLookup:  `lookup` option for http(s).request. Resolution and the
 *                   public-address check happen in ONE step and the socket
 *                   connects to exactly the vetted address, so a DNS-rebinding
 *                   answer between "check" and "connect" cannot win.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

function v4ToInt(ip) {
  const b = ip.split('.').map(Number);
  return (((b[0] * 256 + b[1]) * 256 + b[2]) * 256 + b[3]) >>> 0;
}

function v4InCidr(n, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (n & mask) === (v4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  ['0.0.0.0', 8], // this network
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local (cloud metadata!)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmark
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

function isBlockedV4(ip) {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => v4InCidr(n, base, bits));
}

/** Expand any textual IPv6 form (incl. `::` and trailing dotted v4) to 8 16-bit groups. */
function expandV6(ip) {
  let s = ip.toLowerCase().split('%')[0]; // drop zone id
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = v4ToInt(dotted[2]);
    s = `${dotted[1]}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  const groups = [...h, ...Array(Math.max(fill, 0)).fill('0'), ...t].map((g) => parseInt(g || '0', 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g)) ? groups : null;
}

const v4FromGroups = (hi, lo) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

/** True if the IP must never be fetched (SSRF guard). Non-IP input -> blocked. */
export function isBlockedIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedV4(ip);
  if (fam !== 6) return true;

  const g = expandV6(ip);
  if (!g) return true;
  const zeros = (from, to) => g.slice(from, to).every((x) => x === 0);

  if (zeros(0, 7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedV4(v4FromGroups(g[6], g[7])); // v4-mapped
  if (zeros(0, 6)) return true; // v4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isBlockedV4(v4FromGroups(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isBlockedV4(v4FromGroups(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** Resolve (or vet an IP literal) and require EVERY address to be public. */
export async function hostIsPublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, ''); // URL.hostname keeps IPv6 brackets
  if (net.isIP(host)) return !isBlockedIp(host);
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return false;
  }
  return addrs.length > 0 && addrs.every((a) => !isBlockedIp(a.address));
}

/** `lookup` for http(s).request: vet and pin in one step (anti DNS-rebinding). */
export function pinnedLookup(hostname, options, cb) {
  dns
    .lookup(hostname, { all: true })
    .then((addrs) => {
      if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
        const err = new Error('blocked host');
        err.code = 'EBLOCKED';
        return cb(err);
      }
      if (options && options.all) return cb(null, addrs);
      return cb(null, addrs[0].address, addrs[0].family);
    })
    .catch((e) => cb(e));
}
