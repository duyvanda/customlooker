Đúng, chốt lại theo hướng mới này sẽ **sạch và đúng kiến trúc Looker Studio hơn**: bỏ hoàn toàn persistence custom, tận dụng **Setup + Style làm source of truth**, còn runtime chỉ giữ state tạm thời của viewer.

Community Visualization cho phép phần `data` định nghĩa các field xuất hiện trong tab Setup/Data và phần `style` định nghĩa các control trong tab Style; dữ liệu runtime nhận lại cũng có `fields` và `style` tương ứng. ([Google for Developers][1])

## Kiến trúc cuối cùng

| Chức năng                  | Nằm ở đâu        | Persist F5 |            Runtime được đổi? |
| -------------------------- | ---------------- | ---------: | ---------------------------: |
| Chọn field / thứ tự field  | **Setup**        |          ✅ |                            ❌ |
| Rename field               | **Looker Setup** |          ✅ |                            ❌ |
| Max rows                   | **Setup**        |          ✅ |                            ❌ |
| Default Sort               | **Style**        |          ✅ | ✅ tạm thời bằng click header |
| Conditional Formatting     | **Style**        |          ✅ |                            ❌ |
| Page size                  | **Style**        |          ✅ |                            ❌ |
| Enable Search              | **Style**        |          ✅ |                            ❌ |
| Default Search Text        | **Style**        |          ✅ |       ✅ viewer có thể gõ tạm |
| Search mode / scope        | **Style**        |          ✅ |                            ❌ |
| Hide/Show column           | **Runtime**      |          ❌ |                            ✅ |
| Current page               | Runtime          |          ❌ |                            ✅ |
| Header sort override       | Runtime          |          ❌ |                            ✅ |
| Search text viewer đang gõ | Runtime          |          ❌ |                            ✅ |
| Storage / localStorage     | **BỎ**           |          — |                            — |

Sau F5:

```text
Setup + Style của Looker
        ↓
      restore
        ↓
Default sort
Conditional formatting
Page size
Search config
Default search text

Runtime state
        ↓
      RESET
        ↓
Hidden columns → hiện lại
Current page → page 1
Header sort override → mất
Search text viewer nhập → trở về defaultSearchText
```

---

# 1. Bỏ 100% persistence custom

Iteration này xóa hoàn toàn tư duy:

```text
localStorage
sessionStorage
storage_bridge.html
window.name
Cloud Run preference API
Firestore preference
Storage ID
pending persisted config
```

Trong JS không còn:

```js
saveConfig()
loadConfig()
sendToBridge()
requestStoredConfig()
STORAGE_KEY
STORAGE_BRIDGE_URL
```

Không có bất kỳ persistence layer riêng nào nữa.

**Looker Setup + Style là cấu hình lâu dài duy nhất.**

Điểm này sẽ làm code đơn giản đi khá nhiều.

---

# 2. TAB SETUP — quản lý cấu trúc dữ liệu

Setup nên chỉ chịu trách nhiệm những thứ thực sự liên quan đến **field/data**.

Google hiện chỉ công bố ba loại `DataElement` cho Community Visualization là `DIMENSION`, `METRIC` và `MAX_RESULTS`; không có một DataElement kiểu `SORT`. Vì vậy em không ép sort vào Setup mà để sort ở Style. ([Google for Developers][2])

Concept:

```text
SETUP
────────────────────────

Dimensions
  Department
  Employee Name
  Date

Metrics
  Revenue
  Target
  Achievement %

Maximum rows
  2500
```

### Rename column

**Xóa hoàn toàn rename khỏi runtime.**

Header lấy trực tiếp metadata Looker:

```js
column.name
```

hoặc metadata tương ứng từ:

```js
data.fields
```

Flow:

```text
User đổi tên field trong Looker
        ↓
DSCC gửi field.name mới
        ↓
Table header dùng field.name
```

Không còn:

```js
customTitle
alias
renamedColumn
columnNameOverride
```

trong runtime state.

Điều này đúng yêu cầu của bạn: **Looker đã có rename thì custom table không làm lại.**

---

# 3. Tạo một `baseColumns` cố định cho toàn bộ engine

Đây là phần rất quan trọng vì sau này runtime hide column không được làm lệch Sort/Conditional Formatting.

Ngay khi nhận DSCC data:

```js
baseColumns = [
    {
        slot: 0,
        key: 'c0',
        fieldId: '...',
        name: 'Employee',
        type: 'TEXT',
        rawIndex: 0
    },
    {
        slot: 1,
        key: 'c1',
        fieldId: '...',
        name: 'Revenue',
        type: 'NUMBER',
        rawIndex: 1
    }
];
```

Tất cả Style sẽ tham chiếu vào:

```text
Column 1 → c0
Column 2 → c1
Column 3 → c2
...
```

**Không bao giờ tham chiếu theo visible index.**

Ví dụ:

```text
Setup:

Column 1 = Employee
Column 2 = Department
Column 3 = Revenue
```

Runtime user ẩn Department:

```text
Visible:

Employee
Revenue
```

Nhưng Revenue **vẫn là `c2 / Column 3`**, không trở thành Column 2.

Nhờ vậy:

```text
Conditional Rule → Column 3
Sort Style       → Column 3
```

vẫn áp đúng Revenue.

---

# 4. TAB STYLE — Default Sorting

Chọn **phương án B** như bạn yêu cầu.

Style giữ default:

```text
SORTING
────────────────────

Default sort column
[ Column 3 ▼ ]

Default direction
[ Descending ▼ ]

Allow header sorting
☑
```

Style control như `SELECT_SINGLE`, `CHECKBOX`, `TEXTINPUT`, `FILL_COLOR`, `FONT_COLOR` đều được Community Visualization hỗ trợ. ([Google for Developers][2])

Ví dụ:

```json
{
  "id": "sorting",
  "label": "Sorting",
  "elements": [
    {
      "id": "defaultSortColumn",
      "label": "Default sort column",
      "type": "SELECT_SINGLE",
      "defaultValue": "none",
      "options": [
        { "label": "None", "value": "none" },
        { "label": "Column 1", "value": "c0" },
        { "label": "Column 2", "value": "c1" },
        { "label": "Column 3", "value": "c2" }
      ]
    },
    {
      "id": "defaultSortDirection",
      "label": "Direction",
      "type": "SELECT_SINGLE",
      "defaultValue": "asc",
      "options": [
        { "label": "Ascending", "value": "asc" },
        { "label": "Descending", "value": "desc" }
      ]
    },
    {
      "id": "allowHeaderSort",
      "label": "Allow viewer to sort columns",
      "type": "CHECKBOX",
      "defaultValue": true
    }
  ]
}
```

---

# 5. Sort runtime = temporary override

State:

```js
const runtimeState = {
    sortOverride: null,
    currentPage: 1,
    hiddenColumns: new Set(),
    searchText: ''
};
```

Effective sort:

```js
function getEffectiveSort(style) {
    if (runtimeState.sortOverride) {
        return runtimeState.sortOverride;
    }

    return {
        column: style.defaultSortColumn?.value ?? 'none',
        direction: style.defaultSortDirection?.value ?? 'asc'
    };
}
```

Flow:

```text
STYLE
Revenue DESC
    ↓
Report mở
    ↓
Revenue DESC
```

Viewer click:

```text
Employee
    ↓
Employee ASC     ← runtime override
```

Click lần hai:

```text
Employee DESC
```

Em đề xuất click lần ba:

```text
clear override
    ↓
Revenue DESC     ← quay lại Style
```

Như vậy rất tiện:

```text
ASC → DESC → Default
```

F5 cũng:

```text
sortOverride = null
        ↓
Revenue DESC từ Style
```

### Khi sort thay đổi

Luôn:

```js
runtimeState.currentPage = 1;
```

tránh đang Page 8 rồi sort làm dữ liệu thay đổi nhưng vẫn đứng Page 8.

---

# 6. SEARCH — cấu hình 100% ở Style

Em sẽ **không đưa setting Search vào popup/runtime config nữa**.

Style:

```text
SEARCH
────────────────────────

Enable search
☑

Default search text
[                    ]

Placeholder
[ Search...          ]

Search scope
[ All visible columns ▼ ]

Match mode
[ Contains ▼ ]

Case sensitive
☐
```

`TEXTINPUT`, checkbox và dropdown đều là Style elements được hỗ trợ. ([Google for Developers][1])

### Search runtime hoạt động thế nào?

Style:

```text
Default Search Text = "MERAP"
```

Mở report:

```text
Search box:
[ MERAP ]
```

Viewer đổi thành:

```text
[ Finance ]
```

thì đó chỉ là runtime:

```js
runtimeState.searchText = 'Finance';
```

F5:

```text
runtimeState reset
       ↓
Style default
       ↓
[ MERAP ]
```

**Không lưu `"Finance"` ở đâu cả.**

Đúng philosophy:

```text
Looker Style = cấu hình
Viewer search = interaction tạm
```

### Initialization

Cần tránh mỗi lần DSCC redraw lại ghi đè text user đang gõ.

Không làm:

```js
runtimeState.searchText =
    style.defaultSearchText.value;
```

ở mọi `drawVisualization()`.

Mà:

```js
let searchInitialized = false;
```

Lần đầu:

```js
if (!searchInitialized) {
    runtimeState.searchText =
        style.defaultSearchText?.value ?? '';

    searchInitialized = true;
}
```

Nếu report editor thực sự thay `defaultSearchText` trong Edit mode thì cần detect Style value thay đổi và cập nhật appropriately.

---

# 7. Search Scope

Em đề xuất options:

```text
All columns
Visible columns
Text columns only
Column 1
Column 2
Column 3
...
Column 20
```

Trong đó default:

```text
Visible columns
```

Nếu runtime user hide:

```text
Phone
Email
```

và scope = `Visible columns`, search không xét Phone/Email nữa.

Nếu:

```text
scope = All columns
```

thì dù Email đang hidden:

```text
search "abc@merap..."
```

vẫn có thể match row.

Rõ ràng và predictable.

---

# 8. Conditional Formatting hoàn toàn ở Style

Không còn runtime Rule Builder.

Không còn:

```text
+ Add Rule
Delete Rule
Save Rule
local rules
```

Tạo cố định **5 rule**.

```text
CONDITIONAL FORMATTING — RULE 1
───────────────────────────────

Enable
☑

Column
[ Column 3 ▼ ]

Condition
[ Greater than ▼ ]

Value
[ 100000000 ]

Second value
[              ]

Background
[ ■ ]

Text
[ ■ ]

Bold
☑
```

Các rule 2–5 giống vậy.

---

# 9. Operators cho Conditional Formatting

Em đề xuất engine hỗ trợ:

```text
Number / Date:
>
>=
<
<=
=
!=
Between

Text:
Equals
Not equal
Contains
Does not contain
Starts with
Ends with
Empty
Not empty
```

Không cần user chọn type.

Engine tự đọc:

```js
column.type
```

rồi normalize value.

Ví dụ:

```text
Column 3 = Revenue
type NUMBER

rule:
> 100000000
```

→ numeric comparison.

```text
Column 2 = Department
type TEXT

rule:
Contains "Sales"
```

→ string comparison.

---

# 10. Rule priority

Để tránh hai rule đánh nhau, em chốt:

```text
Rule 1 = priority cao nhất
Rule 2
Rule 3
Rule 4
Rule 5 = thấp nhất
```

**First matching rule wins.**

Ví dụ:

```text
Rule 1: Revenue > 200M → Green
Rule 2: Revenue > 100M → Yellow
```

250M:

```text
match Rule 1
→ Green
→ stop
```

Không bị Rule 2 override sau đó.

---

# 11. Conditional formatting không bị ảnh hưởng bởi hide column

Giả sử:

```text
Column 1 Employee
Column 2 Department
Column 3 Revenue
```

Rule:

```text
Column 3
> 100M
green
```

Runtime hide Department:

```text
Employee | Revenue
```

Rule vẫn truy cập:

```js
row[column.rawIndex]
```

từ `baseColumns.c2`.

Không dùng:

```js
visibleColumns[1]
```

cho rule.

Đây là điểm bắt buộc phải làm đúng.

---

# 12. Hide / Show Columns chỉ Runtime

Giữ feature hide columns như hiện tại, nhưng **không persistence**.

Toolbar:

```text
Columns ▼
```

Popup:

```text
☑ Employee
☑ Department
☑ Revenue
☐ Email
☐ Phone
```

State:

```js
runtimeState.hiddenColumns = new Set([
    'field-email',
    'field-phone'
]);
```

Ở đây nên lưu `fieldId`, không lưu visible index.

F5:

```js
hiddenColumns = new Set();
```

→ tất cả cột từ Setup hiện lại.

### Khi Looker redraw do filter/date range

Trong cùng một iframe lifecycle:

```text
hide Email
→ filter report
→ DSCC redraw
```

em sẽ **giữ Email hidden**.

Chỉ reset khi visualization thực sự reload/F5.

Tức là runtime state sống trong JS memory, không storage.

---

# 13. Pagination

Style:

```text
PAGINATION
────────────────

Enable pagination
☑

Rows per page
[ 25 ▼ ]

Show row count
☑
```

Options:

```text
10
25
50
100
```

Current page:

```js
runtimeState.currentPage
```

Không persist.

F5:

```text
Page 1
```

Khi:

```text
Search changed
Sort changed
Hide/show changed
Page size changed
```

→ quay về:

```text
currentPage = 1
```

---

# 14. Render pipeline cuối cùng

Đây là pipeline em muốn code tuân thủ tuyệt đối:

```text
dscc.subscribeToData()
        ↓
drawVisualization(data)
        ↓
read SETUP fields
        ↓
build baseColumns
        ↓
read STYLE config
        ↓
initialize runtime defaults if needed
        ↓
get visibleColumns
        ↓
normalize rows
        ↓
SEARCH
        ↓
SORT
        ↓
PAGINATE
        ↓
render visible columns
        ↓
apply conditional formatting
```

Quan trọng:

```text
SEARCH → SORT → PAGINATION
```

không:

```text
PAGINATION → SORT
```

Nếu paginate trước rồi sort thì chỉ sort 25 row hiện tại, sai.

---

# 15. State model cuối cùng

Persistent state duy nhất:

```text
LOOKER
├── Setup
│   ├── Dimensions
│   ├── Metrics
│   ├── field order
│   ├── field rename
│   └── max rows
│
└── Style
    ├── Default sort
    ├── Conditional rules 1–5
    ├── Page size
    ├── Search enabled
    ├── Default search text
    ├── Search scope
    ├── Search mode
    └── visual styling
```

Runtime:

```text
JS MEMORY
├── currentPage
├── searchText temporary
├── sortOverride
└── hiddenColumns
```

**Không có layer thứ ba.**

---

# 16. Những code cũ phải remove

Iteration này em sẽ yêu cầu remove hoàn toàn:

```text
Skeleton
Storage bridge
localStorage
sessionStorage
Persistence keys
Save configuration
Restore configuration
Runtime rename
Runtime conditional-format modal
Runtime conditional rule persistence
Runtime default sort persistence
Runtime search config modal
Storage ID
Cloud persistence
```

Có thể giữ popup:

```text
Columns
```

vì hide/show vẫn runtime.

---

# 17. Một lưu ý về Column 1 / Column 2

Do các option của `SELECT_SINGLE` trong Style config phải khai báo trước, Community Visualization không có cơ chế để runtime biến dropdown thành danh sách field động như:

```text
Revenue
Employee
Department
```

từ fields vừa chọn; options của selector được định nghĩa trong config JSON. ([Google for Developers][1])

Vì vậy UI Style sẽ dùng:

```text
Column 1
Column 2
Column 3
...
```

Còn tên thực tế xem ở Setup/table:

```text
Column 1 → Employee Name
Column 2 → Department
Column 3 → Revenue
```

Đây là limitation em chấp nhận để đổi lại persistence sạch và ổn định.

---

# 18. Acceptance test cho iteration này

Sau khi code xong, em sẽ coi build đạt khi hành vi như sau:

```text
STYLE:
Default sort = Column 3 DESC

→ F5
→ Column 3 DESC

→ click Column 1
→ Column 1 ASC

→ click lần 2
→ Column 1 DESC

→ click lần 3
→ quay Column 3 DESC
```

Conditional:

```text
Rule 1:
Column 3 > 100
Green

→ F5
→ rule vẫn còn

→ hide Column 2 runtime
→ Column 3 vẫn green đúng dữ liệu
```

Search:

```text
Style:
Default Search = MERAP

→ mở report
→ input = MERAP

→ viewer gõ Sales
→ filter Sales

→ F5
→ input lại MERAP
```

Hide:

```text
hide Email
→ Email mất

→ filter report
→ Email vẫn hidden

→ F5
→ Email hiện lại
```

Rename:

```text
Rename Revenue → Doanh thu
trong Looker

→ custom table
→ Header = Doanh thu

Không có runtime Rename.
```

Và quan trọng nhất:

```text
DevTools → Application

Custom visualization KHÔNG:
localStorage.setItem()
sessionStorage.setItem()
storage bridge
IndexedDB
cookie persistence
```

### Chốt

Em sẽ đi theo đúng mô hình:

```text
SETUP = dữ liệu / field / tên cột
STYLE = cấu hình report cần lưu
RUNTIME = interaction tạm của viewer
```

Trong đó **Option B cho Sort**, Conditional Formatting 100% Style, Rename 100% Looker, Search configuration 100% Style, Hide Column 100% runtime, và **zero custom persistence**.

Đây là architecture em thấy hợp lý nhất cho bản tiếp theo.

[1]: https://developers.google.com/looker-studio/visualization/config-reference?utm_source=chatgpt.com "Community Visualization Config Reference  |  Community Visualizations  |  Google for Developers"
[2]: https://developers.google.com/looker-studio/visualization/config-reference "Community Visualization Config Reference  |  Community Visualizations  |  Google for Developers"
