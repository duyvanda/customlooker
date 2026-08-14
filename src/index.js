// Import thư viện Looker Studio Community Viz SDK
import * as dscc from '@google/dscc';

// Biến trạng thái lần đầu render
let firstRender = true;

// HÀM HIỂN THỊ SKELETON LOADING (Nhúng trực tiếp CSS để hiển thị tức thì 100%)
function showSkeleton() {
    try {
        if (!document.body) return;

        // Inject trực tiếp CSS Skeleton vào head nếu chưa có (không phụ thuộc file CSS ngoài)
        if (!document.getElementById('excelviz-skeleton-style')) {
            const style = document.createElement('style');
            style.id = 'excelviz-skeleton-style';
            style.textContent = `
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .skeleton {
                    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.4s ease-in-out infinite;
                    border-radius: 6px;
                }
                .skeleton-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 10px;
                    box-sizing: border-box;
                    width: 100%;
                }
                .skeleton-btn {
                    width: 210px;
                    height: 38px;
                }
                .skeleton-table {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .skeleton-header {
                    height: 36px;
                    opacity: 0.85;
                }
                .skeleton-row {
                    height: 28px;
                    opacity: 0.65;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.innerHTML = `
            <div class="skeleton-container">
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
    } catch (e) {
        console.warn('[ExcelViz] Skeleton load warning:', e);
    }
}

// Khởi chạy skeleton ngay
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSkeleton, { once: true });
} else {
    showSkeleton();
}

// HÀM PHỤ: Kiểm tra chuỗi có phải là định dạng Ngày tháng / Timestamp hợp lệ không
function isValidDate(dateStr) {
    if (typeof dateStr !== 'string') return false;
    if (!dateStr.includes('-') && !dateStr.includes('/') && !dateStr.includes(':')) return false;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
}

// HÀM PHỤ: Mở helper page và truyền dữ liệu qua postMessage (polling liên tục để đảm bảo nhận được)
const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart2/downloader.html';

function downloadViaHelper(payload) {
    const helperWindow = window.open(DOWNLOADER_URL, '_blank');
    if (!helperWindow) {
        alert('Popup bị chặn! Vui lòng cho phép popup (Allow Popups) trên trình duyệt cho trang Looker Studio.');
        return;
    }

    // Polling gửi postMessage mỗi 300ms trong 6s để helper nhận ngay khi sẵn sàng
    let attempts = 0;
    const maxAttempts = 20; // 20 * 300ms = 6 giây
    const interval = setInterval(() => {
        attempts++;
        try {
            helperWindow.postMessage(payload, '*');
        } catch (e) {
            console.error('[ExcelViz] postMessage error:', e);
        }
        if (attempts >= maxAttempts) {
            clearInterval(interval);
        }
    }, 300);
}

// HÀM RENDER NỘI DUNG THẬT
function renderActualTable(data) {
    if (!document.body) return;

    // Xóa skeleton để render nội dung thật
    document.body.innerHTML = '';

    // Tạo container chính
    const container = document.createElement('div');
    container.className = 'container';

    // TẠO NÚT BẤM DOWNLOAD EXCEL
    const btn = document.createElement('button');
    btn.className = 'btn-excel';
    btn.innerHTML = '📊 Xuất File Excel (.xlsx)';
    container.appendChild(btn);

    // Lấy danh sách tên cột (Headers) từ fields
    const headers = [];
    const fields = data.fields || {};

    // Duyệt tất cả concept keys (dimensions, metrics...)
    Object.keys(fields).forEach(conceptKey => {
        const conceptFields = fields[conceptKey];
        if (Array.isArray(conceptFields)) {
            conceptFields.forEach(f => {
                if (f && f.name) headers.push(f.name);
            });
        }
    });

    // Lấy rows từ bảng DEFAULT
    const rows = (data.tables && data.tables.DEFAULT) ? data.tables.DEFAULT.rows : [];

    // TẠO BẢNG HTML ĐỂ PREVIEW TRÊN DASHBOARD
    const table = document.createElement('table');
    table.className = 'preview-table';

    // Tạo dòng Header cho bảng HTML
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(hText => {
        const th = document.createElement('th');
        th.innerText = hText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Đổ dữ liệu vào các dòng (Rows) cho bảng HTML Preview
    const tbody = document.createElement('tbody');
    if (rows && rows.length > 0) {
        rows.forEach(rowData => {
            const tr = document.createElement('tr');
            rowData.forEach(cellData => {
                const td = document.createElement('td');
                td.innerText = (cellData === null || cellData === undefined) ? '' : String(cellData);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = headers.length || 1;
        td.style.textAlign = 'center';
        td.style.padding = '20px';
        td.style.color = '#9ca3af';
        td.innerText = 'Chưa có dữ liệu. Vui lòng thêm Dimension hoặc Metric.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
    document.body.appendChild(container);

    // XỬ LÝ SỰ KIỆN CLICK NÚT DOWNLOAD EXCEL
    btn.addEventListener('click', () => {
        try {
            if (!rows || rows.length === 0) {
                alert('Không có dữ liệu để xuất file!');
                return;
            }

            if (headers.length === 0) {
                alert('Chưa có cột nào được chọn!');
                return;
            }

            // Biến đổi dữ liệu thô thành mảng object chuẩn
            const excelData = rows.map(row => {
                let rowObject = {};
                headers.forEach((headerName, index) => {
                    const cellValue = row[index];
                    if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') {
                        rowObject[headerName] = '';
                    } else if (!isNaN(cellValue) && String(cellValue).trim() !== '' && typeof cellValue !== 'boolean') {
                        rowObject[headerName] = Number(cellValue);
                    } else if (isValidDate(String(cellValue))) {
                        rowObject[headerName] = String(cellValue);
                    } else {
                        rowObject[headerName] = String(cellValue);
                    }
                });
                return rowObject;
            });

            const todayStr = new Date().toISOString().slice(0, 10);
            const fileName = `Bao_cao_rawdata_${todayStr}.xlsx`;

            // Gửi dữ liệu sang helper page
            downloadViaHelper({
                type: 'EXCEL_DOWNLOAD',
                headers: headers,
                rows: rows,
                excelData: excelData,
                fileName: fileName
            });

        } catch (err) {
            console.error('[ExcelViz] Export error:', err);
            alert('Lỗi khi xuất file: ' + err.message);
        }
    });
}

// HÀM CHÍNH: Vẽ giao diện và xử lý dữ liệu từ Looker Studio
function drawVisualization(data) {
    try {
        if (!document.body) return;

        // Giữ skeleton tối thiểu 700ms ở lần nạp đầu tiên để mắt người nhìn thấy hiệu ứng loading mượt mà
        const delay = firstRender ? 700 : 0;
        firstRender = false;

        setTimeout(() => {
            renderActualTable(data);
        }, delay);
    } catch (err) {
        console.error('[ExcelViz] drawVisualization error:', err);
    }
}

// ĐĂNG KÝ SUBSCRIBER ĐỂ NHẬN DỮ LIỆU TỪ LOOKER STUDIO
try {
    dscc.subscribeToData(drawVisualization, { transform: dscc.tableTransform });
} catch (e) {
    console.error('[ExcelViz] dscc subscribe error:', e);
}
