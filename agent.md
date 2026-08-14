# 📊 Custom Looker Studio Community Visualization: Table with Excel Export

Tài liệu tổng quan về kiến trúc, luồng hoạt động, cấu trúc mã nguồn và hướng dẫn triển khai dự án **Custom Looker Studio Table Viz**.

---

## 1. 🎯 Mục tiêu dự án

Looker Studio (Google Data Studio) mặc định không hỗ trợ nút bấm trực tiếp xuất file Excel `.xlsx` từ bảng dữ liệu đã lọc trên dashboard, đồng thời các Custom Visualization thường bị hạn chế bởi cơ chế bảo mật nghiêm ngặt (Iframe Sandbox).

**Dự án này giải quyết các vấn đề trên với các tính năng cốt lõi:**
1. **Hiển thị bảng dữ liệu động:** Nhận dữ liệu Dimensions & Metrics từ Looker Studio, tự động co giãn và hiển thị theo bộ lọc.
2. **Hiệu ứng Skeleton Loading:** Tự động hiển thị khung Shimmer Loading trong lúc Looker Studio đang truy vấn / tính toán dữ liệu, tránh màn hình trắng.
3. **Xuất file Excel (`.xlsx`) & CSV (`.csv`):** Xuất dữ liệu đã filter thành file Excel hoàn chỉnh hoặc CSV định dạng UTF-8 with BOM (không lỗi font tiếng Việt).
4. **Lấy dữ liệu JSON cho Backend / API:** Cung cấp nút copy toàn bộ dữ liệu bảng dưới dạng JSON để gửi về API backend hoặc kiểm thử Postman.

---

## 2. 🏗️ Kiến trúc & Cơ chế hoạt động (Architecture & Flow)

```
┌─────────────────────────────────────────────────────────────┐
│                    LOOKER STUDIO REPORT                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Sandboxed Iframe (origin: null, no allow-downloads)   │  │
│  │                                                       │  │
│  │  1. Khởi động -> Render Skeleton Shimmer Loading       │  │
│  │  2. @google/dscc nhận data -> Render Bảng + Nút Export│  │
│  │  3. Click "Xuất File Excel"                           │  │
│  │     └─► window.open(downloader.html)                  │  │
│  │     └─► Polling postMessage(headers, rows, json)      │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ (postMessage qua tab mới)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             TAB MỚI (downloader.html - Context Tự Do)        │
│                                                             │
│  1. Lắng nghe 'message' event từ Looker Studio              │
│  2. Nhận matrix (Headers + Rows) -> Tạo file Excel bằng     │
│     XLSX.utils.aoa_to_sheet([headers, ...rows])             │
│  3. Tự động kích hoạt tải xuống file .xlsx về máy tính      │
│  4. Giao diện điều khiển:                                   │
│     ├── 📥 Nút tải lại file Excel (.xlsx)                   │
│     ├── 📄 Nút tải file CSV (.csv) UTF-8 có BOM             │
│     ├── 📋 Nút Copy JSON (dùng cho API / Backend)          │
│     └── 📊 Thống kê: Tổng số dòng, Số cột, Tên file        │
└─────────────────────────────────────────────────────────────┘
```

### 💡 Các giải pháp kỹ thuật then chốt:

1. **Vượt qua Sandbox Iframe của Looker Studio:**
   - Looker Studio chạy visual script trong iframe sandbox có cờ `allow-scripts`, nhưng **không có** `allow-downloads` và `origin` là `null`. Mọi thao tác `<a>.click()` hoặc `URL.createObjectURL(blob)` trực tiếp trong iframe đều bị browser chặn (`Download is disallowed`).
   - **Giải pháp:** Khi bấm xuất file, mở trang trung gian `downloader.html` tại context window độc lập không bị sandbox, truyền dữ liệu qua `postMessage` đa vòng lặp (`interval polling` mỗi 300ms x 20 lần = 6 giây), đảm bảo tab mới chắc chắn nhận được dữ liệu ngay khi vừa tải xong.

2. **Khắc phục lỗi file Excel rỗng:**
   - Sử dụng phương thức `XLSX.utils.aoa_to_sheet([headers, ...rows])` (Array of Arrays) thay vì `json_to_sheet`. Cơ chế ma trận 2D này đảm bảo 100% tất cả các dòng và cột được ánh xạ chính xác vào Excel mà không phụ thuộc vào tên trường hay ký tự đặc biệt.

3. **Skeleton Loading an toàn DOM:**
   - Kiểm tra `document.readyState` và `DOMContentLoaded` trước khi can thiệp vào `document.body` để tránh crash khi Looker Studio chưa khởi tạo xong DOM của iframe.

---

## 3. 📁 Cấu trúc thư mục dự án

```
customLooker/
├── src/
│   └── index.js              # Mã nguồn chính (Looker Studio SDK, Skeleton, DOM Handler)
├── downloader.html           # Trang helper nhận postMessage, tạo file Excel/CSV & Copy JSON
├── index.css                 # Định kiểu bảng và hiệu ứng Shimmer Skeleton
├── index.json                # Khai báo schema Dimensions & Metrics cho Looker Studio
├── manifest.json             # Khai báo tài nguyên Community Visualization
├── webpack.config.js         # Cấu hình Webpack đóng gói ra index.bundle.js
├── package.json              # Khai báo dependencies npm & scripts
├── customLooker.zip          # File nén toàn bộ dự án
└── agent.md                  # Tài liệu tổng quan dự án (file này)
```

---

## 4. 🚀 Hướng dẫn Triển khai & Sử dụng

### Bước 1: Cài đặt thư viện & Build
```powershell
# Cài đặt dependencies
npm install

# Đóng gói ra file index.bundle.js
npm run build
```

### Bước 2: Upload lên Google Cloud Storage (GCS)
Tất cả các file cần được lưu tại cùng một thư mục GCS công khai:
```powershell
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" cp index.bundle.js downloader.html index.json index.css manifest.json gs://analytics_merap/excelchart2/
```

### Bước 3: Cấu hình CORS trên Bucket GCS
Để Looker Studio có thể đọc manifest và tài nguyên qua XHR:
```powershell
# Tạo file cors.json với origin wildcard hoặc lookerstudio.google.com
gsutil cors set cors.json gs://analytics_merap
```

### Bước 4: Thêm Chart vào Looker Studio
1. Mở báo cáo trên **Looker Studio**.
2. Chọn **Add a chart** -> **Community visualizations** -> **Explore more** -> **Build your own visualization**.
3. Tại ô **Manifest path**, nhập đường dẫn GCS:
   ```
   gs://analytics_merap/excelchart2
   ```
4. Bấm **Submit** và thêm chart vào báo cáo.
5. Kéo thả các trường **Dimensions** và **Metrics** mong muốn vào bảng.

---

## 5. 📝 Kinh nghiệm & Lưu ý quan trọng (Best Practices)

| Vấn đề | Nguyên nhân | Giải pháp |
|---|---|---|
| `Manifest path invalid` | Nhập dạng `https://` hoặc trỏ trực tiếp vào file `.json` | Luôn nhập dạng folder `gs://<bucket>/<folder>` |
| `Missing config path` | `manifest.json` dùng relative path | Dùng đường dẫn tuyệt đối `gs://...` trong phần `resource` của `manifest.json` |
| `La.value.apply is not a function` | `index.json` có cú pháp style/elements không đúng chuẩn | Tối giản `index.json`, chỉ giữ các phần data cần thiết |
| `Download is disallowed` | Iframe của Looker Studio bị sandbox chặn download | Sử dụng trang trung gian `downloader.html` qua `postMessage` |
| File Excel bị rỗng | `json_to_sheet` bị lỗi map object key | Dùng `aoa_to_sheet([headers, ...rows])` |
| Crash lúc nạp Skeleton | Gọi `document.body` khi DOM chưa ready | Bọc trong kiểm tra `document.readyState` & `DOMContentLoaded` |
