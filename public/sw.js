const CACHE_NAME = "caleris-shell-v1";
const SHELL = ["/", "/favicon/android-chrome-192x192.png", "/favicon/android-chrome-512x512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("caleris-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
 const request=event.request;if(request.method!=="GET")return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 if(/^\/(rest\/v1|auth\/v1|storage\/v1|functions\/v1|api\/|_vercel\/)/.test(url.pathname))return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put("/",copy));}return response;}).catch(async()=> (await caches.match(request))||(await caches.match("/"))));return;
 }
 if(/\.(?:js|css|png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)){
  event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));return response;});return cached||network;}));
 }
});