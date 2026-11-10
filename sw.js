/* 無人機足球模擬培訓系統 — 離線快取（Service Worker）  2026-11-05
 *
 * 做什麼：有網路時打開網頁一次，就把網頁、lib/ 函式庫、assets/ 素材存在這台裝置上。
 *         之後沒網路或網路很慢，也能直接打開、照常飛（練習、闖關、對 AI 比賽、選手訓練）。
 *         連線對戰／分享觀賽本來就要網路，這裡不處理（直接走網路）。
 *
 * ※ 改了 index.html、assets/ 或 lib/ 之後，把下面 CACHE 的版本號改一下（例如 -b、-c），
 *    裝置下次有網路打開時才會整包換新；舊快取會自動刪掉。
 *    網頁本身（index.html）不用改版本號也會更新：有網路時每次都先抓新版。
 *    素材和函式庫則是存了就一直用（省網路流量），所以換了圖或模型「一定要」改版本號。
 * ※ 新增素材檔時，順便加進 PRECACHE；沒加也能用，只是要等第一次用到才會存。
 */
const CACHE = 'drone-sim-2026-11-11a';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'lib/three.min.js', 'lib/GLTFLoader.js', 'lib/SkeletonUtils.js', 'lib/qrcode.min.js',
  'assets/logo.webp', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/pilot.glb', 'assets/crowd.webp',
  'assets/sky/sky_2k.jpg', 'assets/sky/sky_4k.jpg', 'assets/sky/cloud.png',
  'assets/sky/cliff_diff.jpg', 'assets/sky/cliff_nor.jpg',
  'assets/sky/grass_diff.jpg', 'assets/sky/grass_nor.jpg',
];
// 外部函式庫（網址帶固定版本號，內容不會變）：lib/ 沒上傳時的備援、連線對戰模組，抓到一次也存起來。
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'esm.sh'];
const PAGE_TIMEOUT = 3000;   // 網頁本身：先等網路 3 秒拿新版，太慢就用存的

self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    // 一個一個存：網路差時某個檔失敗不會讓全部前功盡棄，缺的之後用到時再補
    await Promise.all(PRECACHE.map(u=>c.add(new Request(u, {cache:'reload'})).catch(()=>{})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k.startsWith('drone-sim-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    const c = await caches.open(CACHE);
    let missing = 0;
    for(const u of PRECACHE) if(!(await c.match(u))) missing++;
    for(const cl of await self.clients.matchAll({includeUncontrolled:true, type:'window'}))
      cl.postMessage({type:'offline-ready', cache:CACHE, missing});
  })());
});

const okToStore = r=>r && (r.ok || r.type === 'opaque');

async function pageFirst(req){   // 網頁：網路優先（有新版就用新版），逾時或離線就用存的
  const c = await caches.open(CACHE);
  const net = fetch(req).then(r=>{ if(r.ok) c.put('index.html', r.clone()); return r; });
  const timeout = new Promise(ok=>setTimeout(ok, PAGE_TIMEOUT));
  const fast = await Promise.race([net.catch(()=>null), timeout]);
  if(fast) return fast;
  const cached = await c.match('index.html');
  if(cached){ net.catch(()=>{}); return cached; }
  return net;   // 還沒存過：只能繼續等網路
}

async function cacheFirst(req){   // 素材、函式庫：有存就用（不再重抓，省網路），沒有才上網抓並存起來
  const c = await caches.open(CACHE);
  const cached = await c.match(req);
  if(cached) return cached;
  const r = await fetch(req);
  if(okToStore(r)) c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if(url.origin === location.origin){
    const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);
    e.respondWith(isPage ? pageFirst(req) : cacheFirst(req));
  }else if(CDN_HOSTS.includes(url.hostname)){
    e.respondWith(cacheFirst(req));
  }
  // 其他（TURN 憑證、Nostr 配對等）：不攔，照常走網路
});
