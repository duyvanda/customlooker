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
   - **Ưu tiên 1 (Cao nhất):** Cấu hình text ghi đè trong Style panel (`perColumnSummary` dạng `m1:sum,m2:avg,m3:min` với `m1` là metric đầu tiên trong danh sách Setup).
   - **Ưu tiên 2:** Metadata `f.aggregation` trả về từ Looker Studio (SUM, AVG, MIN, MAX, COUNT).
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
3. **Quy tắc bắt buộc trong Code để chống Lag:**
   - **Batching với `requestAnimationFrame` (RAF):** Cả `drawVisualization` và `ResizeObserver` đều **bắt buộc** phải bọc qua RAF để gom các lần render theo tần số quét màn hình, tránh re-render và re-sort dữ liệu lớn liên tục.
   - **CSS 100% Container Fit:** `.table-wrapper` và `#excelviz-app-root` luôn phải để `width: 100%; height: 100%; overflow: hidden;` (không dùng `100vh`) để khớp chính xác 100% với kích thước iframe do Bounding Box cấp.
4. **Mẹo hỗ trợ User khi cần chỉnh kích thước:**
   - **Sync nhanh không cần kéo:** Chọn biểu đồ mẫu + bảng Custom Viz -> Chuột phải -> **Make same size (Kích thước phù hợp)** -> **Height (Chiều cao)**.
   - **Kéo góc:** Kéo núm vuông ở góc dưới bên phải thay vì núm ở giữa cạnh đáy để hạn chế chuột lọt vào lòng iframe.
