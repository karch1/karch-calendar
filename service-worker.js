self.addEventListener("install", (event) => {
  console.log("Service Worker Installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker Activated");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // 페치 이벤트 (필요 시 캐싱 로직 추가 가능)
});

/* ========================================================
   1. FIRESTORE 백그라운드 일정 알림 (상시 감시 로직 추가)
======================================================== */
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore-compat.js'); // 생성용 추가
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

const db = firebase.firestore();
const messaging = firebase.messaging();

let bgNotifiedSchedules = new Set();

// 20초마다 백그라운드에서 Firestore 일정을 체크합니다. (브라우저가 살아있는 한 꺼져도 작동)
setInterval(async () => {
  try {
    const now = new Date();
    const snap = await db.collection("events").get();
    
    snap.forEach(doc => {
      const e = doc.data();
      if (!e.date || !e.time) return;

      const eventTime = new Date(`${e.date}T${e.time}:00`);
      const diff = eventTime - now;

      // 5분 전 알림 (시간 오차 감안하여 10초 여유 확보)
      if (diff > 0 && diff <= 5 * 60 * 1000 && diff > 4 * 60 * 1000 + 40000) {
        const key = doc.id + "_5min";
        if (!bgNotifiedSchedules.has(key)) {
          bgNotifiedSchedules.add(key);
          showBgNotification(`📅 5분 전 알림`, e.title);
        }
      }
      // 정시 알림
      if (diff >= -10000 && diff <= 10000) {
        const key = doc.id + "_now";
        if (!bgNotifiedSchedules.has(key)) {
          bgNotifiedSchedules.add(key);
          showBgNotification(`📅 지금 시작 알림`, e.title);
        }
      }
    });
  } catch (err) {
    console.error("백그라운드 스케줄러 에러:", err);
  }
}, 20000);

function showBgNotification(title, body) {
  self.registration.showNotification(title, {
    body: body,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "bg-schedule-" + Date.now(),
    renotify: true
  });
}

/* ========================================================
   2. FCM BACKGROUND PUSH (기존 유지)
======================================================== */
messaging.onBackgroundMessage((payload) => {
  console.log("백그라운드 FCM 푸시 수신", payload);
  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png"
    }
  );
});
