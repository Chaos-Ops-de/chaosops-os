// Can the kiosk-shell embed the ChaosOps display in its <iframe>?
//
// When a frame is refused (X-Frame-Options / CSP frame-ancestors) or the host
// is unreachable, Chromium paints its own grey error page inside the frame —
// and the shell can't see that from outside (it's cross-origin). So the agent
// asks the server directly and the shell shows a branded screen instead.
//
// Result: { ok: true } | { ok: false, reason: 'unreachable' | 'http-error' | 'frame-blocked', detail }

const DEFAULT_TIMEOUT_MS = 8000;

// Does one CSP `frame-ancestors` source list admit `origin`?
function sourceListAllows(sources, origin) {
  const { protocol, host } = new URL(origin);
  return sources.some((src) => {
    if (src === '*') return true;
    if (src === `${protocol}`) return true; // scheme-source, e.g. "http:"
    if (src === origin) return true;
    // host-source with wildcard port, e.g. http://127.0.0.1:*
    const m = /^([a-z][a-z0-9+.-]*:\/\/)?([^/:]+)(?::(\d+|\*))?\/?$/i.exec(src);
    if (!m) return false;
    const [, scheme, srcHost, srcPort] = m;
    const [originHost, originPort = ''] = host.split(':');
    if (scheme && scheme !== `${protocol}//`) return false;
    if (srcHost !== originHost) return false;
    return srcPort === '*' || (srcPort ?? '') === originPort;
  });
}

// Frame-ability per the browser rules: CSP frame-ancestors (every enforced
// policy must allow) wins over X-Frame-Options; without it, any XFO value
// blocks a cross-origin parent (DENY, SAMEORIGIN, and the dead ALLOW-FROM).
export function frameVerdict(headers, origin) {
  const csp = headers.get('content-security-policy');
  const policies = csp ? csp.split(',') : [];
  let sawFrameAncestors = false;
  for (const policy of policies) {
    const directive = policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .find(([name]) => name?.toLowerCase() === 'frame-ancestors');
    if (!directive) continue;
    sawFrameAncestors = true;
    if (!sourceListAllows(directive.slice(1), origin)) {
      return { ok: false, reason: 'frame-blocked', detail: `frame-ancestors ${directive.slice(1).join(' ')}` };
    }
  }
  if (sawFrameAncestors) return { ok: true };
  const xfo = headers.get('x-frame-options');
  if (xfo) return { ok: false, reason: 'frame-blocked', detail: `x-frame-options ${xfo}` };
  return { ok: true };
}

export async function checkDisplay(url, { origin, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { ok: false, reason: 'unreachable', detail: String(err.cause?.code || err.message || err) };
  }
  res.body?.cancel().catch(() => {});
  if (!res.ok) return { ok: false, reason: 'http-error', detail: `HTTP ${res.status}` };
  return frameVerdict(res.headers, origin);
}
