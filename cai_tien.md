# 🚀 Danh Sách Ý Tưởng & Kế Hoạch Cải Tiến (Roadmap)

Tài liệu lưu trữ các ý tưởng, tính năng mở rộng và cải tiến kỹ thuật cho dự án **Custom Looker Studio Table Viz**.

---

## 1. 📡 Tích Hợp API Firestore / Backend (Data Logging & Write-Back)

### 1.1. Mục tiêu & Use-Cases
- **Audit Log (Nhật ký xuất file):** Tự động ghi lại lịch sử mỗi khi người dùng bấm xuất Excel hoặc CSV (Email/User, thời gian, số dòng, tên file, bộ lọc Date Range đang chọn).
- **User Notes / Feedback:** Cho phép người xem báo cáo nhập ghi chú, phản hồi hoặc đánh dấu trực tiếp trên dòng dữ liệu rồi lưu vào Firestore.
- **Save View / Bookmark Cá Nhân:** Lưu cấu hình cột (ẩn/hiện cột, độ rộng, thứ tự sort) theo từng người dùng.

### 1.2. Kiến Trúc Kỹ Thuật (2 Phương Án)

#### 🌟 Phương Án 1: Gửi qua Cloud Function / Webhook (Khuyên dùng - Bảo mật cao)
Looker Studio Sandbox hỗ trợ gọi `fetch()` ra bên ngoài. Frontend chỉ cần gửi POST request đến Cloud Function:

```javascript
async function logExportToFirestore(payload) {
    try {
        await fetch('https://asia-southeast1-your-project.cloudfunctions.net/saveExportLog', {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                rowCount: payload.rowCount,
                filters: payload.filters,
                fileName: payload.fileName,
                exportType: payload.exportType // 'EXCEL' | 'CSV'
            })
        });
    } catch (err) {
        console.error('Lỗi gửi log export:', err);
    }
}
```

#### ⚡ Phương Án 2: Dùng trực tiếp Firebase Client SDK (`firebaseConfig.js`)
Chỉ cần 1 file `firebaseConfig.js` cấu hình phía client:

```javascript
// firebaseConfig.js
export const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

Ghi dữ liệu đơn giản:
```javascript
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function logExport(data) {
    await addDoc(collection(db, "export_logs"), {
        ...data,
        createdAt: serverTimestamp()
    });
}
```

#### 🛡️ Quy Tắc Bảo Mật (Firestore Security Rules):
Để client ghi log an toàn mà không sợ bị lộ hoặc xoá dữ liệu:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /export_logs/{docId} {
      allow create: if true;                // Cho phép tạo log mới
      allow read, update, delete: if false; // Cấm đọc / sửa / xoá
    }
  }
}
```

---

## 2. ⚡ Các Cải Tiến Hiệu Năng & Trải Nghiệm Tiếp Theo

- [ ] **Virtual Scrolling:** Tối ưu hóa render DOM cho bảng > 5.000 dòng trực tiếp trên giao diện mà không cần phân trang.
- [ ] **Custom Column Formatter:** Bổ sung thêm định dạng tiền tệ (VND, USD, EUR) và tỷ lệ % có điều kiện ngay trong Style config.
- [ ] **Multi-Header Grouping:** Cho phép gom nhóm nhiều cột dưới một tiêu đề chung (Header cấp 2).
