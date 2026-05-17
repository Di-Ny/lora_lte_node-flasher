// Service Worker pour LoRa-LTE Node Flasher
// Permet le fonctionnement offline (terrain sans internet) en pre-cacheant
// tous les firmwares declares dans builds.json + les dependances ESP Web Tools.
//
// Strategie de cache :
//   - index.html, builds.json    -> network-first (toujours essayer reseau,
//                                   fallback cache si offline -> permet de voir
//                                   les nouvelles releases en ligne)
//   - firmware/*.bin             -> cache-first (immuable par nature, un .bin
//                                   publie ne change pas)
//   - manifests/*.json           -> cache-first (idem, immuables)
//   - unpkg.com/esp-web-tools/*  -> cache-first (version fige dans l'URL)
//   - autres                     -> network-first

const CACHE_VERSION = "v2";
const STATIC_CACHE = `flasher-static-${CACHE_VERSION}`;
const FIRMWARE_CACHE = `flasher-firmware-${CACHE_VERSION}`;
const VENDOR_CACHE = `flasher-vendor-${CACHE_VERSION}`;

// Fichiers du site qu'on tente de pre-cacher a l'install
// (HTML est en network-first donc en pratique on ne s'en sert pas mais ca aide)
const STATIC_PRECACHE = [
  "./",
  "./index.html",
  "./builds.json",
  "./manifest.webmanifest",
];

// =============================================================================
// INSTALL : pre-cache des fichiers statiques de base
// =============================================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.addAll(STATIC_PRECACHE);
      } catch (e) {
        // Si on est offline ou un fichier manque, on continue quand meme
        console.warn("[SW] Precache failed (continuing):", e);
      }
      // Active immediatement la nouvelle version sans attendre que les onglets se ferment
      await self.skipWaiting();
    })()
  );
});

// =============================================================================
// ACTIVATE : nettoie les anciens caches
// =============================================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const validCaches = new Set([STATIC_CACHE, FIRMWARE_CACHE, VENDOR_CACHE]);
      await Promise.all(
        keys.map((k) => (validCaches.has(k) ? null : caches.delete(k)))
      );
      // Prend le controle de toutes les pages ouvertes immediatement
      await self.clients.claim();
    })()
  );
});

// =============================================================================
// FETCH : strategie de cache selon l'URL
// =============================================================================
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GET uniquement
  if (req.method !== "GET") return;

  // Cas 1 : firmware/*.bin -> cache-first (immuable)
  if (url.pathname.includes("/firmware/") && url.pathname.endsWith(".bin")) {
    event.respondWith(cacheFirst(req, FIRMWARE_CACHE));
    return;
  }

  // Cas 2 : manifests/*.json -> cache-first (immuable, generes par release)
  if (url.pathname.includes("/manifests/") && url.pathname.endsWith(".json")) {
    event.respondWith(cacheFirst(req, FIRMWARE_CACHE));
    return;
  }

  // Cas 3 : ESP Web Tools depuis unpkg.com -> cache-first (URL versionnees)
  if (url.host === "unpkg.com" || url.host.endsWith(".unpkg.com")) {
    event.respondWith(cacheFirst(req, VENDOR_CACHE));
    return;
  }

  // Cas 4 : tout le reste sur notre domaine -> network-first
  //          (permet de voir une nouvelle version d'index.html ou builds.json
  //           si on est online, fallback cache si offline)
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }

  // Cas 5 : domaines externes inconnus -> reseau direct
});

// =============================================================================
// Strategies de cache
// =============================================================================

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (e) {
    // Offline et pas en cache : on ne peut rien faire
    return new Response("Offline and not cached", {
      status: 504,
      statusText: "Gateway Timeout",
    });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

// =============================================================================
// MESSAGE : la page peut demander un pre-cache des firmwares
// (declenche depuis index.html apres le premier chargement reussi)
// =============================================================================
self.addEventListener("message", (event) => {
  if (event.data?.type === "PRECACHE_FIRMWARES") {
    event.waitUntil(precacheFirmwares(event.source));
  }
});

async function precacheFirmwares(client) {
  try {
    // Recupere builds.json (depuis cache si offline)
    const resp = await fetch("./builds.json", { cache: "no-cache" });
    if (!resp.ok) throw new Error(`builds.json: HTTP ${resp.status}`);
    const data = await resp.json();

    // Enumere tous les fichiers a cacher : .bin + manifests
    const urls = [];
    for (const v of data.versions || []) {
      for (const key of Object.keys(v.builds || {})) {
        const b = v.builds[key];
        if (!b.available) continue;
        urls.push(`firmware/v${v.id}-${key}-full.bin`);
        urls.push(`firmware/v${v.id}-${key}-app.bin`);
        if (b.manifestUpdate) urls.push(b.manifestUpdate);
        if (b.manifestFactory) urls.push(b.manifestFactory);
      }
    }

    // Filtre les URLs deja en cache
    const cache = await caches.open(FIRMWARE_CACHE);
    const total = urls.length;
    let done = 0;
    let skipped = 0;

    notify(client, { type: "PRECACHE_START", total });

    for (const url of urls) {
      const existing = await cache.match(url);
      if (existing) {
        skipped++;
        done++;
        notify(client, { type: "PRECACHE_PROGRESS", done, total, url, cached: true });
        continue;
      }
      try {
        const r = await fetch(url);
        if (r.ok) {
          await cache.put(url, r.clone());
        }
        done++;
        notify(client, { type: "PRECACHE_PROGRESS", done, total, url, cached: false });
      } catch (e) {
        done++;
        notify(client, { type: "PRECACHE_PROGRESS", done, total, url, error: e.message });
      }
    }

    notify(client, { type: "PRECACHE_DONE", total, skipped, downloaded: total - skipped });
  } catch (e) {
    notify(client, { type: "PRECACHE_ERROR", message: e.message });
  }
}

function notify(client, msg) {
  if (client) client.postMessage(msg);
}
