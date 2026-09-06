// Real backend: drives NetworkManager via nmcli (Debian image ships NM).
// Every nmcli invocation used by the agent lives in this file — see README
// "How nmcli is invoked" for the full table.
import { execFile } from 'node:child_process';

const NMCLI_TIMEOUT_MS = 30_000;

function nmcli(args) {
  return new Promise((resolve, reject) => {
    execFile('nmcli', args, { timeout: NMCLI_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error((stderr || err.message || 'nmcli failed').trim());
        e.cause = err;
        reject(e);
      } else {
        resolve(stdout);
      }
    });
  });
}

// nmcli -t (terse) escapes ':' inside fields as '\:'. Split on unescaped ':'.
function splitTerse(line) {
  const out = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      cur += line[++i];
    } else if (ch === ':') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function createNmcliBackend() {
  return {
    name: 'nmcli',

    // → { online, connected, ssid, ip }
    async status() {
      // Overall internet reachability per NM's connectivity check.
      const connectivity = (await nmcli(['networking', 'connectivity', 'check'])).trim();
      const online = connectivity === 'full';

      // Active wifi connection, if any.
      let connected = false;
      let ssid = null;
      let ip = null;
      const devLines = (await nmcli(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status']))
        .trim().split('\n').filter(Boolean);
      for (const line of devLines) {
        const [device, type, state, connection] = splitTerse(line);
        if (type === 'wifi' && state === 'connected') {
          connected = true;
          ssid = connection || null;
          const ipOut = (await nmcli(['-t', '-f', 'IP4.ADDRESS', 'device', 'show', device])).trim();
          // e.g. "IP4.ADDRESS[1]:192.168.1.23/24"
          const m = ipOut.match(/:([0-9.]+)\//);
          if (m) ip = m[1];
          break;
        }
      }
      return { online, connected, ssid, ip };
    },

    // → [{ ssid, signal, secured }]
    async networks() {
      const out = await nmcli(['-t', '-f', 'SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'auto']);
      const seen = new Map();
      for (const line of out.trim().split('\n').filter(Boolean)) {
        const [ssid, signal, security] = splitTerse(line);
        if (!ssid) continue; // hidden networks
        const entry = {
          ssid,
          signal: Number.parseInt(signal, 10) || 0,
          secured: security !== '' && security !== '--',
        };
        const prev = seen.get(ssid);
        if (!prev || entry.signal > prev.signal) seen.set(ssid, entry);
      }
      return [...seen.values()].sort((a, b) => b.signal - a.signal);
    },

    async connect(ssid, psk) {
      const args = ['device', 'wifi', 'connect', ssid];
      if (psk) args.push('password', psk);
      await nmcli(args);
    },

    // Delete every saved wifi connection profile (the "reset" primitive).
    async forget() {
      const out = await nmcli(['-t', '-f', 'UUID,TYPE', 'connection', 'show']);
      const uuids = out.trim().split('\n').filter(Boolean)
        .map(splitTerse)
        .filter(([, type]) => type === '802-11-wireless')
        .map(([uuid]) => uuid);
      for (const uuid of uuids) {
        await nmcli(['connection', 'delete', 'uuid', uuid]);
      }
      return uuids.length;
    },
  };
}
