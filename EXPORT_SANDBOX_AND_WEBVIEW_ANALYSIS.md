# 🛡️ Phân Tích Kỹ Thuật: Cơ Chế Xuất File Excel, Giới Hạn Sandbox Looker Studio & Giải Pháp Android WebView

Tài liệu chuyên sâu về cơ chế bảo mật Iframe Sandbox trong Google Looker Studio, nguyên nhân lỗi `allow-downloads`, cơ chế hoạt động của Helper Tab và giải pháp xử lý vấn đề trên Android In-App WebView.

---

## 1. 🔒 Giới Hạn `allow-downloads` Trong Iframe Của Google Looker Studio

### 1.1. Bản chất cơ chế bảo mật của Google Looker Studio
- Google Looker Studio nhúng tất cả các Community Visualization bên trong một thẻ `<iframe>` độc lập với thuộc tính `sandbox`:
  ```html
  <iframe sandbox="allow-scripts allow-same-origin allow-popups allow-forms ..."></iframe>
  ```
- **Cố tình không cấp cờ `allow-downloads`:** Theo chính sách bảo mật chống tấn công drive-by download độc hại từ các visualization bên thứ ba, Google Looker Studio **chủ động loại bỏ cờ `allow-downloads`** khỏi thuộc tính sandbox của iframe.

### 1.2. Hiện tượng khi cố gắng tải file trực tiếp tại chỗ (In-Place Download)
- Nếu mã nguồn JavaScript bên trong Community Viz cố gắng kích hoạt tải file bằng:
  - Thẻ `<a>` ảo với `a.href = URL.createObjectURL(blob); a.click();`
  - Thư viện FileSaver (`saveAs()`) hoặc `XLSX.writeFile()`
- Trình duyệt Chromium / Google Chrome sẽ lập tức chặn hành vi này và ném ra thông báo lỗi bảo mật cấp trình duyệt:
  ```text
  Download is disallowed. The frame initiating or instantiating the download is sandboxed, but the flag 'allow-downloads' is not set. See https://www.chromestatus.com/feature/5706745674465280 for more details.
  ```

---

## 2. 🚀 Giải Pháp Chuẩn: Helper Tab (`downloader.html`)

### 2.1. Cơ chế hoạt động
```
Looker Studio (Sandboxed Iframe, no allow-downloads)
   │
   ├─► window.open('downloader.html', '_blank')
   │     └─► Mở cửa sổ cấp cao nhất (Top-Level Window Context)
   │
   └─► postMessage({ headers, rows, filterInfo, fileName }, '*')
         │
         ▼
Top-Level Tab (downloader.html - Không bị dính Sandbox)
   │
   ├─► Nhận dữ liệu từ sự kiện 'message'
   ├─► Tạo SheetJS Worksheet: Bảo toàn số 0 ở đầu (type 's', z: '@')
   └─► Kích hoạt tải file Excel .xlsx thành công 100% về thư mục Downloads!
```

### 2.2. Vì sao giải pháp này thành công?
- Vì `downloader.html` được mở trong một Tab mới riêng biệt (Top-level browsing context), nó **hoàn toàn không bị ràng buộc bởi sandbox của iframe Looker Studio**.
- Người dùng có thể tải file `.xlsx` không giới hạn dung lượng, đồng thời có thể sao chép nhanh chuỗi JSON Date Range nguyên bản.

---

## 3. 📱 Vấn Đề Trên Android App (In-App WebView) & Cách Xử Lý Triệt Để

### 3.1. Hiện tượng & Nguyên nhân cốt lõi
- **Hiện tượng:** Khi báo cáo Looker Studio được nhúng vào một Ứng dụng di động (như App Android, Flutter WebView, React Native WebView...), khi bấm nút Xuất Excel, tab `downloader.html` mở lên nhưng bị quay vòng chờ vô tận (Loading spinner không bao giờ dừng).
- **Nguyên nhân kỹ thuật:**
  - Android WebView mặc định cô lập các cửa sổ được tạo ra từ `window.open()` thành các Webview riêng biệt và **ngắt đứt kênh liên lạc `postMessage`** giữa cửa sổ cha và cửa sổ con.
  - Khi đó, lệnh `helperWindow.postMessage(payload, '*')` từ Looker Studio không bao giờ đến được `downloader.html`.

---

### 3.2. Các giải pháp xử lý

#### ✅ Giải pháp 1: Dành cho Người Dùng Cuối (End-user Workaround)
- Trên điện thoại di động, mở báo cáo trực tiếp bằng trình duyệt chuẩn:
  - **Google Chrome** (trên điện thoại Android).
  - **Safari** (trên iPhone / iPad).
- Trên trình duyệt di động, cơ chế Tab độc lập hoạt động 100% mượt mà và tải file về máy ngay lập tức.

#### ✅ Giải pháp 2: Dành cho Lập Trình Viên Ứng Dụng (Android / Flutter / React Native App Devs)
Nếu ứng dụng di động của doanh nghiệp cần nhúng báo cáo Looker Studio trực tiếp trong App, đội ngũ Mobile App Dev cần cấu hình mở quyền đa cửa sổ trong mã nguồn Native Android:

**Trong Kotlin / Java (Android Native):**
```kotlin
val webView = findViewById<WebView>(R.id.my_webview)

// 1. Bật JavaScript và quyền hỗ trợ đa cửa sổ
webView.settings.javaScriptEnabled = true
webView.settings.setSupportMultipleWindows(true)
webView.settings.javaScriptCanOpenWindowsAutomatically = true

// 2. Gán WebChromeClient để quản lý việc mở cửa sổ mới
webView.webChromeClient = object : WebChromeClient() {
    override fun onCreateWindow(
        view: WebView?,
        isDialog: Boolean,
        isUserGesture: Boolean,
        resultMsg: Message?
    ): Boolean {
        val newWebView = WebView(view!!.context)
        newWebView.settings.javaScriptEnabled = true
        // Thêm newWebView vào container hoặc dialog để nhận postMessage
        val transport = resultMsg?.obj as WebView.WebViewTransport
        transport.webView = newWebView
        resultMsg.sendToTarget()
        return true
    }
}
```

**Trong Flutter (`webview_flutter`):**
- Bật cờ `JavaScriptMode.unrestricted`.
- Cho phép mở `navigationDelegate` hoặc xử lý `onCreateWindow`.

---

## 4. 📌 Tóm Tắt Khuyến Nghị

| Môi Trường Sử Dụng | Trạng Thái Hoạt Động | Khuyến Nghị Thực Thi |
| :--- | :--- | :--- |
| **Máy Tính PC / Laptop (Chrome, Edge, Firefox, Safari)** | 🚀 **Hoạt động 100% mượt mà** | Bấm Xuất Excel ➔ Tự động tải file `.xlsx` ngay lập tức. |
| **Trình Duyệt Di Động (Chrome Android, Safari iOS)** | 🚀 **Hoạt động 100% mượt mà** | Mở URL báo cáo trên Chrome / Safari di động để xuất file. |
| **Ứng Dụng Nhúng Di Động (In-App WebView)** | ⚠️ Cần cấu hình Native | Cấu hình `setSupportMultipleWindows(true)` trong Android Native hoặc mở báo cáo qua External Browser. |
