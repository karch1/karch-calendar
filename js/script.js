import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, deleteDoc, updateDoc,
  doc, onSnapshot, query, orderBy, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js";

/* ========================= FIREBASE INIT ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyBU3jeOqj_FCBXeO2ghh5XlHBrQbUjNaiA",
  authDomain: "ahn-jin-zero.firebaseapp.com",
  projectId: "ahn-jin-zero",
  storageBucket: "ahn-jin-zero.firebasestorage.app",
  messagingSenderId: "55250475892",
  appId: "1:55250475892:web:c87555da879be518faaa21",
  measurementId: "G-V2TEL4TNPJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const messaging = getMessaging(app);

/* ========================= STATE ========================= */
const state = {
  currentDate: new Date(),
  events: [],
  selectedDateStr: null,
  currentUser: null,
  editId: null,
  selectedEvent: null,
  viewMode: "list",
  visibleUsers: {}
};

let chatUnsub = null;
let lastProcessedMsgId = null;
let scheduleTimer = null;
let notifiedSchedules = new Set();

/* ========================= USER MAP ========================= */
const userColorMap = {
  "choae000@gmail.com": { name: "갈치", color: "#6366f1" },
  "ssang9764@gmail.com": { name: "생마", color: "#38bdf8" },
  "cksgml0@naver.com": { name: "연막", color: "#8b5e3c" },
  "ahn7770@gmail.com": { name: "안크", color: "#ef4444" },
  "huigi@email.com": { name: "희기", color: "#f97316" },
  "bot@bot.com": { name: "🤖 안건전지 봇", color: "#10b981" }
};

Object.keys(userColorMap).forEach(email => {
  if(email !== "bot@bot.com") state.visibleUsers[email] = true;
});

/* ========================= ADMIN ========================= */
const ADMIN_EMAIL = "choae000@gmail.com";
function isAdmin() {
  return state.currentUser?.email === ADMIN_EMAIL;
}
function canEditEvent(eventData) {
  if (!state.currentUser) return false;
  if (isAdmin()) return true;
  return eventData.userEmail === state.currentUser.email;
}

/* ========================= SHIFT LOGIC ========================= */
const SHIFT_START = new Date("2026-05-04");
const SHIFT_PATTERN = [
  "주간","주간","주간","주간","주간", "휴","휴",
  "오후","오후","오후","오후","오후", "휴","휴",
  "야간","야간","야간","야간","야간", "휴","휴"
];

function getShiftLabel(dateStr) {
  const target = new Date(dateStr);
  const diff = Math.floor((target - SHIFT_START) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "";
  return SHIFT_PATTERN[diff % SHIFT_PATTERN.length];
}

/* ========================= ELEMENTS ========================= */
const calendarEl = document.getElementById('calendar');
const monthDisplay = document.getElementById('monthDisplay');

/* ========================= TOAST ========================= */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.style.opacity = 1;
  setTimeout(() => { t.style.opacity = 0; }, 2000);
}

/* ========================= SYSTEM NOTIFICATION ========================= */
function triggerSystemNotification(title, options) {
  showToast(title);
  if (Notification.permission === "granted") {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification(title, {
          icon: "./icon-192.png",
          badge: "./icon-192.png",
          ...options
        });
      } else {
        new Notification(title, options);
      }
    });
  }
}

/* ========================= BOT AUTO CHAT SENDER ========================= */
async function sendBotMessage(text) {
  await addDoc(collection(db, "messages"), {
    text,
    userName: userColorMap["bot@bot.com"].name,
    userColor: userColorMap["bot@bot.com"].color,
    userUid: "system-bot",
    createdAt: serverTimestamp()
  });
}

/* ========================= LOGIN / LOGOUT ========================= */
window.loginGoogle = async () => {
  await signInWithPopup(auth, provider);
  showToast("로그인 완료");
};
window.logoutGoogle = async () => {
  await signOut(auth);
  showToast("로그아웃 완료");
};

/* ========================= AUTH STATE ========================= */
onAuthStateChanged(auth, (user) => {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (user && userColorMap[user.email]) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "block";
    const p = userColorMap[user.email];
    state.currentUser = {
      uid: user.uid,
      email: user.email,
      name: p.name,
      color: p.color
    };
    loadEvents();
    listenChat();
    startScheduleNotifier();
  } else {
    loginBtn.style.display = "block";
    logoutBtn.style.display = "none";
    state.currentUser = null;
    state.events = [];
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
    if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
    notifiedSchedules.clear();
    document.getElementById("chatMessages").innerHTML = "";
    renderCalendar();
  }
});

/* ========================= LOAD EVENTS ========================= */
async function loadEvents() {
  const snap = await getDocs(collection(db, "events"));
  state.events = [];
  snap.forEach(d => {
    state.events.push({ id: d.id, ...d.data() });
  });
  renderUserFilters();
  renderCalendar();
}

/* ========================= OPEN ADD FORM ========================= */
window.openAddForm = function () {
  if (!state.currentUser) return showToast("로그인 필요");
  state.editId = null;
  document.getElementById('eventTitle').value = "";
  document.getElementById('eventTime').value = "";
  document.getElementById('eventShiftDay').checked = false;
  document.getElementById('eventShiftNight').checked = false;
  document.getElementById('eventInitialMemo').value = "";
  document.getElementById('editModal').style.display = "flex";
};

/* ========================= MONTH MOVE ========================= */
window.prevMonth = function () {
  state.currentDate.setMonth(state.currentDate.getMonth() - 1);
  renderCalendar();
};
window.nextMonth = function () {
  state.currentDate.setMonth(state.currentDate.getMonth() + 1);
  renderCalendar();
};

const sidebar = document.getElementById("userSidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
sidebarToggle.onclick = () => { sidebar.classList.toggle("active"); };

/* ========================= MOBILE CHAT TOGGLE & BACKDROP LOGIC ========================= */
const mobileChatToggle = document.getElementById("mobileChatToggle");
const chatSidebar = document.getElementById("chatSidebar");
const chatBackdrop = document.getElementById("chatBackdrop");

function closeMobileChat() {
  chatSidebar.classList.remove("chat-open");
  chatSidebar.classList.add("chat-closed");
  chatBackdrop.style.display = "none";
  mobileChatToggle.style.display = "flex";
}

if (mobileChatToggle) {
  mobileChatToggle.onclick = () => {
    chatSidebar.classList.remove("chat-closed");
    chatSidebar.classList.add("chat-open");
    chatBackdrop.style.display = "block";
    mobileChatToggle.style.display = "none";
  };
}

document.getElementById("closeChatBtn").onclick = closeMobileChat;
chatBackdrop.onclick = closeMobileChat;

/* ========================= 주간/야간 체크박스 중복 선택 방지 ========================= */
const chkDay = document.getElementById('eventShiftDay');
const chkNight = document.getElementById('eventShiftNight');
chkDay.onchange = () => { if (chkDay.checked) chkNight.checked = false; };
chkNight.onchange = () => { if (chkNight.checked) chkDay.checked = false; };

/* ========================= EDIT EVENT OPEN ========================= */
window.editEvent = function (e) {
  if (!canEditEvent(e)) return showToast("본인 일정만 수정 가능");
  state.selectedDateStr = e.date;
  state.editId = e.id;
  document.getElementById('eventTitle').value = e.title;
  document.getElementById('eventTime').value = e.time || "";
  document.getElementById('eventShiftDay').checked = e.shiftType === "주간";
  document.getElementById('eventShiftNight').checked = e.shiftType === "야간";
  document.getElementById('eventInitialMemo').value = e.memo || "";
  document.getElementById('editModal').style.display = "flex";
};

/* ========================= DELETE EVENT ========================= */
window.deleteEvent = async function (id) {
  const target = state.events.find(e => e.id === id);
  if (!target) return showToast("일정을 찾을 수 없음");
  if (!canEditEvent(target)) return showToast("본인 일정만 삭제 가능");

  await deleteDoc(doc(db, "events", id));
  state.events = state.events.filter(e => e.id !== id);
  
  const displayTitle = target.shiftType ? `[${target.shiftType}] ${target.title}` : target.title;
  await sendBotMessage(`📢 [알림] ${state.currentUser.name}님이 일정을 삭제했습니다.\n🗑️ 삭제된 일정: ${displayTitle} (${target.date})`);
  renderCalendar();
  closeModal('dayModal');
};

/* ========================= CLOSE MODAL ========================= */
window.closeModal = function (id) {
  document.getElementById(id).style.display = "none";
};

/* ========================= SAVE EVENT ========================= */
document.getElementById('saveBtn').onclick = async () => {
  const title = document.getElementById('eventTitle').value.trim();
  const time = document.getElementById('eventTime').value;
  const memo = document.getElementById('eventInitialMemo').value;
  
  const shiftType = document.getElementById('eventShiftDay').checked ? "주간" : (document.getElementById('eventShiftNight').checked ? "야간" : "");

  if (!state.selectedDateStr) return showToast("날짜 선택");
  if (!title) return showToast("제목 입력");

  const data = {
    date: state.selectedDateStr,
    title,
    time,
    memo,
    shiftType,
    userColor: state.currentUser.color,
    userUid: state.currentUser.uid,
    userEmail: state.currentUser.email,
    userName: state.currentUser.name
  };

  const displayTitle = shiftType ? `[${shiftType}] ${title}` : title;

  if (state.editId) {
    await updateDoc(doc(db, "events", state.editId), data);
    const idx = state.events.findIndex(e => e.id === state.editId);
    state.events[idx] = { ...state.events[idx], ...data };
    state.editId = null;
    await sendBotMessage(`📢 [알림] ${state.currentUser.name}님이 일정을 수정했습니다.\n✏️ 수정된 일정: ${displayTitle} (${data.date} ${time})`);
  } else {
    const ref = await addDoc(collection(db, "events"), data);
    state.events.push({ id: ref.id, ...data });
    await sendBotMessage(`📢 [알림] ${state.currentUser.name}님이 새 일정을 등록했습니다.\n📅 일정명: ${displayTitle} (${data.date} ${time})`);
  }
  renderCalendar();
  closeModal('editModal');
  closeModal('dayModal');
};

/* ========================= USER FILTER RENDER ========================= */
function renderUserFilters() {
  const wrap = document.getElementById("userFilterList");
  wrap.innerHTML = "";
  Object.entries(userColorMap).forEach(([email, user]) => {
    if(email === "bot@bot.com") return;
    const isChecked = state.visibleUsers[email];
    const row = document.createElement("label");
    
    row.className = `flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 cursor-pointer transition-all ${
      isChecked ? 'bg-gray-50 border-gray-300 shadow-sm opacity-100' : 'bg-white opacity-40 hover:opacity-70'
    }`;
    row.innerHTML = `
      <input type="checkbox" ${isChecked ? "checked" : ""} data-email="${email}" class="hidden">
      <span class="w-2.5 h-2.5 rounded-full" style="background:${user.color}"></span>
      <span class="text-xs font-bold text-gray-700">${user.name}</span>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("input").forEach(chk => {
    chk.onchange = () => {
      const email = chk.dataset.email;
      state.visibleUsers[email] = chk.checked;
      renderUserFilters();
      renderCalendar();
    };
  });
}

/* ========================= MY ONLY TOGGLE ========================= */
document.getElementById("myOnlyToggle").onchange = (e) => {
  if (!state.currentUser) return;
  const checked = e.target.checked;
  Object.keys(state.visibleUsers).forEach(email => {
    state.visibleUsers[email] = checked ? email === state.currentUser.email : true;
  });
  renderUserFilters();
  renderCalendar();
};

/* ========================= CALENDAR RENDER ========================= */
function renderCalendar() {
  calendarEl.innerHTML = '';
  const y = state.currentDate.getFullYear();
  const m = state.currentDate.getMonth();
  monthDisplay.innerText = `${y}년 ${m + 1}월`;

  const days = ['일', '월', '화', '수', '목', '금', '토'];
  days.forEach(d => {
    const el = document.createElement('div');
    el.className = "day-label";
    el.innerText = d;
    calendarEl.appendChild(el);
  });

  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  const todayStr = new Date().toISOString().split("T")[0];

  for (let i = 0; i < first; i++) {
    calendarEl.appendChild(document.createElement('div'));
  }

  for (let d = 1; d <= last; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const shift = getShiftLabel(dateStr);
    const div = document.createElement('div');
    div.className = "calendar-day";

    if (dateStr === todayStr) {
      div.style.outline = "3px solid #1ac486";
      div.style.background = "#e6f9f2";
    }

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="day-num font-bold text-xs text-gray-700">${d}</span>
        <span style="font-size:9px;font-weight:900;color:#64748b;">${shift}</span>
      </div>
    `;

    const events = state.events.filter(e => e.date === dateStr && state.visibleUsers[e.userEmail]);
    events.forEach(e => {
      const bar = document.createElement('div');
      bar.className = "event-bar";
      bar.style.background = e.userColor;
      
      const displayTitle = e.shiftType ? `[${e.shiftType}] ${e.title}` : e.title;
      bar.innerText = displayTitle;

      bar.onclick = (ev) => {
        ev.stopPropagation();
        openEventDetail(e);
      };
      div.appendChild(bar);
    });

    div.onclick = () => openDayModal(dateStr);
    calendarEl.appendChild(div);
  }
}

/* ========================= DAY MODAL ========================= */
window.openDayModal = function (dateStr) {
  state.selectedDateStr = dateStr;
  state.viewMode = "list";
  const modal = document.getElementById('dayModal');
  const list = document.getElementById('modalEventList');
  const title = document.getElementById('modalDateTitle');
  title.innerText = dateStr;

  const events = state.events.filter(e => e.date === dateStr && state.visibleUsers[e.userEmail]);
  list.innerHTML = "";
  if (events.length === 0) {
    list.innerHTML = "<div class='text-gray-400 text-sm text-center py-4'>일정이 없습니다.</div>";
  }
  events.forEach(e => {
    const div = document.createElement('div');
    div.className = "p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition text-left";
    
    const displayTitle = e.shiftType ? `[${e.shiftType}] ${e.title}` : e.title;
    div.innerHTML = `<b class="text-gray-800 text-sm">${displayTitle}</b><br/><small class="text-gray-400 font-semibold">${e.time || "시간 미정"}</small>`;
    
    div.onclick = () => openEventDetail(e);
    list.appendChild(div);
  });
  modal.style.display = "flex";
};

/* ========================= DETAIL MODAL ========================= */
window.openEventDetail = function (e) {
  state.selectedEvent = e;
  state.viewMode = "detail";
  const modal = document.getElementById('dayModal');
  const list = document.getElementById('modalEventList');
  const editable = canEditEvent(e);

  const displayTitle = e.shiftType ? `[${e.shiftType}] ${e.title}` : e.title;

  list.innerHTML = `
    <div class="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm text-left">
      <div class="font-black text-xl text-gray-800 tracking-tight">${displayTitle}</div>
      <div class="text-xs font-bold text-gray-400 mt-1 mb-3">🕒 ${e.time || "시간 미정"}</div>
      <div class="p-3 bg-gray-50 rounded-xl text-sm text-gray-600 font-medium whitespace-pre-wrap leading-relaxed min-height-[60px]">${e.memo || "작성된 메모가 없습니다."}</div>
      <div class="mt-4 flex items-center gap-1.5 text-xs font-bold" style="color:${e.userColor};">
        <span class="w-2 h-2 rounded-full" style="background:${e.userColor}"></span>
        작성자 : ${e.userName}
      </div>
      <div class="mt-5 flex gap-2 pt-2 border-t border-gray-50">
        ${editable ? `
          <button id="modalEditBtn" class="flex-1 py-2 bg-[#1ac486] hover:background-[#159f6d] text-white rounded-xl font-bold text-xs transition">수정</button>
          <button id="modalDelBtn" class="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-xs transition">삭제</button>
        ` : ''}
        <button id="modalListBtn" class="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-xl font-bold text-xs transition">목록</button>
      </div>
    </div>
  `;
  
  if (editable) {
    document.getElementById("modalEditBtn").onclick = () => editEvent(e);
    document.getElementById("modalDelBtn").onclick = () => deleteEvent(e.id);
  }
  document.getElementById("modalListBtn").onclick = () => openDayModal(e.date);
  
  modal.style.display = "flex";
};

/* ========================= CHAT CODE ========================= */
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");

chatInput.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("sendChatBtn").click();
  }
});

document.getElementById("sendChatBtn").onclick = async () => {
  if (!state.currentUser) return showToast("로그인 필요");
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  await addDoc(collection(db, "messages"), {
    text,
    userName: state.currentUser.name,
    userColor: state.currentUser.color,
    userUid: state.currentUser.uid,
    createdAt: serverTimestamp()
  });
};

function listenChat() {
  if (!state.currentUser) return;
  if (chatUnsub) chatUnsub();

  const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(50));

  chatUnsub = onSnapshot(q, async (snapshot) => {
    chatMessages.innerHTML = "";
    const docs = [...snapshot.docs].reverse();

    docs.forEach(doc => {
      const m = doc.data();
      const isMe = state.currentUser ? m.userUid === state.currentUser.uid : false;
      const time = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
      const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          
      const item = document.createElement("div");
      item.className = `chat-item ${isMe ? 'chat-right' : 'chat-left'}`;

      const isBot = m.userUid === "system-bot";

      const bubbleStyle = `
        background:${isBot ? '#dcfce7' : isMe ? '#1ac486' : '#ffffff'};
        color:${isMe ? '#fff' : '#111'};
        border:${isBot ? '1px solid #86efac' : isMe ? 'none' : '1px solid #e5e7eb'};
      `;

      item.innerHTML = `
        <div class="chat-box">
          ${!isMe ? `<div class="chat-meta" style="color:${m.userColor}">${m.userName}</div>` : ''}
          <div class="flex ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end">
            <div class="chat-bubble" style="${bubbleStyle}">${m.text}</div>
            <span class="chat-time">${timeStr}</span>
          </div>
        </div>
      `;
      chatMessages.appendChild(item);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (docs.length > 0) {
      const latestMsgDoc = docs[docs.length - 1];
      const latestMsg = latestMsgDoc.data();

      if (latestMsgDoc.id !== lastProcessedMsgId && latestMsg.text === "!오늘" && latestMsg.userUid !== "system-bot") {
        lastProcessedMsgId = latestMsgDoc.id;

        const todayStr = new Date().toISOString().split("T")[0];
        const todaysEvents = state.events.filter(e => e.date === todayStr);

        let summaryText = `📅 [오늘의 일정 요약] (${todayStr})\n`;
        if (todaysEvents.length === 0) {
          summaryText += "등록된 일정이 없습니다. 깨끗한 하루 되세요! ✨";
        } else {
          todaysEvents.sort((a,b) => (a.time || "").localeCompare(b.time || ""));
          todaysEvents.forEach((e, idx) => {
            const displayTitle = e.shiftType ? `[${e.shiftType}] ${e.title}` : e.title;
            summaryText += `${idx + 1}. [${e.time || "시간미정"}] ${displayTitle} (작성자: ${e.userName})\n`;
            if(e.memo) summaryText += `   💬 메모: ${e.memo}\n`;
          });
        }
        await sendBotMessage(summaryText);
      }

      if (latestMsgDoc.id !== window.lastNotifiedChatId && latestMsg.userUid !== state.currentUser.uid) {
        window.lastNotifiedChatId = latestMsgDoc.id;
        if (document.visibilityState === "hidden") {
          triggerSystemNotification(`💬 ${latestMsg.userName}`, { body: latestMsg.text, tag: "chat-msg" });
        }
      }
    }
  });
}

window.openDayModal = openDayModal;
window.openEventDetail = openEventDetail;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.closeModal = closeModal;

/* ========================= SERVICE WORKER ========================= */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(async (reg) => {
      console.log("SW REGISTER SUCCESS");
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const token = await getToken(messaging, {
          vapidKey: "BCeAQRVjha5xrFLqCwMPLowkMd7cYsjpBU-s9nQmVftHf3QScivat1NtNvLpJMUEmxUJfALTBfa7XAU3KKVwBiM",
          serviceWorkerRegistration: reg
        });
        console.log("FCM TOKEN", token);
      }
    }).catch((err) => { console.log("SW FAIL", err); });
}

/* ========================= SCHEDULE NOTIFIER ========================= */
function startScheduleNotifier() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = setInterval(() => {
    if (!state.currentUser) return;
    const now = new Date();
    state.events.forEach(e => {
      if (!e.date || !e.time) return;
      const eventTime = new Date(`${e.date}T${e.time}:00`);
      const diff = eventTime - now;

      if (diff > 0 && diff <= 5 * 60 * 1000) {
        const key = e.id + "_5min";
        if (notifiedSchedules.has(key)) return;
        notifiedSchedules.add(key);
        const displayTitle = e.shiftType ? `[${e.shiftType}] ${e.title}` : e.title;
        triggerSystemNotification("📅 일정 5분 전 알림", { body: `${displayTitle}\n시간: ${e.time}`, tag: "schedule-" + e.id, renotify: false });
      }
      if (diff > 0 && diff <= 1000) {
        const key = e.id + "_now";
        if (notifiedSchedules.has(key)) return;
        notifiedSchedules.add(key);
        const displayTitle = e.shiftType ? `[${e.shiftType}] ${e.title}` : e.title;
        triggerSystemNotification("📅 일정 시작 알림", { body: `${displayTitle}\n지금 바로 시작합니다.`, tag: "schedule-" + e.id, renotify: false });
      }
    });
  }, 10000);
}

onMessage(messaging, (payload) => {
  triggerSystemNotification(payload.notification.title, { body: payload.notification.body });
});

renderCalendar();