Mình đã mở và check toàn bộ `customLooker.zip`. Phần **skeleton loading thực ra đã được bạn thêm vào đúng cả `src/index.js`, `index.css` và `index.bundle.js`** rồi.

Nhưng hiện tại có 3 điểm đáng chú ý:

1. **Skeleton chỉ xuất hiện lúc visualization khởi động lần đầu.** Ngay khi `drawVisualization(data)` được gọi, dòng này xóa skeleton ngay:

```js
document.body.innerHTML = '';
```

Nếu Looker trả data rất nhanh thì skeleton chỉ tồn tại vài mili-giây nên gần như không nhìn thấy.

2. Khi filter/data thay đổi, code hiện tại **không có bước chuyển về skeleton trước khi render lại**, nên bạn sẽ không thấy loading ở các lần refresh sau.

3. Quan trọng: `manifest.json` hiện đang load production từ:

```text
gs://analytics_merap/excelchart2/index.bundle.js
gs://analytics_merap/excelchart2/index.css
gs://analytics_merap/excelchart2/index.json
```

và downloader cũng là:

```text
https://storage.googleapis.com/analytics_merap/excelchart2/downloader.html
```

Nghĩa là nếu bạn đang upload file mới sang `table_viz_prod` như ảnh trước đó thì **Looker vẫn chạy code trong `excelchart2`**, không phải code mới.

### Skeleton hiện tại của bạn

Đoạn này đúng ý tưởng:

```js
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', showSkeleton);
} else {
    showSkeleton();
}

function drawVisualization(data) {
    try {
        if (!document.body) return;

        // Clear skeleton hoặc giao diện cũ
        document.body.innerHTML = '';
```

Mình đề xuất sửa một chút cho chắc hơn:

```js
let firstRender = true;

function showSkeleton() {
    if (!document.body) return;

    document.body.innerHTML = `
        <div class="container skeleton-container">
            <div class="skeleton skeleton-btn"></div>

            <div class="skeleton-table">
                <div class="skeleton skeleton-header"></div>
                <div class="skeleton skeleton-row"></div>
                <div class="skeleton skeleton-row"></div>
                <div class="skeleton skeleton-row"></div>
                <div class="skeleton skeleton-row"></div>
                <div class="skeleton skeleton-row"></div>
            </div>
        </div>
    `;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSkeleton, { once: true });
} else {
    showSkeleton();
}

function drawVisualization(data) {
    try {
        if (!document.body) return;

        firstRender = false;

        // Data đã về -> bỏ skeleton
        document.body.innerHTML = '';

        // ... phần render table hiện tại
```

CSS skeleton của bạn thì **ổn**, animation shimmer đã có:

```css
@keyframes shimmer {
    0% {
        background-position: -200% 0;
    }
    100% {
        background-position: 200% 0;
    }
}

.skeleton {
    background: linear-gradient(
        90deg,
        #f3f4f6 25%,
        #e5e7eb 50%,
        #f3f4f6 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
    border-radius: 6px;
}
```

### Vì sao bạn có thể đang không thấy skeleton?

Khả năng cao nhất là **data load quá nhanh**. Để test riêng skeleton, tạm thời đổi phần đầu `drawVisualization()` thành:

```js
function drawVisualization(data) {
    setTimeout(() => {
        renderVisualization(data);
    }, 1500);
}
```

Khi đó bạn sẽ thấy skeleton chạy khoảng **1.5 giây**, sau đó bảng xuất hiện. Đây **chỉ dùng để test**, production không nên cố tình delay.

### Mình đề xuất làm bản hoàn chỉnh như này

```text
Mở visualization
       ↓
Skeleton shimmer
       ↓
Looker gửi data
       ↓
Render table
       ↓
Skeleton biến mất

Có data          → Table
Không có data    → Thông báo "Chưa có dữ liệu"
Có lỗi           → Thông báo lỗi
```

Ngoài ra mình sẽ giữ nguyên toàn bộ chức năng **Xuất Excel**, không đụng đến logic hiện tại.

Nếu bạn muốn, mình có thể **sửa trực tiếp bộ source bạn vừa gửi**, build lại `index.bundle.js` và trả lại cho bạn một file `customLooker_skeleton.zip` để bạn chỉ việc upload lên GCS.
