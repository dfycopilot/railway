/**
 * Web-page capture for Promo / Announcement videos.
 *
 * POST /capture-page  { url, storage_upload: { signed_url, path } }
 *   → opens the page like a phone, takes a (height-capped) full-page JPEG,
 *     lists where the key elements are (in screenshot pixels), uploads the JPEG.
 *
 * Safety: the service lives on Railway's private network, so every URL the
 * browser touches (first page, redirects, sub-resources) must resolve to a
 * public address. See checkUrl() / isPublicIp(). Since 2026-11-12 (review):
 * EVERY connection Chromium makes goes through a local gate (proxy) that
 * resolves the host itself, checks the address and connects to exactly that
 * address — Chromium's own DNS lookup could otherwise answer differently from
 * ours (DNS rebinding), and service/shared workers skip request interception.
 */

import dns from "dns/promises";
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- tunables ----------
const VIEW_W = 430;
const VIEW_H = 932;
const DPR = 2;
const NAV_TIMEOUT_MS = 20_000;
// Copilot waits 55 s for the whole answer: queue + job stay under that.
const JOB_TIMEOUT_MS = 38_000;
const QUEUE_WAIT_MS = 12_000;
const MAX_CONCURRENT = 2;
const MAX_SCROLL_PX = 6000;
const MAX_CAPTURE_PX = 3000;
const MAX_ELEMENTS = 40;
const MAX_TEXT = 4000;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

class CaptureError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const BAD_LINK = "That link can't be opened.";
const NOT_LOADED = "The page didn't load.";

// ---------- address checks ----------
function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

function isPublicIpv4(ip) {
  const n = ipv4ToInt(ip);
  return !V4_BLOCKED.some(([base, mask]) => ((n & mask) >>> 0) === base);
}

// Expand an IPv6 string into 8 numbers (handles "::" and a dotted IPv4 tail).
function expandIpv6(ip) {
  let s = ip.split("%")[0].toLowerCase();
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + ((n >>> 16).toString(16)) + ":" + ((n & 0xffff).toString(16));
  }
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === null ? [] : Array(8 - h.length - t.length).fill("0");
  const parts = [...h, ...fill, ...t].map((x) => parseInt(x || "0", 16));
  return parts.length === 8 && parts.every((x) => x >= 0 && x <= 0xffff) ? parts : null;
}

function isPublicIpv6(ip) {
  const p = expandIpv6(ip);
  if (!p) return false;
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible) → judge the IPv4.
  if (p.slice(0, 5).every((x) => x === 0) && (p[5] === 0xffff || p[5] === 0)) {
    if (p[5] === 0 && p[6] === 0) return false; // ::, ::1 and friends
    return isPublicIpv4(`${p[6] >> 8}.${p[6] & 255}.${p[7] >> 8}.${p[7] & 255}`);
  }
  // Only global unicast 2000::/3 is allowed …
  if ((p[0] & 0xe000) !== 0x2000) return false;
  // … minus documentation, IETF/Teredo (2001::/23) and 6to4 (2002::/16).
  if (p[0] === 0x2001 && p[1] === 0x0db8) return false;
  if (p[0] === 0x2001 && p[1] < 0x0200) return false;
  if (p[0] === 0x2002) return false;
  return true;
}

export function isPublicIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) return isPublicIpv4(ip);
  if (v === 6) return isPublicIpv6(ip);
  return false;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".railway.internal", ".localdomain", ".home.arpa"];

/**
 * Checks a URL without touching the network. Returns { url, host, ip } where
 * ip is set when the host is an IP literal, or throws CaptureError(400).
 */
function checkUrlShape(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new CaptureError(400, BAD_LINK);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new CaptureError(400, BAD_LINK);
  if (u.username || u.password) throw new CaptureError(400, BAD_LINK);
  if (u.port && u.port !== "80" && u.port !== "443") throw new CaptureError(400, BAD_LINK);
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) throw new CaptureError(400, BAD_LINK);
  if (net.isIP(host)) {
    if (!isPublicIp(host)) throw new CaptureError(400, BAD_LINK);
    return { url: u, host, ip: host };
  }
  if (host === "localhost" || !host.includes(".")) throw new CaptureError(400, BAD_LINK);
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new CaptureError(400, BAD_LINK);
  return { url: u, host, ip: null };
}

async function hostResolvesPublic(host) {
  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}

/** Full check (shape + DNS). Throws CaptureError(400) when unsafe. */
export async function checkUrl(raw) {
  const r = checkUrlShape(raw);
  if (!r.ip && !(await hostResolvesPublic(r.host))) throw new CaptureError(400, BAD_LINK);
  return r;
}

// ---------- the network gate (proxy) ----------
/** A public address for host:port, or null. Shape rules as checkUrlShape. */
async function gateAddress(host, port) {
  let shape;
  try {
    const h = net.isIP(host) === 6 ? `[${host}]` : host;
    shape = checkUrlShape(`${port === 80 ? "http" : "https"}://${h}:${port}/`);
  } catch {
    return null;
  }
  if (shape.ip) return shape.ip;
  try {
    const addrs = await dns.lookup(shape.host, { all: true, verbatim: true });
    if (!addrs.length || !addrs.every((a) => isPublicIp(a.address))) return null;
    return addrs[0].address;
  } catch {
    return null;
  }
}

const IDLE_MS = 30_000;
function onGateConnect(req, client, head) {
  // CONNECT host:port (https, wss)
  let target;
  try {
    target = new URL(`http://${req.url}`);
  } catch {
    client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  const port = Number(target.port || 443);
  const host = target.hostname.replace(/^\[|\]$/g, "");
  gateAddress(host, port).then((addr) => {
    if (!addr || client.destroyed) {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const up = net.connect({ host: addr, port });
    const kill = () => { up.destroy(); client.destroy(); };
    up.setTimeout(IDLE_MS, kill);
    client.setTimeout(IDLE_MS, kill);
    up.on("error", kill);
    client.on("error", kill);
    up.on("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) up.write(head);
      up.pipe(client);
      client.pipe(up);
    });
  });
}
function onGateRequest(req, res) {
  // plain http: the request line carries the absolute URL
  let u;
  try {
    u = new URL(req.url);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (u.protocol !== "http:") {
    res.writeHead(400).end();
    return;
  }
  const port = Number(u.port || 80);
  gateAddress(u.hostname.replace(/^\[|\]$/g, ""), port).then((addr) => {
    if (!addr) {
      res.writeHead(403).end();
      return;
    }
    const headers = { ...req.headers, host: u.host };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const up = http.request({ host: addr, port, method: req.method, path: u.pathname + u.search, headers, timeout: IDLE_MS }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on("timeout", () => up.destroy());
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
}
let gatePort = null;
function startGate() {
  if (gatePort) return gatePort;
  gatePort = new Promise((resolve, reject) => {
    const srv = http.createServer(onGateRequest);
    srv.on("connect", onGateConnect);
    srv.on("clientError", (_e, sock) => { try { sock.destroy(); } catch {} });
    srv.once("error", (e) => { gatePort = null; reject(e); });
    srv.listen(0, "127.0.0.1", () => resolve(srv.address().port));
  });
  return gatePort;
}

// ---------- browser ----------
function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const base = path.join(__dirname, "node_modules/.remotion/chrome-headless-shell");
  const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
  for (const plat of ls(base)) {
    for (const sub of ls(path.join(base, plat))) {
      for (const name of ["chrome-headless-shell", "chrome-headless-shell.exe"]) {
        const p = path.join(base, plat, sub, name);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return "/usr/bin/chromium";
}

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--mute-audio",
  "--hide-scrollbars",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-sync",
  "--dns-prefetch-disable",
  "--block-new-web-contents",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-features=NetworkPrediction,Prerender2,BackForwardCache,MediaRouter,DialMediaRouteProvider",
  "--disable-quic", // UDP would skip the gate
];

// ---------- concurrency gate ----------
let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const w = { resolve, timer: null };
    w.timer = setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) waiters.splice(i, 1);
      reject(new CaptureError(503, "Too many pages are being opened right now. Please try again in a minute."));
    }, QUEUE_WAIT_MS);
    waiters.push(w);
  });
}
function release() {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // slot passes straight to the next waiter
  } else {
    active--;
  }
}

// ---------- the capture ----------
async function capture(startUrl, state) {
  const port = await startGate();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    // Everything through the gate; "<-loopback>" stops Chromium from ever
    // skipping it for localhost.
    args: [...LAUNCH_ARGS, `--proxy-server=http://127.0.0.1:${port}`, "--proxy-bypass-list=<-loopback>"],
    protocolTimeout: 30_000,
  });
  if (state.done) { // job already timed out while Chromium was starting
    try { await browser.close(); } catch {}
    throw new CaptureError(422, NOT_LOADED);
  }
  state.browser = browser;

  // Any extra tab/popup is closed immediately (it would not be intercepted).
  let mainTarget = null;
  browser.on("targetcreated", async (t) => {
    if (t.type() === "page" && mainTarget && t !== mainTarget) {
      try { const p = await t.page(); await p?.close(); } catch {}
    }
    // Workers we don't need (their requests also go through the gate).
    if (t.type() === "service_worker" || t.type() === "shared_worker") {
      try { const s = await t.createCDPSession(); await s.send("Runtime.terminateExecution").catch(() => {}); await s.detach(); } catch {}
    }
  });

  try {
    const bcdp = await browser.target().createCDPSession();
    await bcdp.send("Browser.setDownloadBehavior", { behavior: "deny" });
  } catch {}

  const page = await browser.newPage();
  mainTarget = page.target();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  try { await page.setBypassServiceWorker(true); } catch {}
  try {
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
  } catch {}

  // Every request (incl. redirects, which arrive as new requests) is re-checked.
  const hostCache = new Map(); // host → Promise<boolean>
  hostCache.set(startUrl.host, Promise.resolve(true)); // already checked
  const BLOCK_TYPES = new Set(["media", "websocket", "eventsource", "ping", "manifest", "texttrack", "prefetch"]);
  let mainBlocked = false;

  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    if (req.isInterceptResolutionHandled()) return;
    const isMainNav = req.isNavigationRequest() && req.frame() === page.mainFrame();
    try {
      const u = req.url();
      if (u.startsWith("data:") || u.startsWith("blob:")) return req.continue();
      if (BLOCK_TYPES.has(req.resourceType())) return req.abort("blockedbyclient");
      let shape;
      try {
        shape = checkUrlShape(u);
      } catch {
        if (isMainNav) mainBlocked = true;
        return req.abort("blockedbyclient");
      }
      if (!shape.ip) {
        if (!hostCache.has(shape.host)) hostCache.set(shape.host, hostResolvesPublic(shape.host));
        if (!(await hostCache.get(shape.host))) {
          if (isMainNav) mainBlocked = true;
          return req.abort("blockedbyclient");
        }
      }
      return req.continue();
    } catch {
      try { await req.abort("blockedbyclient"); } catch {}
    }
  });

  // Navigate.
  let resp = null;
  try {
    resp = await page.goto(startUrl.url.href, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });
  } catch (e) {
    if (mainBlocked) throw new CaptureError(400, BAD_LINK);
    const isTimeout = e?.name === "TimeoutError" || /timeout/i.test(String(e?.message));
    if (!isTimeout) throw new CaptureError(422, NOT_LOADED);
    // networkidle2 never came — keep going if the document itself loaded.
    try {
      await page.waitForFunction(() => document.readyState !== "loading" && location.href !== "about:blank", { timeout: 3000 });
    } catch {
      throw new CaptureError(422, NOT_LOADED);
    }
  }
  if (mainBlocked) throw new CaptureError(400, BAD_LINK);
  if (resp && resp.status() >= 400) throw new CaptureError(422, NOT_LOADED);

  await sleep(1000);

  // Best-effort cookie banner dismissal.
  try {
    await page.evaluate(() => {
      const re = /^(accept|accept all|accept all cookies|accept cookies|i accept|agree|i agree|agree and close|got it|ok|okay|allow all|allow cookies|allow all cookies|close)\s*[!.]?$/i;
      const nodes = document.querySelectorAll("button, [role=button], a[href='#'], a:not([href]), input[type=button], input[type=submit]");
      let clicks = 0;
      for (const el of nodes) {
        if (clicks >= 2) break;
        const t = (el.innerText || el.value || "").trim().replace(/\s+/g, " ");
        if (!t || t.length > 30 || !re.test(t)) continue;
        if (t.toLowerCase() === "close" || t.toLowerCase() === "ok" || t.toLowerCase() === "okay") {
          // Only inside something that looks like a cookie/consent box.
          let p = el, ok = false;
          for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
            const s = ((p.id || "") + " " + (p.className?.toString?.() || "") + " " + (p.innerText || "").slice(0, 300)).toLowerCase();
            if (/cookie|consent|gdpr|privacy/.test(s)) { ok = true; break; }
          }
          if (!ok) continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        try { el.click(); clicks++; } catch {}
      }
    });
    await sleep(400);
  } catch {}

  // Best-effort: close sign-up / promo popups (Escape, then a visible close
  // button inside something that looks like a dialog/modal).
  try {
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const boxes = document.querySelectorAll("[role=dialog], [aria-modal=true], dialog[open], [class*=modal i], [class*=popup i], [id*=modal i], [id*=popup i]");
      let clicks = 0;
      for (const box of boxes) {
        if (clicks >= 2) break;
        const r = box.getBoundingClientRect();
        if (r.width < 50 || r.height < 50 || getComputedStyle(box).display === "none") continue;
        const btns = box.querySelectorAll("button, [role=button], a:not([href]), a[href='#']");
        for (const b of btns) {
          const label = ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "") + " " + (b.innerText || "") + " " + (b.className?.toString?.() || "")).toLowerCase();
          if (!/\b(close|dismiss|no thanks|not now|maybe later)\b|×|✕/.test(label)) continue;
          const br = b.getBoundingClientRect();
          if (br.width < 2 || br.height < 2) continue;
          try { b.click(); clicks++; } catch {}
          break;
        }
      }
    });
    await sleep(400);
  } catch {}

  // Scroll down and back to wake lazy images.
  try {
    const total = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0));
    const limit = Math.min(total, MAX_SCROLL_PX);
    for (let y = 0; y < limit; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await sleep(150);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(600);
    await page.evaluate(() => Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2000))]));
  } catch {}

  // The window stays phone-sized (a tall window stretched every "full
  // screen" section, 2026-11-12 review); the shot reaches below it. Measured
  // and shot from the same layout, at the top of the page (tested: a 100vh
  // hero stays one screen tall and the boxes land where they were measured).
  const docHeight = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight));
  const clipH = Math.max(VIEW_H, Math.min(Math.ceil(docHeight), MAX_CAPTURE_PX));
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);

  const info = await page.evaluate(collectInPage, { DPR, CAPTURE_H: clipH, MAX_ELEMENTS, MAX_TEXT, VIEW_W });

  const jpeg = await page.screenshot({
    type: "jpeg",
    quality: 82,
    clip: { x: 0, y: 0, width: VIEW_W, height: clipH },
    captureBeyondViewport: true,
  });

  return {
    jpeg: Buffer.from(jpeg),
    width: Math.round(VIEW_W * DPR),
    height: Math.round(clipH * DPR),
    title: info.title,
    text: info.text,
    elements: info.elements,
  };
}

// Runs inside the page.
function collectInPage({ DPR, CAPTURE_H, MAX_ELEMENTS, MAX_TEXT, VIEW_W }) {
  const sx = window.scrollX, sy = window.scrollY;
  const capH = CAPTURE_H;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  const visible = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0.05;
  };
  const boxOf = (r) => {
    const left = Math.max(0, r.left + sx), right = Math.min(VIEW_W, r.right + sx);
    const top = Math.max(0, r.top + sy), bottom = Math.min(capH, r.bottom + sy);
    if (right - left < 4 || bottom - top < 4) return null;
    return { x: Math.round(left * DPR), y: Math.round(top * DPR), w: Math.round((right - left) * DPR), h: Math.round((bottom - top) * DPR) };
  };

  const out = [];
  const add = (kind, text, rect, prio) => {
    text = clean(text).slice(0, 80);
    if (!text) return;
    const b = boxOf(rect);
    if (!b) return;
    out.push({ kind, text, ...b, prio });
  };

  const looksLikeButton = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== "transparent" && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg);
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" && parseFloat(cs.borderRadius) > 0;
    const cls = (el.className?.toString?.() || "") + " " + (el.getAttribute("role") || "");
    return hasBg || hasBorder || /\b(btn|button|cta)\b/i.test(cls);
  };

  for (const el of document.querySelectorAll("h1, h2, h3")) {
    if (!visible(el)) continue;
    add("heading", el.innerText, el.getBoundingClientRect(), 2);
  }
  for (const el of document.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")) {
    if (!visible(el)) continue;
    add("button", el.innerText || el.value || el.getAttribute("aria-label"), el.getBoundingClientRect(), 1);
  }
  for (const el of document.querySelectorAll("a[href]")) {
    if (!visible(el)) continue;
    const href = el.getAttribute("href") || "";
    const r = el.getBoundingClientRect();
    const t = clean(el.innerText || el.getAttribute("aria-label"));
    if (/^tel:/i.test(href)) {
      add("phone", t || href.replace(/^tel:/i, ""), r, 0);
      continue;
    }
    if (!t || t.length > 40) continue;
    if (looksLikeButton(el) && r.width >= 40 && r.height >= 24) add("button", t, r, 1);
    else if (r.width >= 24 && r.height >= 16) add("link", t, r, 3);
  }
  for (const el of document.querySelectorAll("input, select, textarea")) {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset"].includes(type)) continue;
    if (!visible(el)) continue;
    let label = el.getAttribute("placeholder") || el.getAttribute("aria-label");
    if (!label && el.id) {
      try { label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText; } catch {}
    }
    if (!label) label = el.closest("label")?.innerText;
    if (!label && el.tagName === "SELECT") label = el.options[el.selectedIndex]?.text;
    add("input", label || el.getAttribute("name") || el.tagName.toLowerCase(), el.getBoundingClientRect(), 1);
  }
  // Phone numbers written as plain text.
  try {
    const re = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n, count = 0;
    while ((n = walker.nextNode()) && count < 10) {
      const s = n.nodeValue;
      if (!s || s.length < 10 || !/\d/.test(s)) continue;
      if (n.parentElement?.closest("a[href^='tel:'], script, style, noscript")) continue;
      if (!n.parentElement || !visible(n.parentElement)) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s)) && count < 10) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        add("phone", m[0], range.getBoundingClientRect(), 0);
        count++;
      }
    }
  } catch {}

  // De-duplicate (same text + nearly the same box).
  const uniq = [];
  for (const e of out) {
    const dup = uniq.find((u) => u.text.toLowerCase() === e.text.toLowerCase() &&
      Math.abs(u.x - e.x) <= 16 && Math.abs(u.y - e.y) <= 16 && Math.abs(u.w - e.w) <= 16 && Math.abs(u.h - e.h) <= 16);
    if (dup) { if (e.prio < dup.prio) Object.assign(dup, e); continue; }
    uniq.push(e);
  }
  uniq.sort((a, b) => a.prio - b.prio || a.y - b.y);
  const picked = uniq.slice(0, MAX_ELEMENTS).sort((a, b) => a.y - b.y || a.x - b.x);
  const elements = picked.map(({ prio, ...e }, i) => ({ i, ...e }));

  return {
    title: clean(document.title).slice(0, 200),
    text: clean(document.body?.innerText).slice(0, MAX_TEXT),
    elements,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkUploadUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol === "https:") return true;
  // Local testing only: an explicit flag lets http://127.0.0.1 stand in for storage.
  return process.env.CAPTURE_ALLOW_LOCAL_UPLOAD === "1" && u.protocol === "http:" &&
    (u.hostname === "127.0.0.1" || u.hostname === "localhost");
}

// ---------- route ----------
export function registerCaptureRoute(app, authMiddleware) {
  app.post("/capture-page", authMiddleware, async (req, res) => {
    const t0 = Date.now();
    const { url, storage_upload } = req.body || {};
    const signedUrl = storage_upload?.signed_url || storage_upload?.signedUrl;
    let host = "?";
    let acquired = false;
    const state = { browser: null, done: false };
    let timer = null;

    try {
      if (!signedUrl || !storage_upload?.path || !checkUploadUrl(signedUrl)) {
        throw new CaptureError(400, "Missing or invalid upload target.");
      }
      if (typeof url !== "string" || !url || url.length > 2048) throw new CaptureError(400, BAD_LINK);
      const checked = await checkUrl(url);
      host = checked.host;

      await acquire();
      acquired = true;

      const result = await Promise.race([
        capture(checked, state),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new CaptureError(422, NOT_LOADED)), JOB_TIMEOUT_MS); }),
      ]);
      clearTimeout(timer);

      // Close Chromium before the upload so the slot frees memory sooner.
      try { await state.browser?.close(); } catch {}
      state.browser = null;

      let up;
      try {
        up = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: result.jpeg });
      } catch {
        up = null;
      }
      if (!up || !up.ok) {
        console.error(`[capture] host=${host} upload failed: ${up ? up.status : "network"}`);
        return res.status(502).json({ error: "Couldn't save the picture of the page." });
      }

      console.log(`[capture] host=${host} ok ${result.width}x${result.height} ${result.elements.length} elements ${(result.jpeg.length / 1024).toFixed(0)}KB in ${Date.now() - t0}ms`);
      return res.json({
        ok: true,
        path: storage_upload.path,
        width: result.width,
        height: result.height,
        title: result.title,
        text: result.text,
        elements: result.elements,
      });
    } catch (err) {
      const status = err instanceof CaptureError ? err.status : 422;
      const message = err instanceof CaptureError ? err.message : NOT_LOADED;
      console.log(`[capture] host=${host} ${status} "${message}" in ${Date.now() - t0}ms${err instanceof CaptureError ? "" : ` (${String(err?.message || err).slice(0, 120)})`}`);
      return res.status(status).json({ error: message });
    } finally {
      state.done = true;
      clearTimeout(timer);
      if (state.browser) {
        const b = state.browser;
        state.browser = null;
        try { await b.close(); } catch {
          try { b.process()?.kill("SIGKILL"); } catch {}
        }
      }
      if (acquired) release();
    }
  });
}
