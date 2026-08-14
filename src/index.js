// Import thư viện Looker Studio Community Viz SDK
import * as dscc from '@google/dscc';

// Khóa lưu trữ cấu hình cột và quy tắc màu trên localStorage
const USER_CONFIG_STORAGE_KEY = 'user_tbl_cols_looker_custom_v5';
const USER_RULES_STORAGE_KEY = 'user_tbl_rules_looker_custom_v5';

// Biến trạng thái toàn cục
let firstRender = true;
let currentData = null;
let userColumnConfigs = null; // Cấu hình cột tùy biến
let userConditionalRules = null; // Quy tắc tô màu động từ Modal

let tableState = {
    sortColumn: null,       // index trong columns đang sort (0-based)
    sortDirection: 'asc',   // 'asc' | 'desc'
    currentPage: 1,
    pageSize: 20,           // Mặc định 20 dòng/trang
    lastAdminPageSize: null,
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
                    height: 32px;
                }
                .skeleton-table {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .skeleton-header {
                    height: 36px;
                    opacity: 0.9;
                }
                .skeleton-row {
                    height: 30px;
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
        console.warn('[ExcelViz] Skeleton warning:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSkeleton, { once: true });
} else {
    showSkeleton();
}

// HÀM KIỂM TRA CHÍNH XÁC SỐ THỰC SỰ
function isNumericValue(val) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'number') return !isNaN(val);
    if (typeof val === 'boolean') return false;
    if (typeof val !== 'string') return false;
    const s = val.trim();
    if (s === '') return false;
    return /^-?\d+(\.\d+)?$/.test(s);
}

// HÀM KIỂM TRA ĐỊNH DẠNG NGÀY THÁNG
function isValidDate(dateStr) {
    if (typeof dateStr !== 'string') return false;
    if (!dateStr.includes('-') && !dateStr.includes('/') && !dateStr.includes(':')) return false;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
}

// HÀM MỞ HELPER XUẤT EXCEL
const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart2/downloader.html';

function downloadViaHelper(payload) {
    const helperWindow = window.open(DOWNLOADER_URL, '_blank');
    if (!helperWindow) {
        alert('Popup bị chặn! Vui lòng cho phép popup (Allow Popups) trên trình duyệt cho trang Looker Studio.');
        return;
    }

    let attempts = 0;
    const maxAttempts = 20;
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

// HÀM ĐỊNH DẠNG NGÀY THÁNG ĐA DẠNG
function formatDateValue(val, fmtStyle = 'date') {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();
    
    const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
        const yyyy = match[1];
        const mm = match[2].padStart(2, '0');
        const dd = match[3].padStart(2, '0');
        const hh = (match[4] || '00').padStart(2, '0');
        const min = (match[5] || '00').padStart(2, '0');
        const ss = (match[6] || '00').padStart(2, '0');

        if (fmtStyle === 'date_ddmmyyyy_hhmmss') return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
        if (fmtStyle === 'date_yymmdd') return `${yyyy}-${mm}-${dd}`;
        if (fmtStyle === 'date_mmyyyy') return `${mm}/${yyyy}`;
        if (fmtStyle === 'date_yyyy') return `${yyyy}`;
        return `${dd}-${mm}-${yyyy}`;
    }

    const matchDMY = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (matchDMY) {
        const dd = matchDMY[1].padStart(2, '0');
        const mm = matchDMY[2].padStart(2, '0');
        const yyyy = matchDMY[3];
        return `${dd}-${mm}-${yyyy}`;
    }

    return str;
}

// HÀM ĐÁNH GIÁ VÀ ÁP DỤNG QUY TẮC ĐIỀU KIỆN ĐỘNG
function evaluateAllRules(fieldName, val, allRules) {
    if (!allRules || !Array.isArray(allRules) || allRules.length === 0) return null;
    if (val === null || val === undefined) return null;

    const str = String(val).trim();
    const strLower = str.toLowerCase();
    const isNum = isNumericValue(val);
    const num = isNum ? Number(val) : NaN;

    for (const rule of allRules) {
        if (rule.field !== '*' && rule.field.toLowerCase() !== fieldName.toLowerCase()) {
            continue;
        }

        let matched = false;
        const targetVal = (rule.value || '').trim();
        const targetLower = targetVal.toLowerCase();
        const targetNum = Number(targetVal);

        if (rule.operator === 'contains') {
            matched = targetLower !== '' && strLower.includes(targetLower);
        } else if (rule.operator === 'equals') {
            matched = strLower === targetLower;
        } else if (rule.operator === 'startsWith') {
            matched = strLower.startsWith(targetLower);
        } else if (rule.operator === 'pos') {
            matched = isNum && num >= 0;
        } else if (rule.operator === 'neg') {
            matched = isNum && num < 0;
        } else if (isNum && !isNaN(targetNum)) {
            if (rule.operator === '>') matched = num > targetNum;
            else if (rule.operator === '<') matched = num < targetNum;
            else if (rule.operator === '>=') matched = num >= targetNum;
            else if (rule.operator === '<=') matched = num <= targetNum;
            else if (rule.operator === '==' || rule.operator === 'equals') matched = num === targetNum;
        }

        if (matched) {
            return rule.style;
        }
    }

    return null;
}

// HÀM FORMAT CELL TOÀN DIỆN
function formatTableCell(fieldName, val, colFmt = 'auto', colColor = 'default', allRules = []) {
    if (val === null || val === undefined || String(val).trim() === '') {
        return '';
    }

    const str = String(val).trim();
    const isNum = isNumericValue(val);
    const num = isNum ? Number(val) : NaN;

    // 1. FORMAT GIÁ TRỊ CƠ BẢN
    let formattedVal = str;

    if (colFmt === 'monospace') {
        formattedVal = `<span class="font-mono">${str}</span>`;
    } else if (colFmt === 'badge') {
        formattedVal = `<span class="badge badge-default">${str}</span>`;
    } else if (colFmt.startsWith('date')) {
        formattedVal = formatDateValue(str, colFmt);
    } else if (isNum) {
        if (colFmt === 'number_comma') {
            formattedVal = num.toLocaleString('en-US');
        } else if (colFmt === 'number_vn') {
            const absNum = Math.abs(num);
            let shortStr = '';
            if (absNum >= 1e9) shortStr = (absNum / 1e9).toFixed(2).replace(/\.00$/, '') + ' Tỷ';
            else if (absNum >= 1e6) shortStr = (absNum / 1e6).toFixed(2).replace(/\.00$/, '') + ' Tr';
            else if (absNum >= 1e3) shortStr = (absNum / 1e3).toFixed(1).replace(/\.0$/, '') + ' K';
            else shortStr = absNum.toString();
            formattedVal = num < 0 ? '-' + shortStr : shortStr;
        } else if (colFmt === 'currency') {
            formattedVal = num.toLocaleString('vi-VN') + ' ₫';
        } else if (colFmt === 'percent') {
            if (Math.abs(num) < 1 && num !== 0) formattedVal = (num * 100).toFixed(1).replace(/\.0$/, '') + '%';
            else formattedVal = num.toFixed(1).replace(/\.0$/, '') + '%';
        } else {
            formattedVal = num.toLocaleString('vi-VN');
        }
    } else if (isValidDate(str)) {
        formattedVal = formatDateValue(str, 'date');
    }

    // 2. KIỂM TRA QUY TẮC ĐIỀU KIỆN ĐỘNG (> < = contain startsWith pos neg)
    const ruleStyle = evaluateAllRules(fieldName, val, allRules);
    if (ruleStyle) {
        if (ruleStyle === 'badge_success') return `<span class="badge badge-success">✓ ${str}</span>`;
        if (ruleStyle === 'badge_danger') return `<span class="badge badge-danger">✕ ${str}</span>`;
        if (ruleStyle === 'badge_warning') return `<span class="badge badge-warning">⏳ ${str}</span>`;
        if (ruleStyle === 'badge_info') return `<span class="badge badge-info">${str}</span>`;
        if (ruleStyle === 'badge_gray') return `<span class="badge badge-default">${str}</span>`;
        if (ruleStyle === 'color_green') return `<span class="color-green">${formattedVal}</span>`;
        if (ruleStyle === 'color_red') return `<span class="color-red">${formattedVal}</span>`;
        if (ruleStyle === 'color_amber') return `<span class="color-amber">${formattedVal}</span>`;
        if (ruleStyle === 'color_cyan') return `<span class="color-cyan">${formattedVal}</span>`;
        if (ruleStyle === 'color_pos_neg') {
            return (isNum && num < 0)
                ? `<span class="color-pos-neg-neg">${formattedVal}</span>`
                : `<span class="color-pos-neg-pos">${formattedVal}</span>`;
        }
    }

    // 3. MÀU CỘT CỐ ĐỊNH (Nếu chọn trong Modal)
    if (colColor === 'pos_green_neg_red' && isNum) {
        return num >= 0
            ? `<span class="color-pos-neg-pos">${formattedVal}</span>`
            : `<span class="color-pos-neg-neg">${formattedVal}</span>`;
    }
    if (colColor === 'green') return `<span class="color-green">${formattedVal}</span>`;
    if (colColor === 'red') return `<span class="color-red">${formattedVal}</span>`;
    if (colColor === 'amber') return `<span class="color-amber">${formattedVal}</span>`;
    if (colColor === 'cyan') return `<span class="color-cyan">${formattedVal}</span>`;

    return formattedVal;
}

// HÀM SO SÁNH DỮ LIỆU ĐA KIỂU (Natural Sort)
function compareValues(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined || a === '') return 1;
    if (b === null || b === undefined || b === '') return -1;

    if (isNumericValue(a) && isNumericValue(b)) {
        return Number(a) - Number(b);
    }

    if (isValidDate(String(a)) && isValidDate(String(b))) {
        return new Date(a).getTime() - new Date(b).getTime();
    }

    return new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }).compare(String(a), String(b));
}

// HÀM TRÍCH XUẤT CÁC CỘT HIỂN THỊ (GỒM DIMENSIONS, METRICS, LOẠI TRỪ SEARCHFIELDS)
function extractDisplayFields(currentData) {
    const fields = currentData.fields || {};
    const allHeaders = (currentData.tables && currentData.tables.DEFAULT) ? currentData.tables.DEFAULT.headers : [];
    const displayFields = [];

    const searchFieldIds = (fields.searchFields || []).map(sf => sf.id || sf.name);

    if (fields.dimensions && Array.isArray(fields.dimensions)) {
        fields.dimensions.forEach(f => {
            const rawIdx = allHeaders.findIndex(h => (h.id && h.id === f.id) || h.name === f.name);
            if (rawIdx !== -1 && !displayFields.some(df => df.rawIndex === rawIdx)) {
                displayFields.push({
                    id: f.id || `dim_${rawIdx}`,
                    name: f.name || f.id,
                    rawIndex: rawIdx
                });
            }
        });
    }

    if (fields.metrics && Array.isArray(fields.metrics)) {
        fields.metrics.forEach(f => {
            const rawIdx = allHeaders.findIndex(h => (h.id && h.id === f.id) || h.name === f.name);
            if (rawIdx !== -1 && !displayFields.some(df => df.rawIndex === rawIdx)) {
                displayFields.push({
                    id: f.id || `met_${rawIdx}`,
                    name: f.name || f.id,
                    rawIndex: rawIdx
                });
            }
        });
    }

    if (displayFields.length === 0 && allHeaders.length > 0) {
        allHeaders.forEach((h, idx) => {
            if (!searchFieldIds.includes(h.id) && !searchFieldIds.includes(h.name)) {
                displayFields.push({
                    id: h.id || `col_${idx}`,
                    name: h.name || h.id,
                    rawIndex: idx
                });
            }
        });
    }

    return displayFields;
}

// HÀM ĐỒNG BỘ CẤU HÌNH CỘT (GIỮ NGUYÊN THỨ TỰ, ẨN/HIỆN ĐÃ LƯU)
function syncColumnConfigsWithFields(existingConfigs, displayFields) {
    if (!existingConfigs || !Array.isArray(existingConfigs) || existingConfigs.length === 0) {
        return displayFields.map((df, idx) => ({
            id: df.id || `col_${idx}`,
            field: df.name || df.id || `col_${idx}`,
            title: df.name || df.id || `Cột ${idx + 1}`,
            visible: true,
            format: 'auto',
            color: 'default',
            rawIndex: df.rawIndex
        }));
    }

    const result = [];
    const usedRawIndices = new Set();

    existingConfigs.forEach(ec => {
        const matchedDf = displayFields.find(df => 
            !usedRawIndices.has(df.rawIndex) && (df.name === ec.field || df.id === ec.id)
        );
        if (matchedDf) {
            usedRawIndices.add(matchedDf.rawIndex);
            result.push({
                ...ec,
                rawIndex: matchedDf.rawIndex
            });
        }
    });

    displayFields.forEach((df, idx) => {
        if (!usedRawIndices.has(df.rawIndex)) {
            usedRawIndices.add(df.rawIndex);
            result.push({
                id: df.id || `col_${idx}`,
                field: df.name || df.id || `col_${idx}`,
                title: df.name || df.id || `Cột ${idx + 1}`,
                visible: true,
                format: 'auto',
                color: 'default',
                rawIndex: df.rawIndex
            });
        }
    });

    return result;
}

// HÀM LẤY CẤU HÌNH CỘT ĐÃ LƯU TỪ LOCALSTORAGE
function loadStoredColumnConfigs(displayFields) {
    let saved = null;
    try {
        const item = localStorage.getItem(USER_CONFIG_STORAGE_KEY);
        if (item) saved = JSON.parse(item);
    } catch (e) { }

    return syncColumnConfigsWithFields(saved, displayFields);
}

// HÀM LẤY QUY TẮC MÀU TỪ LOCALSTORAGE
function loadStoredRules() {
    try {
        const item = localStorage.getItem(USER_RULES_STORAGE_KEY);
        if (item) return JSON.parse(item);
    } catch (e) { }
    return [];
}

// HÀM MỞ MODAL TÙY CHỈNH CỘT BẢNG & QUY TẮC MÀU ĐỘNG
function openColumnConfigModal() {
    if (!currentData) return;
    const displayFields = extractDisplayFields(currentData);
    if (!displayFields || displayFields.length === 0) {
        alert('Chưa có dữ liệu cột hiển thị để cấu hình!');
        return;
    }

    let activeTab = 'columns';
    let workingConfigs = JSON.parse(JSON.stringify(userColumnConfigs || loadStoredColumnConfigs(displayFields)));
    let workingRules = JSON.parse(JSON.stringify(userConditionalRules || loadStoredRules()));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'table-col-config-modal';

    function renderModalContent() {
        overlay.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <div class="modal-nav-tabs">
                        <button class="modal-tab-btn ${activeTab === 'columns' ? 'active' : ''}" id="tab-btn-columns">
                            📋 Cấu Hình Cột (${workingConfigs.length})
                        </button>
                        <button class="modal-tab-btn ${activeTab === 'rules' ? 'active' : ''}" id="tab-btn-rules">
                            🎨 Quy Tắc Tô Màu & Badge Động (${workingRules.length})
                        </button>
                    </div>
                    <button class="modal-close-btn" id="btn-close-modal">✕</button>
                </div>
                
                <div class="modal-body">
                    ${activeTab === 'columns' ? `
                        <table class="col-config-table">
                            <thead>
                                <tr>
                                    <th style="width:40px; text-align:center;">STT</th>
                                    <th style="width:70px; text-align:center;">Hiện</th>
                                    <th style="width:170px;">Tên gốc Looker/BQ</th>
                                    <th style="width:210px;">Tên hiển thị (Label)</th>
                                    <th style="width:170px;">Định dạng (Format)</th>
                                    <th style="width:160px;">Màu cột (Color)</th>
                                    <th style="width:90px; text-align:center;">Thứ tự</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${workingConfigs.map((col, idx) => `
                                    <tr>
                                        <td style="text-align:center; color:#94a3b8; font-weight:600;">${idx + 1}</td>
                                        <td style="text-align:center;">
                                            <input type="checkbox" class="col-vis-chk" data-idx="${idx}" ${col.visible !== false ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
                                        </td>
                                        <td style="font-family:'JetBrains Mono',monospace; color:#475569; font-size:11px;">${col.field}</td>
                                        <td>
                                            <input type="text" class="col-config-input col-title-inp" data-idx="${idx}" value="${col.title || col.field}">
                                        </td>
                                        <td>
                                            <select class="col-config-select col-fmt-sel" data-idx="${idx}">
                                                <option value="auto" ${col.format === 'auto' ? 'selected' : ''}>Tự động (Auto)</option>
                                                <option value="badge" ${col.format === 'badge' ? 'selected' : ''}>Thẻ Badge</option>
                                                <option value="number_comma" ${col.format === 'number_comma' ? 'selected' : ''}>Số phẩy (1,234,567)</option>
                                                <option value="number_vn" ${col.format === 'number_vn' ? 'selected' : ''}>Rút gọn VN (1.5 Tr / 2 Tỷ)</option>
                                                <option value="currency" ${col.format === 'currency' ? 'selected' : ''}>Tiền tệ (1,250,000 ₫)</option>
                                                <option value="percent" ${col.format === 'percent' ? 'selected' : ''}>Phần trăm (15.5%)</option>
                                                <option value="date" ${col.format === 'date' ? 'selected' : ''}>Ngày (dd-mm-yyyy)</option>
                                                <option value="date_ddmmyyyy_hhmmss" ${col.format === 'date_ddmmyyyy_hhmmss' ? 'selected' : ''}>Ngày Giờ (dd-mm-yyyy hh:mm:ss)</option>
                                                <option value="monospace" ${col.format === 'monospace' ? 'selected' : ''}>Font Code Monospace</option>
                                            </select>
                                        </td>
                                        <td>
                                            <select class="col-config-select col-color-sel" data-idx="${idx}">
                                                <option value="default" ${col.color === 'default' ? 'selected' : ''}>Mặc định</option>
                                                <option value="pos_green_neg_red" ${col.color === 'pos_green_neg_red' ? 'selected' : ''}>Dương Xanh / Âm Đỏ</option>
                                                <option value="green" ${col.color === 'green' ? 'selected' : ''}>Xanh Lá (Green)</option>
                                                <option value="red" ${col.color === 'red' ? 'selected' : ''}>Đỏ (Red)</option>
                                                <option value="amber" ${col.color === 'amber' ? 'selected' : ''}>Vàng Cam (Amber)</option>
                                                <option value="cyan" ${col.color === 'cyan' ? 'selected' : ''}>Xanh Dương (Cyan)</option>
                                            </select>
                                        </td>
                                        <td style="text-align:center; white-space:nowrap;">
                                            <button class="btn-move btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Di chuyển lên">▲</button>
                                            <button class="btn-move btn-move-down" data-idx="${idx}" ${idx === workingConfigs.length - 1 ? 'disabled' : ''} title="Di chuyển xuống">▼</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : `
                        <div>
                            <div style="font-size:12px; color:#64748b; margin-bottom:10px;">
                                💡 Thiết lập quy tắc điều kiện động (<strong>chứa từ khóa, bằng, lớn hơn, nhỏ hơn, số âm/dương</strong>) để tự động đổi màu chữ hoặc gắn Thẻ Badge cho bất kỳ cột nào.
                            </div>
                            <table class="col-config-table">
                                <thead>
                                    <tr>
                                        <th style="width:160px;">Cột áp dụng</th>
                                        <th style="width:170px;">Điều kiện (Operator)</th>
                                        <th style="width:180px;">Giá trị so sánh</th>
                                        <th style="width:200px;">Kiểu hiển thị</th>
                                        <th style="width:50px; text-align:center;">Xóa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${workingRules.length === 0 ? `
                                        <tr>
                                            <td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">
                                                Chưa có quy tắc nào. Bấm nút bên dưới để thêm quy tắc mới!
                                            </td>
                                        </tr>
                                    ` : workingRules.map((rule, rIdx) => `
                                        <tr>
                                            <td>
                                                <select class="col-config-select rule-field-sel" data-idx="${rIdx}">
                                                    <option value="*" ${rule.field === '*' ? 'selected' : ''}>★ Tất cả cột</option>
                                                    ${workingConfigs.map(c => `<option value="${c.field}" ${rule.field === c.field ? 'selected' : ''}>${c.title || c.field}</option>`).join('')}
                                                </select>
                                            </td>
                                            <td>
                                                <select class="col-config-select rule-op-sel" data-idx="${rIdx}">
                                                    <option value="contains" ${rule.operator === 'contains' ? 'selected' : ''}>Chứa từ khóa (Contains)</option>
                                                    <option value="equals" ${rule.operator === 'equals' ? 'selected' : ''}>Bằng chính xác (= Equals)</option>
                                                    <option value="startsWith" ${rule.operator === 'startsWith' ? 'selected' : ''}>Bắt đầu bằng (Starts with)</option>
                                                    <option value=">" ${rule.operator === '>' ? 'selected' : ''}>Lớn hơn (&gt;)</option>
                                                    <option value="<" ${rule.operator === '<' ? 'selected' : ''}>Nhỏ hơn (&lt;)</option>
                                                    <option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>Lớn hơn hoặc bằng (&gt;=)</option>
                                                    <option value="<=" ${rule.operator === '<=' ? 'selected' : ''}>Nhỏ hơn hoặc bằng (&lt;=)</option>
                                                    <option value="pos" ${rule.operator === 'pos' ? 'selected' : ''}>Số dương (&gt;= 0)</option>
                                                    <option value="neg" ${rule.operator === 'neg' ? 'selected' : ''}>Số âm (&lt; 0)</option>
                                                </select>
                                            </td>
                                            <td>
                                                <input type="text" class="col-config-input rule-val-inp" data-idx="${rIdx}" placeholder="vd: OFF, Staging, Done, 1000..." value="${rule.value || ''}" ${['pos', 'neg'].includes(rule.operator) ? 'disabled style="background:#f1f5f9;"' : ''}>
                                            </td>
                                            <td>
                                                <select class="col-config-select rule-style-sel" data-idx="${rIdx}">
                                                    <option value="badge_success" ${rule.style === 'badge_success' ? 'selected' : ''}>🏷️ Badge Xanh Lá (✓ Success)</option>
                                                    <option value="badge_danger" ${rule.style === 'badge_danger' ? 'selected' : ''}>🏷️ Badge Đỏ (✕ Danger)</option>
                                                    <option value="badge_warning" ${rule.style === 'badge_warning' ? 'selected' : ''}>🏷️ Badge Vàng (⏳ Warning)</option>
                                                    <option value="badge_info" ${rule.style === 'badge_info' ? 'selected' : ''}>🏷️ Badge Xanh Dương (Info)</option>
                                                    <option value="badge_gray" ${rule.style === 'badge_gray' ? 'selected' : ''}>🏷️ Badge Xám (Gray)</option>
                                                    <option value="color_green" ${rule.style === 'color_green' ? 'selected' : ''}>🎨 Chữ Xanh Lá</option>
                                                    <option value="color_red" ${rule.style === 'color_red' ? 'selected' : ''}>🎨 Chữ Đỏ</option>
                                                    <option value="color_amber" ${rule.style === 'color_amber' ? 'selected' : ''}>🎨 Chữ Vàng Cam</option>
                                                    <option value="color_cyan" ${rule.style === 'color_cyan' ? 'selected' : ''}>🎨 Chữ Xanh Dương</option>
                                                    <option value="color_pos_neg" ${rule.style === 'color_pos_neg' ? 'selected' : ''}>🎨 Dương Xanh / Âm Đỏ</option>
                                                </select>
                                            </td>
                                            <td style="text-align:center;">
                                                <button class="btn-del-rule" data-idx="${rIdx}" title="Xóa quy tắc này">🗑️</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                            <button class="btn-add-rule" id="btn-add-rule">+ Thêm Quy Tắc Màu / Badge Mới</button>
                        </div>
                    `}
                </div>
                
                <div class="modal-footer">
                    <button class="btn-modal-reset" id="btn-reset-modal" title="Xóa toàn bộ cấu hình đã lưu và quay về mặc định">🔄 Khôi phục mặc định</button>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-modal-reset" id="btn-cancel-modal">Hủy bỏ</button>
                        <button class="btn-modal-save" id="btn-save-modal">Lưu & Áp Dụng ✓</button>
                    </div>
                </div>
            </div>
        `;

        overlay.querySelector('#tab-btn-columns').onclick = () => { activeTab = 'columns'; renderModalContent(); };
        overlay.querySelector('#tab-btn-rules').onclick = () => { activeTab = 'rules'; renderModalContent(); };
        overlay.querySelector('#btn-close-modal').onclick = () => overlay.remove();
        overlay.querySelector('#btn-cancel-modal').onclick = () => overlay.remove();

        function syncInputsBeforeMove() {
            if (activeTab === 'columns') {
                for (let idx = 0; idx < workingConfigs.length; idx++) {
                    const chk = overlay.querySelector(`.col-vis-chk[data-idx="${idx}"]`);
                    const titleInp = overlay.querySelector(`.col-title-inp[data-idx="${idx}"]`);
                    const fmtSel = overlay.querySelector(`.col-fmt-sel[data-idx="${idx}"]`);
                    const colorSel = overlay.querySelector(`.col-color-sel[data-idx="${idx}"]`);
                    if (chk) workingConfigs[idx].visible = chk.checked;
                    if (titleInp) workingConfigs[idx].title = titleInp.value;
                    if (fmtSel) workingConfigs[idx].format = fmtSel.value;
                    if (colorSel) workingConfigs[idx].color = colorSel.value;
                }
            } else if (activeTab === 'rules') {
                for (let idx = 0; idx < workingRules.length; idx++) {
                    const fieldSel = overlay.querySelector(`.rule-field-sel[data-idx="${idx}"]`);
                    const opSel = overlay.querySelector(`.rule-op-sel[data-idx="${idx}"]`);
                    const valInp = overlay.querySelector(`.rule-val-inp[data-idx="${idx}"]`);
                    const styleSel = overlay.querySelector(`.rule-style-sel[data-idx="${idx}"]`);
                    if (fieldSel) workingRules[idx].field = fieldSel.value;
                    if (opSel) workingRules[idx].operator = opSel.value;
                    if (valInp) workingRules[idx].value = valInp.value;
                    if (styleSel) workingRules[idx].style = styleSel.value;
                }
            }
        }

        if (activeTab === 'columns') {
            overlay.querySelectorAll('.btn-move-up').forEach(btn => {
                btn.onclick = (e) => {
                    syncInputsBeforeMove();
                    const idx = Number(e.currentTarget.dataset.idx);
                    if (idx > 0) {
                        const temp = workingConfigs[idx];
                        workingConfigs[idx] = workingConfigs[idx - 1];
                        workingConfigs[idx - 1] = temp;
                        renderModalContent();
                    }
                };
            });

            overlay.querySelectorAll('.btn-move-down').forEach(btn => {
                btn.onclick = (e) => {
                    syncInputsBeforeMove();
                    const idx = Number(e.currentTarget.dataset.idx);
                    if (idx < workingConfigs.length - 1) {
                        const temp = workingConfigs[idx];
                        workingConfigs[idx] = workingConfigs[idx + 1];
                        workingConfigs[idx + 1] = temp;
                        renderModalContent();
                    }
                };
            });
        }

        if (activeTab === 'rules') {
            const addBtn = overlay.querySelector('#btn-add-rule');
            if (addBtn) {
                addBtn.onclick = () => {
                    syncInputsBeforeMove();
                    workingRules.push({
                        field: '*',
                        operator: 'contains',
                        value: '',
                        style: 'badge_success'
                    });
                    renderModalContent();
                };
            }

            overlay.querySelectorAll('.rule-op-sel').forEach(sel => {
                sel.onchange = (e) => {
                    const idx = Number(e.target.dataset.idx);
                    workingRules[idx].operator = e.target.value;
                    syncInputsBeforeMove();
                    renderModalContent();
                };
            });

            overlay.querySelectorAll('.btn-del-rule').forEach(btn => {
                btn.onclick = (e) => {
                    syncInputsBeforeMove();
                    const idx = Number(e.currentTarget.dataset.idx);
                    workingRules.splice(idx, 1);
                    renderModalContent();
                };
            });
        }

        // Reset toàn bộ về mặc định
        overlay.querySelector('#btn-reset-modal').onclick = () => {
            try {
                localStorage.removeItem(USER_CONFIG_STORAGE_KEY);
                localStorage.removeItem(USER_RULES_STORAGE_KEY);
            } catch (e) { }
            userColumnConfigs = null;
            userConditionalRules = [];
            overlay.remove();
            renderTable();
        };

        // Lưu & Áp Dụng
        overlay.querySelector('#btn-save-modal').onclick = () => {
            syncInputsBeforeMove();
            userColumnConfigs = workingConfigs;
            userConditionalRules = workingRules;
            try {
                localStorage.setItem(USER_CONFIG_STORAGE_KEY, JSON.stringify(userColumnConfigs));
                localStorage.setItem(USER_RULES_STORAGE_KEY, JSON.stringify(userConditionalRules));
            } catch (e) {
                console.warn('Save localStorage error:', e);
            }
            overlay.remove();
            renderTable();
        };
    }

    renderModalContent();
    document.body.appendChild(overlay);
}

// HÀM RENDER BẢNG CHÍNH VỚI FULL TÍNH NĂNG
function renderTable() {
    if (!document.body || !currentData) return;

    // Lưu lại trạng thái focus của ô search
    const prevSearchInput = document.getElementById('main-search-input');
    const wasFocused = (document.activeElement === prevSearchInput);
    const cursorPosition = prevSearchInput ? prevSearchInput.selectionStart : null;

    // Đọc cấu hình từ tab Style & Setup của Looker Studio
    const styleConfig = currentData.style || {};
    const rowDensity = styleConfig.rowDensity?.value || 'normal';
    const tableVariant = styleConfig.tableVariant?.value || 'striped';
    const fontSize = Number(styleConfig.fontSize?.value || '13');
    const showSTT = styleConfig.showSTT?.value === true;
    const textWrap = styleConfig.textWrap?.value === true;
    const showSearch = styleConfig.showSearch?.value !== false;
    const showColConfig = styleConfig.showColConfig?.value !== false;

    // Lấy danh sách quy tắc điều kiện động từ Modal (LocalStorage)
    if (!userConditionalRules) {
        userConditionalRules = loadStoredRules();
    }

    // ĐỒNG BỘ DEFAULT PAGE SIZE TỪ ADMIN SETUP
    const adminDefaultPageSize = (styleConfig.defaultPageSize && styleConfig.defaultPageSize.value !== undefined)
        ? Number(styleConfig.defaultPageSize.value)
        : 20;

    if (tableState.lastAdminPageSize !== adminDefaultPageSize) {
        tableState.lastAdminPageSize = adminDefaultPageSize;
        tableState.pageSize = adminDefaultPageSize;
    }

    // Lấy thông tin fields và raw data từ Looker Studio
    const fields = currentData.fields || {};
    const allHeaders = (currentData.tables && currentData.tables.DEFAULT) ? currentData.tables.DEFAULT.headers : [];
    const rawRows = (currentData.tables && currentData.tables.DEFAULT) ? currentData.tables.DEFAULT.rows : [];

    // Trích xuất các cột cần hiển thị
    const displayFields = extractDisplayFields(currentData);

    // Đồng bộ cấu hình cột với dữ liệu hiện tại
    if (!userColumnConfigs) {
        userColumnConfigs = loadStoredColumnConfigs(displayFields);
    } else {
        userColumnConfigs = syncColumnConfigsWithFields(userColumnConfigs, displayFields);
    }

    // Lọc ra các cột được phép hiển thị (visible !== false)
    const activeColumns = userColumnConfigs.filter(c => c.visible !== false);

    // Xác định các cột tìm kiếm
    const designatedSearchIndices = [];
    const designatedSearchNames = [];
    if (fields.searchFields && Array.isArray(fields.searchFields) && fields.searchFields.length > 0) {
        fields.searchFields.forEach(f => {
            const idx = allHeaders.findIndex(h => (h.id && h.id === f.id) || h.name === f.name);
            if (idx !== -1 && !designatedSearchIndices.includes(idx)) {
                designatedSearchIndices.push(idx);
                designatedSearchNames.push(f.name);
            }
        });
    }

    let autoPlaceholder = 'Tìm kiếm nhanh...';
    if (designatedSearchNames.length > 0) {
        autoPlaceholder = `Tìm theo: ${designatedSearchNames.join(', ')}...`;
    }
    const finalPlaceholder = (styleConfig.searchPlaceholder?.value && styleConfig.searchPlaceholder.value.trim() !== '')
        ? styleConfig.searchPlaceholder.value
        : autoPlaceholder;

    // 1. FILTER TÌM KIẾM
    let filteredRows = rawRows;
    if (tableState.searchQuery && tableState.searchQuery.trim() !== '') {
        const words = tableState.searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const searchCols = designatedSearchIndices.length > 0
            ? designatedSearchIndices
            : activeColumns.map(c => c.rawIndex);

        filteredRows = rawRows.filter(row => {
            return words.every(word => {
                return searchCols.some(colIdx => {
                    const cellVal = row[colIdx];
                    return String(cellVal || '').toLowerCase().includes(word);
                });
            });
        });
    }

    // 2. SORT DỮ LIỆU
    let sortedRows = [...filteredRows];
    if (tableState.sortColumn !== null && tableState.sortColumn >= 0 && tableState.sortColumn < activeColumns.length) {
        const targetCol = activeColumns[tableState.sortColumn];
        const rawIdx = targetCol.rawIndex;
        const dir = tableState.sortDirection === 'desc' ? -1 : 1;
        sortedRows.sort((rowA, rowB) => {
            return dir * compareValues(rowA[rawIdx], rowB[rawIdx]);
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

    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'toolbar-left';

    // Nút Xuất Excel
    const btnExcel = document.createElement('button');
    btnExcel.className = 'btn-excel';
    btnExcel.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/><path d="m15.5 15.5-1.4 1.4-2.1-2.1V19h-2v-4.2l-2.1 2.1-1.4-1.4 4.5-4.5 4.5 4.5z"/></svg>
        <span>Xuất Excel (${rawRows.length.toLocaleString('vi-VN')} dòng)</span>
    `;
    toolbarLeft.appendChild(btnExcel);

    // Nút Tùy chỉnh Cột
    if (showColConfig) {
        const btnColConfig = document.createElement('button');
        btnColConfig.className = 'btn-col-config';
        btnColConfig.innerHTML = `<span>⚙️ Cột Bảng & Màu Sắc</span>`;
        btnColConfig.onclick = openColumnConfigModal;
        toolbarLeft.appendChild(btnColConfig);
    }

    // Ô Tìm kiếm
    if (showSearch) {
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
    
    const sizeOptions = [10, 20, 25, 50, 100, 250, 500, 1000, -1];
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

    // 2. KHUNG CHỨA BẢNG CUỘN ĐƯỢC
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'table-scroll-container';

    const table = document.createElement('table');
    table.className = `preview-table table-${tableVariant} density-${rowDensity} ${textWrap ? '' : 'text-nowrap'}`;
    table.style.fontSize = `${fontSize}px`;

    // THEAD
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    if (showSTT) {
        const sttTh = document.createElement('th');
        sttTh.className = 'cell-stt';
        sttTh.style.cursor = 'default';
        sttTh.innerText = 'STT';
        headerRow.appendChild(sttTh);
    }

    activeColumns.forEach((col, colIdx) => {
        const th = document.createElement('th');
        const isSorted = tableState.sortColumn === colIdx;
        if (isSorted) th.className = 'th-sorted';

        let icon = '↕';
        if (isSorted) {
            icon = tableState.sortDirection === 'asc' ? '▲' : '▼';
        }

        th.innerHTML = `
            <div class="th-content">
                <span>${col.title || col.field}</span>
                <span class="sort-icon">${icon}</span>
            </div>
        `;

        th.addEventListener('click', () => {
            if (tableState.sortColumn === colIdx) {
                tableState.sortDirection = tableState.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                tableState.sortColumn = colIdx;
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
        pageRows.forEach((row, rowIdx) => {
            const tr = document.createElement('tr');

            if (showSTT) {
                const sttTd = document.createElement('td');
                sttTd.className = 'cell-stt';
                sttTd.innerText = startIdx + rowIdx + 1;
                tr.appendChild(sttTd);
            }

            activeColumns.forEach((col) => {
                const td = document.createElement('td');
                const rawVal = row[col.rawIndex];
                
                const isDate = isValidDate(String(rawVal)) || col.format.startsWith('date');
                const isNum = isNumericValue(rawVal) || ['number_comma', 'number_vn', 'currency', 'percent'].includes(col.format);

                if (isNum) {
                    td.className = 'align-right';
                } else if (isDate) {
                    td.className = 'align-center';
                } else {
                    td.className = 'align-left';
                }

                if (textWrap) td.classList.add('text-wrap-cell');

                // Áp dụng định dạng và các quy tắc động > < = contain
                td.innerHTML = formatTableCell(col.field, rawVal, col.format, col.color, userConditionalRules);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = (showSTT ? 1 : 0) + (activeColumns.length || 1);
        td.style.textAlign = 'center';
        td.style.padding = '40px 20px';
        td.style.color = '#94a3b8';
        td.style.fontSize = '13px';
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

    // KHÔI PHỤC FOCUS Ô SEARCH
    if (wasFocused) {
        const newSearchInput = document.getElementById('main-search-input');
        if (newSearchInput) {
            newSearchInput.focus();
            const pos = cursorPosition !== null ? cursorPosition : newSearchInput.value.length;
            newSearchInput.setSelectionRange(pos, pos);
        }
    }

    // SỰ KIỆN XUẤT FILE EXCEL
    btnExcel.addEventListener('click', () => {
        try {
            if (!rawRows || rawRows.length === 0) {
                alert('Không có dữ liệu để xuất file!');
                return;
            }

            if (activeColumns.length === 0) {
                alert('Chưa có cột nào được bật hiển thị!');
                return;
            }

            const exportHeaders = [];
            if (showSTT) exportHeaders.push('STT');
            activeColumns.forEach(c => exportHeaders.push(c.title || c.field));

            const rowsToExport = sortedRows.length > 0 ? sortedRows : rawRows;

            const excelRows = rowsToExport.map((row, rIdx) => {
                const rowData = [];
                if (showSTT) rowData.push(rIdx + 1);
                activeColumns.forEach(c => {
                    const val = row[c.rawIndex];
                    rowData.push(val === null || val === undefined ? '' : val);
                });
                return rowData;
            });

            const todayStr = new Date().toISOString().slice(0, 10);
            const fileName = `Bao_cao_rawdata_${todayStr}.xlsx`;

            downloadViaHelper({
                type: 'EXCEL_DOWNLOAD',
                headers: exportHeaders,
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
