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

// บันทึกเวลาเปิดหน้าเว็บ เพื่อไม่ดึงข้อความที่เคยตอบไว้ก่อนหน้านี้มาแสดง
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

// 1. ตรวจสอบสถานะ Online ของ Admin
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

    // บันทึกข้อมูลลูกค้าเข้าตู้เซฟ customers
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

    // เริ่มดักฟังคำตอบสดจากกระดาน live_replies
    listenToLiveReply(phone);

  } catch (err) {
    console.error("Login Error:", err);
    alert("เกิดข้อผิดพลาด: " + err.message);
    btnLogin.disabled = false;
    btnLogin.textContent = "เริ่มการสนทนา";
  }
});

// 3. ดักฟังคำตอบสดจาก Admin ผ่านกระดาน live_replies
function listenToLiveReply(phone) {
  const replyDocRef = doc(db, "live_replies", phone);

  onSnapshot(replyDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      if (data.text && data.timestamp) {
        const replyTime = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        
        // กรองแสดงผลเฉพาะข้อความที่ส่งมาหลังเปิดหน้าเว็บรอบนี้เท่านั้น
        if (replyTime >= sessionStartTime) {
          renderAdminReply(data.text, data.timestamp);
        }
      }
    }
  }, (err) => {
    console.error("Listener error:", err);
  });
}

// 4. แสดงข้อความ Admin บนหน้าจอ
function renderAdminReply(text, timestamp) {
  const trimmedText = text.trim();

  // คำสั่งส่งจุดเพื่อล้างจอ
  if (trimmedText === "." || trimmedText === ".." || trimmedText === "...") {
    chatMessages.innerHTML = `
      <div style="text-align: center; color: #888; margin: 15px 0; font-size: 13px;">
        จบการสนทนาเรียบร้อยแล้ว
      </div>
    `;
    return;
  }

  let timeStr = "";
  if (timestamp) {
    const date = timestamp.toDate ? timestamp.toDate() : new Date();
    timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  chatMessages.innerHTML = `
    <div style="display: flex; justify-content: flex-start; width: 100%; margin: 10px 0;">
      <div style="background-color: #e4e6eb; color: #050505; padding: 10px 14px; border-radius: 16px; max-width: 80%; word-break: break-word; text-align: left; font-size: 14px; line-height: 1.4;">
        <div style="font-size: 11px; color: #65676b; margin-bottom: 2px;">Admin</div>
        ${escapeHtml(text)}
        ${timeStr ? `<div style="font-size: 10px; color: #8a8d91; text-align: right; margin-top: 4px;">${timeStr}</div>` : ""}
      </div>
    </div>
  `;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 5. ส่งข้อความของลูกค้าเข้าตู้เซฟ (Write-Only)
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

  try {
    const messagesRef = collection(db, "customers", currentUser.phone, "messages");

    // 5.1 บันทึกเข้าประวัติตู้เซฟ
    await addDoc(messagesRef, {
      sender: "user",
      text: text,
      timestamp: serverTimestamp()
    });

    await setDoc(doc(db, "customers", currentUser.phone), {
      lastMessage: text,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 5.2 ยิงแจ้งเตือนผ่าน Worker ถ้า Admin ออฟไลน์
    if (adminDot.classList.contains("offline")) {
      fetch("https://aged-silence-89af.xxxcopyxx.workers.dev/chat-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: currentUser.phone,
          message: text
        })
      }).catch(err => console.error("Worker fetch error:", err));
    }

    // 5.3 ขึ้นป้ายสถานะส่งสำเร็จ (ไม่สร้างบับเบิ้ลข้อความค้างบนจอ)
    const statusNotice = document.createElement("div");
    statusNotice.style.cssText = "text-align: center; color: #28a745; margin: 6px 0; font-size: 12px;";
    statusNotice.textContent = "✓ ส่งข้อความเรียบร้อยแล้ว";
    chatMessages.appendChild(statusNotice);
    chatMessages.scrollTop = chatMessages.scrollHeight;

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

function escapeHtml(string) {
  const div = document.createElement("div");
  div.textContent = string;
  return div.innerHTML;
}

btnSend.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
