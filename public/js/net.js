// WebSocket URL is derived from the page. Never hardcode a host or port.
// Path is /ws — same origin, same port as the page (ws or wss).

export function wsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function connectNet(handlers) {
  let ws = null;
  let attempt = 0;
  let retry = null;
  let wanted = true;
  let offset = 0;
  const samples = [];

  function serverNow() {
    return Date.now() + offset;
  }

  function send(msg) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function considerPong(msg) {
    if (typeof msg.c !== "number" || typeof msg.s !== "number") return;
    const rtt = Date.now() - msg.c;
    if (rtt < 0 || rtt > 8000) return;
    samples.push(msg.s - (msg.c + rtt / 2));
    if (samples.length > 7) samples.shift();
    const sorted = [...samples].sort((a, b) => a - b);
    offset = sorted[sorted.length >> 1];
  }

  function open() {
    handlers.status?.("connecting");
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      attempt = 0;
      handlers.status?.("online");
      send({ t: "ping", c: Date.now() });
      handlers.open?.();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === "pong") considerPong(msg);
      handlers.message?.(msg);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      handlers.status?.("offline");
      handlers.close?.();
      if (!wanted) return;
      const wait = Math.min(8000, 350 * 2 ** attempt);
      attempt++;
      retry = setTimeout(open, wait);
    };
  }

  const ping = setInterval(() => send({ t: "ping", c: Date.now() }), 1500);
  open();

  return {
    send,
    serverNow,
    close() {
      wanted = false;
      clearInterval(ping);
      clearTimeout(retry);
      try { ws && ws.close(); } catch { /* ignore */ }
    },
  };
}
