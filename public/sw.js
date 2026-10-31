// Service worker do Navalha.
// Não guarda páginas nem dados de ninguém em cache (agenda e dados pessoais sempre vêm do servidor).
// Só guarda os ícones e a tela "sem internet", para o app abrir com uma mensagem amigável quando o celular estiver offline.
const CACHE = "navalha-v1";
const OFFLINE = "/offline.html";
const STATIC = [OFFLINE, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  const url = new URL(req.url);
  if (url.origin === location.origin && STATIC.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});
