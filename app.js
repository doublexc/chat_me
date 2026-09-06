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

// บันทึกเวลาที่เปิดหน้าเว็บรอบนี้ เพื่อไม่ให้แสดงข้อความที่ Admin ตอบไว้ก่อนหน้านี้
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

    // สร้างหรืออัปเดตเอกสารข้อมูลลูกค้า
    await setDoc(doc(db, "customers", phone), {
      phoneNumber: phone,
      displayName: name,
      updatedAt: serverTimestamp()
    }, { merge: true });

    loginModal.style.display = "none";
    
    chatMessages.innerHTML = `
      <div style="text-align: center; color: #888; margin: 15px 0; font-size: 13px; line-height: 1.5;">
        เริ่มการสนทนากับ Admin แล้ว<br>
        (ระบบจะไม่แสดงประวัติการแชทเก่าเพื่อความปลอดภัย)
      </div>
    `;

    // เริ่มดักฟังคำตอบล่าสุดจาก Admin
    listenToAdminReply(phone);

  } catch (err) {
    console.error("Login Error:", err);
    alert("เกิดข้อผิดพลาด: " + err.message);
    btnLogin.disabled = false;
    btnLogin.textContent = "เริ่มการสนทนา";
  }
});

// 3. ดักฟังคำตอบล่าสุดจาก ADMIN (ดึงจาก doc customers ไม่ผ่าน subcollection)
function listenToAdminReply(phone) {
  const customerDocRef = doc(db, "customers", phone);

  onSnapshot(customerDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // ตรวจสอบว่ามีข้อความตอบกลับล่าสุดและเวลาบันทึกไว้หรือไม่
      if (data.latestAdminReply && data.adminReplyTimestamp) {
        const replyTime = data.adminReplyTimestamp.toDate ? data.adminReplyTimestamp.toDate() : new Date(data.adminReplyTimestamp);
        
        // แสดงผลเฉพาะข้อความที่ส่งมาหลังเปิดหน้าเว็บรอบปัจจุบันเท่านั้น
        if (replyTime >= sessionStartTime) {
          renderAdminReply(data.latestAdminReply, data.adminReplyTimestamp);
        }
      }
    }
  }, (err) => {
    console.log("Admin listener closed or expired:", err.message);
  });
}

// 4. แสดงข้อความตอบกลับของ Admin ทางฝั่งซ้าย
function renderAdminReply(text, timestamp) {
  const trimmedText = text.trim();

  // รองรับการส่งจุดเพื่อล้างข้อความ
  if (trimmedText === "." || trimmedText === ".." || trimmedText === "...") {
    return;
  }

  let timeStr = "";
  if (timestamp) {
    const date = timestamp.toDate ? timestamp.toDate() : new Date();
    timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const msgElement = document.createElement("div");
  msgElement.style.display = "flex";
  msgElement.style.justifyContent = "flex-start";
  msgElement.style.width = "100%";
  msgElement.style.margin = "4px 0";

  msgElement.innerHTML = `
    <div style="background-color: #e4e6eb; color: #050505; padding: 10px 14px; border-radius: 16px; max-width: 75%; word-break: break-word; text-align: left; font-size: 14px; line-height: 1.4;">
      <div style="font-size: 11px; color: #65676b; margin-bottom: 2px;">Admin</div>
      ${escapeHtml(text)}
      ${timeStr ? `<div style="font-size: 10px; color: #8a8d91; text-align: right; margin-top: 4px;">${timeStr}</div>` : ""}
    </div>
  `;

  chatMessages.appendChild(msgElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 5. ส่งข้อความของลูกค้าลงระบบ (Write-Only)
let isSending = false;
const COOLDOWN_SECONDS = 3;

async function sendMessage() {
  const text = messageInput.value.trim();

  if (!text || !currentUser.phone) return;
  if (isSending) return;

  if (text.length > 300) {
    alert("ข้อความยาวเกินไป (จำกัดไม่เกิน 300 ตัวอักษร)");
    return;
  }

  isSending = true;
  btnSend.disabled = true;
  messageInput.value = "";

  // แสดงข้อความที่เพิ่งส่งบนหน้าจอของลูกค้าทันที (ฝั่งขวา)
  renderLocalMessage(text);

  try {
    const messagesRef = collection(db, "customers", currentUser.phone, "messages");

    // ส่งข้อความเข้า messages (แอดมินอ่านได้คนเดียว)
    await addDoc(messagesRef, {
      sender: "user",
      text: text,
      timestamp: serverTimestamp()
    });

    // อัปเดตข้อมูลลูกค้า
    await setDoc(doc(db, "customers", currentUser.phone), {
      lastMessage: text,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // ยิงแจ้งเตือนผ่าน Worker ถ้า Admin ออฟไลน์
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

// 6. แสดง Bubble ข้อความที่เพิ่งส่งของลูกค้า (ฝั่งขวา)
function renderLocalMessage(text) {
  const msgElement = document.createElement("div");
  msgElement.style.display = "flex";
  msgElement.style.justifyContent = "flex-end";
  msgElement.style.width = "100%";
  msgElement.style.margin = "4px 0";

  msgElement.innerHTML = `
    <div style="background-color: #007bff; color: white; padding: 10px 14px; border-radius: 16px; max-width: 75%; word-break: break-word; text-align: left; font-size: 14px; line-height: 1.4;">
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
