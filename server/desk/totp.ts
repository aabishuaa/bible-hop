// Time-based one-time passwords (RFC 6238), for the Desk's second factor (rule 15.2).
// Works with any authenticator app: Google Authenticator, Authy, 1Password, Apple Passwords...
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/=+$/, '')) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, timeMs: number, step = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/** Accepts the current code and its neighbours, for clocks a little out of step. */
export function verifyTotp(secret: string, code: string, nowMs = Date.now()): boolean {
  const given = Buffer.from(code.replace(/\s+/g, ''));
  if (given.length !== 6) return false;
  for (const delta of [0, -1, 1]) {
    const want = Buffer.from(totpAt(secret, nowMs + delta * 30_000));
    if (timingSafeEqual(given, want)) return true;
  }
  return false;
}

export function otpauthUrl(username: string, secret: string, issuer = 'Bible Hopping'): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
