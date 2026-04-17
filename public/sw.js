// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.text() || '你有一条新消息';
  const options = {
    body: data
  };
  event.waitUntil(self.registration.showNotification('Sprited', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/')); // 点击跳转首页
});