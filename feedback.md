Có. Với **Freeze Column**, em đề xuất cũng cho editor chọn field ở **Setup**, không lưu runtime.

### `index.json`

Thêm một nhóm Setup:

```text
FREEZE COLUMNS

Freeze dimensions
[ Employee ]
[ Department ]
[ + Add dimension ]

Freeze metrics
[ Revenue ]
[ + Add metric ]
```

Do Looker không có generic `FIELD`, implementation dùng 2 selector:

```text
freezeDimensions   max: 5
freezeMetrics      max: 5
```

JS gom lại theo `field.id`, nhưng **giữ thứ tự thật của Table Data**, không theo thứ tự hai selector.

Ví dụ Table:

```text
Employee | Department | Email | Revenue | KPI
```

Setup chọn:

```text
Freeze dimensions:
Employee
Department

Freeze metrics:
Revenue
```

Thì frozen fields:

```text
Employee
Department
Revenue
```

theo thứ tự chúng xuất hiện trong table.

---

### `src/index.js`

Thêm resolver:

```js
const freezeFieldIds = new Set([
    ...(data.fields?.freezeDimensions || []),
    ...(data.fields?.freezeMetrics || [])
].map(f => f.id));
```

Khi render header/cell:

```js
if (freezeFieldIds.has(column.fieldId)) {
    th.classList.add('frozen-column');
    td.classList.add('frozen-column');
}
```

Nhưng cần tính `left` động:

```text
Column frozen 1 → left: 0
Column frozen 2 → left: width(column 1)
Column frozen 3 → left: width(1) + width(2)
```

Tạo helper kiểu:

```js
applyFrozenColumnOffsets();
```

chạy sau khi table render.

Nên dùng `ResizeObserver` để khi Looker resize chart hoặc width cột thay đổi thì tính lại offset.

---

### `index.css`

Thêm sticky:

```css
.frozen-column {
    position: sticky;
    z-index: 3;
    background: inherit;
}
```

Header frozen cần cao hơn:

```css
thead .frozen-column {
    z-index: 6;
}
```

Cell giao giữa **sticky header + frozen column** phải có z-index cao nhất để không bị đè.

Có thể thêm shadow ở cột frozen cuối:

```css
.frozen-column-last {
    box-shadow: 4px 0 6px rgba(0,0,0,.08);
}
```

để nhìn rõ ranh giới vùng freeze.

---

### Behavior với Hide Column

Freeze lấy theo `field.id`, nên runtime hide không làm lệch.

Ví dụ:

```text
Freeze:
Employee
Department
Revenue
```

Viewer hide Department:

```text
Employee | Revenue
```

thì offset tự tính lại:

```text
Employee → left 0
Revenue  → left width(Employee)
```

Department vẫn nằm trong Setup nhưng vì đang hidden nên không tham gia render/freeze.

F5:

```text
hidden state reset
→ Department hiện lại
→ freeze lại tự động
```

---

### Một rule em khuyên áp dụng

**Không di chuyển column khi freeze.**

Nếu Table Data là:

```text
Employee | Email | Department | Revenue
```

và editor chọn freeze:

```text
Employee
Department
```

thì vẫn giữ thứ tự table:

```text
Employee | Email | Department | Revenue
```

chỉ Employee + Department có sticky behavior.

Nếu muốn UX giống Excel hơn, tốt nhất editor nên đặt các cột muốn freeze về bên trái ngay trong **Setup Table Data**.

---

### Các file cần sửa

| File              | Modify                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `index.json`      | thêm `freezeDimensions`, `freezeMetrics` trong Setup                   |
| `src/index.js`    | resolve frozen field IDs + tính `left` sticky + recalc khi resize/hide |
| `index.css`       | sticky column, z-index, shadow                                         |
| `index.bundle.js` | build lại, không sửa tay                                               |
| `manifest.json`   | không đổi                                                              |

Vậy tổng architecture đang chốt sẽ là:

```text
SEARCH
→ Setup: 1 multi-select

SORT
→ Setup: 1 multi-select, max 3

CONDITIONAL
→ Setup: 1 multi-select, max 5

FREEZE
→ Setup: chọn các field cần freeze

STYLE
→ chỉ behavior / màu / direction / rule

RUNTIME
→ search text, header-sort override, hide column, pagination
```

Freeze cũng **không cần bất kỳ storage/persistence custom nào**.
