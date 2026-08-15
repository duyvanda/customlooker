Ừ, **không freeze Metric**. Lần update tiếp theo em đề xuất giữ scope rất gọn: **fix logic còn sót + harden mapping + không thêm feature mới** trên bản `customLooker(3).zip`. 

## Plan update tiếp theo

### 1. `src/index.js` — Fix Conditional Formatting P0

Hiện phải đảm bảo rule chỉ chạy khi Setup đã bind field hợp lệ.

Sửa resolver theo nguyên tắc:

```js
const field = resolveConditionalField(...);

if (!field) {
    return null;
}

const rawIndex = findRawIndexForField(field, allHeaders);

if (rawIndex < 0) {
    return null;
}
```

Sau đó:

```js
const rules = [
    buildRule(1),
    buildRule(2),
    buildRule(3)
].filter(Boolean);
```

Kết quả:

```text
Rule bật + chưa chọn field
→ SKIP

Rule có field nhưng không map được Table Data
→ SKIP

Không bao giờ có rule rawIndex = -1
```

---

### 2. `src/index.js` — Validate Dimension/Metric cùng một slot

Áp dụng cho:

```text
Sort 1
Sort 2
Sort 3

Conditional Rule 1
Conditional Rule 2
Conditional Rule 3
```

Tạo helper chung:

```js
function resolveSingleSetupField(
    dimensionField,
    metricField,
    label
) {
    if (dimensionField && metricField) {
        return {
            field: null,
            error: `${label}: chỉ chọn Dimension hoặc Metric`
        };
    }

    return {
        field: dimensionField || metricField || null,
        error: null
    };
}
```

Không làm kiểu:

```js
dimension || metric
```

nữa vì nó che lỗi cấu hình.

Nếu editor chọn:

```text
Sort 1 Dimension = Department
Sort 1 Metric    = Revenue
```

thì:

```text
Sort 1 bị vô hiệu hóa
+ báo cấu hình không hợp lệ
```

không tự chọn Department.

---

### 3. Thêm warning cấu hình rất nhẹ

Không làm modal.

Nếu Setup sai, phía trên table chỉ hiện:

```text
⚠ Cấu hình chưa hợp lệ:
Sort 1 chỉ được chọn Dimension hoặc Metric.
```

Nếu có nhiều lỗi:

```text
⚠ Có 2 lỗi cấu hình trong Setup.
```

Có thể hover/xem chi tiết.

File:

```text
src/index.js
index.css
```

CSS nhỏ:

```css
.config-warning {
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 4px;
}
```

Không ảnh hưởng UI bình thường.

---

### 4. `src/index.js` — Runtime sort dùng `fieldId`

Đổi state từ:

```js
sortOverride = {
    rawIndex: 3,
    direction: 'asc'
};
```

sang:

```js
sortOverride = {
    fieldId: 'xxxx',
    direction: 'asc'
};
```

Mỗi render resolve lại:

```js
const overrideColumn = tableColumns.find(
    col => col.fieldId === runtimeState.sortOverride?.fieldId
);
```

Sau đó mới lấy:

```js
overrideColumn.rawIndex
```

Lợi ích:

```text
Editor reorder Setup
→ field vẫn đúng

Looker redraw
→ sort vẫn đúng

Rename field
→ sort vẫn đúng
```

---

### 5. Giữ Option B cho header sort

Không thay behavior:

```text
Default:
Setup Sort 1–3 + Style direction
```

Viewer click một header:

```text
Click 1 → ASC runtime
Click 2 → DESC runtime
Click 3 → clear runtime override
          ↓
          quay lại Sort 1–3 từ Setup
```

Khi runtime override tồn tại, nó **override toàn bộ default multi-sort**, không trộn với Sort 2/3.

Ví dụ:

```text
Default:
1 Revenue DESC
2 Department ASC
3 KPI DESC

Viewer click Employee
→ chỉ Employee ASC
```

Click lần 3:

```text
→ Revenue DESC
→ Department ASC
→ KPI DESC
```

---

### 6. `src/index.js` — Fix Metric fallback index

Trong `extractTableColumns()` sửa fallback metric.

Không:

```js
cols.length + metricIndex
```

vì `cols.length` thay đổi trong loop.

Dùng:

```js
const metricStartIndex = cols.length;

metrics.forEach((field, metricIndex) => {
    const rawIndex = findRawIndexForField(...);

    const actualIndex =
        rawIndex >= 0
            ? rawIndex
            : metricStartIndex + metricIndex;
});
```

Đảm bảo:

```text
Dimension:
0
1
2

Metric:
3
4
5
```

không nhảy thành:

```text
3
5
7
```

---

## 7. Freeze — giữ Dimension only

Không thêm:

```text
freezeMetrics
```

Không thêm bất kỳ logic Metric freeze nào.

Giữ đúng:

```text
SETUP

Freeze columns
[ Dimension A ]
[ Dimension B ]
[ Dimension C ]
```

JS:

```js
data.fields?.freezeDimensions || []
```

Freeze chỉ áp dụng cho Dimension.

Behavior hiện tại giữ:

```text
📌 sticky
ResizeObserver
dynamic left offsets
shadow ở frozen boundary
```

### Khi hide runtime

Ví dụ:

```text
Freeze:
Employee
Department
Area
```

hide Department:

```text
Employee | Area
```

offset tự recalc.

F5:

```text
Department hiện lại
→ freeze lại bình thường
```

---

## 8. `src/index.js` — Centralize field resolver

Lần này nên gom mapping về một chỗ để Search/Sort/Conditional/Freeze không tự resolve theo 4 kiểu khác nhau.

Tạo helper:

```js
function findTableColumnByField(field, tableColumns) {
    if (!field) return null;

    return (
        tableColumns.find(
            col => col.fieldId && col.fieldId === field.id
        ) ||
        tableColumns.find(
            col => col.name === field.name
        ) ||
        null
    );
}
```

Ưu tiên:

```text
field.id
 ↓
field.name fallback
```

Sau đó:

```text
Search → helper
Sort → helper
Conditional → helper
Freeze → helper
```

Không duplicate matching logic.

---

## 9. Search — không đổi architecture

Giữ hiện tại:

```text
Setup
Search columns
[ field ]
[ field ]
[ field ]
...
```

Nếu không chọn field nào:

```text
Search box không xuất hiện
```

Không fallback:

```text
search toàn bộ columns ❌
```

Search text runtime vẫn giữ trong session.

F5 → trở về default search text từ Style.

---

## 10. Conditional — không đổi UI

Không thêm Rule Builder runtime.

Giữ:

```text
SETUP
Conditional Rule 1 Field
Conditional Rule 2 Field
Conditional Rule 3 Field

STYLE
Rule 1 behavior
Rule 2 behavior
Rule 3 behavior
```

Chỉ harden resolver.

---

## 11. `index.css` — cleanup nhẹ

Chỉ làm:

```text
+ config-warning
+ config-warning-detail nếu cần
```

Và kiểm tra lại dead CSS cuối cùng.

Không redesign:

```text
Search
Pagination
Columns popup
Freeze
Table header
Export button
```

UI hiện tại giữ nguyên.

---

## 12. `index.json`

Update rất ít.

**Không thêm Freeze Metric.**

Chỉ kiểm tra lại label Setup cho rõ:

```text
SEARCH
Search columns

SORTING
Sort 1
Sort 2
Sort 3

CONDITIONAL FORMATTING
Rule 1 field
Rule 2 field
Rule 3 field

FREEZE
Freeze columns
```

Nếu hiện IDs/config đã đúng thì **không đổi ID**, tránh làm Looker mất config editor đã chọn.

Đây rất quan trọng:

```text
Không rename config ID
Không xóa/recreate ID nếu không cần
```

---

## 13. `index.bundle.js`

Không sửa tay.

Sau khi sửa:

```text
src/index.js
index.css
index.json (nếu cần)
```

build lại:

```bash
npm run build
```

rồi kiểm tra bundle timestamp/hash mới.

---

## 14. Acceptance test

Test Sort:

```text
Sort 1 = Revenue DESC
Sort 2 = Department ASC
Sort 3 = KPI DESC

→ đúng multi-sort

click Employee
→ Employee ASC

click lại
→ Employee DESC

click lần 3
→ quay lại multi-sort
```

Test invalid config:

```text
Sort 1 Dimension = Department
Sort 1 Metric = Revenue

→ warning
→ Sort 1 không chạy
→ table không crash
```

Conditional:

```text
Rule 1 Enabled
Field trống

→ rule skip
→ table bình thường
```

```text
Rule 1 = Revenue
Revenue > 100M → green

→ đúng

hide một column khác
→ rule vẫn đúng
```

Freeze:

```text
Freeze:
Employee
Department

→ sticky đúng

resize chart
→ offset đúng

hide Employee
→ Department về left: 0

F5
→ Employee trở lại và freeze
```

Search:

```text
không chọn Search field
→ không search box

chọn Employee + Email
→ chỉ search 2 field đó
```

Export:

```text
search ra 0 row
→ Excel = 0 data row
→ không export rawRows
```

### Scope chốt lần update này

```text
P0  Conditional invalid field
P0  Slot Dimension + Metric conflict
P1  Runtime sort fieldId
P1  Metric fallback index
P1  Centralize resolver
P1  Config warning nhỏ
KEEP Freeze Dimension-only
```

Sau vòng này em nghĩ **nên freeze feature set**, đưa lên Looker test thực tế với dataset lớn và tập trung tìm bug performance/edge case thay vì thêm UI nữa.
