importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBU3jeOqj_FCBXeO2ghh5XlHBrQbUjNaiA",
  authDomain: "ahn-jin-zero.firebaseapp.com",
  projectId: "ahn-jin-zero",
  storageBucket: "ahn-jin-zero.firebasestorage.app",
  messagingSenderId: "55250475892",
  appId: "1:55250475892:web:c87555da879be518faaa21",
  measurementId: "G-V2TEL4TNPJ"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

/* ========================= INSTALL ========================= */
self.addEventListener("install", (event) => {

  self.skipWaiting();

});

/* ========================= ACTIVATE ========================= */
self.addEventListener("activate", (event) => {

  event.waitUntil(self.clients.claim());

});

/* ========================= BACKGROUND FCM ========================= */
messaging.onBackgroundMessage((payload) => {

  console.log("SW BACKGROUND MESSAGE", payload);

  self.registration.showNotification(

    payload.notification?.title || "새 알림",

    {
      body:
        payload.notification?.body || "메시지가 도착했습니다.",

      icon: "./icon-192.png",

      badge: "./icon-192.png",

      tag: "fcm-message",

      renotify: false
    }
  );
});

/* ========================= NOTIFICATION CLICK ========================= */
self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  event.waitUntil(

    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {

      for (const client of clientList) {

        if ("focus" in client) {

          return client.focus();
        }
      }

      if (clients.openWindow) {

        return clients.openWindow("./");
      }
    })
  );
});
