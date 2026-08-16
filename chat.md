Ừ, mình đã **sign-off bản `customLooker(2).zip`** trước, chưa xét phần Allow/F5.

## Kết quả: **CHƯA sign-off production 100% — khoảng 90%**

Các fix chính đã apply **đúng**:

* `src/export.js`: handshake `PING → PONG → payload 1 lần → ACK` ✅
* Không còn `excelDataObjects` duplicate ✅
* `src/index.js`: cache filter/sort ✅
* Cache summary ✅
* Search debounce 250ms ✅
* Chặn `Tất cả` khi >5.000 rows ✅
* Export async/yield mỗi 5.000 rows ✅
* Chặn Excel >1.048.576 rows ✅
* `downloader.html`: SheetJS 0.20.3 ✅
* Dense worksheet ✅
* CSV chunk 5.000 rows ✅
* Bundle `index.bundle.v3.32.js` **đã chứa code fix mới** ✅
* `node --check` source + bundle đều PASS ✅

Nhưng mình thấy **2 chỗ nên fix trước production**.

### 1. HIGH — CSV Formula Injection

Trong `downloader.html`, hiện tại:

```js
function escapeCsvCell(val) {
    if (val === null || val === undefined || val === '') return '';

    const s = String(val);

    if (/^0\d+$/.test(s.trim()))
        return `="${s.trim()}"`;

    if (
        s.includes(',') ||
        s.includes('"') ||
        s.includes('\n') ||
        s.includes('\r')
    ) {
        return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
}
```

Nếu data có:

```text
=HYPERLINK(...)
+cmd...
@SUM(...)
```

CSV mở trong Excel có thể bị hiểu là formula.

Nên sửa thành:

```js
function escapeCsvCell(val) {
    if (val === null || val === undefined || val === '') {
        return '';
    }

    const originalIsString = typeof val === 'string';
    let s = String(val);

    // Bảo toàn số 0 đầu.
    // Chỉ cho phép công thức dạng ="0123" khi nội dung 100% là chữ số.
    if (/^0\d+$/.test(s.trim())) {
        return `="${s.trim()}"`;
    }

    // Chống CSV / Formula Injection.
    // Numeric thật (number) như -123 vẫn giữ là số.
    if (
        originalIsString &&
        /^[=+\-@\t\r]/.test(s)
    ) {
        s = "'" + s;
    }

    if (
        s.includes(',') ||
        s.includes('"') ||
        s.includes('\n') ||
        s.includes('\r')
    ) {
        return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
}
```

**Chỗ này mình khuyên bắt buộc sửa.**

---

### 2. HIGH — downloader vẫn giữ 288k rows trong RAM sau khi tải xong

Trong `downloader.html` hiện có:

```js
globalData = {
    headers,
    rows,
    fileName,
    filterInfo,
    columnWidths,
    isCsv
};
```

Sau khi Excel tải xong, `globalData.rows` vẫn giữ nguyên toàn bộ:

```text
288,151 rows
```

cho đến khi user đóng downloader tab.

Nghĩa là fix đã giảm peak RAM khá nhiều, nhưng sau export browser vẫn có thể giữ hàng trăm MB.

Trong `processPayload()` sau đoạn:

```js
const isHeavy = rows.length > 200000;
```

mình đề xuất thêm cuối function:

```js
// Dataset lớn: giải phóng raw rows sau khi file đã tạo xong.
// Tránh tab downloader giữ hàng trăm MB RAM vô thời hạn.
if (isHeavy && success) {
    setTimeout(() => {
        if (globalData) {
            globalData.rows = null;
            globalData.columnWidths = null;
        }

        if (btnExcelEl) {
            btnExcelEl.disabled = true;
            btnExcelEl.textContent =
                '✓ Đã tải Excel - xuất lại từ báo cáo';
        }

        if (btnCsvEl) {
            btnCsvEl.disabled = true;
            btnCsvEl.textContent =
                '✓ Đã tải - xuất lại từ báo cáo';
        }
    }, 0);
}
```

Và sửa 2 nút tải lại:

**Cũ:**

```js
if (!globalData) return;
```

**Mới:**

```js
if (
    !globalData ||
    !Array.isArray(globalData.rows)
) {
    return;
}
```

Với data <200k thì vẫn giữ tính năng:

```text
Tải lại Excel
Tải lại CSV
```

Với >200k thì tải xong giải phóng RAM.

Mình thấy cách này hợp lý hơn cho project của bạn.

---

### Có một tối ưu nhỏ nữa mình khuyên apply

Trong `drawVisualization()` hiện tại:

```js
function drawVisualization(data) {
    try {
        currentData = data;

        ...
```

Nên clear cache cũ khi Looker gửi dataset mới:

```js
function drawVisualization(data) {
    try {

        if (currentData !== data) {
            processedRowsCache.dataRef = null;
            processedRowsCache.key = '';
            processedRowsCache.rows = null;

            summaryCache.rowsRef = null;
            summaryCache.key = '';
            summaryCache.result = null;
        }

        currentData = data;

        if (renderRafId) {
            cancelAnimationFrame(renderRafId);
        }

        renderRafId = requestAnimationFrame(() => {
            renderTable();
        });

    } catch (err) {
        console.error(
            '[ExcelViz] drawVisualization error:',
            err
        );
    }
}
```

Lợi ích khi user đổi:

```text
Date Range
Filter
Dimension
Metric
```

dataset mới tới thì cache 288k rows cũ được nhả reference ngay, tránh giữ **old dataset + new dataset** cùng lúc lâu hơn cần thiết.

---

## Còn một cleanup nhưng không chặn production

`package.json` vẫn có:

```json
"xlsx": "^0.18.5"
```

nhưng source Webpack **không hề import `xlsx`** nữa.

`downloader.html` đang dùng:

```html
https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
```

Vậy dependency này thừa. Có thể bỏ:

```bash
npm uninstall xlsx
```

rồi commit lại:

```text
package.json
package-lock.json
```

Không ảnh hưởng runtime hiện tại.

---

### Sign-off cuối của mình

Sau khi fix **CSV injection + release `globalData.rows` >200k**, mình sẽ cho bản này:

**🟢 SIGN-OFF production cho performance fix v3.32.**

Architecture lúc đó sẽ khá ổn:

```text
Looker 288k
   ↓
cache filter/sort
   ↓
exportRows 1 bản
   ↓
PING/PONG
   ↓
postMessage 1 lần
   ↓
Downloader
   ↓
Dense XLSX / Chunk CSV
   ↓
Download
   ↓
release 288k rows khỏi RAM
```

Một caveat duy nhất: mình xác nhận bundle hiện tại có các fingerprint của code mới và syntax PASS, nhưng mình **chưa rebuild clean từ `npm ci` trong môi trường này** vì install dependency bị timeout. Vì vậy sau 2 chỉnh sửa trên, ở máy của bạn nên chạy lại `npm run build`, rồi mình sign-off lần cuối trước khi upload GCS.
