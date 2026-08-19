# 📋 KẾ HOẠCH TRIỂN KHAI TÍNH NĂNG HYPERLINK (CHUẨN MARKDOWN)
**Dự án:** Custom Looker Studio Table Viz (`D:\customLooker`)  
**Mục tiêu:** Hỗ trợ render liên kết Hyperlink tự động từ chuỗi chuẩn Markdown `[Label](URL)` và URL thuần, đảm bảo trải nghiệm hiển thị web đẹp mắt, an toàn XSS và bảo toàn link khi xuất file Excel/CSV.

---

## 🎯 1. Yêu Cầu Tính Năng
1. **Chuẩn Markdown chính thức:** `[Tên hiển thị](Đường link URL)` (ví dụ `[BV Chợ Rẫy](https://crm.merap.com/kh/101)`).
2. **Hỗ trợ URL thuần:** Tự nhận diện chuỗi URL bắt đầu bằng `http://`, `https://`, `mailto:`, `tel:`.
3. **Bảo mật & An toàn (XSS):** Validate URL bằng `URL constructor` + whitelist protocol. Escape HTML attribute riêng biệt cho `href`.
4. **Trải nghiệm giao diện (UI/UX):** Màu xanh MERAP Teal (`#00A79D`), kèm icon mở tab mới, hover gạch chân, click không kích hoạt sort cột (`stopPropagation`).
5. **Sắp xếp (Sorting):** `sorters.js` giữ nguyên. Xử lý sort value ở `index.js` qua `getCellSortValue()`, tận dụng lazy cache.
6. **Xuất file Excel/CSV:**
   - **Excel (`.xlsx`):** Ô hiển thị URL (text thuần).
   - **CSV (`.csv`):** Xuất text `Label` (hoặc URL nếu là URL thuần).

---

## 📁 2. Chi Tiết Các File Cần Sửa & Nội Dung Thay Đổi

```text
D:\customLooker/
├── src/
│   ├── formatters.js   # [1] parseHyperlink + looksLikeHyperlink + sanitizeUrl + escapeHtmlAttribute
│   ├── index.js        # [2] Lazy cache (WeakMap) + getCellSortValue + export Excel/CSV
│   ├── rules.js        # [3] formatTableCell() render thẻ <a> dùng cache
│   └── index.css       # [4] CSS styling cho .table-cell-link
```

---

### 🔹 File 1: `src/formatters.js`

**Thêm hàm `looksLikeHyperlink` — cheap guard O(1):**
```javascript
export function looksLikeHyperlink(val) {
    if (typeof val !== 'string') return false;
    const s = val.trim();
    return (
        s.startsWith('[') ||
        /^https?:\/\//i.test(s) ||
        /^mailto:/i.test(s) ||
        /^tel:/i.test(s)
    );
}
```

**Thêm `sanitizeUrl` + `parseHyperlink`:**
```javascript
const SAFE_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];

function sanitizeUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return SAFE_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
}

export function parseHyperlink(val) {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    if (!str) return null;

    // 1. Chuẩn Markdown: [Label](URL)
    const mdMatch = str.match(/^\[([^\]]+)\]\(\s*(\S+)\s*\)$/i);
    if (mdMatch) {
        const url = sanitizeUrl(mdMatch[2].trim());
        if (url) return { isLink: true, label: mdMatch[1].trim(), url };
    }

    // 2. URL thuần
    const urlMatch = str.match(/^(https?:\/\/\S+|mailto:\S+|tel:\S+)$/i);
    if (urlMatch) {
        const url = sanitizeUrl(urlMatch[1]);
        if (url) return { isLink: true, label: urlMatch[1], url };
    }

    return null;
}
```

**Thêm `escapeHtmlAttribute` — escape riêng cho context HTML attribute:**
```javascript
export function escapeHtmlAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
```

**Cập nhật `isNumericValue` và `isDateValue`:** Dùng cheap guard trước, không gọi `parseHyperlink` vô điều kiện:
```javascript
// Thêm vào đầu isNumericValue() và isDateValue()
if (looksLikeHyperlink(val) && parseHyperlink(val)) return false;
```

---

### 🔹 File 2: `src/index.js` (Lazy Cache + Sort + Export)

**Lazy hyperlink cache — WeakMap, reset khi nhận data mới:**
```javascript
let hyperlinkMetaCache = new WeakMap();

// Gọi khi Looker gửi dataset mới (đầu drawVisualization):
hyperlinkMetaCache = new WeakMap();

function getHyperlinkMeta(row, rawIndex) {
    let rowCache = hyperlinkMetaCache.get(row);
    if (!rowCache) {
        rowCache = new Map();
        hyperlinkMetaCache.set(row, rowCache);
    }
    if (rowCache.has(rawIndex)) return rowCache.get(rawIndex);
    const result = parseHyperlink(row[rawIndex]);
    rowCache.set(rawIndex, result);
    return result;
}
```
> ✅ 288k rows × 50 cột: chỉ parse hyperlink cho rows/cột đang hiển thị trên page, không parse toàn bộ.

**`getCellSortValue` — dùng cache khi sort column TEXT:**
```javascript
function getCellSortValue(row, col) {
    if (col.type !== 'TEXT') return row[col.rawIndex];
    const link = getHyperlinkMeta(row, col.rawIndex);
    return link ? link.label : row[col.rawIndex];
}

// Trong comparator sort:
return dir * compareValues(
    getCellSortValue(rowA, overrideCol),
    getCellSortValue(rowB, overrideCol),
    overrideCol.type
);
```
> Khi sort 288k rows, hyperlink của cột đang sort được parse tối đa 1 lần/row rồi cache. Các cột khác không bị đụng.

**Export:**
- `exportExcel`: Nếu ô là Hyperlink → xuất `link.url` (text, type `'s'`).
- `exportCsv`: Nếu ô là Hyperlink → xuất `link.label` (hoặc URL nếu là URL thuần).

---

### 🔹 File 3: `src/rules.js`

**Cập nhật `formatTableCell(...)`** — dùng `getHyperlinkMeta` thay vì `parseHyperlink` trực tiếp:
```javascript
const link = getHyperlinkMeta(row, rawIndex);
if (link) {
    const safeLabel = escapeHtml(link.label);
    const safeUrl = escapeHtmlAttribute(link.url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
               class="table-cell-link"
               onclick="event.stopPropagation()"
            >${safeLabel}<svg class="link-icon" viewBox="0 0 24 24" width="11" height="11"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
               <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
               <polyline points="15 3 21 3 21 9"></polyline>
               <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg></a>`;
}
```

---

### 🔹 File 4: `src/index.css`

```css
.table-cell-link {
    color: #00A79D;
    text-decoration: none;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    transition: color 0.15s ease;
}
.table-cell-link:hover {
    color: #007a7d;
    text-decoration: underline;
}
.table-cell-link .link-icon {
    opacity: 0.65;
    flex-shrink: 0;
    transition: transform 0.15s ease, opacity 0.15s ease;
}
.table-cell-link:hover .link-icon {
    opacity: 1;
    transform: translate(1px, -1px);
}
```

---

## ⚡ 3. Các Bước Thực Hiện
1. Cập nhật `src/formatters.js` — thêm `looksLikeHyperlink`, `parseHyperlink`, `sanitizeUrl`, `escapeHtmlAttribute` + guard `isNumericValue`/`isDateValue`.
2. Cập nhật `src/index.js` — thêm WeakMap lazy cache, `getHyperlinkMeta`, `getCellSortValue`; cập nhật comparator sort; cập nhật export Excel/CSV.
3. Cập nhật `src/rules.js` — dùng `getHyperlinkMeta` trong `formatTableCell`, render `<a>` tag.
4. Cập nhật `src/index.css` — thêm style `.table-cell-link`.
5. Chạy `npm run build` xác nhận build thành công.
6. Ghi log Walkthrough vào `changelog/`.
