Đúng, **một chỗ có thể chọn nhiều field**. Em sửa lại plan Search như sau:

### `index.json`

Chỉ cần **1 element**:

```json
{
  "id": "searchFields",
  "label": "Search columns",
  "type": "DIMENSION",
  "options": {
    "min": 0,
    "max": 10
  }
}
```

`max` là số dimension tối đa editor được chọn trong cùng một ô Setup. Looker Studio hỗ trợ `min/max` cho `DIMENSION` và sẽ trả lại toàn bộ field đã chọn dưới cùng `configId`. ([Google for Developers][1])

Setup sẽ thành:

```text
SEARCH COLUMNS
[ Employee Name ]
[ Email         ]
[ Department    ]
[ + Add dimension ]
```

JS đọc:

```js
const searchFields =
    data.fields?.searchFields || [];
```

Rồi lấy các `field.id` đó để search.

### Vậy Search không cần:

```text
searchSetupC1
searchSetupC2
searchSetupC3
```

Chỉ còn:

```text
searchFields[]
```

gọn hơn nhiều.

### Sort thì vẫn khác

Sort chỉ cần **1 field**, nên:

```text
sortDimension max: 1
sortMetric    max: 1
```

hoặc nếu chỉ sort metric thì một `sortMetric` là đủ.

### Conditional

Conditional cũng có thể cho editor chọn nhiều field trong **một Setup element**:

```json
{
  "id": "conditionalFields",
  "label": "Conditional formatting fields",
  "type": "METRIC",
  "options": {
    "min": 0,
    "max": 5
  }
}
```

Sau đó mapping theo thứ tự:

```text
conditionalFields[0] → Style Rule 1
conditionalFields[1] → Style Rule 2
conditionalFields[2] → Style Rule 3
...
```

Cách này gọn hơn hẳn `cfSetupC1`, `cfSetupC2`...

**Em chốt lại:** Search nên là **1 selector multi-field**, Conditional cũng nên cân nhắc **1 selector multi-field**, còn Sort là **1 selector single-field**.

[1]: https://developers.google.com/looker-studio/visualization/config-reference?utm_source=chatgpt.com "Community Visualization Config Reference  |  Community Visualizations  |  Google for Developers"

Sort chỉ cần 3 field bạn ơi.

Đúng. Vậy chốt **Sort tối đa 3 field**, theo thứ tự ưu tiên.

### Sort — Setup

Nếu 3 field đều cùng loại, dùng **1 selector multi-field**:

```json
{
  "id": "sortFields",
  "label": "Sort columns",
  "type": "METRIC",
  "options": {
    "min": 0,
    "max": 3
  }
}
```

Editor chọn:

```text
SORT COLUMNS

Revenue
KPI %
Target
+ Add metric
```

Thứ tự chính là priority:

```text
sortFields[0] → Sort 1
sortFields[1] → Sort 2
sortFields[2] → Sort 3
```

Ví dụ:

```text
1. Revenue DESC
2. KPI % DESC
3. Target ASC
```

### Style

Chỉ cần direction cho 3 cấp:

```text
SORTING

Sort 1 direction
[ DESC ▼ ]

Sort 2 direction
[ DESC ▼ ]

Sort 3 direction
[ ASC ▼ ]

Allow header sorting
☑
```

JS:

```js
const sortFields = data.fields?.sortFields || [];

const sortConfig = [
    {
        field: sortFields[0],
        direction: data.style.sort1Direction?.value || 'asc'
    },
    {
        field: sortFields[1],
        direction: data.style.sort2Direction?.value || 'asc'
    },
    {
        field: sortFields[2],
        direction: data.style.sort3Direction?.value || 'asc'
    }
].filter(item => item.field);
```

Sort engine:

```text
Revenue bằng nhau
      ↓
so KPI
      ↓
KPI bằng nhau
      ↓
so Target
```

### Runtime Option B vẫn giữ

```text
Setup:
Revenue DESC
KPI DESC
Target ASC
        ↓
default multi-sort

User click Employee
        ↓
Employee ASC     ← temporary override

click Employee lần 2
        ↓
Employee DESC

click lần 3
        ↓
clear override
        ↓
quay về:
Revenue DESC
KPI DESC
Target ASC
```

F5 cũng quay về 3 sort field từ Setup.

**Lưu ý duy nhất:** nếu Sort cần trộn cả `Dimension + Metric`, Looker không có generic `FIELD`, nên implementation phải xử lý riêng. Còn nếu 3 field Sort của mình là Metric thì **1 selector `sortFields`, `max: 3` là đẹp nhất**.

Vậy structure hiện tại chốt:

```text
SEARCH
→ 1 selector, nhiều fields

SORT
→ 1 selector, tối đa 3 fields

CONDITIONAL
→ 1 selector, tối đa 5 fields
```

Style chỉ cấu hình behavior của các field đã chọn ở Setup.
