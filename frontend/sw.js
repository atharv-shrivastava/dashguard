const CACHE = "dashguard-ui-v9";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./camera.js",
  "./motion.js", "./detection.js", "./detection-worker.js",
  "./manifest.webmanifest", "./assets/icon.svg"
];
const RUNTIME_HOSTS = new Set(["cdn.jsdelivr.net", "storage.googleapis.com"]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isLocalAppFile = url.origin === self.location.origin;
  const isVisionRuntime = RUNTIME_HOSTS.has(url.hostname) && (
    url.hostname === "cdn.jsdelivr.net"
      ? url.pathname.includes("/@mediapipe/tasks-vision@1.2.3/")
      : (url.pathname.includes("/mediapipe-models/object_detector/efficientdet_lite0/") ||
        url.pathname.includes("/mediapipe-models/face_detector/blaze_face_full_range/"))
  );
  if (!isLocalAppFile && !isVisionRuntime) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
