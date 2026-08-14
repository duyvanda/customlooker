Được — nhưng chỉ **một phần**. Cái dropdown bạn chụp kiểu `Visible columns / All columns / Column 1 / Column 2...` về bản chất là **cấu hình behavior**, không phải field binding. Tab **Setup** của Community Visualization hiện chỉ hỗ trợ `DIMENSION`, `METRIC`, và `MAX_RESULTS`; không có loại control tùy ý như dropdown/checkbox/text input ở Setup. ([Google for Developers][1])

Nói cách khác:

```text
SETUP
├── Dimension
├── Metric
└── Max results
```

Còn:

```text
Search scope
Default sort column
Sort direction
Conditional formatting rule
Page size
```

thì đúng API hiện tại phải để ở **Style**, vì các control `SELECT_SINGLE`, `CHECKBOX`, `TEXTINPUT`, color picker... chỉ tồn tại trong `style[]`. ([Google for Developers][1])

Tuy nhiên, có một cách **tận dụng Setup tốt hơn** để UI đỡ phải hiện `Column 1 / Column 2 / Column 3`.

## Em đề xuất chia lại như sau

### Setup chỉ quản lý field thật

```text
SETUP

Dimensions
[ Employee Name ]
[ Department    ]
[ Date          ]

Metrics
[ Revenue       ]
[ Target        ]
[ KPI %         ]

Maximum rows
[ 5000 ]
```

Editor chọn field và thứ tự field tại đây. Looker sẽ gửi metadata thật xuống JS. Google xác nhận `data` config chính là phần định nghĩa Dimension/Metric được render trong property panel Setup. ([Google for Developers][2])

Vậy trong JS mình biết:

```text
Column 1 = Employee Name
Column 2 = Department
Column 3 = Date
Column 4 = Revenue
Column 5 = Target
Column 6 = KPI %
```

---

# Nhưng dropdown Style vẫn không tự hiện tên field

Ví dụ cái bạn đang thấy:

```text
Visible columns
All columns
Column 1
Column 2
Column 3
...
```

Em **không thể làm native Style dropdown tự động thành**:

```text
Visible columns
All columns
Employee Name
Department
Revenue
KPI %
```

theo field editor vừa chọn trong Setup.

Lý do là `SELECT_SINGLE.options` của Community Visualization phải được khai báo tĩnh trong config JSON. ([Google for Developers][1])

Đây là hạn chế của API Community Visualization chứ không phải do code của mình.

---

# Nhưng có thể thiết kế tốt hơn

Thay vì:

```text
Search scope
[ Visible columns ▼ ]

All columns
Column 1
Column 2
Column 3
...
Column 20
```

em đề xuất Search chỉ có:

```text
SEARCH

Enable search
☑

Search scope
[ Visible columns ▼ ]

Options:
• Visible columns
• All columns
```

**Bỏ toàn bộ Column 1...20 khỏi Search.**

Vì thực tế search theo một column cụ thể không quá cần thiết với table này.

Flow:

```text
Visible columns
→ chỉ search những column đang hiện

All columns
→ search cả column runtime đang hidden
```

UI gọn hẳn.

---

# Sort thì khác

Sort cần chọn **một field cụ thể**, nên Style vẫn phải có:

```text
Default sort column
[ Column 4 ▼ ]
```

Tuy nhiên em đề xuất có thêm option:

```text
None
First column
Last metric
Column 1
Column 2
...
```

Hoặc đơn giản nhất:

```text
Default sort column
[ Column 1 ▼ ]
```

Trong table UI, editor nhìn Setup đã biết Column 1 là field nào.

---

# Conditional Formatting cũng tương tự

Rule:

```text
Rule 1
Enable ☑

Apply to
[ Column 4 ▼ ]

Condition
[ Greater than ▼ ]

Value
[ 100000000 ]

Background
[ ■ ]
```

Conditional formatting bắt buộc phải chỉ định column, nên vẫn cần column position ở Style.

Nhưng mình có thể làm thêm một cải tiến rất hữu ích:

## Hiển thị mapping ngay trong table editor/runtime

Ví dụ toolbar hoặc tooltip:

```text
Columns

1 — Employee Name
2 — Department
3 — Date
4 — Revenue
5 — Target
6 — KPI %
```

Thế là khi editor vào Style:

```text
Conditional Rule 1
Apply to: Column 4
```

họ biết ngay:

```text
Column 4 = Revenue
```

Không cần đoán.

---

# Có nên tạo riêng field trong Setup như "Sort Field"?

Về kỹ thuật có thể khai báo thêm một `DIMENSION`, ví dụ:

```text
SETUP

Dimensions
[ Employee ]
[ Department ]

Metrics
[ Revenue ]

Sort Field
[ Revenue ]
```

Nhưng em **không khuyên**.

Vì `DIMENSION`/`METRIC` trong Setup là **field tham gia vào data request**, không phải control UI thuần túy. Thêm một field chỉ để chọn sort/search có thể làm thay đổi dataset/granularity mà Looker gửi xuống visualization. Setup được thiết kế để binding data, không phải làm settings panel. ([Google for Developers][1])

Ví dụ:

```text
Rows hiện tại:

Department | Revenue
Sales      | 100
IT         | 80
```

Nếu mình thêm:

```text
Sort Field = Employee
```

như một Dimension riêng, Looker có thể trả dataset theo:

```text
Department + Employee
```

→ granularity thay đổi.

Không đáng.

---

# Vậy em chỉnh plan lại thế này

### Setup

```text
DATA

Dimensions
[ ... ]

Metrics
[ ... ]

Maximum rows
[ ... ]
```

Chịu trách nhiệm:

```text
field thật
field order
field rename
data type
max rows
```

---

### Style — Table

```text
TABLE

Rows per page
[ 25 ▼ ]

Enable pagination
☑

Show row count
☑
```

---

### Style — Search

```text
SEARCH

Enable search
☑

Default search text
[          ]

Placeholder
[ Search... ]

Search scope
[ Visible columns ▼ ]

Options:
• Visible columns
• All columns

Case sensitive
☐
```

**Bỏ:**

```text
Column 1
Column 2
Column 3
...
```

khỏi Search Scope.

---

### Style — Sorting

```text
SORTING

Default sort
[ Column 4 ▼ ]

Direction
[ Descending ▼ ]

Allow header sorting
☑
```

Runtime Option B:

```text
Style default
      ↓
Revenue DESC

click Employee
      ↓
Employee ASC

click lần 2
      ↓
Employee DESC

click lần 3
      ↓
Revenue DESC
```

---

### Style — Conditional Formatting

```text
RULE 1

Enable
☑

Apply to
[ Column 4 ▼ ]

Condition
[ Greater than ▼ ]

Value
[ 100000000 ]

Background
[ ■ ]

Text color
[ ■ ]

Bold
☑
```

5 rule cố định.

---

### Runtime

Chỉ còn:

```text
Search text viewer đang gõ
Current page
Temporary sort override
Hide/show columns
```

Không:

```text
Rename
Conditional rule editor
Search config
Default sort config
Persistence
```

---

## Hide column vẫn để runtime

Ví dụ:

```text
Columns ▼

☑ Employee Name
☑ Department
☑ Revenue
☐ Email
☐ Phone
```

F5:

```text
reset → tất cả cột hiện lại
```

Đúng requirement hiện tại.

---

## Quan trọng: map Column phải luôn dựa trên Setup

Em sẽ định nghĩa:

```text
Setup field order
      ↓
baseColumns

c0 = Employee Name
c1 = Department
c2 = Revenue
c3 = Target
```

Runtime hide:

```text
Department
```

không được đổi mapping thành:

```text
c0 Employee
c1 Revenue   ❌
```

Mà vẫn:

```text
c0 Employee
c1 Department hidden
c2 Revenue
c3 Target
```

Vậy:

```text
Conditional Rule = Column 3
```

luôn là Revenue, kể cả Column 2 đang hidden.

---

### Chốt UI gọn hơn

Cái menu trong ảnh hiện tại:

```text
Visible columns
All columns
Column 1
Column 2
Column 3
Column 4
...
```

em sẽ đổi thành chỉ:

```text
Visible columns
All columns
```

cho **Search Scope**.

Còn những chỗ thực sự cần chọn field như **Sort** và **Conditional Formatting** mới giữ `Column 1...N`.

Đây là cách cân bằng tốt nhất giữa hạn chế API của Looker Community Visualization và trải nghiệm editor hiện tại.

[1]: https://developers.google.com/looker-studio/visualization/config-reference?utm_source=chatgpt.com "Community Visualization Config Reference  |  Community Visualizations  |  Google for Developers"
[2]: https://developers.google.com/data-studio/visualization/define-config?utm_source=chatgpt.com "Defining the visualization config  |  Integrate and share  |  Google for Developers"
