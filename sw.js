// Service worker: cache-first for album artwork only.
// API calls (your Apps Script backend, iTunes search) are never cached —
// they always hit the network fresh, since that data changes and must stay current.

const CACHE_NAME = 'library-images-v1';
const MAX_CACHED_IMAGES = 400; // rough cap so this doesn't grow unbounded forever

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

function isImageRequest(request){
  // Covers <img> tag loads (destination === 'image') as a primary check,
  // with a URL-extension fallback in case destination isn't set consistently.
  if(request.destination === 'image') return true;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(request.url);
}

async function trimCache(cacheName, maxItems){
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if(keys.length <= maxItems) return;

  const excess = keys.length - maxItems;
  for(let i = 0; i < excess; i++){
    await cache.delete(keys[i]);
  }
}

async function handleImageRequest(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if(cached) return cached;

  try{
    const response = await fetch(request);
    // Only cache successful, cacheable responses.
    if(response && response.ok){
      cache.put(request, response.clone());
      trimCache(CACHE_NAME, MAX_CACHED_IMAGES);
    }
    return response;
  }catch(err){
    // Offline / network failure with nothing cached yet — let it fail naturally.
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if(request.method !== 'GET') return; // never touch POST (add/remove actions)
  if(!isImageRequest(request)) return; // let everything else (API calls) pass through untouched

  event.respondWith(handleImageRequest(request));
});
