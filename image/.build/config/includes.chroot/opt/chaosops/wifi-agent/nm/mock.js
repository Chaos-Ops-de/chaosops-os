// Fake NetworkManager backend for local dev + tests (no nmcli on macOS).
// Mirrors the nmcli backend's interface exactly; state lives in memory.
// CHAOSOPS_MOCK_ONLINE=1 makes the mock start already connected+online.
export function createMockBackend(env = process.env) {
  const scan = [
    { ssid: 'ChaosOps-Office', signal: 87, secured: true },
    { ssid: 'DUNDER-GUEST', signal: 62, secured: false },
    { ssid: 'FRITZ!Box 7590', signal: 44, secured: true },
  ];
  const state = {
    connectedSsid: env.CHAOSOPS_MOCK_ONLINE ? scan[0].ssid : null,
    savedProfiles: env.CHAOSOPS_MOCK_ONLINE ? [scan[0].ssid] : [],
  };

  return {
    name: 'mock',
    _state: state, // exposed for tests

    async status() {
      const connected = state.connectedSsid !== null;
      return {
        online: connected,
        connected,
        ssid: state.connectedSsid,
        ip: connected ? '192.168.99.42' : null,
      };
    },

    async networks() {
      return scan.map((n) => ({ ...n }));
    },

    async connect(ssid, psk) {
      const net = scan.find((n) => n.ssid === ssid);
      if (!net) throw new Error(`No network with SSID "${ssid}" found.`);
      if (net.secured && !psk) throw new Error('Secrets were required, but not provided.');
      if (net.secured && psk === 'wrong') throw new Error('802-11-wireless-security.psk: invalid');
      state.connectedSsid = ssid;
      if (!state.savedProfiles.includes(ssid)) state.savedProfiles.push(ssid);
    },

    async forget() {
      const n = state.savedProfiles.length;
      state.savedProfiles = [];
      state.connectedSsid = null;
      return n;
    },
  };
}
