/// <reference lib="webworker" />
export default null;
declare var self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Intercept the Web Share Target POST request
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const image = formData.get('image');
          
          if (image instanceof File) {
            // Find all active window clients and send the file
            const clients = await self.clients.matchAll({ type: 'window' });
            for (const client of clients) {
              client.postMessage({
                type: 'SHARED_IMAGE',
                file: image
              });
            }
          }
          
          // Redirect the browser back to the main app root
          return Response.redirect('/', 303);
        } catch (error) {
          console.error('[ServiceWorker] Share target error:', error);
          return Response.redirect('/', 303);
        }
      })()
    );
  }
});
