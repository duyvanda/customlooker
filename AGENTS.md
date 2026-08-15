# 📊 Custom Looker Studio Table Viz - Hướng Dẫn Vận Hành & Quy Tắc Dự Án

---

## 1. 📌 Thông Tin Môi Trường
- **Production Manifest Path:** `gs://analytics_merap/excelchart3`
- **GitHub Repo:** `https://github.com/duyvanda/customlooker.git` (branch `main`)
- **Python:** `D:\ipython_file\.venv\Scripts\python.exe` | **SSH:** `biserver@27.74.242.21`
- **Shell Môi Trường:** Windows PowerShell (Tránh dùng lệnh Linux như `grep`, `cat`, `sed`; dùng `Select-String`, `Get-Content`, `Set-Content` hoặc tool chuyên dụng).
- **Màu sắc thương hiệu MERAP:** Teal (`#009B9E`), Navy (`#202657`).

---

## 2. 📁 Cấu Trúc Thư Mục
```text
D:\customLooker/
├── src/
│   ├── index.js              # Entry point chính (Data Pipeline, Lifecycle, Render Table)
│   ├── formatters.js         # Engine bóc tách & format BigQuery Date/Number, Escape HTML, Bỏ dấu TV
│   ├── schema.js             # Bóc tách tableColumns, searchFields, sortLevels từ DSCC metadata
│   ├── rules.js              # Engine conditional formatting (Rule 1-3) & tô màu cột nhóm 1-3
│   ├── sorters.js            # Natural multi-type comparator (compareValues)
│   ├── summary.js            # Tính toán Dòng Tổng (3 cấp ưu tiên) & DOM generator
│   ├── ui.js                 # Sticky freeze offsets, drag-to-resize, popup ẩn/hiện cột
│   ├── export.js             # Giao tiếp tab downloader.html (postMessage) & extract Date Range
│   └── index.css             # Source CSS chính (Design System, Sticky, Badges)
├── index.bundle.v3.X.js      # JS bundle active trên GCS (ví dụ: v3.32)
├── index.v3.X.css            # CSS active trên GCS (ví dụ: v3.32)
├── index.v3.X.json           # JSON config active trên GCS (ví dụ: v3.32)
├── downloader.html           # Helper tab xuất Excel (.xlsx) & CSV (.csv)
├── index.json                # Schema Setup & Style của Looker Studio
├── manifest.json             # Khai báo tài nguyên ("devMode": false)
├── archive/                  # 📦 Lưu trữ các file bundle / CSS cũ
├── changelog/                # Nhật ký thay đổi (Walkthrough)
└── customLooker.zip          # Gói nén dự án
```

---

## 3. ⚠️ Quy Tắc Bắt Buộc (Critical Rules)

1. **Cố định Manifest Path:** **TUYỆT ĐỐI KHÔNG** tự ý đổi số folder GCS (ví dụ: `excelchart3` → `excelchart4`) vì sẽ làm toàn bộ báo cáo cũ của công ty bị mất liên kết và không nhận được bản cập nhật.
2. **Quy Tắc File Versioning & Chọn Chế Độ Deploy:**
  - **Chế độ A - Deploy NÂNG PHIÊN BẢN (Bust Cache CDN ngay lập tức - Áp dụng 0s 100%):**
     - Áp dụng khi: Có tính năng mới, thay đổi schema quan trọng, hoặc fix bug khẩn cấp cần người dùng nhận ngay bản mới 100%.
     - **BẮT BUỘC đổi tên cả JS và CSS** (ví dụ: `v3.26` → `v3.27`) trong `webpack.config.js`, `manifest.json` và GCS để tránh lỗi Google CDN trả về CSS cũ làm vỡ giao diện.
     - **Thời gian áp dụng:** **0 giây (Ngay lập tức 100%)** do URL file mới hoàn toàn, CDN chưa từng cache.
   - **Chế độ B - Deploy GIỮ NGUYÊN PHIÊN BẢN (Không tăng version - Google cập nhật dần):**
     - Áp dụng khi: Chỉnh sửa nhẹ nhàng (như cập nhật cấu hình mặc định `defaultValue`, tinh chỉnh nhỏ layout), chấp nhận Google Edge CDN cập nhật dần theo thời gian mà không cần đổi tên file/URL phiên bản.
     - Quy trình: Giữ nguyên số version hiện tại (ví dụ `v3.26`), đồng bộ file CSS/JSON tương ứng, build lại bundle ghi đè, đóng gói ZIP và deploy đè lên GCS bucket với cờ `Cache-Control`.
     - **Thời gian áp dụng:** Thường từ **5 đến 15 phút** (tối đa ~30 phút tùy Edge CDN server của Google). Nếu người dùng bấm `Ctrl + F5` (Hard Refresh) hoặc mở Tab Ẩn danh (Incognito) thì nhận bản mới sau **1 - 2 phút**.
   - ⚠️ **BẮT BUỘC HỎI LẠI TRƯỚC KHI DEPLOY:** Khi nhận được yêu cầu deploy từ User mà User chưa chỉ định rõ chọn Chế độ A hay B, Agent **BẮT BUỘC phải hỏi lại User** để xác nhận trước khi tiến hành deploy.
3. **TUYỆT ĐỐI KHÔNG tự ý tăng phiên bản khi code (No auto-versioning):**
   - Trong suốt quá trình code, refactor, fix bug hoặc test, Agent **bắt buộc giữ nguyên phiên bản hiện tại** (ví dụ `v3.26`).
   - **TUYỆT ĐỐI KHÔNG** tự ý đổi tên output bundle trong `webpack.config.js`, không đổi `manifest.json`, không tạo file version mới (`index.vX.css`, `index.vX.json`) trừ khi có chỉ định rõ ràng từ User.
4. **TUYỆT ĐỐI KHÔNG tự ý Deploy & Git:** Chỉ build và đóng gói bundle cục bộ; **KHÔNG ĐƯỢC TỰ Ý** chạy lệnh deploy lên GCS (`gsutil cp ...`) hoặc `git commit` / `git push` trừ khi có yêu cầu rõ ràng từ User.
5. **Bảo toàn số 0 ở đầu:**
   - Excel: Cell type `t: 's'`, format `@` (`z: '@'`).
   - CSV: Dùng công thức `="0123"` + tiền tố BOM UTF-8 `\uFEFF`.
6. **Nút Xuất Excel (>200k dòng):** Tự động chuyển màu đỏ cảnh báo (`btn-excel-danger`) và hướng dẫn dùng CSV để tránh crash trình duyệt.
7. **devMode:** Luôn để `"devMode": false` trên Production để kích hoạt Google Edge CDN.
8. **Môi Trường Lệnh Shell (Windows PowerShell):** Luôn dùng cú pháp PowerShell chuẩn (`Get-Content`, `Set-Content`, `Copy-Item`, `Move-Item`, `Compress-Archive`, `Select-String`), tránh dùng các lệnh shell Linux (`grep`, `cat`, `sed`, `awk`).
9. **Quy Tắc Xuất File (Helper Tab & postMessage):**
   - Khi click nút xuất file, **bắt buộc mở thẳng `window.open(DOWNLOADER_URL, '_blank')`** trong sự kiện click (Direct User Gesture) để không bị chặn popup và hiển thị ngay màn hình chờ tải. **Tuyệt đối không mở tab rỗng `about:blank`**.
   - **Tuyệt đối không truy cập `helperWindow.location.href`** vì sẽ gây lỗi bảo mật `Cross-Origin DOMException`.
   - Áp dụng cơ chế phản hồi **2-Way ACK (`DOWNLOADER_READY_ACK`)** để dừng timer `clearInterval` ngay khi nhận dữ liệu, và luôn kiểm tra `if (helperWindow.closed)` để dọn dẹp timer nếu người dùng đóng tab sớm.
10. **Nhất Quán Parse Số & Regex Anchor Dấu Âm:**
    - Toàn bộ codebase (kể cả đánh giá quy tắc màu `rules.js`) **bắt buộc dùng `parseNumericValue(val, type)`**, **tuyệt đối không dùng `Number(val)`** (vì `Number("1,000")` trả về `NaN`).
    - Khi nhận diện dấu chấm phân cách ngàn chuẩn VN, bắt buộc dùng regex neo đầu chuỗi `replace(/^-/, '')` để bóc tách dấu âm trước khi đo độ dài phần nguyên.

---

## 4. 🧮 Quy Tắc Dữ Liệu & Tính Toán Dòng Tổng Hợp (Summary Row)

1. **Phạm vi tính toán:** Bắt buộc tính trên toàn bộ dữ liệu đã lọc (`sortedRows`, có thể lên đến hàng chục nghìn dòng), **tuyệt đối không** tính trên trang hiển thị hiện tại (`pageRows`).
2. **Thứ tự ưu tiên phép tính & Danh sách Aggregations (Cho Metric & Dimension):**
   - **Ưu tiên 1 (Cao nhất - Ghi đè tùy chọn theo cột):** Cấu hình text ghi đè trong Style panel (`perColumnSummary`). Hỗ trợ cho **cả Dimension và Metric**:
     - `sum`: Tính tổng (cho cột số).
     - `avg` / `average`: Tính trung bình (cho cột số).
     - `min`: Giá trị nhỏ nhất (cho cột số).
     - `max`: Giá trị lớn nhất (cho cột số).
     - `count`: Đếm số dòng có dữ liệu khác rỗng (cho cả text và số).
     - `countd` / `count_distinct` / `distinct`: Đếm số giá trị duy nhất (Distinct Count, cho cả text và số).
     - Cú pháp ví dụ: `brand:countd, Mã KH:countd, Doanh Thu:sum, Số Lượng:sum, Năm:sum, Đơn Giá:avg`.
     - Tên cột tiếng Việt (có dấu / không dấu / không phân biệt hoa thường) hoặc Mã trường (Field ID).
   - **Ưu tiên 2 (Mặc định tự động cho Metric):** Metadata `f.aggregation` trả về từ Looker Studio (SUM, AVG, MIN, MAX, COUNT, COUNT_DISTINCT) do người dùng chọn bên Setup.
   - **Ưu tiên 3 (Fallback cho Metric):** Cấu hình dropdown mặc định toàn cục `summaryType` (hỗ trợ SUM, AVG, MIN, MAX, COUNT, COUNTD).
3. **Xử lý số thực & chữ số thập phân (Decimal Places):**
   - Dùng `parseNumericValue(val, col.type)` để bóc tách chính xác mọi định dạng số (có dấu phẩy/chấm phân cách ngàn).
   - Số chữ số thập phân khi hiển thị:
     - `COUNT / COUNTD`: Luôn là `0` chữ số thập phân.
     - `AVG`: Tối thiểu `2` chữ số thập phân (tối đa 6) do tính chất phép chia tạo số lẻ.
     - `SUM / MIN / MAX`: Tự động nhận diện theo độ chính xác của dữ liệu gốc (`maxDecimalPlaces`).
4. **Typography & Styling dòng Tổng hợp:**
   - Base `.summary-row th/td` reset `font-weight: 400` để không bị double-bold từ header.
   - Nhãn dòng tổng: dùng class `.summary-label` (chữ nghiêng *italic*, màu `#64748b`).
   - Số liệu tổng: dùng class `.summary-number` (`font-weight: 600`, `font-variant-numeric: tabular-nums`).
5. **Định dạng Date/Time & Number theo cột (Chuẩn BigQuery Format):**
   - **`perColumnDateFormat` (Date/Time):** Sử dụng chuẩn BigQuery Format Elements:
     - Ký hiệu: `%Y` (Năm 4 số), `%y` (Năm 2 số), `%m` (Tháng 01-12), `%d` (Ngày 01-31), `%H` (Giờ 00-23), `%M` (Phút 00-59), `%S` (Giây 00-59), `%B` (Tên tháng đầy đủ), `%b`/`%h` (Tên tháng viết tắt).
     - Cú pháp: `Tên Cột:pattern` (hoặc `fieldId:pattern`). Ví dụ: `Ngày Giao:%d/%m/%Y, Created:%Y-%m-%d %H:%M:%S, Tháng:%m/%Y`.
   - **`perColumnNumberFormat` (Number):** Sử dụng chuẩn BigQuery `FORMAT()` / `printf`:
     - Ký hiệu: `%'.0f` hoặc `%'d` (Số nguyên có dấu phẩy ngàn), `%'.1f` (1 số lẻ), `%'.2f` (2 số lẻ), `%'.3f` (3 số lẻ).
     - Tiền tệ: `vnd` / `vnđ` / `%'.0f ₫` (VNĐ), `usd` / `$%'.2f` (USD).
     - Phần trăm: `%'.2f%%`, `%'.0f%%`, `percent`, `percent_2` (Tự nhân 100 nếu giá trị $\le 1$).
     - Rút gọn: `compact` / `kmb` (`1.5M`, `2.3B`).
     - Cú pháp: `Doanh Thu:%'.2f, Số Lượng:%'d, Tỷ Lệ:%'.2f%%, VNĐ:vnd`.

---

## 5. 🖱️ Quy Tắc Tương Tác & Giao Diện (Interaction & UX)

1. **Duy trì vị trí cuộn (Scroll Position Preservation):**
   - Trước khi `renderTable()` xóa và dựng lại DOM, bắt buộc đọc `prevScrollLeft` và `prevScrollTop` từ `.table-scroll-container`.
   - Ngay sau khi mount DOM và sau `applyFrozenColumnOffsets`, bắt buộc khôi phục lại vị trí cuộn để bảng không bị nhảy/văng về cột 1 (STT) khi người dùng thao tác sort hoặc đổi trang ở các cột bên phải.
2. **2-State Header Sorting:**
   - Click cùng 1 cột: Đổi chiều trực tiếp `ASC` ↔ `DESC`.
   - Click cột khác: Bắt đầu bằng `ASC`.
   - Không dùng trạng thái `null` (reset) để tránh làm giao diện tự động nhảy về cột sort mặc định của Setup.

---

## 6. 🚀 Quy Trình Build & Deploy Khi Có Cập Nhật

### 🌟 Trường Hợp 1: Deploy Giữ Nguyên Phiên Bản (Không Tăng Version)
*Dùng cho các thay đổi nhỏ/cấu hình mặc định, chấp nhận CDN cập nhật dần:*

```powershell
# 1. Đồng bộ file CSS và JSON theo version hiện tại (ví dụ v3.26)
Copy-Item 'src/index.css' 'index.v3.26.css' -Force
Copy-Item 'index.json' 'index.v3.26.json' -Force

# 2. Build Webpack ghi đè bundle hiện tại
npm run build

# 3. Đóng gói ZIP
Remove-Item -Path "customLooker.zip" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "src", "downloader.html", "index.v3.26.css", "index.json", "index.v3.26.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.v3.26.js", "AGENTS.md", "cai_tien.md", "changelog", "archive" -DestinationPath "customLooker.zip" -Force

# 4. Deploy lên GCS Production (CHỈ KHI USER YÊU CẦU)
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.v3.26.js" "index.v3.26.css" "index.v3.26.json" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart3/
```

### 🚀 Trường Hợp 2: Deploy Nâng Phiên Bản Mới (Ví dụ lên `v3.27`)
*Dùng khi có tính năng mới/fix bug khẩn cấp cần phá cache CDN 100% lập tức:*

```powershell
# 1. Cập nhật output.filename trong webpack.config.js -> 'index.bundle.v3.27.js'
# 2. Tạo bản copy CSS và JSON mới
Copy-Item 'src/index.css' 'index.v3.27.css' -Force
Copy-Item 'index.json' 'index.v3.27.json' -Force

# 3. Cập nhật manifest.json:
#    "js":     "gs://analytics_merap/excelchart3/index.bundle.v3.27.js"
#    "css":    "gs://analytics_merap/excelchart3/index.v3.27.css"
#    "config": "gs://analytics_merap/excelchart3/index.v3.27.json"
#    "devMode": false

# 4. Build Webpack
npm run build

# 5. Dọn dẹp toàn bộ file version cũ và LICENSE.txt vào archive/
Move-Item -Path "index.bundle.v3.26.js", "index.bundle.v3.26.js.LICENSE.txt", "index.v3.26.css", "index.v3.26.json" -Destination "archive/" -Force -ErrorAction SilentlyContinue

# 6. Đóng gói ZIP
Remove-Item -Path "customLooker.zip" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "src", "downloader.html", "index.v3.27.css", "index.json", "index.v3.27.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.v3.27.js", "AGENTS.md", "cai_tien.md", "changelog", "archive" -DestinationPath "customLooker.zip" -Force

# 7. Deploy lên GCS Production (CHỈ KHI USER YÊU CẦU)
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.v3.27.js" "index.v3.27.css" "index.v3.27.json" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart3/
```

---

## 7. 📝 Quy Tắc Walkthrough & Git
- Mỗi phiên làm việc phải tạo/cập nhật 1 file walkthrough tại `changelog/yyyymmdd_hhmmss_walkthrough.md`.
- **CHỈ deploy và sử dụng git khi được User yêu cầu rõ ràng.**
- Khi commit git, commit message luôn viết bằng tiếng Việt.

---

## 8. 📐 Bounding Box & Iframe Resize Performance

1. **Bản chất Bounding Box trong Looker Studio:**
   - **Bounding Box** (khung viền xanh có các núm kéo kích thước *Resize Handles*) là thành phần giao diện của Looker Studio (trang cha).
   - Biểu đồ Custom Viz chạy hoàn toàn bên trong một thẻ **`<iframe>`** độc lập (trang con).
2. **Nguyên nhân gây giật/khựng khi kéo dài Bounding Box:**
   - Khi người dùng kéo núm Bounding Box, nếu con trỏ chuột lướt vào phạm vi `<iframe>`, trình duyệt sẽ chuyển quyền bắt sự kiện chuột (`pointer-events`) sang iframe, làm Looker Studio mất dấu chuột dẫn đến Bounding Box bị khựng/lag.
   - Looker Studio gửi sự kiện `RENDER` liên tục ở tần số cao (30-60 lần/giây) khi Bounding Box thay đổi kích thước.

---

## 9. 📡 Tổng Hợp API Looker Studio Community Viz (Cung Cấp & Chưa Có / Hạn Chế)

### 9.1. Các API & Dữ Liệu Looker Studio CUNG CẤP (`@google/dscc`)

| Thành Phần API | Chi Tiết Dữ Liệu & Cơ Chế | Ứng Dụng Trong Dự Án |
| :--- | :--- | :--- |
| **`dscc.subscribeToData`** | Callback lắng nghe sự kiện đẩy dữ liệu khi trang load, filter thay đổi, resize hoặc sửa cấu hình (`transform: dscc.tableTransform` hoặc `objectTransform`). | `drawVisualization(data)` batching với `requestAnimationFrame` để render DOM. |
| **`data.tables.DEFAULT`** | Chứa `headers` (`[{ id, name, type }]`) và `rows` (Mảng 2D dữ liệu các dòng). | Pipeline xử lý dữ liệu: `tableColumns`, `rawRows`, sắp xếp, lọc tìm kiếm, phân trang. |
| **`data.fields` (Metadata Cột & Phép Tính)** | Danh sách các trường theo từng slot Setup (`dimensions`, `metrics`, `sort1Dimension`, `searchFields`...).<br>Mỗi field có đầy đủ metadata:<br>• **`id`**: Mã định danh trường (vd: `qt_1a2b3c`).<br>• **`name`**: Tên hiển thị cột (vd: `"Doanh Thu"`, `"Mã KH"`).<br>• **`type`**: Kiểu dữ liệu (`TEXT`, `NUMBER`, `PERCENT`, `CURRENCY`, `YEAR_MONTH_DAY`, `BOOLEAN`...).<br>• **`aggregation`**: Phép tính được chọn bên Setup (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `AUTO`, `NONE`...). | • Nhận diện kiểu dữ liệu (`type`) để format ngày tháng, số thập phân, tiền tệ, căn lề.<br>• Tự động nhận diện phép tính (`aggregation`) của từng metric để chọn hàm tính toán tương ứng (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`) cho dòng Tổng Hợp. |
| **`data.style`** | Đọc các tùy chọn cấu hình từ tab Style trong `index.json` (`styleConfig[key].value` hoặc `defaultValue`). Hỗ trợ các control: `SELECT_SINGLE`, `CHECKBOX`, `TEXTINPUT`, `COLOR_PICKER`, `FILL_COLOR`... | Cấu hình cỡ chữ, màu sắc, phân trang, ghim cột, ẩn/hiện nút xuất, per-column summary. |
| **`data.dateRanges`** | `data.dateRanges.DEFAULT.start` & `.end` (Định dạng `YYYYMMDD`) khi báo cáo có Date Range Filter active. | Trích xuất gửi kèm Helper Tab xuất Excel/CSV (`extractActiveFilterInfo`). |
| **`data.theme`** | Bảng màu theme của báo cáo (`themeFillColor`, `themeFontColor`, `themeAccentFillColor`...). | Đồng bộ style theo theme Looker (nếu cần). |
| **`data.interactions` & `dscc.sendInteraction`** | API gửi tương tác lọc chéo (Cross-filtering) sang các chart khác trên trang báo cáo. | Hỗ trợ lọc liên biểu đồ khi click dòng (nếu kích hoạt). |

#### 🔍 Minh Họa Cấu Trúc `data.fields` Thực Tế Nhận Được Từ Looker Studio:
```json
{
  "fields": {
    "dimensions": [
      { "id": "qt_dim1", "name": "Mã Khách Hàng", "type": "TEXT" },
      { "id": "qt_dim2", "name": "Ngày Giao Hàng", "type": "YEAR_MONTH_DAY" }
    ],
    "metrics": [
      { "id": "qt_met1", "name": "Số Lượng", "type": "NUMBER", "aggregation": "SUM" },
      { "id": "qt_met2", "name": "Đơn Giá TB", "type": "NUMBER", "aggregation": "AVG" },
      { "id": "qt_met3", "name": "Doanh Số", "type": "NUMBER", "aggregation": "SUM" }
    ],
    "searchFields": [
      { "id": "qt_dim_tenkh", "name": "tenkhachhang", "type": "TEXT" }
    ],
    "sort1Dimension": [
      { "id": "qt_dim1", "name": "Mã Khách Hàng", "type": "TEXT" }
    ]
  }
}
```

#### 📋 Bảng Ánh Xạ Các Slot Kéo Thả Bên Tab Setup Sang `data.fields`:

| Tên Hiển Thị Bên Tab Setup | ID Slot (`index.json`) | Đường Dẫn API Looker Studio Trả Về | Mô Tả & Xử Lý Trong Code |
| :--- | :--- | :--- | :--- |
| **Dimension (Cột Dữ Liệu)** | `dimensions` | `data.fields.dimensions` | Mảng các cột Dimension chính hiển thị trên bảng. |
| **Metric (Cột Chỉ Số)** | `metrics` | `data.fields.metrics` | Mảng các cột Metric chính, kèm metadata `aggregation` (`SUM`, `AVG`...). |
| **🔍 Search Dimension** | `searchFields` | `data.fields.searchFields` | Danh sách cột dùng để lọc tìm kiếm. Nếu mảng này rỗng `[]` $\rightarrow$ ẩn thanh Search. |
| **Sort 1/2/3 Dimension & Metric** | `sort1Dimension` / `sort1Metric`... | `data.fields.sort1Dimension`... | Các trường sắp xếp đa cấp 1, 2, 3 từ Setup. |
| **Rule Format 1/2/3 Dimension & Metric** | `rule1Dimension` / `rule1Metric`... | `data.fields.rule1Dimension`... | Các trường dùng để áp dụng quy tắc tô màu có điều kiện. |
| **🎨 Tô Màu Cột Nhóm 1/2/3** | `colGroup1Dimensions` / `colGroup1Metrics`... | `data.fields.colGroup1Dimensions`... | Các trường được gán vào 3 nhóm màu Header & Cột. |
| **📌 Ghim Cố Định Cột** | `freezeDimensions` | `data.fields.freezeDimensions` | Các cột Dimension được cố định (Freeze / Sticky left). |

#### 🔍 Minh Họa Cấu Trúc `data.tables.DEFAULT` Thực Tế Nhận Được:
```json
{
  "tables": {
    "DEFAULT": {
      "headers": [
        { "id": "qt_dim1", "name": "Mã Khách Hàng", "type": "TEXT" },
        { "id": "qt_dim2", "name": "Ngày Giao Hàng", "type": "YEAR_MONTH_DAY" },
        { "id": "qt_met1", "name": "Số Lượng", "type": "NUMBER" },
        { "id": "qt_met2", "name": "Đơn Giá TB", "type": "NUMBER" },
        { "id": "qt_met3", "name": "Doanh Số Nhỏ Nhất", "type": "NUMBER" }
      ],
      "rows": [
        ["KH0001", "20260815", 150, 25000.5, 3750000],
        ["KH0002", "20260814", 80,  45000.0, 3600000],
        ["KH0003", "20260813", 200, 18500.0, 3700000],
        ["KH0004", null,       0,   0,       0]
      ]
    }
  }
}
```
*Ghi chú:*
- `headers`: Chứa định nghĩa các cột theo đúng thứ tự hiển thị từ trái qua phải (0, 1, 2, 3, 4...).
- `rows`: Mảng 2 chiều chứa dữ liệu từng dòng. Mỗi phần tử trong row ánh xạ trực tiếp theo chỉ số cột `headers[i]`.

---

### 9.2. Các API & Tính Năng Looker Studio CHƯA CÓ / HẠN CHẾ (Missing APIs & Limitations)

| Tính Năng Thiếu / Hạn Chế | Mô Tả Hạn Chế Của Looker Studio | Giải Pháp Tự Triển Khai (Workaround) |
| :--- | :--- | :--- |
| **1. Không có API Phân Trang (Pagination)** | Looker Studio đẩy toàn bộ dữ liệu về một lần (tối đa tới giới hạn connector/1M dòng), không hỗ trợ phân trang phía backend cho Custom Viz. | Tự xây dựng toàn bộ logic phân trang client-side (`runtimeState.currentPage`, `pageSizeOverride`, thanh điều hướng 2 hàng). |
| **2. Không có Dữ Liệu Dòng Tổng Hợp Sẵn (Summary Row Data)** | Looker Studio **chỉ cung cấp metadata `f.aggregation`** (SUM/AVG/MIN/MAX...) chứ **không tính toán sẵn kết quả tổng hợp của toàn bộ bảng** cho Custom Viz (khác với bảng Native Table có backend trả về kết quả). | Viz dùng metadata `f.aggregation` từ `data.fields.metrics` kết hợp duyệt toàn bộ mảng dòng đã lọc (`sortedRows`) trên Frontend để tự tính kết quả số liệu hiển thị. |
| **3. Không có API Xuất File Trực Tiếp (`allow-downloads`)** | Iframe Sandbox của Looker Studio **thiếu cờ `allow-downloads`**, chặn toàn bộ link `<a> download` và Blob/FileSaver trực tiếp. | Kiến trúc Helper Tab: `window.open` trang `downloader.html` trên GCS + truyền dữ liệu qua `postMessage`. |
| **4. Không có API Lưu Trạng Thái Người Dùng (State Persistence)** | Không có cơ chế lưu cài đặt của người xem (Viewer) như: cột ẩn/hiện, độ rộng cột đã kéo, bookmark cá nhân. F5 sẽ reset về mặc định của Editor. | Cần tích hợp thêm Backend/Database ngoài (ví dụ: Google Cloud Functions + Firebase Firestore). |
| **5. Không có Two-way Binding Cho Setup/Style** | Viz chỉ có quyền **đọc** (read-only) từ Looker Studio, không thể gọi API để cập nhật ngược lại panel Setup/Style từ code JS. | Mọi thao tác tạm thời của người xem (sort runtime, search text, ẩn cột) được lưu trong biến bộ nhớ `runtimeState`. |
| **6. Không có Dynamic UI Trong Tab Style** | Schema `index.json` là tĩnh, không thể tự sinh ra N ô chọn cấu hình tương ứng với N cột dữ liệu người dùng kéo thả. | Định nghĩa sẵn các Slot nhóm cố định (Nhóm 1–3) hoặc dùng chuỗi `TEXTINPUT` cú pháp (`Doanh Thu:avg, Số Lượng:sum`). |
| **7. Bị Cách Ly Iframe Hoàn Toàn (Cross-Origin Sandbox)** | Không thể đọc URL trang cha, không thể mở modal đè lên UI Looker Studio, không thể can thiệp sự kiện chuột của Bounding Box bên ngoài. | Dựng UI Modal/Popup nội bộ bên trong `#excelviz-app-root` và tối ưu render với `requestAnimationFrame`. |
| **8. Không Truy Cập Được Dữ Liệu Gốc Chưa Group (Raw Underlying Data)** | Data gửi về đã bị tổng hợp/group theo các Dimension trong Setup. Không thể xem dữ liệu chi tiết nếu trường đó không được gán vào Setup. | Người thiết kế báo cáo bắt buộc phải kéo đầy đủ các Dimension chi tiết cần thiết vào Setup. |
| **9. Cơ Chế Ủy Quyền "ALLOW" & Bắt Buộc F5 Lần Đầu (2-Layer Security)** | Dù Data Source đã bật `Community visualizations access: On`, khi dùng Manifest Path riêng (`gs://...`), Google vẫn bắt mỗi tài khoản bấm **"ALLOW"** ở lần đầu mở báo cáo để xác nhận tin tưởng mã JS từ GCS. Sau khi bấm ALLOW, Looker Studio **không tự động gửi lại sự kiện re-render** vào iframe $\rightarrow$ Chart bị đứng im/treo. | Đây là **giới hạn nền tảng (Platform Limitation)** của Google Looker Studio, code bên trong iframe bị cô lập hoàn toàn và không thể can thiệp trang cha. Bắt buộc người dùng phải **F5 (tải lại trang 1 lần duy nhất)** sau khi bấm ALLOW để khởi động lại vòng đời kết nối `dscc.subscribeToData`. |

---

### 9.3. 🛠️ Quy Trình 3 Bước Tạo Ô Kéo Thả Setup Mới (Custom Setup Slot)

1. **Khai báo trong [`index.json`](file:///D:/customLooker/index.json) (mảng `"data"` $\rightarrow$ `"elements"`):**
   ```json
   {
     "id": "customSlotId",
     "label": "Tên Hiển Thị Bên Tab Setup",
     "type": "DIMENSION", // "DIMENSION" (phân loại/chữ/ngày) hoặc "METRIC" (số liệu)
     "options": { "min": 0, "max": 10 } // min: 0 (tùy chọn), max: số lượng trường tối đa
   }
   ```
2. **Đọc & Xử lý trong [`src/index.js`](file:///D:/customLooker/src/index.js):**
   ```javascript
   // Đọc từ data.fields theo ID đã khai báo
   const selectedFields = (data.fields && data.fields.customSlotId) || [];
   // Map với cột bảng qua helper ID-first
   const targetCols = selectedFields.map(f => findTableColumnByField(f, tableColumns)).filter(Boolean);
   ```
3. **Build & Deploy:** Đổi versioned JSON/JS, chạy `npm run build` và deploy lên GCS.

---

## 10. 📘 Cẩm Nang Hướng Dẫn Cấu Hình Tab SETUP & STYLE (Kèm Ví Dụ Thực Chiến)

---

### 10.1. 📋 Hướng Dẫn Tab SETUP (Kéo Thả Trường Dữ Liệu)

| Slot Kéo Thả Bên Setup | Loại Slot | Mục Đích Sử Dụng & Quy Tắc | Ví Dụ Kéo Thả Thực Tế |
| :--- | :--- | :--- | :--- |
| **Dimension (Cột Dữ Liệu)** | `DIMENSION` | Chứa các cột phân loại, mã, tên, ngày tháng hiển thị trên bảng. | Kéo: `Mã Khách Hàng`, `Tên KH`, `Ngày Giao`, `brand`. |
| **Metric (Cột Chỉ Số)** | `METRIC` | Chứa các cột số liệu đo lường, tính toán. | Kéo: `Số Lượng`, `Đơn Giá`, `Doanh Số`, `Chiết Khấu`. |
| **🔍 Search Dimension (`searchFields`)** | `DIMENSION` | Chọn các cột để người xem **tìm kiếm trực tiếp** trên thanh Search Box.<br>• Nếu để trống $\rightarrow$ Ẩn thanh Search.<br>• Nếu kéo nhiều cột $\rightarrow$ Tìm kiếm đồng thời trên tất cả các cột đó. | Kéo: `tenkhachhang`, `Mã KH`, `brand`.<br>*(Khi gõ từ khóa "Dược", hệ thống tự tìm trên cả 3 cột)*. |
| **Sort 1/2/3 Dimension & Metric** | `DIMENSION` / `METRIC` | Thiết lập sắp xếp đa cấp 1, 2, 3 mặc định khi mở bảng.<br>• **Quy tắc:** Mỗi cấp chỉ chọn 1 Dimension **HOẶC** 1 Metric.<br>• Chiều tăng/giảm cấu hình ở tab Style (`sort1Direction`). | • Sort 1: Kéo `Ngày Giao` (Style: `desc` - Mới nhất lên đầu).<br>• Sort 2: Kéo `Doanh Số` (Style: `desc` - Doanh số cao lên đầu).<br>• Sort 3: Kéo `Tên KH` (Style: `asc` - Theo thứ tự A-Z). |
| **Rule Format 1/2/3 Dimension & Metric** | `DIMENSION` / `METRIC` | Chọn trường áp dụng **quy tắc tô màu có điều kiện** (Conditional Formatting).<br>• Cấu hình kiểu tô màu chi tiết ở tab Style. | • Rule 1 Metric: Kéo `Tỷ Lệ Tăng Trưởng` (Style: `color_pos_neg` - Dương xanh lá, Âm đỏ).<br>• Rule 2 Metric: Kéo `Doanh Số` (Style: `color_scale_green` - Gradient màu).<br>• Rule 3 Dimension: Kéo `Trạng Thái` (Style: `badge_soft` - Thẻ badge mềm). |
| **🎨 Tô Màu Cột Nhóm 1, 2, 3** | `DIMENSION` / `METRIC` | Gán các cột vào 3 nhóm màu Header/Data riêng biệt theo nhận diện thương hiệu MERAP (Teal / Navy / Gray). | • Nhóm 1 (Dimension): Kéo `brand`, `classid` $\rightarrow$ Style: Nền Header Teal `#009B9E`, chữ trắng, in đậm.<br>• Nhóm 2 (Metric): Kéo `Doanh Số` $\rightarrow$ Style: Nền Header Navy `#202657`, chữ trắng.<br>• Nhóm 3 (Metric): Kéo `Lợi Nhuận` $\rightarrow$ Style: Căn lề phải, in đậm. |
| **📌 Ghim Cố Định Cột (`freezeDimensions`)** | `DIMENSION` | Chọn các cột Dimension muốn **cố định bên trái (Sticky Freeze)** khi cuộn ngang bảng. | Kéo: `Mã Khách Hàng`, `Tên KH` $\rightarrow$ 2 cột này sẽ đứng yên bên trái khi cuộn xem các cột số liệu bên phải. |

---

### 10.2. 🎨 Hướng Dẫn Tab STYLE (Định Dạng & Tùy Biến Giao Diện)

#### 1. 🧮 Cấu Hình Dòng Tổng Hợp (Summary Row)

| Tùy Chọn Trong Style | Ý Nghĩa & Các Giá Trị | Ví Dụ Cấu Hình |
| :--- | :--- | :--- |
| **Hiện dòng Tổng cộng (`showSummaryRow`)** | Bật/tắt dòng tổng hợp. | `true` (Bật) |
| **Vị trí dòng Tổng (`summaryPosition`)** | `top` (Đầu bảng - sticky dưới header) hoặc `bottom` (Chân bảng). | `top` (Tiện theo dõi ngay khi mở bảng lớn). |
| **Nhãn dòng tổng (`summaryLabel`)** | Tên hiển thị tại ô STT của dòng tổng. | Mặc định: `Tổng cộng` hoặc tùy chỉnh: `Grant`, `Grand Total`, `Tổng`. |
| **Phép tính mặc định (`summaryType`)** | Phép tính toàn cục cho các cột Metric chưa có cấu hình riêng (`sum`, `avg`, `min`, `max`, `count`, `countd`). | `sum` (Tổng cộng) |
| **Phép tính từng Cột (`perColumnSummary`)** | Ghi đè phép tính riêng cho từng cột (**Hỗ trợ cả Dimension & Metric**).<br>• Cú pháp: `Tên Cột:agg` (hoặc `fieldId:agg`).<br>• Danh sách agg: `sum`, `avg`, `min`, `max`, `count`, `countd` / `distinct`. | **Ví dụ mẫu:**<br>`brand:countd, Mã KH:countd, Doanh Thu:sum, Số Lượng:sum, Đơn Giá:avg, Năm:sum`<br><br>*(Kết quả: Cột `brand` và `Mã KH` đếm số lượng duy nhất; `Doanh Thu` & `Số Lượng` tính tổng; `Đơn Giá` tính trung bình)*. |

---

#### 2. 📅 Định Dạng Ngày Tháng (`perColumnDateFormat`) — Chuẩn BigQuery

Sử dụng chuỗi định dạng phần tử BigQuery (`%d`, `%m`, `%Y`, `%H`, `%M`, `%S`):
- **Cú pháp:** `Tên Cột:pattern, Tên Cột 2:pattern`

| Mục Đích Định Dạng | Cú Pháp Mẫu | Dữ Liệu Gốc | Hiển Thị Trên Bảng |
| :--- | :--- | :--- | :--- |
| **Ngày/Tháng/Năm (Chuẩn VN)** | `Ngày Giao:%d/%m/%Y` | `20260815` hoặc `2026-08-15` | `15/08/2026` |
| **Ngày-Tháng-Năm Giờ:Phút:Giây** | `Created At:%d-%m-%Y %H:%M:%S` | `2026-08-15 14:30:00` | `15-08-2026 14:30:00` |
| **Tháng/Năm** | `Tháng:%m/%Y` | `202608` | `08/2026` |
| **Tên tháng tiếng Anh** | `Tháng:%B %Y` | `202608` | `August 2026` |

---

#### 3. 💰 Định Dạng Số & Tiền Tệ (`perColumnNumberFormat`) — Chuẩn BigQuery / Format

- **Cú pháp:** `Tên Cột:pattern, Tên Cột 2:pattern`

| Kiểu Định Dạng | Cú Pháp Mẫu | Giá Trị Gốc | Hiển Thị Trên Bảng |
| :--- | :--- | :--- | :--- |
| **Số nguyên có dấu phẩy ngàn** | `Số Lượng:%'d` hoặc `%'.0f` | `12500` | `12,500` |
| **Số thực 2 chữ số thập phân** | `Đơn Giá:%'.2f` | `45000.5` | `45,000.50` |
| **Tiền tệ VNĐ** | `Doanh Số:vnd` hoặc `%'.0f ₫` | `3750000` | `3,750,000 ₫` |
| **Tiền tệ USD** | `Doanh Thu:usd` hoặc `$%'.2f` | `150.5` | `$150.50` |
| **Tỷ lệ Phần Trăm (%)** | `Tỷ Lệ Tăng Trưởng:%'.2f%%` hoặc `percent_2` | `0.156` | `15.60%` |
| **Rút gọn triệu/tỷ (Compact KMB)** | `Doanh Số:compact` hoặc `kmb` | `2500000000` | `2.5B` |

---

#### 4. 🎨 Kiểu Định Dạng Màu Có Điều Kiện (Conditional Rule Styles)

Khi kéo trường vào `Rule Format 1/2/3` bên Setup, chọn kiểu định dạng trong Style:

| Kiểu Định Dạng (`ruleStyle`) | Ứng Dụng Thực Tế & Hiển Thị |
| :--- | :--- |
| **`color_pos_neg` (Âm đỏ, Dương xanh lá)** | Dùng cho cột tăng trưởng/lợi nhuận: Số $> 0$ chữ màu xanh lá (`#16a34a`), số $< 0$ chữ màu đỏ (`#dc2626`). |
| **`color_scale_green` / `color_scale_blue`** | Dải gradient nhiệt độ: Giá trị càng lớn màu nền xanh càng đậm (nhận diện nhanh Top doanh số). |
| **`badge_soft` (Thẻ trạng thái viền mềm)** | Dùng cho cột phân loại (`Hoàn thành`, `Đang xử lý`, `Đã hủy`): Hiển thị dạng thẻ pill viền bo tròn đẹp mắt. |
| **`threshold_target` (So sánh ngưỡng mục tiêu)** | So sánh với giá trị ngưỡng: Đạt $\ge$ ngưỡng tô màu xanh, chưa đạt tô màu đỏ. |

---

#### 5. 📐 Tùy Biến Bảng & Phân Trang (Layout & Typography)

- **Cỡ chữ (`fontSize`):** `12px` (Nhỏ) $\rightarrow$ `16px` (Chuẩn MERAP) $\rightarrow$ `20px` (Lớn).
- **Mật độ dòng (`rowDensity`):**
  - `compact`: Chiều cao dòng gọn (32px), xem được nhiều dòng nhất trên màn hình.
  - `normal`: Chiều cao dòng chuẩn (40px).
  - `relaxed`: Chiều cao dòng rộng rãi, thoáng mắt (48px).
- **Kiểu viền bảng (`tableVariant`):**
  - `bordered`: Kẻ đầy đủ đường viền ô (chuẩn bảng Excel báo cáo).
  - `striped`: Tô màu xen kẽ giữa các dòng chẵn/lẻ.
  - `simple`: Tối giản viền ngang.
- **Tự động ngắt dòng (`textWrap`):**
  - `false` (Nowrap): Giữ nội dung trên 1 dòng duy nhất, vượt quá hiện dấu `...` (kéo giãn độ rộng để xem).
  - `true` (Wrap): Tự động xuống dòng khi nội dung text dài.
- **Độ rộng tối đa cột (`colMaxWidth`):** `300px` (mặc định), `400px` hoặc `none` (không giới hạn).



