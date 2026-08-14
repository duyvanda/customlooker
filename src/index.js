// Import thư viện Looker Studio Community Viz SDK
import * as dscc from '@google/dscc';

// Biến trạng thái toàn cục
let firstRender = true;
let currentData = null;

let tableState = {
    sortColumn: null,       // index cột đang sort trong displayColumns (0-based)
    sortDirection: 'asc',   // 'asc' | 'desc'
    currentPage: 1,
    pageSize: 25,           // 10 | 25 | 50 | 100 | 250 | 500 | 1000 | -1 (Tất cả)
    searchQuery: ''
};

// HÀM HIỂN THỊ SKELETON LOADING
function showSkeleton() {
    try {
        if (!document.body) return;

        if (!document.getElementById('excelviz-skeleton-style')) {
            const style = document.createElement('style');
            style.id = 'excelviz-skeleton-style';
            style.textContent = `
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .skeleton {
                    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.4s ease-in-out infinite;
                    border-radius: 6px;
                }
                .skeleton-container {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    padding: 12px;
                    box-sizing: border-box;
                    width: 100%;
                }
                .skeleton-btn {
                    width: 200px;
                    height: 34px;
                }
                .skeleton-table {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .skeleton-header {
                    height: 38px;
                    opacity: 0.9;
                }
                .skeleton-row {
                    height: 32px;
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

// HÀM PHỤ: Mở helper page và truyền dữ liệu qua postMessage
const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart2/downloader.html';

function downloadViaHelper(payload) {
    const helperWindow = window.open(DOWNLOADER_URL, '_blank');
    if (!helperWindow) {
        alert('Popup bị chặn! Vui lòng cho phép popup (Allow Popups) trên trình duyệt cho trang Looker Studio.');
        return;
    }

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

// HÀM SO SÁNH DỮ LIỆU ĐA KIỂU (Numbers, Dates, Strings tiếng Việt)
function compareValues(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined || a === '') return 1;
    if (b === null || b === undefined || b === '') return -1;

    // So sánh kiểu số
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB) && typeof a !== 'boolean' && typeof b !== 'boolean') {
        return numA - numB;
    }

    // So sánh ngày tháng
    if (isValidDate(String(a)) && isValidDate(String(b))) {
        return new Date(a).getTime() - new Date(b).getTime();
    }

    // So sánh chuỗi tiếng Việt chuẩn
    return new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }).compare(String(a), String(b));
}

// HÀM CONDITIONAL FORMATTING
function formatCellContent(val) {
    if (val === null || val === undefined || String(val).trim() === '') {
        return '';
    }

    const strVal = String(val).trim();
    const lowerVal = strVal.toLowerCase();

    if (lowerVal === 'success' || lowerVal === 'done' || lowerVal === 'hoàn thành' || lowerVal === 'đạt' || lowerVal === 'active' || lowerVal === 'on') {
        return `<span class="badge badge-success">✓ ${strVal}</span>`;
    }
    if (lowerVal === 'fail' || lowerVal === 'failed' || lowerVal === 'cancel' || lowerVal === 'hủy' || lowerVal === 'thất bại' || lowerVal === 'late' || lowerVal === 'off' || lowerVal === 'chưa đạt') {
        return `<span class="badge badge-danger">✕ ${strVal}</span>`;
    }
    if (lowerVal === 'pending' || lowerVal === 'chờ xử lý' || lowerVal === 'đang xử lý' || lowerVal === 'warning') {
        return `<span class="badge badge-warning">⏳ ${strVal}</span>`;
    }
    if (lowerVal === 'staging' || lowerVal === 'info' || lowerVal === 'ch-replace') {
        return `<span class="badge badge-info">${strVal}</span>`;
    }
    if (lowerVal === 'none' || lowerVal === 'null' || lowerVal === 'n/a') {
        return `<span class="badge badge-gray">${strVal}</span>`;
    }

    const numVal = Number(val);
    if (!isNaN(numVal) && typeof val !== 'boolean' && !isValidDate(strVal)) {
        if (numVal < 0) {
            return `<span class="cell-negative">${numVal.toLocaleString('vi-VN')}</span>`;
        }
        return numVal.toLocaleString('vi-VN');
    }

    return strVal;
}

// HÀM RENDER BẢNG CHÍNH VỚI SORT, PAGINATION, SEARCH, EXCEL
function renderTable() {
    if (!document.body || !currentData) return;

    // Lưu lại vị trí con trỏ và trạng thái focus của ô search nếu đang gõ
    const prevSearchInput = document.getElementById('main-search-input');
    const wasFocused = (document.activeElement === prevSearchInput);
    const cursorPosition = prevSearchInput ? prevSearchInput.selectionStart : null;

    // Đọc cấu hình từ tab Style của Looker Studio
    const styleConfig = currentData.style || {};
    const showSearchConfig = styleConfig.showSearch ? styleConfig.showSearch.value !== false : true;

    // Lấy thông tin fields và headers từ Looker Studio
    const fields = currentData.fields || {};
    const allHeaders = (currentData.tables && currentData.tables.DEFAULT) ? currentData.tables.DEFAULT.headers : [];
    const rawRows = (currentData.tables && currentData.tables.DEFAULT) ? currentData.tables.DEFAULT.rows : [];

    // Phân loại: Cột hiển thị (Display Columns)
    const displayHeaders = [];
    const displayColIndices = [];

    if (fields.dimensions && Array.isArray(fields.dimensions)) {
        fields.dimensions.forEach(f => {
            const idx = allHeaders.findIndex(h => h.id === f.id || h.name === f.name);
            if (idx !== -1 && !displayColIndices.includes(idx)) {
                displayColIndices.push(idx);
                displayHeaders.push(f.name);
            }
        });
    }

    if (fields.metrics && Array.isArray(fields.metrics)) {
        fields.metrics.forEach(f => {
            const idx = allHeaders.findIndex(h => h.id === f.id || h.name === f.name);
            if (idx !== -1 && !displayColIndices.includes(idx)) {
                displayColIndices.push(idx);
                displayHeaders.push(f.name);
            }
        });
    }

    if (displayColIndices.length === 0 && allHeaders.length > 0) {
        allHeaders.forEach((h, idx) => {
            displayColIndices.push(idx);
            displayHeaders.push(h.name);
        });
    }

    // Phân tích Cột tìm kiếm nhanh (do Admin kéo thả vào slot searchFields trong Setup)
    const designatedSearchIndices = [];
    const designatedSearchNames = [];
    if (fields.searchFields && Array.isArray(fields.searchFields) && fields.searchFields.length > 0) {
        fields.searchFields.forEach(f => {
            const idx = allHeaders.findIndex(h => h.id === f.id || h.name === f.name);
            if (idx !== -1 && !designatedSearchIndices.includes(idx)) {
                designatedSearchIndices.push(idx);
                designatedSearchNames.push(f.name);
            }
        });
    }

    // Tự động tạo gợi ý tìm kiếm (Placeholder)
    let autoPlaceholder = 'Tìm kiếm nhanh...';
    if (designatedSearchNames.length > 0) {
        autoPlaceholder = `Tìm theo: ${designatedSearchNames.join(', ')}...`;
    }
    const finalPlaceholder = (styleConfig.searchPlaceholder && styleConfig.searchPlaceholder.value && styleConfig.searchPlaceholder.value.trim() !== '')
        ? styleConfig.searchPlaceholder.value
        : autoPlaceholder;

    // 1. FILTER THEO TÌM KIẾM
    let filteredRows = rawRows;
    if (tableState.searchQuery && tableState.searchQuery.trim() !== '') {
        const words = tableState.searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        
        // Quét trên các cột searchFields (nếu có kéo thả) hoặc trên toàn bộ cột hiển thị
        const targetCols = designatedSearchIndices.length > 0 ? designatedSearchIndices : displayColIndices;

        filteredRows = rawRows.filter(row => {
            return words.every(word => {
                return targetCols.some(colIdx => {
                    const cellVal = row[colIdx];
                    return String(cellVal || '').toLowerCase().includes(word);
                });
            });
        });
    }

    // 2. SORT DỮ LIỆU
    let sortedRows = [...filteredRows];
    if (tableState.sortColumn !== null && tableState.sortColumn >= 0 && tableState.sortColumn < displayColIndices.length) {
        const actualColIdx = displayColIndices[tableState.sortColumn];
        const dir = tableState.sortDirection === 'desc' ? -1 : 1;
        sortedRows.sort((rowA, rowB) => {
            return dir * compareValues(rowA[actualColIdx], rowB[actualColIdx]);
        });
    }

    // 3. PHÂN TRANG (PAGINATION)
    const totalRows = sortedRows.length;
    const pageSize = tableState.pageSize === -1 ? totalRows : tableState.pageSize;
    const totalPages = Math.max(1, Math.ceil(totalRows / (pageSize || 1)));
    
    if (tableState.currentPage > totalPages) tableState.currentPage = totalPages;
    if (tableState.currentPage < 1) tableState.currentPage = 1;

    const startIdx = (tableState.currentPage - 1) * pageSize;
    const endIdx = tableState.pageSize === -1 ? totalRows : Math.min(startIdx + pageSize, totalRows);
    const pageRows = sortedRows.slice(startIdx, endIdx);

    // DỰNG GIAO DIỆN HTML
    document.body.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    // 1. TOOLBAR PHÍA TRÊN
    const toolbar = document.createElement('div');
    toolbar.className = 'table-toolbar';

    // Toolbar Left
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'toolbar-left';

    const btnExcel = document.createElement('button');
    btnExcel.className = 'btn-excel';
    btnExcel.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/><path d="m15.5 15.5-1.4 1.4-2.1-2.1V19h-2v-4.2l-2.1 2.1-1.4-1.4 4.5-4.5 4.5 4.5z"/></svg>
        <span>Xuất Excel (${rawRows.length.toLocaleString('vi-VN')} dòng)</span>
    `;
    toolbarLeft.appendChild(btnExcel);

    // SEARCH INPUT (Không cần dropdown chọn cột vì Admin đã cấu hình cột tìm kiếm)
    if (showSearchConfig) {
        const searchBox = document.createElement('div');
        searchBox.className = 'search-box';
        searchBox.innerHTML = `
            <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        `;

        const searchInput = document.createElement('input');
        searchInput.id = 'main-search-input';
        searchInput.className = 'search-input';
        searchInput.type = 'text';
        searchInput.placeholder = finalPlaceholder;
        searchInput.value = tableState.searchQuery;
        
        searchInput.addEventListener('input', (e) => {
            tableState.searchQuery = e.target.value;
            tableState.currentPage = 1;
            renderTable();
        });

        searchBox.appendChild(searchInput);
        toolbarLeft.appendChild(searchBox);
    }

    toolbar.appendChild(toolbarLeft);

    // Toolbar Right (Chọn Rows/Page)
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'toolbar-right';
    toolbarRight.innerHTML = `<span>Dòng/trang:</span>`;

    const pageSelect = document.createElement('select');
    pageSelect.className = 'page-size-select';
    
    const sizeOptions = [10, 25, 50, 100, 250, 500, 1000, -1];
    sizeOptions.forEach(size => {
        const opt = document.createElement('option');
        opt.value = size;
        opt.textContent = size === -1 ? 'Tất cả' : size;
        if (tableState.pageSize === size) opt.selected = true;
        pageSelect.appendChild(opt);
    });
    pageSelect.addEventListener('change', (e) => {
        tableState.pageSize = Number(e.target.value);
        tableState.currentPage = 1;
        renderTable();
    });
    toolbarRight.appendChild(pageSelect);

    toolbar.appendChild(toolbarRight);
    wrapper.appendChild(toolbar);

    // 2. KHUNG CHỨA BẢNG CUỘN ĐƯỢC (STICKY HEADER)
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'table-scroll-container';

    const table = document.createElement('table');
    table.className = 'preview-table';

    // THEAD
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    displayHeaders.forEach((hText, displayColIdx) => {
        const th = document.createElement('th');
        const isSorted = tableState.sortColumn === displayColIdx;
        if (isSorted) th.className = 'th-sorted';

        let icon = '↕';
        if (isSorted) {
            icon = tableState.sortDirection === 'asc' ? '▲' : '▼';
        }

        th.innerHTML = `
            <div class="th-content">
                <span>${hText}</span>
                <span class="sort-icon">${icon}</span>
            </div>
        `;

        th.addEventListener('click', () => {
            if (tableState.sortColumn === displayColIdx) {
                tableState.sortDirection = tableState.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                tableState.sortColumn = displayColIdx;
                tableState.sortDirection = 'asc';
            }
            renderTable();
        });

        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // TBODY
    const tbody = document.createElement('tbody');
    if (pageRows.length > 0) {
        pageRows.forEach(row => {
            const tr = document.createElement('tr');
            displayColIndices.forEach((actualColIdx) => {
                const td = document.createElement('td');
                const cellVal = row[actualColIdx];
                
                if (!isNaN(cellVal) && cellVal !== null && cellVal !== '' && typeof cellVal !== 'boolean' && !isValidDate(String(cellVal))) {
                    td.className = 'cell-number';
                }

                td.innerHTML = formatCellContent(cellVal);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = displayHeaders.length || 1;
        td.style.textAlign = 'center';
        td.style.padding = '40px 20px';
        td.style.color = '#94a3b8';
        td.style.fontSize = '14px';
        td.innerText = tableState.searchQuery ? 'Không tìm thấy dữ liệu phù hợp với từ khóa.' : 'Chưa có dữ liệu. Vui lòng thêm Dimension hoặc Metric.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scrollContainer.appendChild(table);
    wrapper.appendChild(scrollContainer);

    // 3. PAGINATION FOOTER
    const paginationFooter = document.createElement('div');
    paginationFooter.className = 'table-pagination';

    const pageInfo = document.createElement('div');
    pageInfo.className = 'pagination-info';
    if (totalRows > 0) {
        pageInfo.textContent = `Hiển thị ${startIdx + 1}–${endIdx} trên tổng số ${totalRows.toLocaleString('vi-VN')} dòng`;
    } else {
        pageInfo.textContent = '0 dòng';
    }
    paginationFooter.appendChild(pageInfo);

    const paginationControls = document.createElement('div');
    paginationControls.className = 'pagination-controls';

    if (totalPages > 1 && tableState.pageSize !== -1) {
        // Nút Trước
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.textContent = '‹ Trước';
        prevBtn.disabled = tableState.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (tableState.currentPage > 1) {
                tableState.currentPage--;
                renderTable();
            }
        });
        paginationControls.appendChild(prevBtn);

        // Hiển thị số trang
        let startPage = Math.max(1, tableState.currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        if (startPage > 1) {
            const firstPageBtn = document.createElement('button');
            firstPageBtn.className = 'page-btn';
            firstPageBtn.textContent = '1';
            firstPageBtn.addEventListener('click', () => { tableState.currentPage = 1; renderTable(); });
            paginationControls.appendChild(firstPageBtn);

            if (startPage > 2) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.color = '#94a3b8';
                dots.style.padding = '0 2px';
                paginationControls.appendChild(dots);
            }
        }

        for (let p = startPage; p <= endPage; p++) {
            const pBtn = document.createElement('button');
            pBtn.className = `page-btn ${p === tableState.currentPage ? 'active' : ''}`;
            pBtn.textContent = p;
            pBtn.addEventListener('click', () => {
                tableState.currentPage = p;
                renderTable();
            });
            paginationControls.appendChild(pBtn);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.color = '#94a3b8';
                dots.style.padding = '0 2px';
                paginationControls.appendChild(dots);
            }
            const lastPageBtn = document.createElement('button');
            lastPageBtn.className = 'page-btn';
            lastPageBtn.textContent = totalPages;
            lastPageBtn.addEventListener('click', () => { tableState.currentPage = totalPages; renderTable(); });
            paginationControls.appendChild(lastPageBtn);
        }

        // Nút Sau
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.textContent = 'Sau ›';
        nextBtn.disabled = tableState.currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (tableState.currentPage < totalPages) {
                tableState.currentPage++;
                renderTable();
            }
        });
        paginationControls.appendChild(nextBtn);
    }

    paginationFooter.appendChild(paginationControls);
    wrapper.appendChild(paginationFooter);

    document.body.appendChild(wrapper);

    // KHÔI PHỤC FOCUS & VỊ TRÍ CON TRỎ CHO Ô SEARCH (Tránh bị ngắt khi gõ chữ)
    if (wasFocused) {
        const newSearchInput = document.getElementById('main-search-input');
        if (newSearchInput) {
            newSearchInput.focus();
            const pos = cursorPosition !== null ? cursorPosition : newSearchInput.value.length;
            newSearchInput.setSelectionRange(pos, pos);
        }
    }

    // SỰ KIỆN XUẤT FILE EXCEL: XUẤT TOÀN BỘ CỘT HIỂN THỊ CỦA DATASET
    btnExcel.addEventListener('click', () => {
        try {
            if (!rawRows || rawRows.length === 0) {
                alert('Không có dữ liệu để xuất file!');
                return;
            }

            if (displayHeaders.length === 0) {
                alert('Chưa có cột nào được chọn!');
                return;
            }

            const rowsToExport = sortedRows.length > 0 ? sortedRows : rawRows;

            const excelRows = rowsToExport.map(row => {
                return displayColIndices.map(colIdx => {
                    const cellVal = row[colIdx];
                    return (cellVal === null || cellVal === undefined) ? '' : cellVal;
                });
            });

            const todayStr = new Date().toISOString().slice(0, 10);
            const fileName = `Bao_cao_rawdata_${todayStr}.xlsx`;

            downloadViaHelper({
                type: 'EXCEL_DOWNLOAD',
                headers: displayHeaders,
                rows: excelRows,
                fileName: fileName
            });

        } catch (err) {
            console.error('[ExcelViz] Export error:', err);
            alert('Lỗi khi xuất file: ' + err.message);
        }
    });
}

// HÀM NHẬN DỮ LIỆU TỪ LOOKER STUDIO
function drawVisualization(data) {
    try {
        if (!document.body) return;

        currentData = data;

        const delay = firstRender ? 700 : 0;
        firstRender = false;

        setTimeout(() => {
            renderTable();
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
