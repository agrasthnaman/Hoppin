// Offline check for the built app. Loads it in headless Chrome, stops the web server, reloads, and prints what
// still works. Not part of `npm test` because it needs Chrome.
//
//   cd apps/web && npm run build
//   npx vite preview --port 4173 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
//     --user-data-dir=/tmp/hoppin-chrome about:blank &
//   node scripts/offline-shell-check.mjs
//
// Expected: "offline ..." lines show the app's navigation and screens, and "offline tap More" shows the More screen.
import { execSync, spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9333;
const ws = await (async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
  return new WebSocket((await res.json()).webSocketDebuggerUrl);
})();
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { id += 1; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const goto = async (url) => { await send("Page.navigate", { url }); await sleep(1500); };

await send("Page.enable");
await goto("http://localhost:4173/trips/t1/today");
const ready = await evalJs("navigator.serviceWorker.ready.then(r => !!r.active)");
console.log("service worker active:", ready);
await goto("http://localhost:4173/trips/t1/today"); // second load, now controlled by the worker
console.log("controlled by worker:", await evalJs("!!navigator.serviceWorker.controller"));
console.log("online page text:", JSON.stringify((await evalJs("document.body.innerText")).slice(0, 80)));

execSync("pkill -f 'vite preview --port 4173' || true");
await sleep(1000);
const down = await fetch("http://localhost:4173/").then(() => "still running").catch(() => "stopped");
console.log("web server:", down);

for (const path of ["/trips/t1/today", "/trips/t1/docs", "/trips/zzz/money"]) {
  await goto(`http://localhost:4173${path}`);
  const text = await evalJs("document.body.innerText");
  console.log(`offline ${path}:`, JSON.stringify(text.replace(/\s+/g, " ").slice(0, 90)));
}
// client-side navigation to a lazily loaded screen, offline
await evalJs("document.querySelector('a[href$=\"/more\"]').click()");
await sleep(800);
console.log("offline tap More:", JSON.stringify((await evalJs("document.querySelector('main').innerText")).replace(/\s+/g, " ")));
ws.close();
