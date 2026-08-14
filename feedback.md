Đúng rồi, nếu **bỏ Skeleton hoàn toàn** thì em đề xuất implementation plan như sau, đồng thời tranh thủ làm sạch flow để **persistence ẩn cột sau F5** hoạt động ổn định trên bản `customLooker(1).zip` hiện tại. 

### Implementation plan

1. **Loại bỏ toàn bộ Skeleton**

   * Xóa `showSkeleton()`.
   * Xóa mọi chỗ gọi `showSkeleton()`.
   * Xóa các class CSS:

     ```css
     .skeleton
     .skeleton-container
     .skeleton-table
     .skeleton-row
     .skeleton-header
     .skeleton-btn
     ```
   * Xóa `@keyframes shimmer`.
   * Nếu đang có `body:empty::before` / `body:empty::after` thì xóa luôn.
   * Khi visualization chưa có data: để **transparent/empty**, không render loading UI.

2. **Tách DOM của application khỏi `document.body`**

   Đây là phần quan trọng nhất để persistence không bị chết.

   Chuyển từ kiểu:

   ```js
   document.body.innerHTML = '';
   ```

   sang architecture:

   ```text
   body
   ├── storage_bridge iframe
   └── #excelviz-app-root
       └── Table UI
   ```

   Tạo helper:

   ```js
   function getAppRoot() {
       let root = document.getElementById('excelviz-app-root');

       if (!root) {
           root = document.createElement('div');
           root.id = 'excelviz-app-root';
           document.body.appendChild(root);
       }

       return root;
   }
   ```

   Từ đây trở đi **không được dùng**:

   ```js
   document.body.innerHTML = '';
   ```

   mà chỉ dùng:

   ```js
   getAppRoot().innerHTML = '';
   ```

3. **Giữ `storage_bridge.html` sống suốt lifecycle**

   Bridge được tạo một lần:

   ```text
   Visualization load
        ↓
   Storage bridge
        ↓
   bridge tồn tại
        ↓
   data thay đổi
        ↓
   table re-render
        ↓
   bridge vẫn tồn tại
   ```

   `renderTable()`, sort, pagination, conditional formatting, modal configuration đều chỉ thao tác bên trong `#excelviz-app-root`.

4. **Sửa race condition khi F5**

   Đây là lỗi thứ hai làm config ẩn cột bị mất.

   Flow có thể xảy ra:

   ```text
   F5
    ↓
   bridge load config
    ↓
   Looker chưa gửi data
    ↓
   currentData = null
   ```

   Không được sync config với field lúc này.

   Thêm state:

   ```js
   let pendingColumnConfigs = null;
   let pendingRules = null;
   ```

   Nếu bridge trả config mà chưa có `currentData`:

   ```js
   pendingColumnConfigs = savedConfig;
   ```

   Khi `drawVisualization(data)` được gọi:

   ```js
   currentData = data;

   if (pendingColumnConfigs) {
       // map saved config với fields hiện tại
   }

   renderTable();
   ```

5. **Chuẩn hóa flow render**

   Sau khi bỏ skeleton, lifecycle nên rất đơn giản:

   ```text
   JS start
      ↓
   create storage bridge
      ↓
   create app root
      ↓
   chờ DSCC data
      ↓
   drawVisualization(data)
      ↓
   restore persisted config
      ↓
   process rows
      ↓
   sort
      ↓
   pagination
      ↓
   conditional formatting
      ↓
   render table
   ```

   Không còn:

   ```text
   skeleton
   ↓
   destroy DOM
   ↓
   rebuild
   ```

6. **Không render lỗi trắng / nhấp nháy**

   CSS base:

   ```css
   html,
   body {
       margin: 0;
       padding: 0;
       width: 100%;
       background: transparent;
   }

   #excelviz-app-root {
       width: 100%;
       box-sizing: border-box;
   }
   ```

   Khi chưa có data thì iframe đơn giản là trong suốt.

   Khi data về mới render:

   ```text
   empty
     ↓
   table
   ```

7. **Tách state UI ra rõ ràng**

   Nên gom thành:

   ```js
   const tableState = {
       currentPage: 1,
       pageSize: 25,
       sortColumn: null,
       sortDirection: null,
       search: ''
   };

   let userColumnConfigs = [];
   let conditionalRules = [];
   let currentData = null;
   ```

   Trong đó:

   * `tableState`: state tạm, refresh có thể reset.
   * `userColumnConfigs`: cần persist.
   * `conditionalRules`: cần persist.
   * `currentData`: Looker cung cấp.

   Sau này muốn persist sort/page size cũng có thể đưa thêm vào storage.

8. **Fix persistence column bằng stable identity**

   Không nên lưu chỉ bằng `columnIndex`, vì user đổi field order là lệch.

   Ưu tiên lưu:

   ```js
   {
       fieldId: "...",
       fieldName: "Doanh thu",
       visible: false,
       alias: "DT",
       searchable: true
   }
   ```

   Restore theo:

   ```text
   fieldId
     ↓ nếu không thấy
   fieldName
     ↓ nếu không thấy
   default config
   ```

   Như vậy user reorder field trong Looker vẫn giữ được trạng thái đúng cột.

9. **Namespace storage cho từng table**

   Hiện tại không nên để tất cả visualization dùng một key chung.

   Dùng dạng:

   ```text
   excelviz:v8:<storageScope>:columns
   excelviz:v8:<storageScope>:rules
   ```

   Ví dụ:

   ```text
   excelviz:v8:employee:columns
   excelviz:v8:employee:rules

   excelviz:v8:sales:columns
   excelviz:v8:sales:rules
   ```

   Có thể thêm `Storage ID` vào Style của Looker để mỗi chart tự có namespace.

10. **Giữ nguyên các feature đã có**

Việc bỏ skeleton không được ảnh hưởng:

* Sort ASC/DESC.
* Pagination.
* Hide/show column.
* Rename column.
* Search.
* Conditional formatting.
* Excel export.
* Modal cấu hình.
* DSCC interaction nếu đang có.

11. **Build lại bundle**

Chỉ sửa source:

```text
src/index.js
index.css
index.json     ← chỉ sửa nếu thêm Storage ID
```

Sau đó:

```bash
npm run build
```

hoặc command webpack hiện tại của project.

Output:

```text
index.bundle.js
```

`manifest.json` và `storage_bridge.html` về cơ bản không cần đổi URL nếu vẫn giữ deployment hiện tại.

12. **Acceptance test cuối**

Em sẽ test theo flow:

```text
1. Mở report
   → không skeleton
   → table xuất hiện khi có data

2. Ẩn cột Email
   → Email biến mất

3. F5
   → Email vẫn ẩn

4. Đóng browser mở lại
   → Email vẫn ẩn

5. Sort Doanh thu DESC
   → pagination vẫn đúng

6. Sang page 3
   → hide/show column không phá pagination

7. Conditional formatting
   → sau hide/show vẫn đúng column

8. Export Excel
   → vẫn export đầy đủ dữ liệu

9. Looker filter thay đổi data
   → table redraw
   → config cột không mất

10. Hai custom table trên cùng report
    → config không ghi đè nhau
```

**Phạm vi em khuyên làm ở iteration này:** bỏ Skeleton + sửa `appRoot` + sửa persistence/race condition + stable column ID + storage namespace. Sort/pagination/conditional formatting hiện tại chỉ cần giữ nguyên, chưa refactor thêm để giảm rủi ro.

Sau iteration này flow sẽ sạch hơn rất nhiều:

```text
Looker
  ↓
DSCC data
  ↓
restore user preferences
  ↓
process
  ↓
render
```

và không còn Skeleton hay bất kỳ `document.body.innerHTML = ''` nào có khả năng giết `storage_bridge`.
