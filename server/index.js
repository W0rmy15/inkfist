// One process, one port: static client + WebSocket match server.
// Bind 0.0.0.0 and honor PORT (Render sets it). WebSocket path is /ws.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { attachLobby } from "./lobby.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUB = path.join(ROOT, "public");
const SHARED = path.join(ROOT, "shared");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

export function clientIp(req) {
  if (process.env.TRUST_CF === "1") {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.length > 0 && cf.length < 80) return cf.trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function safeFile(root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

export function createApp() {
  const buckets = new Map();

  function allow(ip, cost = 1, kind = "msg") {
    const now = Date.now();
    const key = `${kind}:${ip}`;
    let b = buckets.get(key);
    // msg: two fighters on one IP (two tabs, or a NAT) at 60Hz, plus catch-up.
    // room: create / join / quick stay slow so codes can't be sprayed.
    const cap = kind === "room" ? 6 : 800;
    const perSec = kind === "room" ? 0.3 : 300;
    const start = kind === "room" ? 3 : 400;
    if (!b) {
      b = { t: now, tokens: start };
      buckets.set(key, b);
    }
    b.tokens = Math.min(cap, b.tokens + ((now - b.t) / 1000) * perSec);
    b.t = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
    if (url.pathname === "/health") {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, version: pkg.version }));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end("method");
      return;
    }
    let pathname = "/";
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end("bad path");
      return;
    }
    if (pathname === "/") pathname = "/index.html";
    const shared = pathname.startsWith("/shared/");
    const root = shared ? SHARED : PUB;
    const rel = shared ? pathname.slice("/shared/".length) : pathname.replace(/^\/+/, "");
    const file = safeFile(root, rel);
    if (!file) {
      res.writeHead(403);
      res.end("no");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  const lobby = attachLobby({ allow });

  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    lobby.connect(ws, req, clientIp(req));
  });

  const timer = setInterval(() => lobby.tick(Date.now()), 1000 / 60);
  if (typeof timer.unref === "function") timer.unref();

  function close() {
    clearInterval(timer);
    for (const client of wss.clients) {
      try { client.close(); } catch { /* already gone */ }
    }
    wss.close();
    server.close();
    lobby.close();
  }

  return { server, close, version: pkg.version };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.server.listen(port, "0.0.0.0", () => {
    console.log(`Dust Rite on 0.0.0.0:${port}  (ws /ws, health /health)`);
  });
}
