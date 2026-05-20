self.addEventListener("install", (event) => {
  console.log("Service Worker Installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker Activated");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // 페치 이벤트
});

/* ========================================================
   1. FIRESTORE 백그라운드 일정 알림 + 채팅 봇 등록
======================================================== */
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

let bgNotifiedSchedules = new Set();

// 20초마다 백그라운드에서 Firestore 일정을 체크합니다.
setInterval(async () => {
  try {
    const now = new Date();
    const snap = await db.collection("events").get();
    
    snap.forEach(doc => {
      const e = doc.data();
      if (!e.date || !e.time) return;

      const eventTime = new Date(`${e.date}T${e.time}:00`);
      const diff = eventTime - now;

      // 5분 전 알림
      if (diff > 0 && diff <= 5 * 60 * 1000 && diff > 4 * 60 * 1000 + 40000) {
        const key = doc.id + "_5min";
        if (!bgNotifiedSchedules.has(key)) {
          bgNotifiedSchedules.add(key);
          
          const msg = `📢 [일정 알림] 5분 뒤 "${e.title}" 일정이 시작됩니다.`;
          showBgNotification(`📅 5분 전 알림`, e.title);
          sendBotMessageToChat(msg); // ◀ 채팅방에 봇 메시지 추가
        }
      }
      
      // 정시 알림
      if (diff >= -10000 && diff <= 10000) {
        const key = doc.id + "_now";
        if (!bgNotifiedSchedules.has(key)) {
          bgNotifiedSchedules.add(key);
          
          const msg = `📢 [일정 시작] 지금 "${e.title}" 일정이 시작되었습니다!`;
          showBgNotification(`📅 지금 시작 알림`, e.title);
          sendBotMessageToChat(msg); // ◀ 채팅방에 봇 메시지 추가
        }
      }
    });
  } catch (err) {
    console.error("백그라운드 스케줄러 에러:", err);
  }
}, 20000);

// [핵심 추가] 실제 채팅 DB에 시스템 봇 이름으로 메시지를 꼽아넣는 함수
async function sendBotMessageToChat(messageText) {
  try {
    // 'chats' 부분은 실제 사용하시는 채팅 컬렉션 이름으로 매칭해주세요.
    await db.collection("messages").add({
      text: messageText,
      userName: "시스템 봇",
      userUid: "system-bot",
      userColor: "#10b981",
      createdAt: firebase.firestore.FieldValue.serverTimestamp() // 파이어베이스 서버 타임스탬프
    });
    console.log("시스템 봇 채팅 등록 성공:", messageText);
  } catch (error) {
    console.error("시스템 봇 채팅 등록 실패:", error);
  }
}

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
