// Stable per-device identity. deviceCode is generated once and persisted in
// the state dir (CHAOSOPS_STATE_DIR, default /var/lib/wifi-agent; falls back
// to ~/.chaosos-wifi-agent when that isn't writable, e.g. local dev).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Unambiguous alphabet (no 0/O, 1/I/L) for codes a human reads off a screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function loadIdentity(env = process.env) {
  const candidates = [
    env.CHAOSOPS_STATE_DIR,
    '/var/lib/wifi-agent',
    join(homedir(), '.chaosos-wifi-agent'),
  ].filter(Boolean);

  for (const dir of candidates) {
    const file = join(dir, 'identity.json');
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      // Missing or unreadable — try to create it here.
    }
    try {
      mkdirSync(dir, { recursive: true });
      const identity = {
        deviceCode: `CHOS-${randomCode(4)}-${randomCode(4)}`,
        humanCode: randomCode(6),
      };
      writeFileSync(file, JSON.stringify(identity, null, 2) + '\n');
      return identity;
    } catch {
      // Dir not writable — fall through to the next candidate.
    }
  }
  // Last resort: ephemeral identity (still functional, not persisted).
  return { deviceCode: `CHOS-${randomCode(4)}-${randomCode(4)}`, humanCode: randomCode(6) };
}
