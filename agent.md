# 📊 Custom Looker Studio Community Visualization: Table with Excel Export & Dynamic Rules

Tài liệu toàn diện về kiến trúc, quy tắc vận hành, hệ thống cấu hình, quy tắc tô màu/badge động và hướng dẫn triển khai dự án **Custom Looker Studio Table Viz**.

---

## 1. 🎯 Mục tiêu dự án

Looker Studio (Google Data Studio) mặc định không hỗ trợ nút bấm trực tiếp xuất file Excel `.xlsx` từ bảng dữ liệu đã lọc trên dashboard, đồng thời các Custom Visualization thường bị hạn chế bởi cơ chế bảo mật nghiêm ngặt (Iframe Sandbox) và thiếu các tính năng tùy chỉnh cột / định dạng điều kiện nâng cao.

**Dự án này cung cấp một giải pháp bảng dữ liệu toàn diện:**
1. **Hiển thị dữ liệu động:** Nhận Dimensions & Metrics từ Looker Studio, tự động co giãn, phân trang, sắp xếp đa kiểu.
2. **Xuất file Excel (`.xlsx`) & CSV (`.csv`):** Xuất dữ liệu đã filter thành file Excel hoàn chỉnh hoặc CSV định dạng UTF-8 with BOM (không lỗi font tiếng Việt).
3. **Hiệu ứng Skeleton Shimmer:** Tự động hiển thị khung Shimmer Loading trong lúc Looker Studio đang tải / tính toán dữ liệu.
4. **Modal Tùy chỉnh cột & Quy tắc màu động (`⚙️ Cột Bảng & Màu Sắc`):** Cho phép người dùng tùy biến ẩn/hiện, đổi tên cột, định dạng hiển thị, thay đổi thứ tự và thiết lập quy tắc tô màu / badge động.
5. **Tìm kiếm tiếng Việt không dấu (`remove_accents`):** Gõ tiếng Việt có dấu hoặc không dấu đều tìm kiếm chính xác trên toàn bộ các cột.
6. **Định dạng Ngày Tháng chuẩn Việt Nam `dd-mm-yyyy`:** Tự động nhận diện dữ liệu ngày từ Looker Studio / BigQuery (`YYYYMMDD`, `YYYY-MM-DD`, DateTime) và chuyển đổi thông minh.

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
│  │  2. @google/dscc nhận data -> Render Bảng + Toolbar   │  │
│  │  3. Focus Auto-selection: Click chart -> window.focus │  │
│  │  4. Click "Xuất File Excel"                           │  │
│  │     └─► window.open(downloader.html)                  │  │
│  │     └─► Polling postMessage(headers, rows, json)      │  │
│  │  5. Click "⚙️ Cột Bảng & Màu Sắc"                     │  │
│  │     └─► Mở Modal Quản Lý Cột & Quy Tắc Động (Tab 1,2) │  │
│  │     └─► Lưu cấu hình vào localStorage                 │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
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

---

## 3. 📋 Tổng hợp Toàn Bộ Quy Tắc Hoạt Động Của Biểu Đồ (All Chart Rules)

### 3.1. Quy tắc Khai báo Schema Looker Studio (`index.json` & `manifest.json`)
- **Data Schema:** Mảng `"data"` phải chứa nhóm `concepts` với mảng `elements` chứa các đối tượng `DIMENSION` và `METRIC`:
  ```json
  "data": [
      {
          "id": "concepts",
          "label": "Data",
          "elements": [
              { "id": "dimensions", "label": "Dimension", "type": "DIMENSION", "options": { "min": 0, "max": 50 } },
              { "id": "metrics", "label": "Metric", "type": "METRIC", "options": { "min": 0, "max": 50 } }
          ]
      }
  ]
  ```
  *(Lưu ý: Không lồng thêm nhóm dimension phụ để tránh lỗi `Cannot read properties of undefined (reading 'hierarchy')` trong Looker Studio).*
- **Style Schema:** Bao gồm các thuộc tính điều khiển giao diện:
  - `defaultPageSize`: 10, 20, 25, 50, 100, 250, 500, 1000, Tất cả (-1).
  - `rowDensity`: Gọn (`compact`), Tiêu chuẩn (`normal`), Thoáng (`relaxed`).
  - `tableVariant`: Sọc ngựa vằn (`striped`), Có viền ô (`bordered`), Tối giản (`default`).
  - `fontSize`: 11px, 12px, 13px, 14px, 15px.
  - `showSTT`: Bật/Tắt cột Số thứ tự tự động.
  - `textWrap`: Bật/Tắt chế độ tự động xuống dòng khi text quá dài.
  - `showSearch`: Bật/Tắt ô tìm kiếm nhanh.
  - `showColConfig`: Bật/Tắt nút mở modal tùy chỉnh cột `⚙️ Cột Bảng & Màu Sắc`.
  - `searchPlaceholder`: Gợi ý tìm kiếm tùy chỉnh.

---

### 3.2. Quy tắc Tùy Chỉnh Cột (Tab 1: `📋 Cấu Hình Cột`)
Lưu trữ tại `localStorage.getItem('user_tbl_cols_looker_custom_v5')`.
- **Ẩn / Hiện Cột:** Checkbox bật/tắt hiển thị từng cột độc lập.
- **Đổi Tên Hiển Thị (Label):** Cho phép đặt lại tiêu đề cột thay cho tên kỹ thuật của BigQuery/Looker Studio.
- **Sắp Xếp Thứ Tự Cột:** Nút **▲ (Lên)** và **▼ (Xuống)** giúp đổi vị trí các cột linh hoạt.
- **Tùy Chọn Định Dạng (Format):**
  | Mã Format | Tên hiển thị | Quy tắc chuyển đổi |
  |---|---|---|
  | `auto` | Tự động (Auto) | Tự nhận diện Date / Số / Chuỗi |
  | `date` | Ngày (dd-mm-yyyy) | `20080101` -> `01-01-2008` |
  | `date_ddmmyyyy_hhmmss` | Ngày Giờ (dd-mm-yyyy hh:mm:ss) | `20080101123000` -> `01-01-2008 12:30:00` |
  | `date_mmyyyy` | Tháng/Năm (mm/yyyy) | `20080101` -> `01/2008` |
  | `date_yymmdd` | Chuẩn Quốc Tế (yyyy-mm-dd) | `20080101` -> `2008-01-01` |
  | `badge` | Thẻ Badge | Bọc trong khung pill badge xám mặc định |
  | `number_comma` | Số phẩy (1,234,567) | Format số theo chuẩn US có dấu phẩy |
  | `number_vn` | Rút gọn VN (1.5 Tr / 2 Tỷ) | Rút gọn số lớn: `K` (nghìn), `Tr` (triệu), `Tỷ` |
  | `currency` | Tiền tệ (1,250,000 ₫) | Format số có dấu chấm và ký hiệu `₫` |
  | `percent` | Phần trăm (15.5%) | Chuyển đổi tỷ lệ phần trăm kèm ký tự `%` |
  | `monospace` | Font Code Monospace | Sử dụng font JetBrains Mono |

---

### 3.3. Quy tắc Tô Màu & Gắn Badge Động (Tab 2: `🎨 Quy Tắc Tô Màu & Badge Động`)
Lưu trữ tại `localStorage.getItem('user_tbl_rules_looker_custom_v5')`.
- **Phạm vi áp dụng:** Áp dụng cho một cột được chỉ định cụ thể hoặc áp dụng cho `★ Tất cả cột` (`*`).
- **Toán tử so sánh (Operators):**
  - `contains`: Chứa từ khóa (không phân biệt chữ hoa/thường và không dấu tiếng Việt).
  - `equals`: Bằng chính xác giá trị so sánh.
  - `startsWith`: Bắt đầu bằng từ khóa.
  - `>`: Lớn hơn giá trị số.
  - `<`: Nhỏ hơn giá trị số.
  - `>=`: Lớn hơn hoặc bằng giá trị số.
  - `<=`: Nhỏ hơn hoặc bằng giá trị số.
  - `pos`: Số dương (`>= 0`).
  - `neg`: Số âm (`< 0`).
- **Kiểu hiển thị (Styles):**
  - `badge_success`: 🏷️ Thẻ Badge Xanh Lá (`✓ <giá_trị>`).
  - `badge_danger`: 🏷️ Thẻ Badge Đỏ (`✕ <giá_trị>`).
  - `badge_warning`: 🏷️ Thẻ Badge Vàng Cam (`⏳ <giá_trị>`).
  - `badge_info`: 🏷️ Thẻ Badge Xanh Dương (`<giá_trị>`).
  - `badge_gray`: 🏷️ Thẻ Badge Xám (`<giá_trị>`).
  - `color_green`: 🎨 Đổi màu chữ sang Xanh Lá.
  - `color_red`: 🎨 Đổi màu chữ sang Đỏ.
  - `color_amber`: 🎨 Đổi màu chữ sang Vàng Cam.
  - `color_cyan`: 🎨 Đổi màu chữ sang Xanh Dương.
  - `color_pos_neg`: 🎨 Tự động tô màu: Số dương xanh lá (`>=0`) / Số âm đỏ (`<0`).

---

### 3.4. Quy tắc Nhận Diện & Định Dạng Ngày Tháng (Date/DateTime Handling)
Looker Studio truyền dữ liệu ngày tháng dưới dạng chuỗi số 8 chữ số (`YYYYMMDD`) hoặc chuỗi 14 chữ số (`YYYYMMDDHHMMSS`):
1. **Kiểm tra Date trước Numeric:** Hàm `isDateValue()` luôn chặn kiểm tra các chuỗi mẫu `YYYYMMDD` (năm 1900-2099, tháng 01-12, ngày 01-31) trước khi hàm `isNumericValue()` chạy, ngăn chặn hoàn toàn hiện tượng ngày bị format nhầm thành số có dấu phân cách hàng nghìn (ví dụ `20.080.101`).
2. **Căn lề tự động:** Cột ngày tháng tự động căn giữa (`align-center`), cột số căn phải (`align-right`), cột chuỗi căn trái (`align-left`).

---

### 3.5. Quy tắc Tìm Kiếm & Chuẩn Hóa Chuỗi Tiếng Việt (`remove_accents`)
- Sử dụng thuật toán chuẩn hóa `NFD`, xóa bỏ toàn bộ dấu thanh/dấu mũ (`[\u0300-\u036f]`), chuyển đổi `đ/Đ` thành `d`, đưa về chữ thường.
- Tìm kiếm từ khóa nhiều từ (`multi-word search`): tách chuỗi theo khoảng trắng và kiểm tra thỏa mãn đồng thời tất cả các từ.
- Tự động duy trì con trỏ và tiêu điểm (`cursor position & focus restoration`) của ô tìm kiếm trong suốt quá trình người dùng gõ phím và bảng render lại.

---

### 3.6. Quy tắc Tối Ưu Độ Nét & Giao Diện (Zero-Blur & High-DPI Rendering)
- **Không sử dụng `backdrop-filter: blur()`:** Loại bỏ hoàn toàn `backdrop-filter` trên Modal Overlay vì nó kích hoạt cơ chế GPU rasterization độ phân giải thấp của trình duyệt Chromium trong `<iframe>`, gây mờ nhòe chữ.
- **Độ tương phản cao (Crisp High Contrast):** Toàn bộ chữ chính dùng mã màu đen đậm `#0f172a` / `#000000`, tiêu đề cột đậm `font-weight: 700`, viền bảng `#cbd5e1` / `#94a3b8` rõ nét.
- **Kích hoạt Focus khi ở Edit Mode:** Bắt sự kiện `window.focus()` trên cả `click` và `mousedown` để khi người dùng đang ở chế độ Edit của Looker Studio, nhấp chuột vào bảng sẽ tự động chọn component và mở thanh thuộc tính **Setup** / **Style** bên phải.

---

## 4. 📁 Cấu trúc thư mục dự án

```
customLooker/
├── src/
│   └── index.js              # Mã nguồn chính (Looker Studio SDK, Skeleton, Filter, Sort, Formatter, Modal Config, Export)
├── downloader.html           # Trang helper nhận postMessage, tạo file Excel/CSV & Copy JSON
├── index.css                 # Toàn bộ định kiểu CSS siêu nét, Table Variants, Densities, Badges & Modal Dialog
├── index.json                # Khai báo schema Dimensions, Metrics & Style Panels cho Looker Studio
├── manifest.json             # Khai báo tài nguyên Community Visualization
├── webpack.config.js         # Cấu hình Webpack đóng gói ra index.bundle.js
├── package.json              # Khai báo dependencies npm & scripts
├── customLooker.zip          # File nén toàn bộ dự án để lưu trữ / deploy
└── agent.md                  # Tài liệu toàn diện về toàn bộ quy tắc & kiến trúc dự án (file này)
```

---

## 5. 🚀 Hướng dẫn Triển khai & Triển khai Lên GCS

### Bước 1: Build Webpack
```powershell
npm run build
```

### Bước 2: Đóng gói ZIP & Upload lên Google Cloud Storage (GCS)
```powershell
Compress-Archive -Path "src", "downloader.html", "index.css", "index.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.js", "agent.md" -DestinationPath "customLooker.zip" -Force

gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.js" "index.css" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart2/
```

### Bước 3: Thêm Chart vào Looker Studio
1. Mở báo cáo trên **Looker Studio**.
2. Chọn **Add a chart** -> **Community visualizations** -> **Explore more** -> **Build your own visualization**.
3. Tại ô **Manifest path**, nhập:
   ```
   gs://analytics_merap/excelchart2
   ```
4. Bấm **Submit** và thêm biểu đồ vào báo cáo.
