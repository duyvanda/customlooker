# 📊 Custom Looker Studio Table Viz - Hướng Dẫn Vận Hành & Quy Tắc Dự Án

---

## 1. 📌 Thông Tin Môi Trường
- **Production Manifest Path:** `gs://analytics_merap/excelchart3`
- **GitHub Repo:** `https://github.com/duyvanda/customlooker.git` (branch `main`)
- **Python:** `D:\ipython_file\.venv\Scripts\python.exe` | **SSH:** `biserver@27.74.242.21`
- **Màu sắc thương hiệu MERAP:** Teal (`#009B9E`), Navy (`#202657`).

---

## 2. 📁 Cấu Trúc Thư Mục
```text
D:\customLooker/
├── src/
│   ├── index.js              # Source JS chính (Data Pipeline, Freeze, Sorters, Filter, Summary)
│   └── index.css             # Source CSS chính (Design System, Sticky, Badges)
├── index.bundle.v3.1.js      # JS bundle active trên GCS
├── index.v3.1.css            # CSS active trên GCS
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
2. **File Versioning (JS + CSS song song):** Khi có code mới, **BẮT BUỘC đổi tên cả JS và CSS** (ví dụ: `v3.20`) trong `webpack.config.js`, `manifest.json` và GCS. Nếu chỉ đổi JS mà giữ nguyên CSS, Google CDN sẽ trả về CSS cũ làm vỡ giao diện.
3. **TUYỆT ĐỐI KHÔNG tự ý Deploy & Git:** Chỉ build và đóng gói bundle cục bộ; **KHÔNG ĐƯỢC TỰ Ý** chạy lệnh deploy lên GCS (`gsutil cp ...`) hoặc `git commit` / `git push` trừ khi có yêu cầu rõ ràng từ User.
4. **Bảo toàn số 0 ở đầu:**
   - Excel: Cell type `t: 's'`, format `@` (`z: '@'`).
   - CSV: Dùng công thức `="0123"` + tiền tố BOM UTF-8 `\uFEFF`.
5. **Nút Xuất Excel (>200k dòng):** Tự động chuyển màu đỏ cảnh báo (`btn-excel-danger`) và hướng dẫn dùng CSV để tránh crash trình duyệt.
6. **devMode:** Luôn để `"devMode": false` trên Production để kích hoạt Google Edge CDN.

---

## 4. 🧮 Quy Tắc Dữ Liệu & Tính Toán Dòng Tổng Hợp (Summary Row)

1. **Phạm vi tính toán:** Bắt buộc tính trên toàn bộ dữ liệu đã lọc (`sortedRows`, có thể lên đến hàng chục nghìn dòng), **tuyệt đối không** tính trên trang hiển thị hiện tại (`pageRows`).
2. **Thứ tự ưu tiên phép tính Metric (Aggregation Priority):**
   - **Ưu tiên 1 (Cao nhất - Ghi đè tùy chọn):** Cấu hình text ghi đè trong Style panel (`perColumnSummary`). Hỗ trợ trực tiếp:
     - Tên cột tiếng Việt (có dấu / không dấu / không phân biệt hoa thường): `Doanh Thu:avg, Số Lượng:sum, don gia:min`.
     - Mã trường (Field ID): `qt_met1:min`.
   - **Ưu tiên 2 (Mặc định tự động):** Metadata `f.aggregation` trả về từ Looker Studio (SUM, AVG, MIN, MAX, COUNT) do người dùng chọn bên Setup.
   - **Ưu tiên 3 (Fallback):** Cấu hình dropdown mặc định toàn cục `summaryType`.
3. **Xử lý số thực & chữ số thập phân (Decimal Places):**
   - Dùng `parseNumericValue(val, col.type)` để bóc tách chính xác mọi định dạng số (có dấu phẩy/chấm phân cách ngàn).
   - Số chữ số thập phân khi hiển thị:
     - `COUNT`: Luôn là `0` chữ số thập phân.
     - `AVG`: Tối thiểu `2` chữ số thập phân (tối đa 6) do tính chất phép chia tạo số lẻ.
     - `SUM / MIN / MAX`: Tự động nhận diện theo độ chính xác của dữ liệu gốc (`maxDecimalPlaces`).
4. **Typography & Styling dòng Tổng hợp:**
   - Base `.summary-row th/td` reset `font-weight: 400` để không bị double-bold từ header.
   - Nhãn dòng tổng: dùng class `.summary-label` (chữ nghiêng *italic*, màu `#64748b`).
   - Số liệu tổng: dùng class `.summary-number` (`font-weight: 600`, `font-variant-numeric: tabular-nums`).
   - Biểu tượng: dùng class `.summary-sigma` (màu Merap Teal `#009B9E`).

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

## 6. 🚀 Quy Trình Build & Deploy Khi Có Cập Nhật (Ví dụ lên `v3.20`)

Chạy các lệnh sau trong PowerShell tại `D:\customLooker`:

```powershell
# 1. Cập nhật output.filename trong webpack.config.js -> 'index.bundle.v3.20.js'
# 2. Tạo bản copy CSS và JSON mới
Copy-Item 'src/index.css' 'index.v3.20.css' -Force
Copy-Item 'index.json' 'index.v3.20.json' -Force

# 3. Cập nhật manifest.json:
#    "js":     "gs://analytics_merap/excelchart3/index.bundle.v3.20.js"
#    "css":    "gs://analytics_merap/excelchart3/index.v3.20.css"
#    "config": "gs://analytics_merap/excelchart3/index.v3.20.json"
#    "devMode": false

# 4. Build Webpack
npm run build

# 5. Dọn dẹp file version cũ vào archive/
Move-Item -Path "index.bundle.v3.19.js", "index.v3.19.css", "index.v3.19.json" -Destination "archive/" -Force -ErrorAction SilentlyContinue

# 6. Đóng gói ZIP
Remove-Item -Path "customLooker.zip" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "src", "downloader.html", "index.v3.20.css", "index.json", "index.v3.20.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.v3.20.js", "AGENTS.md", "cai_tien.md", "changelog", "archive" -DestinationPath "customLooker.zip" -Force

# 7. Deploy lên GCS Production (CHỈ KHI USER YÊU CẦU)
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.v3.20.js" "index.v3.20.css" "index.v3.20.json" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart3/
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
      { "id": "qt_met3", "name": "Doanh Số Nhỏ Nhất", "type": "NUMBER", "aggregation": "MIN" }
    ],
    "searchFields": [
      { "id": "qt_dim1", "name": "Mã Khách Hàng", "type": "TEXT" }
    ]
  }
}
```

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

