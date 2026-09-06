import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, doc, collection, addDoc, setDoc, 
  serverTimestamp, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpdlENO8EOWjxqHTZZwlfQoCBIWD8YiEA",
  authDomain: "xxcbase.firebaseapp.com",
  projectId: "xxcbase",
  messagingSenderId: "437317145536",
  appId: "1:437317145536:web:7007e7a4887cfa341dae25"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = {
  name: "",
  phone: ""
};

const loginModal = document.getElementById("login-modal");
const inputName = document.getElementById("input-name");
const inputPhone = document.getElementById("input-phone");
const btnLogin = document.getElementById("btn-login");

const adminDot = document.getElementById("admin-dot");
const adminStatusText = document.getElementById("admin-status-text");
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const btnSend = document.getElementById("btn-send");

// 1. ตรวจจับสถานะ Online ของ Admin (Path นี้เปิด read: if true ไว้ อ่านได้ปกติ)
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

    // สร้างหรืออัปเดตเอกสารข้อมูลลูกค้า
    await setDoc(doc(db, "customers", phone), {
      phoneNumber: phone,
      displayName: name,
      updatedAt: serverTimestamp()
    }, { merge: true });

    loginModal.style.display = "none";
    
    // แจ้งเตือนข้อความต้อนรับบนหน้าจอ (เฉพาะเครื่องลูกค้า ไม่ดึงจากฐานข้อมูล)
    chatMessages.innerHTML = `
      <div style="text-align: center; color: #888; margin-top: 20px; font-size: 14px;">
        เริ่มการสนทนากับ Admin แล้ว<br>
        (ระบบจะไม่บันทึกประวัติการแชทไว้บนหน้าจอนี้เพื่อความปลอดภัย)
      </div>
    `;
  } catch (err) {
    console.error("Login Error:", err);
    alert("เกิดข้อผิดพลาด: " + err.message);
    btnLogin.disabled = false;
    btnLogin.textContent = "เริ่มการสนทนา";
  }
});

// 3. ส่งข้อความของลูกค้าลงระบบ (Write-Only)
let isSending = false;
const COOLDOWN_SECONDS = 3; // เวลาที่ต้องรอก่อนส่งข้อความถัดไป

async function sendMessage() {
  const text = messageInput.value.trim();

  // ตรวจสอบความถูกต้องเบื้องต้น
  if (!text || !currentUser.phone) return;
  if (isSending) return;

  if (text.length > 300) {
    alert("ข้อความยาวเกินไป (จำกัดไม่เกิน 300 ตัวอักษร)");
    return;
  }

  isSending = true;
  btnSend.disabled = true;
  messageInput.value = "";

  // แสดงข้อความที่เพิ่งส่งบนหน้าจอของลูกค้าทันที (Local Echo)
  renderLocalMessage(text);

  try {
    const messagesRef = collection(db, "customers", currentUser.phone, "messages");

    // 3.1 เพิ่มข้อความใหม่เข้า messages (ลูกค้ามีสิทธิ์ create: if true)
    await addDoc(messagesRef, {
      sender: "user",
      text: text,
      timestamp: serverTimestamp()
    });

    // 3.2 อัปเดตฟิลด์ lastMessage และ updatedAt (ตรงตาม affectedKeys ใน Rule)
    await setDoc(doc(db, "customers", currentUser.phone), {
      lastMessage: text,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 3.3 ถ้า Admin ออฟไลน์ ให้ยิงแจ้งเตือนผ่าน Cloudflare Worker
    if (adminDot.classList.contains("offline")) {
      fetch("https://aged-silence-89af.xxxcopyxx.workers.dev/chat-notify", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({
          phone: currentUser.phone,
          message: text
        })
      })
      .then(res => res.json())
      .then(data => console.log("Worker Response:", data))
      .catch(err => console.error("Worker fetch error:", err));
    }

  } catch (err) {
    console.error("Send Error:", err);
    alert("ไม่สามารถส่งข้อความได้: " + err.message);
  } finally {
    // นับถอยหลัง Cooldown ปลดล็อกปุ่มส่ง
    let timeLeft = COOLDOWN_SECONDS;
    btnSend.textContent = `${timeLeft}s`;

    const timer = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(timer);
        isSending = false;
        btnSend.disabled = false;
        btnSend.textContent = "ส่ง";
        messageInput.focus();
      } else {
        btnSend.textContent = `${timeLeft}s`;
      }
    }, 1000);
  }
}

// 4. ฟังก์ชันแสดง Bubble ข้อความที่เพิ่งส่ง (ทำงานเฉพาะในเครื่องลูกค้า)
function renderLocalMessage(text) {
  const msgElement = document.createElement("div");
  msgElement.style.textAlign = "right";
  msgElement.style.margin = "10px 0";
  
  msgElement.innerHTML = `
    <div style="display: inline-block; background-color: #007bff; color: white; padding: 8px 14px; border-radius: 15px; max-width: 80%; word-break: break-word; text-align: left; font-size: 14px;">
      ${escapeHtml(text)}
    </div>
  `;
  
  chatMessages.appendChild(msgElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ฟังก์ชันป้องกัน XSS
function escapeHtml(string) {
  const div = document.createElement("div");
  div.textContent = string;
  return div.innerHTML;
}

btnSend.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
