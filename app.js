import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, doc, collection, addDoc, setDoc, 
  serverTimestamp, onSnapshot, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ใส่ Firebase Config ของ xxcbase
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

// ตัวแปรประจำเซสชัน
let currentUser = {
  name: "",
  phone: ""
};

// เวลาที่เปิดแอปในรอบปัจจุบัน (ใช้กรองข้อความเก่าทิ้ง)
const sessionStartTime = new Date();

// Elements UI
const loginModal = document.getElementById("login-modal");
const inputName = document.getElementById("input-name");
const inputPhone = document.getElementById("input-phone");
const btnLogin = document.getElementById("btn-login");

const adminDot = document.getElementById("admin-dot");
const adminStatusText = document.getElementById("admin-status-text");
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const btnSend = document.getElementById("btn-send");

// 1. ตรวจจับสถานะ Online ของ Admin แบบ Real-time
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

  currentUser.name = name;
  currentUser.phone = phone;

  // บันทึก/อัปเดตข้อมูลลูกค้าลง Firestore
  await setDoc(doc(db, "customers", phone), {
    phoneNumber: phone,
    displayName: name,
    updatedAt: serverTimestamp()
  }, { merge: true });

  // ซ่อน Modal
  loginModal.style.display = "none";

  // เริ่มดักฟังข้อความแชทสด
  listenToLiveMessages(phone);
});

// 3. ฟังก์ชันดักฟังเฉพาะข้อความสด (ไม่แสดงประวัติเก่า)
function listenToLiveMessages(phone) {
  const messagesRef = collection(db, "customers", phone, "messages");
  
  // กรองเฉพาะ timestamp >= sessionStartTime
  const q = query(
    messagesRef,
    where("timestamp", ">=", sessionStartTime),
    orderBy("timestamp", "asc")
  );

  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        // ลบข้อความแจ้งเตือนเริ่มต้นถ้ามี
        const emptyHint = document.querySelector(".empty-hint");
        if (emptyHint) emptyHint.remove();

        const msgData = change.doc.data();
        appendMessageUI(msgData.sender, msgData.text, msgData.timestamp);
      }
    });
  });
}

// 4. แสดงข้อความบน UI
function appendMessageUI(sender, text, timestamp) {
  const row = document.createElement("div");
  row.className = `msg-row ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  const time = document.createElement("div");
  time.className = "msg-time";
  
  if (timestamp) {
    const date = timestamp.toDate ? timestamp.toDate() : new Date();
    time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    time.textContent = "กำลังส่ง...";
  }

  row.appendChild(bubble);
  row.appendChild(time);
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 5. ส่งข้อความ
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentUser.phone) return;

  messageInput.value = "";

  const messagesRef = collection(db, "customers", currentUser.phone, "messages");
  
  // บันทึกลง Sub-collection messages
  await addDoc(messagesRef, {
    sender: "user",
    text: text,
    timestamp: serverTimestamp()
  });

  // อัปเดตข้อความล่าสุดในเอกสารของลูกค้า
  await setDoc(doc(db, "customers", currentUser.phone), {
    lastMessage: text,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

btnSend.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});