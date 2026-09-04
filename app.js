import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, doc, collection, addDoc, setDoc, 
  serverTimestamp, onSnapshot, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpdlENO8EOWjxqHTZZwlfQoCBIWD8YiEA",
  authDomain: "xxcbase.firebaseapp.com",
  projectId: "xxcbase",
  storageBucket: "xxcbase.firebasestorage.app",
  messagingSenderId: "437317145536",
  appId: "1:437317145536:web:7007e7a4887cfa341dae25"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = {
  name: "",
  phone: ""
};

const sessionStartTime = new Date();

const loginModal = document.getElementById("login-modal");
const inputName = document.getElementById("input-name");
const inputPhone = document.getElementById("input-phone");
const btnLogin = document.getElementById("btn-login");

const adminDot = document.getElementById("admin-dot");
const adminStatusText = document.getElementById("admin-status-text");
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const btnSend = document.getElementById("btn-send");

// 1. ตรวจจับสถานะ Online ของ Admin
onSnapshot(doc(db, "system", "admin_status"), (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (data.isOnline === true) {
      adminDot.className = "status-dot online";
      adminStatusText.textContent = "สถานะ Admin: ออนไลน์";
    } else {
      adminDot.className = "status-dot offline";
      adminStatusText.textContent = "สถานะ Admin: ออฟไลน์";
    }
  } else {
    adminDot.className = "status-dot offline";
    adminStatusText.textContent = "สถานะ Admin: ยังไม่เปิดใช้งาน";
  }
});

// 2. ล็อกอินเข้าใช้งาน
btnLogin.addEventListener("click", async () => {
  const name = inputName.value.trim();
  const phone = inputPhone.value.trim().replace(/[^0-9]/g, "");

  if (!name || !phone) {
    alert("กรุณากรอกชื่อและเบอร์โทรศัพท์");
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = "กำลังเชื่อมต่อ...";

  try {
    currentUser.name = name;
    currentUser.phone = phone;

    await setDoc(doc(db, "customers", phone), {
      phoneNumber: phone,
      displayName: name,
      updatedAt: serverTimestamp()
    }, { merge: true });

    loginModal.style.display = "none";
    listenToAdminReply(phone);
  } catch (err) {
    console.error("Login Error:", err);
    alert("เกิดข้อผิดพลาด: " + err.message);
    btnLogin.disabled = false;
    btnLogin.textContent = "เริ่มการสนทนา";
  }
});

// 3. ดักฟังเฉพาะข้อความตอบกลับจาก ADMIN เท่านั้น
function listenToAdminReply(phone) {
  const messagesRef = collection(db, "customers", phone, "messages");

  // กรองเฉพาะข้อความจากแอดมิน และส่งหลังจากเปิดหน้านี้
  const q = query(
    messagesRef,
    where("sender", "==", "admin"),
    where("timestamp", ">=", sessionStartTime),
    orderBy("timestamp", "asc")
  );

  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const msgData = change.doc.data();
        renderAdminReply(msgData.text, msgData.timestamp);
      }
    });
  });
}

// 4. แสดงเฉพาะข้อความล่าสุดของ Admin กลางจอ (รองรับการล้างจอด้วยจุด)
function renderAdminReply(text, timestamp) {
  const trimmedText = text.trim();

  // ถ้าแอดมินส่งจุด เช่น . หรือ ... ให้สั่งล้างหน้าจอเป็นกล่องว่าง
  if (trimmedText === "." || trimmedText === ".." || trimmedText === "...") {
    chatMessages.innerHTML = "";
    return;
  }

  let timeStr = "";
  if (timestamp) {
    const date = timestamp.toDate ? timestamp.toDate() : new Date();
    timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  chatMessages.innerHTML = `
    <div class="admin-latest-reply">
      <div class="admin-latest-text">${text}</div>
      ${timeStr ? `<div class="admin-latest-time">ตอบกลับเมื่อ ${timeStr}</div>` : ""}
    </div>
  `;
}

// 5. ส่งข้อความของลูกค้าลงระบบ (ไม่แตะต้อง UI ใดๆ ทั้งสิ้น)
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentUser.phone) return;

  messageInput.value = "";

  const messagesRef = collection(db, "customers", currentUser.phone, "messages");

  await addDoc(messagesRef, {
    sender: "user",
    text: text,
    timestamp: serverTimestamp()
  });

  await setDoc(doc(db, "customers", currentUser.phone), {
    lastMessage: text,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

btnSend.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
