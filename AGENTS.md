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
  3. `Freeze Dimension` (type `DIMENSION`, min 0, max 10): Cột thứ nguyên ghim cố định bên trái khi cuộn ngang (chỉ áp dụng cho Dimension, không dùng Freeze Metric).
  4. `Search Dimension` (type `DIMENSION`, min 0, max 10): Cột thứ nguyên quét tìm kiếm (nếu không chọn trường nào, Viz sẽ tự động ẩn thanh tìm kiếm).
  5. `Sort 1–3 Dimension / Metric` (type `DIMENSION`/`METRIC`, min 0, max 1 mỗi cấp): Mỗi cấp độ sắp xếp 1–3 cho phép chọn 1 Dimension hoặc 1 Metric tương ứng.
  6. `Rule 1–3 Dimension / Metric` (type `DIMENSION`/`METRIC`, min 0, max 1 mỗi quy tắc): Ràng buộc rõ ràng từng Dimension/Metric cho từng Quy tắc màu 1–3.

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
- Hiển thị icon `📌` tại tiêu đề cột được freeze.
- Hàm `findRawIndexForField` ưu tiên so sánh `field.id` trước rồi mới fallback `field.name` để loại bỏ sai lệch khi đổi tên cột trên Looker Studio.
- Tự động gắn `ResizeObserver` để tính toán lại offset `left` khi bảng thay đổi kích thước.
- Cột frozen cuối cùng tự động được gắn class `.frozen-column-last` tạo đường viền ngăn cách `#94a3b8` và hiệu ứng đổ bóng.

### 3.4. Quy tắc Xuất File Excel (`downloader.html`)
- **Bảo toàn số 0 ở đầu:** Với các chuỗi bắt đầu bằng `0` và có từ 2 ký tự số trở lên, ô Excel luôn được thiết lập `t: 's'` (Text) kèm format `@` (`z: '@'`).
- **Xuất chính xác dữ liệu lọc:** Luôn xuất mảng dòng đang hiển thị theo bộ lọc tìm kiếm (`sortedRows`), không fallback toàn bộ raw data khi tìm kiếm ra 0 dòng.
- **Tự động mở rộng cột:** Tự động tính toán độ dài lớn nhất của text trong từng cột để đặt `ws['!cols'] = [{ wch: maxLen + 3 }]`.
- **Date Range nguyên bản:** Nhận nguyên bản `data.dateRanges.DEFAULT` từ Looker Studio API (`start` & `end`), hiển thị dạng JSON và có nút sao chép tiện lợi.

---

## 4. 📁 Cấu Trúc File Dự Án

```
D:\customLooker/
├── src/
│   └── index.js              # Mã nguồn bảng chính (DSCC SDK, Data Pipeline, Sticky Freeze, Sorters, Formatter, Excel Export)
├── downloader.html           # Helper tab tải file Excel .xlsx bảo toàn số 0 và copy JSON Date Range
├── index.css                 # Toàn bộ CSS giao diện bảng, sticky frozen columns, badges, variants, densities
├── index.json                # Schema Setup & Style chính thức của Looker Studio Community Viz
├── manifest.json             # File Manifest khai báo tài nguyên Community Viz ("devMode": false)
├── webpack.config.js         # Cấu hình đóng gói bundle JS tối ưu dung lượng
├── package.json              # Khai báo dependencies npm (@google/dscc, webpack)
├── index.bundle.js           # File bundle JS sản phẩm (~30.6 KB)
├── customLooker.zip          # Gói nén toàn bộ dự án
├── changelog/                # Thư mục nhật ký thay đổi và Walkthrough
├── feedback.md               # Ghi chú phản hồi yêu cầu
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
Compress-Archive -Path "src", "downloader.html", "index.css", "index.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.js", "agent.md", "feedback.md", "changelog" -DestinationPath "D:\customLooker\customLooker.zip" -Force
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

### 5.5. 🔄 Hướng Dẫn Đổi GCS Folder (Ví dụ: `excelchart2` → `excelchart3`)

Khi cần deploy sang folder GCS mới (tránh cache cũ, hoặc tạo môi trường mới), cần cập nhật **đúng 2 file** sau:

#### 📄 File 1: [`manifest.json`](file:///D:/customLooker/manifest.json)

Đổi tất cả 3 đường dẫn trong `resource` + kiểm tra `devMode`:
```json
"resource": {
    "js":     "gs://analytics_merap/excelchart3/index.bundle.js",
    "css":    "gs://analytics_merap/excelchart3/index.css",
    "config": "gs://analytics_merap/excelchart3/index.json"
},
"devMode": false
```
> ⚠️ **Lưu ý `devMode`:**
> - `devMode: true`  → Tắt cache CDN, dùng khi **đang phát triển/test** (tốc độ chậm hơn ~2-3s).
> - `devMode: false` → Bật Google Edge CDN cache, dùng khi **production** (tốc độ nhanh nhất).

---

#### 📄 File 2: [`src/index.js`](file:///D:/customLooker/src/index.js#L103)

Đổi hằng số `DOWNLOADER_URL` ở **dòng ~103**:
```js
const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart3/downloader.html';
```

---

#### 🚀 Lệnh Deploy Sau Khi Đổi Folder

```powershell
# 1. Build lại bundle
npm run build

# 2. Deploy lên folder GCS mới
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.js" "index.css" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart3/
```

---

#### 🔧 Cập Nhật Trên Looker Studio

Sau khi deploy xong, vào Looker Studio:
1. Mở báo cáo → Bấm **Edit** (chỉnh sửa).
2. Chọn vào Custom Viz → bấm nút **⋮** (ba chấm) → **Edit chart**.
3. Trong phần cài đặt Community Visualization → cập nhật **Manifest Path** sang:
   ```
   gs://analytics_merap/excelchart3
   ```
4. Bấm **Save** → Looker Studio sẽ tải lại chart từ folder mới.

---

#### 📋 Checklist Tổng Hợp Khi Đổi Folder

| # | Việc cần làm | File |
|---|---|---|
| 1 | Đổi 3 URL `resource` (js, css, config) | `manifest.json` |
| 2 | Kiểm tra `devMode` (false = production) | `manifest.json` |
| 3 | Đổi `DOWNLOADER_URL` | `src/index.js` (dòng ~103) |
| 4 | `npm run build` | — |
| 5 | `gsutil cp` lên GCS folder mới | — |
| 6 | Cập nhật Manifest Path trên Looker Studio | Looker Studio UI |

---

## 6. 📝 Quy Tắc Walkthrough & Changelog Bắt Buộc

- Khi hoàn thành bất kỳ nhiệm vụ hoặc thay đổi code nào trong dự án, Agent **luôn phải cập nhật file Walkthrough** để ghi nhận các thay đổi đó.
- Trong cùng một phiên chat chỉ sử dụng duy nhất một file tại thư mục `changelog/` ở gốc dự án với tên file định dạng: `yyyymmdd_hhmmss_walkthrough.md` (ví dụ: [`changelog/20260814_204747_walkthrough.md`](file:///D:/customLooker/changelog/20260814_204747_walkthrough.md)).

