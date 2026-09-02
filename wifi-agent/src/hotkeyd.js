#!/usr/bin/env node
// ChaosOps OS hotkey daemon.
//
// Under cage/Wayland there is no global-hotkey API, so we read the kernel
// evdev devices (/dev/input/event*) directly — one layer BELOW the compositor
// and libinput, which makes the chords global and un-swallowable by Chromium.
// Requires read access to /dev/input (run in the `input` group; see README).
//
// Chords (defined once, surfaced by kiosk-shell):
//   Ctrl+Alt+W → POST /api/hotkey {chord:"wifi"}   (open WiFi menu)
//   Ctrl+Alt+R → POST /api/hotkey {chord:"reset"}  (forget WiFi + back to onboarding)
//
// Dev on macOS (no evdev): CHAOSOPS_HOTKEY_BACKEND=stdin reads lines
// "wifi"/"reset" from stdin and fires the same requests.
import { createReadStream, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const AGENT_URL = process.env.CHAOSOPS_AGENT_URL || 'http://127.0.0.1:8080';
const DEBOUNCE_MS = 1000;

// Linux input-event-codes.h
const EV_KEY = 0x01;
const KEY = { LEFTCTRL: 29, RIGHTCTRL: 97, LEFTALT: 56, RIGHTALT: 100, W: 17, R: 19 };
// struct input_event on 64-bit: 16B timeval + u16 type + u16 code + s32 value
const EVENT_SIZE = 24;

let lastFired = 0;
async function fire(chord) {
  const now = Date.now();
  if (now - lastFired < DEBOUNCE_MS) return;
  lastFired = now;
  try {
    const res = await fetch(`${AGENT_URL}/api/hotkey`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chord }),
    });
    console.log(`hotkeyd: fired "${chord}" → ${res.status}`);
  } catch (err) {
    console.error(`hotkeyd: failed to deliver "${chord}": ${err.message}`);
  }
}

function watchEvdev() {
  const down = new Set(); // currently-pressed key codes, per-process global

  function attach(path) {
    const stream = createReadStream(path, { highWaterMark: EVENT_SIZE * 64 });
    let buf = Buffer.alloc(0);
    stream.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= EVENT_SIZE) {
        const type = buf.readUInt16LE(16);
        const code = buf.readUInt16LE(18);
        const value = buf.readInt32LE(20);
        buf = buf.subarray(EVENT_SIZE);
        if (type !== EV_KEY) continue;
        if (value === 1) down.add(code);        // press
        else if (value === 0) down.delete(code); // release (2 = autorepeat: ignore)
        if (value !== 1) continue;
        const ctrl = down.has(KEY.LEFTCTRL) || down.has(KEY.RIGHTCTRL);
        const alt = down.has(KEY.LEFTALT) || down.has(KEY.RIGHTALT);
        if (!ctrl || !alt) continue;
        if (code === KEY.W) fire('wifi');
        else if (code === KEY.R) fire('reset');
      }
    });
    stream.on('error', (err) => {
      // Device unplugged or unreadable — drop it; hotplug rescan re-adds.
      if (err.code !== 'ENODEV') console.error(`hotkeyd: ${path}: ${err.message}`);
    });
    return stream;
  }

  const watched = new Map();
  function rescan() {
    let names = [];
    try {
      names = readdirSync('/dev/input').filter((n) => n.startsWith('event'));
    } catch (err) {
      console.error(`hotkeyd: cannot read /dev/input: ${err.message}`);
      process.exit(1);
    }
    for (const name of names) {
      const path = `/dev/input/${name}`;
      if (!watched.has(path)) watched.set(path, attach(path));
    }
    for (const [path, stream] of watched) {
      if (!names.includes(path.split('/').pop()) || stream.destroyed) {
        stream.destroy();
        watched.delete(path);
      }
    }
  }
  rescan();
  setInterval(rescan, 5000).unref(); // cheap hotplug support
  console.log(`hotkeyd: watching ${watched.size} evdev device(s), agent at ${AGENT_URL}`);
  setInterval(() => {}, 1 << 30); // keep process alive
}

function watchStdin() {
  console.log('hotkeyd (stdin mock): type "wifi" or "reset" + Enter');
  createInterface({ input: process.stdin }).on('line', (line) => {
    const chord = line.trim();
    if (chord === 'wifi' || chord === 'reset') fire(chord);
  });
}

const backend = process.env.CHAOSOPS_HOTKEY_BACKEND
  || (process.platform === 'linux' ? 'evdev' : 'stdin');
if (backend === 'stdin') watchStdin();
else watchEvdev();
