# 📊 Custom Looker Studio Table Viz - Hướng Dẫn Vận Hành & Quy Tắc Dự Án

---

## 1. 📌 Thông Tin Môi Trường
- **Production Manifest Path:** `gs://analytics_merap/excelchart3`
- **GitHub Repo:** `https://github.com/duyvanda/customlooker.git` (branch `main`)
- **Python:** `D:\ipython_file\.venv\Scripts\python.exe` | **SSH:** `biserver@27.74.242.21`

---

## 2. 📁 Cấu Trúc Thư Mục
```text
D:\customLooker/
├── src/
│   ├── index.js              # Source JS chính (Data Pipeline, Freeze, Sorters, Filter)
│   └── index.css             # Source CSS chính
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
2. **File Versioning (JS + CSS song song):** Khi có code mới, **BẮT BUỘC đổi tên cả JS và CSS** (ví dụ: `v3.3`) trong `webpack.config.js`, `manifest.json` và GCS. Nếu chỉ đổi JS mà giữ nguyên CSS, Google CDN sẽ trả về CSS cũ làm vỡ giao diện.
3. **TUYỆT ĐỐI KHÔNG tự ý Deploy & Git:** Chỉ build và đóng gói bundle cục bộ; **KHÔNG ĐƯỢC TỰ Ý** chạy lệnh deploy lên GCS (`gsutil cp ...`) hoặc `git commit` / `git push` trừ khi có yêu cầu rõ ràng từ User.
4. **Bảo toàn số 0 ở đầu:**
   - Excel: Cell type `t: 's'`, format `@` (`z: '@'`).
   - CSV: Dùng công thức `="0123"` + tiền tố BOM UTF-8 `\uFEFF`.
5. **Nút Xuất Excel (>200k dòng):** Tự động chuyển màu đỏ cảnh báo (`btn-excel-danger`) và hướng dẫn dùng CSV để tránh crash trình duyệt.
6. **devMode:** Luôn để `"devMode": false` trên Production để kích hoạt Google Edge CDN.

---

## 4. 🚀 Quy Trình Build & Deploy Khi Có Cập Nhật (Ví dụ lên `v3.3`)

Chạy các lệnh sau trong PowerShell tại `D:\customLooker`:

```powershell
# 1. Cập nhật output.filename trong webpack.config.js -> 'index.bundle.v3.3.js'
# 2. Tạo bản copy CSS và JSON mới
Copy-Item 'src/index.css' 'index.v3.3.css' -Force
Copy-Item 'index.json' 'index.v3.3.json' -Force

# 3. Cập nhật manifest.json:
#    "js":     "gs://analytics_merap/excelchart3/index.bundle.v3.3.js"
#    "css":    "gs://analytics_merap/excelchart3/index.v3.3.css"
#    "config": "gs://analytics_merap/excelchart3/index.v3.3.json"
#    "devMode": false

# 4. Build Webpack
npm run build

# 5. Dọn dẹp file version cũ vào archive/
Move-Item -Path "index.bundle.v3.2.js", "index.v3.2.css", "index.v3.2.json" -Destination "archive/" -Force -ErrorAction SilentlyContinue

# 6. Đóng gói ZIP
Remove-Item -Path "customLooker.zip" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "src", "downloader.html", "index.v3.3.css", "index.json", "index.v3.3.json", "manifest.json", "package.json", "webpack.config.js", "index.bundle.v3.3.js", "AGENTS.md", "cai_tien.md", "changelog", "archive" -DestinationPath "customLooker.zip" -Force

# 7. Deploy lên GCS Production (CHỈ KHI USER YÊU CẦU)
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" -m cp -a public-read "index.bundle.v3.3.js" "index.v3.3.css" "index.v3.3.json" "downloader.html" "index.json" "manifest.json" gs://analytics_merap/excelchart3/
```

---

## 5. 📝 Quy Tắc Walkthrough & Git
- Mỗi phiên làm việc phải tạo/cập nhật 1 file walkthrough tại `changelog/yyyymmdd_hhmmss_walkthrough.md`.
- **CHỈ deploy và sử dụng git khi được User yêu cầu rõ ràng.**
- Khi commit git, commit message luôn viết bằng tiếng Việt.
