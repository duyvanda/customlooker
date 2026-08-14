# 📊 Custom Looker Studio Community Visualization: Table with Excel Export & Setup-Driven Dynamic Rules

Tài liệu toàn diện về toàn bộ kiến trúc, quy tắc vận hành, hệ thống cấu hình Setup/Style, quy tắc xử lý dữ liệu và hướng dẫn build/deploy dự án **Custom Looker Studio Table Viz**.

---

## 1. 🎯 Mục tiêu & Tổng Quan Dự Án

Looker Studio (Google Data Studio) mặc định không hỗ trợ nút bấm trực tiếp xuất file Excel `.xlsx` từ bảng dữ liệu đã lọc trên dashboard, đồng thời các Custom Visualization thường bị hạn chế bởi cơ chế bảo mật nghiêm ngặt (Iframe Sandbox) và thiếu các tính năng tùy chỉnh cố định cột, sắp xếp đa cấp, tô màu có điều kiện.

**Dự án này cung cấp một giải pháp bảng dữ liệu chuẩn doanh nghiệp toàn diện:**
1. **Kiến trúc Native 100% Setup-Driven:** Mọi liên kết cột (Cột hiển thị, Cột cố định Freeze, Cột quét tìm kiếm, Cột sắp xếp Sort 1–3, Cột tô màu Rule 1–3) đều được cấu hình trực tiếp từ tab **Setup (Data)** của Looker Studio.
2. **Tab Style chuẩn Google:** Phần **Giao diện Bảng (Appearance)** được đưa lên đầu tiên trong tab Style, kế tiếp là **Sắp xếp (Sorting Setup)**, **Tìm kiếm (Search Setup)** và **🎨 Tô Màu & Badge (Quy tắc 1–3)**.
3. **Cố Định Cột (Sticky Freeze Columns):** Chỉ cho phép cố định các cột Dimension (Thứ nguyên), tự động tính toán pixel `left` offset chuẩn xác, giữ cố định bên trái mượt mà khi cuộn ngang và tạo đường viền đổ bóng phân cách (`frozen-column-last`).
4. **Xuất File Excel Chuẩn Doanh Nghiệp (`.xlsx`):** Tự động xuất file Excel bảo toàn 100% số `0` ở đầu cho số điện thoại, mã nhân viên, mã định danh (cell type Text `t: 's'`, format `@`), tự động căn chỉnh độ rộng cột (`auto-fit column width`).
5. **Trích Xuất Date Range Nguyên Bản:** Giữ nguyên 100% Date Range (`start` & `end`) từ Google Looker Studio API, kèm nút sao chép nhanh JSON Date Range.
6. **Sắp Xếp Đa Cấp 1–3 & Header 3-State Click:** Thiết lập 3 cấp độ sắp xếp ưu tiên từ Setup/Style, kết hợp click tiêu đề cột xoay vòng 3 trạng thái: `ASC (▲)` -> `DESC (▼)` -> `Revert về Multi-Sort ban đầu`.
7. **Tìm Kiếm Tiếng Việt Không Dấu (`remove_accents`):** Tìm kiếm tức thì, hỗ trợ tìm nhiều từ (`multi-word search`), tự động nhận diện danh sách cột cần tìm theo `Search Dimension`.
8. **Popup Ẩn/Hiện Cột Runtime:** Cho phép người xem bật/tắt hiển thị cột trong phiên xem mà không làm ảnh hưởng hay lưu đè lên báo cáo gốc (tự khôi phục khi F5).

---

## 2. 🏗️ Kiến trúc & Luồng Dữ Liệu (Architecture & Data Flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          LOOKER STUDIO REPORT                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Sandboxed Iframe (origin: null, no allow-downloads)               │  │
│  │                                                                   │  │
│  │  1. Khởi tạo: @google/dscc subscribeToData(drawVisualization)     │  │
│  │  2. Trích xuất Schema Setup:                                      │  │
│  │     ├── Dimension & Metric -> Table Columns                       │  │
│  │     ├── Freeze Dimension   -> isFrozen sticky columns             │  │
│  │     ├── Search Dimension   -> searchColumns filter list           │  │
│  │     ├── Sort Dimension/Met -> Multi-level sort 1-3                │  │
│  │     └── Conditional Dim/Met-> Rules 1-3 field binding             │  │
│  │  3. Data Pipeline:                                                │  │
│  │     rawRows -> Search Filter -> Multi-Sort -> Pagination -> Render│  │
│  │  4. Click "Xuất Excel (X dòng)":                                  │  │
│  │     └─► window.open(downloader.html)                              │  │
│  │     └─► PostMessage(headers, rows, filterInfo, fileName)          │  │
│  └───────────────────────────────────┬───────────────────────────────┘  │
│                                      │                                  │
└──────────────────────────────────────┼──────────────────────────────────┘
                                       │ (postMessage sang tab mới)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 TAB MỚI (downloader.html - Context Độc Lập)             │
│                                                                         │
│  1. Lắng nghe 'message' event nhận payload                              │
│  2. Tạo SheetJS Worksheet: Bảo toàn số 0 ở đầu (type 's', z: '@')       │
│  3. Tự động kích hoạt tải xuống file Excel .xlsx vào thư mục Downloads  │
│  4. Giao diện: Nút tải lại Excel + Nút Copy JSON Date Range nguyên bản  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 📋 Tổng Hợp Toàn Bộ Quy Tắc Hoạt Động & Chuẩn Hóa

### 3.1. Quy tắc Tab Setup (Data) trong `index.json`
- **Tên nhóm chính:** `Data`
- **Các trường thành phần:**
  1. `Dimension` (type `DIMENSION`, min 0, max 50): Danh sách cột thứ nguyên hiển thị.
  2. `Metric` (type `METRIC`, min 0, max 50): Danh sách cột chỉ số hiển thị.
  3. `Freeze Dimension` (type `DIMENSION`, min 0, max 10): Cột thứ nguyên ghim cố định bên trái khi cuộn ngang (chỉ áp dụng cho Dimension).
  4. `Search Dimension` (type `DIMENSION`, min 0, max 10): Cột thứ nguyên quét tìm kiếm (nếu để trống, tự động quét tất cả các cột hiển thị).
  5. `Sort Dimension (1–3)` (type `DIMENSION`, min 0, max 3): Cột Dimension ưu tiên sắp xếp cấp 1 đến 3.
  6. `Sort Metric (1–3)` (type `METRIC`, min 0, max 3): Cột Metric ưu tiên sắp xếp cấp 1 đến 3.
  7. `Conditional Dimension (1–3)` (type `DIMENSION`, min 0, max 3): Cột Dimension gán cho Quy tắc màu 1–3.
  8. `Conditional Metric (1–3)` (type `METRIC`, min 0, max 3): Cột Metric gán cho Quy tắc màu 1–3.

### 3.2. Quy tắc Tab Style trong `index.json`
- **Thứ tự các Section trong Style:**
  1. **`tableAppearance` (Giao diện Bảng):** Nằm ở vị trí đầu tiên của tab Style.
     - `defaultPageSize`: 10, 20, 25, 50, 100, 250, 500, 1000, Tất cả (-1).
     - `rowDensity`: Gọn (`compact`), Tiêu chuẩn (`normal`), Thoáng (`relaxed`).
     - `tableVariant`: Sọc ngựa vằn (`striped`), Có viền ô (`bordered`), Tối giản (`default`).
     - `fontSize`: 11px đến 16px.
     - `showSTT`: Checkbox hiển thị cột STT.
     - `textWrap`: Checkbox tự động xuống dòng.
     - `showColPopup`: Checkbox bật/tắt nút `👁️ Cột hiển thị`.
  2. **`sortingSection` (Sắp xếp):**
     - `sort1Direction`, `sort2Direction`, `sort3Direction`: Tăng dần (`asc` ▲) / Giảm dần (`desc` ▼).
     - `allowHeaderSort`: Checkbox cho phép click tiêu đề để sắp xếp 3 trạng thái.
  3. **`searchSection` (Tìm kiếm):**
     - `showSearch`: Bật/tắt ô tìm kiếm.
     - `defaultSearchText`: Từ khóa mặc định.
     - `searchPlaceholder`: Placeholder tùy chỉnh.
     - `searchMode`: Chứa từ khóa (`contains`), Bằng chính xác (`equals`), Bắt đầu bằng (`startsWith`).
     - `searchCaseSensitive`: Phân biệt hoa/thường.
  4. **`rule1Section` – `rule3Section` (Tô Màu & Badge Quy Tắc 1 đến 3):**
     - `ruleX_enable`: Bật/Tắt quy tắc.
     - `ruleX_operator`: `contains`, `equals`, `notEquals`, `startsWith`, `endsWith`, `>`, `>=`, `<`, `<=`, `between`, `pos`, `neg`, `empty`, `notEmpty`.
     - `ruleX_value`, `ruleX_value2`: Giá trị so sánh.
     - `ruleX_style`: Badge Xanh/Đỏ/Vàng/Lam/Xám hoặc Chữ Xanh/Đỏ/Vàng/Lam/Dương Xanh Âm Đỏ.

### 3.3. Quy tắc Cố Định Cột (Sticky Freeze Columns)
- Chỉ nhận các cột nằm trong `Freeze Dimension`.
- Hàm `findRawIndexForField` luôn so sánh cả `field.name` và `field.id` để loại bỏ sai lệch ID nội bộ do Looker Studio sinh ra giữa các concept.
- `applyFrozenColumnOffsets` tự động duyệt qua các cột frozen, tính toán giá trị `th.style.left` và `td.style.left` tích lũy theo chiều rộng thực tế của các cột trước đó.
- Cột frozen cuối cùng tự động được gắn class `.frozen-column-last` để hiển thị đường viền ngăn cách `#94a3b8` và hiệu ứng đổ bóng mượt mà.

### 3.4. Quy tắc Xuất File Excel (`downloader.html`)
- **Bảo toàn số 0 ở đầu:** Với các chuỗi bắt đầu bằng `0` và có từ 2 ký tự số trở lên (như số điện thoại `0912345678`, mã nhân viên `0012`...), ô Excel luôn được thiết lập `t: 's'` (Text) kèm format `@` (`z: '@'`), ngăn chặn tuyệt đối tình trạng Excel tự đổi thành số và làm mất số 0.
- **Tự động mở rộng cột:** Tự động tính toán độ dài lớn nhất của text trong từng cột để đặt `ws['!cols'] = [{ wch: maxLen + 3 }]`.
- **Date Range nguyên bản:** Nhận nguyên bản `data.dateRanges.DEFAULT` từ Looker Studio API (`start` & `end`), hiển thị dạng JSON và có nút sao chép tiện lợi.

---

### 3.5. 🛡️ Phân Tích Kỹ Thuật: Cơ Chế Xuất File, Giới Hạn Sandbox & Vấn Đề Android WebView

#### A. Giới hạn `allow-downloads` trong Iframe của Google Looker Studio:
- Google Looker Studio nhúng Community Visualization trong một iframe bảo mật nghiêm ngặt và **cố tình không cấp cờ `allow-downloads`**.
- Nếu thực hiện tải file trực tiếp tại chỗ bằng `<a>.click()` hoặc `Blob` bên trong iframe, trình duyệt Chromium sẽ chặn với thông báo:
  ```
  Download is disallowed. The frame initiating or instantiating the download is sandboxed, but the flag 'allow-downloads' is not set.
  ```
- **Giải pháp xử lý chuẩn:** Sử dụng cơ chế mở tab helper [`downloader.html`](file:///D:/customLooker/downloader.html) qua `window.open()`. Vì `downloader.html` là một tab cấp cao nhất (Top-level window context), nó hoàn toàn thoát khỏi môi trường sandbox của iframe và tải file `.xlsx` về máy bình thường.

#### B. Vấn đề trên Android App (In-App WebView):
- **Hiện tượng:** Khi báo cáo Looker Studio được nhúng vào một Ứng dụng di động Android (Android WebView, Flutter WebView, React Native WebView...), khi bấm nút Xuất Excel, tab `downloader.html` mở lên nhưng bị quay vòng vô tận (Loading mãi).
- **Nguyên nhân cốt lõi:**
  - Android WebView mặc định cô lập các cửa sổ được mở bởi `window.open` thành các context độc lập và ngắt đứt liên lạc `postMessage` giữa 2 cửa sổ.
  - Khi đó, dữ liệu bảng từ Looker Studio không thể truyền sang tab `downloader.html`, khiến màn hình chờ không nhận được dữ liệu.
- **Các giải pháp khắc phục triệt để:**
  1. **Dành cho Người Dùng Cuối (End-user Workaround):**
     - Mở báo cáo bằng trình duyệt di động chuẩn (**Google Chrome** trên Android hoặc **Safari** trên iOS) thay vì xem qua WebView nhúng của App. Trên Chrome/Safari mobile, tính năng tải file hoạt động 100% mượt mà.
  2. **Dành cho Lập Trình Viên Ứng Dụng (Android App Devs):**
     - Trong mã nguồn Native của App Android, cần cấu hình WebView hỗ trợ đa cửa sổ và WebChromeClient:
       ```kotlin
       webView.settings.setSupportMultipleWindows(true)
       webView.settings.javaScriptCanOpenWindowsAutomatically = true
       webView.webChromeClient = WebChromeClient()
       ```
       Khi cấu hình này được kích hoạt, Android WebView sẽ duy trì kênh truyền thông `postMessage` giữa 2 cửa sổ và cho phép tải file Excel bình thường.

---

## 4. 📁 Cấu Trúc File Dự Án

```
D:\customLooker/
├── src/
│   └── index.js              # Mã nguồn bảng chính (DSCC SDK, Data Pipeline, Sticky Freeze, Sorters, Formatter, Excel Export)
├── downloader.html           # Helper tab tải file Excel .xlsx bảo toàn số 0 và copy JSON Date Range
├── index.css                 # Toàn bộ CSS giao diện bảng, sticky frozen columns, badges, variants, densities
├── index.json                # Schema Setup & Style chính thức của Looker Studio Community Viz
├── manifest.json             # File Manifest khai báo tài nguyên Community Viz ("devMode": true)
├── webpack.config.js         # Cấu hình đóng gói bundle JS tối ưu dung lượng
├── package.json              # Khai báo dependencies npm (@google/dscc, webpack)
├── index.bundle.js           # File bundle JS sản phẩm (~30.6 KB)
├── customLooker.zip          # Gói nén toàn bộ dự án
├── changelog/                # Thư mục nhật ký thay đổi và Walkthrough
│   └── 20260814_204747_walkthrough.md # Nhật ký phiên làm việc
└── agent.md                  # Tài liệu toàn diện quy tắc & hướng dẫn (File này)
```

---

## 5. 🚀 Quy Trình Build, Đóng Gói & Triển Khai (Deployment Rules)

### 5.1. Thông tin GCS Bucket & Manifest
- **GCS Bucket Path:** `gs://analytics_merap/excelchart2/`
- **Manifest Path nhập vào Looker Studio:** `gs://analytics_merap/excelchart2`
- **GitHub Repository:** `https://github.com/duyvanda/customlooker.git` (branch `main`)
- **Python Executable (nếu cần script phụ trợ):** `D:\ipython_file\.venv\Scripts\python.exe`
- **SSH Host (nếu cần SSH):** `biserver@27.74.242.21`

### 5.2. Lệnh Build Webpack & Đóng Gói ZIP
Chạy trong PowerShell tại thư mục gốc `D:\customLooker`:
```powershell
# 1. Build Webpack bundle
npm run build

# 2. Xóa zip cũ và nén gói zip mới
Remove-Item -Path "D:\customLooker\customLooker.zip" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "src", "downloader.html", "index.css", "index.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.js", "agent.md", "changelog" -DestinationPath "D:\customLooker\customLooker.zip" -Force
```

### 5.3. Lệnh Triển Khai Lên Google Cloud Storage (GCS)
```powershell
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.js" "index.css" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart2/
```

### 5.4. Lệnh Commit & Push GitHub (Luôn commit bằng tiếng Việt)
```powershell
git add .
git commit -m "<Nội dung commit bằng tiếng Việt mô tả thay đổi>"
git push origin main
```

---

## 6. 📝 Quy Tắc Walkthrough & Changelog Bắt Buộc

- Khi hoàn thành bất kỳ nhiệm vụ hoặc thay đổi code nào trong dự án, Agent **luôn phải cập nhật file Walkthrough** để ghi nhận các thay đổi đó.
- Trong cùng một phiên chat chỉ sử dụng duy nhất một file tại thư mục `changelog/` ở gốc dự án với tên file định dạng: `yyyymmdd_hhmmss_walkthrough.md` (ví dụ: [`changelog/20260814_204747_walkthrough.md`](file:///D:/customLooker/changelog/20260814_204747_walkthrough.md)).
