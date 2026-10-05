/* Generated from this release's SHA-256 inventory. No cross-game caches. */
'use strict';
const VERSION = 'cc575679f14b6ffe05ae';
const ASSETS = [{"path":"credits.txt","bytes":1006,"sha256":"4fbc23f6cb79acd3ee3bcd17b335580505487609dfa27a33e393cd58ee66f980"},{"path":"fonts-OFL.txt","bytes":14712,"sha256":"849f4ea9c214fa4ac3593b770c699f387534b11ce671264c1b10d85bdcb5997b"},{"path":"index.apple-touch-icon.png","bytes":4624,"sha256":"ad69955909c15a08cac78f63fc352607c7ea29ccd02985a75e02dd5df36ff6e9"},{"path":"index.audio.position.worklet.js","bytes":2973,"sha256":"be33985bc7160d6bf9646f259cd86b259cd67b02ccb297ee5c44f8ac84327bc8"},{"path":"index.audio.worklet.js","bytes":7298,"sha256":"5b476a9c9ce642c0ee4256436d1bc31d9c38f868aca0f9a8e2a57c18d2dec2a3"},{"path":"index.html","bytes":8689,"sha256":"f50c3f8a0398a930224abe58aafec90a145c148b82cbaf16b1944cd2654fb2ab"},{"path":"index.icon.png","bytes":6924,"sha256":"827093e2031ed772455c8ac3dacaf351a0d8d481f895c72e178c7ac71e7d1f1c"},{"path":"index.js","bytes":279815,"sha256":"33c94cb3175f3333b82e2a3be5e8e86f77986f0aa2042b1631f6367a4e5bb6ba"},{"path":"index.pck","bytes":6354436,"sha256":"73d405c8a67b669512885562dc1364dbc137db0c90ec708e7dede787f1d14053"},{"path":"index.png","bytes":21443,"sha256":"3cb4495c0b98dfbe4b663cbf2b6836473572339beb66d902367893162a70be0e"},{"path":"index.wasm","bytes":39514754,"sha256":"fc74679e3b97f76878947fcd4fbe1268cbfa6188182a2e33bbc3f5dc9bfa57d0"},{"path":"manifest.webmanifest","bytes":731,"sha256":"d49ba77050bcfe1b6810f8ed8d40e3af6bc37fd6abd65c1fd7cd419407aaa283"},{"path":"pwa-icon-192.png","bytes":4852,"sha256":"ed06fac082041ff5477537c03356a4bf8ec4e68f7228cad72d3b8d96deef1dbd"},{"path":"pwa-icon-512.png","bytes":14115,"sha256":"92646f9a6fd164b362d28c5123ba03229636759d62570cf4754bc6eebe6b20d5"},{"path":"pwa-maskable-512.png","bytes":14115,"sha256":"92646f9a6fd164b362d28c5123ba03229636759d62570cf4754bc6eebe6b20d5"},{"path":"pwa.css","bytes":2699,"sha256":"3ac59b9f6127a402df1007deb58516a91b70a08499d835a46bb560e0878f3214"},{"path":"pwa.js","bytes":12048,"sha256":"2540b08c1a8a25436bd8f8acf9de4f5ad303dbea636ecaff50cc6e850d6f543c"}];
const SCOPE = self.registration.scope;
const PREFIX = `sheriff-chase-pwa:${SCOPE}:`;
const CACHE = `${PREFIX}${VERSION}`;
const COMPLETE = new URL('__pwa_complete__', SCOPE).href;
const urls = new Map(ASSETS.map((asset) => [new URL(asset.path, SCOPE).href, asset]));
let repairPromise = null;

async function announce(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (client.url.startsWith(SCOPE)) client.postMessage({ ...message, scope: SCOPE, version: VERSION });
  }
}
async function verifiedFetch(asset) {
  const url = new URL(asset.path, SCOPE).href;
  // Reuse the first game's HTTP download when possible. A stale HTTP cache must
  // never poison a new build, so verify bytes and retry the network once.
  for (const mode of ['default', 'reload']) {
    try {
      const response = await fetch(new Request(url, { cache: mode, credentials: 'same-origin', redirect: 'error' }));
      if (!response.ok || response.type === 'opaque') throw new Error('Unavailable asset');
      const data = await response.clone().arrayBuffer();
      if (data.byteLength !== asset.bytes) throw new Error('Incomplete asset');
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
      if (hash !== asset.sha256) throw new Error('Different release');
      return response;
    } catch (error) { if (mode === 'reload') throw error; }
  }
}
async function cacheComplete(cache) {
  if (!await cache.match(COMPLETE)) return false;
  for (const url of urls.keys()) if (!await cache.match(url)) return false;
  return true;
}
async function saveRelease(installing) {
  const cache = await caches.open(CACHE);
  try {
    await cache.delete(COMPLETE);
    let done = 0;
    for (const [url, asset] of urls) {
      // Existing entries were already verified. Sequential writes bound memory
      // while the Godot runtime is also using the ~40 MB WebAssembly engine.
      if (!await cache.match(url)) await cache.put(url, await verifiedFetch(asset));
      await announce({ type: 'CACHE_PROGRESS', done: ++done, total: ASSETS.length });
    }
    await cache.put(COMPLETE, new Response(JSON.stringify({ version: VERSION }), { headers: { 'Content-Type': 'application/json' } }));
    await announce({ type: 'CACHE_STATUS', ready: true });
  } catch (error) {
    // Never touch the active older version or another game's caches. A repair
    // preserves usable entries in this version even when the device is full.
    if (installing) await caches.delete(CACHE);
    await announce({ type: 'CACHE_FAILED' });
    throw error;
  }
}
self.addEventListener('install', (event) => {
  event.waitUntil(saveRelease(true));
  // Deliberately no skipWaiting: a mission must never reset for an update.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Normal lifecycle waits for every old controlled game tab to close first.
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    // Deliberately no clients.claim: the first online page keeps its own build.
    await announce({ type: 'CACHE_STATUS', ready: await cacheComplete(await caches.open(CACHE)) });
  })());
});
self.addEventListener('message', (event) => {
  if (event.source?.url && !event.source.url.startsWith(SCOPE)) return;
  if (event.data?.type === 'CACHE_STATUS') {
    event.waitUntil((async () => {
      const message = { type: 'CACHE_STATUS', scope: SCOPE, version: VERSION, ready: await cacheComplete(await caches.open(CACHE)) };
      if (event.ports[0]) event.ports[0].postMessage(message);
    })());
  } else if (event.data?.type === 'CACHE_REPAIR') {
    if (!repairPromise) repairPromise = saveRelease(false).catch(() => {}).finally(() => { repairPromise = null; });
    event.waitUntil(repairPromise);
  }
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.href.startsWith(SCOPE)) return;
  url.search = '';
  url.hash = '';
  if (request.mode === 'navigate' && url.href === SCOPE) url.pathname += 'index.html';
  const asset = urls.get(url.href);
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    try {
      const response = await verifiedFetch(asset);
      // A missing asset may be repaired online, but never mix an old HTML/PCK
      // with a newer deploy. A quota failure must not break online gameplay.
      try { await cache.put(url.href, response.clone()); } catch (_) { /* Storage unavailable. */ }
      return response;
    } catch (_) {
      return new Response('游戏文件暂不可用。请联网后关闭游戏窗口，再重新打开。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
