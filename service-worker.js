importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore-compat.js');
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

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 백그라운드 일정 체크 (20초 주기)
setInterval(async () => {
  try {
    const now = new Date();
    const snap = await db.collection("events").get();
    
    snap.forEach(doc => {
      const e = doc.data();
      if (!e.date || !e.time) return;
      
      const eventTime = new Date(`${e.date}T${e.time}:00`);
      const diff = eventTime - now;

      // 5분 전 알림 (5분 ~ 4분 40초 사이)
      if (diff > 280000 && diff <= 300000) {
        sendBotMessage(`📢 [일정] 5분 뒤 "${e.title}" 시작`);
      }
      // 정시 알림 (-10초 ~ +10초)
      else if (diff >= -10000 && diff <= 10000) {
        sendBotMessage(`📢 [일정] "${e.title}" 시작!`);
      }
    });
  } catch (err) {
    console.error("SW 백그라운드 에러:", err);
  }
}, 20000);

async function sendBotMessage(text) {
  await db.collection("messages").add({
    text: text,
    userName: "시스템 봇",
    userUid: "system-bot",
    userColor: "#10b981",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "./icon-192.png"
  });
});
