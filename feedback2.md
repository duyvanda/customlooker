Được. Với custom table này, mình có thể làm **sort + pagination + conditional formatting khá giống Table mặc định của Looker Studio**. Tuy nhiên có một giới hạn quan trọng: Community Visualization chạy trong iframe riêng; SDK chính thức chủ yếu đưa cho component `tables`, `fields`, `style`, `theme`, `interactions`, và phía interaction hiện chỉ hỗ trợ `FILTER`. Không có API native để bảo Looker Studio “hãy sort/paginate bảng này giúp tôi”, nên các chức năng đó nên được xử lý trong JavaScript của visualization. ([Google for Developers][1])

### Kiến trúc mình khuyên dùng

```text
Looker Studio data
       ↓
   rawRows
       ↓
 Conditional parsing
       ↓
     SORT
       ↓
  PAGINATION
       ↓
 renderTable()
       ↓
Conditional Formatting
       ↓
 HTML Table
```

**Sort** nên xử lý khi click trực tiếp vào `<th>`:

```text
Mã NV        Họ tên        Doanh thu ↑
─────────────────────────────────────
NV001        Nguyễn A      120,000
NV003        Nguyễn C       90,000
NV002        Nguyễn B       50,000
```

State giữ ở ngoài `drawVisualization()`:

```js
let tableState = {
    sortColumn: null,
    sortDirection: 'asc',
    currentPage: 1,
    pageSize: 25
};
```

Click header:

```js
th.addEventListener('click', () => {
    if (tableState.sortColumn === columnIndex) {
        tableState.sortDirection =
            tableState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        tableState.sortColumn = columnIndex;
        tableState.sortDirection = 'asc';
    }

    tableState.currentPage = 1;
    renderTable();
});
```

Điểm quan trọng là phải sort **đúng kiểu dữ liệu**, không dùng `String.localeCompare()` cho tất cả. DSCC cung cấp header metadata gồm `type`, `concept`, `name`, `id`, nên mình có thể biết cột là number/text/date để comparator xử lý phù hợp. ([Google for Developers][1])

Ví dụ:

```js
function compareValues(a, b, fieldType) {
    if (fieldType === 'NUMBER') {
        return Number(a || 0) - Number(b || 0);
    }

    if (
        fieldType === 'YEAR_MONTH_DAY' ||
        fieldType === 'DATE'
    ) {
        return new Date(a) - new Date(b);
    }

    return new Intl.Collator('vi', {
        numeric: true,
        sensitivity: 'base'
    }).compare(String(a ?? ''), String(b ?? ''));
}
```

---

### Pagination

Pagination nên làm client-side:

```text
Hiển thị: [10] [25] [50] [100] dòng

‹ Trước    1  2  3  4  5    Sau ›

1–25 / 428 dòng
```

Logic đơn giản:

```js
const start =
    (tableState.currentPage - 1) * tableState.pageSize;

const end = start + tableState.pageSize;

const pageRows = sortedRows.slice(start, end);
```

Có thể đưa `pageSize` vào tab **Style của Looker Studio** bằng `SELECT_SINGLE`. Looker Studio Community Viz cho phép khai báo các control như `SELECT_SINGLE`, `CHECKBOX`, `TEXTINPUT`, màu sắc, font, interval... trong config. ([Google for Developers][2])

Ví dụ trong `index.json`:

```json
{
    "id": "pageSize",
    "label": "Rows per page",
    "type": "SELECT_SINGLE",
    "defaultValue": "25",
    "options": [
        { "label": "10", "value": "10" },
        { "label": "25", "value": "25" },
        { "label": "50", "value": "50" },
        { "label": "100", "value": "100" }
    ]
}
```

Sau đó JS:

```js
const pageSize =
    Number(data.style.pageSize?.value || 25);
```

Có một điểm cần phân biệt: đây là **pagination trên số rows Looker đã gửi xuống visualization**, không phải server-side pagination trực tiếp xuống BigQuery/Google Sheets/database.

Google có `MAX_RESULTS` dành riêng để định nghĩa số row visualization có thể request; mặc định được tài liệu ghi là **2.500 rows**. ([Google for Developers][2])

Mình sẽ thêm kiểu:

```json
{
    "id": "maxRows",
    "label": "Maximum rows",
    "type": "MAX_RESULTS",
    "options": {
        "max": 5000
    }
}
```

Như vậy:

```text
Data source
    ↓
Looker trả tối đa N rows
    ↓
Custom table giữ N rows
    ↓
Pagination 25 rows/page
```

---

## Conditional Formatting

Phần này làm được khá mạnh.

Ví dụ user muốn:

```text
Doanh thu > 100 triệu   → nền xanh
Doanh thu < 50 triệu    → nền đỏ
Status = "Late"         → chữ đỏ
Status = "Done"         → chữ xanh
% KPI >= 100%           → xanh đậm + bold
```

Render cell:

```js
function getConditionalStyle(value, column, rules) {
    for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.column !== column) continue;

        let matched = false;

        switch (rule.operator) {
            case '>':
                matched = Number(value) > Number(rule.value);
                break;

            case '>=':
                matched = Number(value) >= Number(rule.value);
                break;

            case '<':
                matched = Number(value) < Number(rule.value);
                break;

            case '=':
                matched = String(value) === String(rule.value);
                break;

            case 'contains':
                matched = String(value)
                    .toLowerCase()
                    .includes(String(rule.value).toLowerCase());
                break;
        }

        if (matched) {
            return {
                backgroundColor: rule.backgroundColor,
                color: rule.textColor
            };
        }
    }

    return null;
}
```

Sau đó:

```js
const style = getConditionalStyle(
    cellData,
    columnIndex,
    conditionalRules
);

if (style) {
    td.style.backgroundColor = style.backgroundColor;
    td.style.color = style.color;
}
```

### Có thể cấu hình ngay trong Looker Studio Style panel

Google cho Community Viz các style control như `CHECKBOX`, `TEXTINPUT`, `SELECT_SINGLE`, `FILL_COLOR`, `FONT_COLOR`... nên mình có thể tạo từng rule trong Style panel. ([Google for Developers][2])

Ví dụ:

```text
CONDITIONAL FORMATTING

Rule 1
☑ Enable

Column:
[ Doanh thu ]

Condition:
[ Greater than ▼ ]

Value:
[ 100000000 ]

Background:
[ 🟢 ]

Text:
[ ⚫ ]

─────────────────

Rule 2
☑ Enable

Column:
[ Status ]

Condition:
[ Equals ▼ ]

Value:
[ Late ]

Background:
[ 🔴 ]
```

Nhưng có một hạn chế: file config của Community Visualization là cấu hình tĩnh. Vì vậy dropdown trong Style panel không dễ tự sinh động danh sách `"Doanh thu", "Status", "Ngày..."` theo những field mà user vừa kéo vào chart. Google quy định các option của `SELECT_SINGLE`/`SELECT_RADIO` trong visualization config. ([Google for Developers][2])

Do đó mình khuyên dùng **column position**:

```text
Apply to column:
[ Column 1 ▼ ]
[ Column 2 ▼ ]
...
[ Column 20 ▼ ]
```

Hoặc tốt hơn:

```text
Column:
[ 3 ]
```

rồi UI custom bên trong table sẽ hiển thị tên thật.

---

## Nếu muốn giống Looker Studio hơn nữa

Mình sẽ làm table của bạn thành dạng:

```text
┌──────────────────────────────────────────────────────────────┐
│ 📊 Xuất Excel                         Rows/page: [25 ▼]      │
├───────────────┬──────────────────┬───────────────────────────┤
│ Mã NV ↕       │ Họ tên ↕         │ Doanh thu ↓               │
├───────────────┼──────────────────┼───────────────────────────┤
│ NV001         │ Nguyễn Văn A     │ 120,000,000 🟢            │
│ NV002         │ Nguyễn Văn B     │  85,000,000                │
│ NV003         │ Nguyễn Văn C     │  32,000,000 🔴            │
├───────────────┴──────────────────┴───────────────────────────┤
│ 1–25 / 428                          ‹  1 2 3 4 5  ›          │
└──────────────────────────────────────────────────────────────┘
```

Và mình đề xuất thêm luôn **5 chức năng** trong cùng lần sửa:

| Chức năng              | Cách làm                                         |
| ---------------------- | ------------------------------------------------ |
| Sort ASC/DESC          | Click header                                     |
| Multi-type sort        | Number / Date / Text                             |
| Pagination             | 10 / 25 / 50 / 100                               |
| Conditional formatting | Number / Text / Date                             |
| Sticky header          | Header đứng yên khi scroll                       |
| Excel                  | Export **toàn bộ rows**, không chỉ page hiện tại |

Phần Excel nên giữ `rawRows` riêng:

```js
rawRows
   ├──→ sort → paginate → màn hình
   │
   └──────────────────→ Export Excel
```

Như vậy đang ở:

```text
Page 3 / 18
```

bấm **Xuất Excel** vẫn lấy toàn bộ 428 dòng, không chỉ 25 dòng ở page 3.

Ngoài ra có thể thêm click vào row/cell để **lọc các chart khác trong report**. Đây là phần Looker Studio hỗ trợ native thông qua `dscc.sendInteraction()`, nhưng hiện interaction type chính thức chỉ có `FILTER`. ([Google for Developers][1])

### Với project bạn đang làm, mình khuyên triển khai theo mức này

**Sort + Pagination:** làm trực tiếp trong table.

**Conditional Formatting:** cấu hình rule trong tab Style của Looker, khoảng **3–5 rule** là hợp lý.

**Click row → Filter report:** dùng DSCC interaction.

**Excel:** xuất toàn bộ dataset đã nhận.

**Skeleton:** giữ như hiện tại.

Như vậy custom visualization sẽ gần với **Looker Studio Table**, nhưng có thêm lợi thế lớn là **Export Excel thật sự** và mình có thể kiểm soát CSS/UI hoàn toàn.

Nếu triển khai tiếp trên bộ `customLooker.zip` bạn vừa gửi , phần cần sửa chủ yếu là **`src/index.js` + `index.json` + `index.css`**, sau đó webpack build lại `index.bundle.js`; không cần thay kiến trúc project.

[1]: https://developers.google.com/data-studio/visualization/library-reference "Data Studio Community Component (dscc) library reference  |  Community Visualizations  |  Google for Developers"
[2]: https://developers.google.com/data-studio/visualization/config-reference "Community Visualization Config Reference  |  Community Visualizations  |  Google for Developers"
