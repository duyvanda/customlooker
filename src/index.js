// Import thư viện Looker Studio Community Viz SDK
import * as dscc from '@google/dscc';

// Khóa lưu trữ cấu hình cột và quy tắc màu trên localStorage & fallback multi-tier
const USER_CONFIG_STORAGE_KEY = 'user_tbl_cols_looker_custom_v6';
const USER_RULES_STORAGE_KEY = 'user_tbl_rules_looker_custom_v6';

// Biến trạng thái toàn cục
let firstRender = true;
let currentData = null;
let userColumnConfigs = null; // Cấu hình cột tùy biến
let userConditionalRules = null; // Quy tắc tô màu động từ Modal

let tableState = {
    sortColumn: null,       // index trong activeColumns đang sort (0-based) hoặc null
    sortDirection: 'asc',   // 'asc' | 'desc'
    currentPage: 1,
    pageSize: 20,           // Mặc định 20 dòng/trang
    lastAdminPageSize: null,
    searchQuery: ''
};

// HỆ THỐNG LƯU TRỮ ĐA TẦNG (MULTI-LAYER PERSISTENCE: LOCALSTORAGE + SESSIONSTORAGE + WINDOW.NAME)
function saveToStorage(key, data) {
    if (!data) return;
    const str = JSON.stringify(data);
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, str); } catch (e) { }
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, str); } catch (e) { }
    try {
        let winStore = {};
        try { winStore = JSON.parse(window.name || '{}'); } catch (e) { winStore = {}; }
        winStore[key] = data;
        window.name = JSON.stringify(winStore);
    } catch (e) { }
}

function loadFromStorage(key) {
    try {
        if (typeof localStorage !== 'undefined') {
            const item = localStorage.getItem(key);
            if (item) return JSON.parse(item);
        }
    } catch (e) { }
    try {
        if (typeof sessionStorage !== 'undefined') {
            const item = sessionStorage.getItem(key);
            if (item) return JSON.parse(item);
        }
    } catch (e) { }
    try {
        if (window.name) {
            const winStore = JSON.parse(window.name);
            if (winStore && winStore[key]) return winStore[key];
        }
    } catch (e) { }
    return null;
}

function removeFromStorage(key) {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch (e) { }
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key); } catch (e) { }
    try {
        if (window.name) {
            const winStore = JSON.parse(window.name);
            if (winStore && winStore[key]) {
                delete winStore[key];
                window.name = JSON.stringify(winStore);
            }
        }
    } catch (e) { }
}

// HỖ TRỢ KÍCH HOẠT FOCUS / CHỌN CHART KHI NHẤP CHUỘT Ở EDIT MODE
try {
    window.addEventListener('click', () => {
        try { window.focus(); } catch (e) { }
    });
    window.addEventListener('mousedown', () => {
        try { window.focus(); } catch (e) { }
    });
} catch (e) { }

// HÀM CHUẨN HÓA BỎ DẤU TIẾNG VIỆT (AN TOÀN TUYỆT ĐỐI VỚI MỌI KIỂU DỮ LIỆU)
function remove_accents(str) {
    if (str === null || str === undefined) return '';
    try {
        return String(str)
            .normalize('NFD')
            .toLowerCase()
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'd');
    } catch (e) {
        return String(str).toLowerCase();
    }
}

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

// HÀM KIỂM TRA CHÍNH XÁC ĐỊNH DẠNG NGÀY THÁNG
function isDateValue(val, fieldType = '') {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    if (str === '') return false;

    const ft = String(fieldType || '').toUpperCase();
    if (ft && (ft.includes('DATE') || ft.includes('YEAR') || ft.includes('TIME') || ft.includes('MONTH') || ft.includes('DAY'))) {
        return true;
    }

    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(str)) {
        return true;
    }

    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})(\d{2})(\d{2})$/.test(str)) {
        return true;
    }

    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str) || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(str)) {
        return true;
    }

    return false;
}

// HÀM KIỂM TRA CHÍNH XÁC SỐ THỰC SỰ
function isNumericValue(val, fieldType = '') {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return false;

    const ft = String(fieldType || '').toUpperCase();
    if (ft && (ft.includes('DATE') || ft.includes('YEAR') || ft.includes('TIME') || ft.includes('MONTH') || ft.includes('DAY') || ft === 'TEXT' || ft === 'STRING')) {
        return false;
    }

    const s = String(val).trim();
    if (s === '') return false;

    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(s)) {
        return false;
    }

    if (typeof val === 'number') return !isNaN(val);
    if (typeof val !== 'string') return false;

    return /^-?\d+(\.\d+)?$/.test(s);
}

// HÀM MỞ HELPER XUẤT EXCEL
const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart2/downloader.html';

function downloadViaHelper(payload) {
    try {
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
    } catch (e) {
        console.error('[ExcelViz] download error:', e);
    }
}

// HÀM ĐỊNH DẠNG NGÀY THÁNG ĐA DẠNG (Chuẩn hóa YYYYMMDD -> dd-mm-yyyy)
function formatDateValue(val, fmtStyle = 'date') {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();

    // 1. Chuỗi YYYYMMDD 8 chữ số Looker Studio
    const match8 = str.match(/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
    if (match8) {
        const yyyy = match8[1];
        const mm = match8[2];
        const dd = match8[3];
        if (fmtStyle === 'date_yymmdd') return `${yyyy}-${mm}-${dd}`;
        if (fmtStyle === 'date_mmyyyy') return `${mm}/${yyyy}`;
        if (fmtStyle === 'date_yyyy') return `${yyyy}`;
        if (fmtStyle === 'date_ddmmyyyy_hhmmss') return `${dd}-${mm}-${yyyy} 00:00:00`;
        return `${dd}-${mm}-${yyyy}`;
    }

    // 2. Chuỗi YYYYMMDDHHMMSS 14 chữ số
    const match14 = str.match(/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})(\d{2})(\d{2})$/);
    if (match14) {
        const yyyy = match14[1];
        const mm = match14[2];
        const dd = match14[3];
        const hh = match14[4];
        const min = match14[5];
        const ss = match14[6];
        if (fmtStyle === 'date_ddmmyyyy_hhmmss') return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
        if (fmtStyle === 'date_yymmdd') return `${yyyy}-${mm}-${dd}`;
        return `${dd}-${mm}-${yyyy}`;
    }

    // 3. Chuỗi YYYY-MM-DD hoặc YYYY/MM/DD
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

    // 4. Chuỗi DD-MM-YYYY hoặc DD/MM/YYYY
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
    const strNormalized = remove_accents(str);
    const isNum = isNumericValue(val);
    const num = isNum ? Number(val) : NaN;

    for (const rule of allRules) {
        if (!rule) continue;
        if (rule.field && rule.field !== '*' && remove_accents(rule.field) !== remove_accents(fieldName)) {
            continue;
        }

        let matched = false;
        const targetVal = (rule.value || '').trim();
        const targetNormalized = remove_accents(targetVal);
        const targetNum = Number(targetVal);

        if (rule.operator === 'contains') {
            matched = targetNormalized !== '' && strNormalized.includes(targetNormalized);
        } else if (rule.operator === 'equals') {
            matched = strNormalized === targetNormalized;
        } else if (rule.operator === 'startsWith') {
            matched = strNormalized.startsWith(targetNormalized);
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
function formatTableCell(fieldName, val, colFmt = 'auto', colColor = 'default', allRules = [], fieldType = '') {
    if (val === null || val === undefined || String(val).trim() === '') {
        return '';
    }

    const str = String(val).trim();
    const strFmt = String(colFmt || 'auto');

    const isDate = isDateValue(val, fieldType) || strFmt.startsWith('date');
    const isNum = !isDate && (isNumericValue(val, fieldType) || ['number_comma', 'number_vn', 'currency', 'percent'].includes(strFmt));
    const num = isNum ? Number(val) : NaN;

    // 1. FORMAT GIÁ TRỊ CƠ BẢN
    let formattedVal = str;

    if (strFmt === 'monospace') {
        formattedVal = `<span class="font-mono">${str}</span>`;
    } else if (strFmt === 'badge') {
        formattedVal = `<span class="badge badge-default">${str}</span>`;
    } else if (isDate) {
        formattedVal = formatDateValue(str, strFmt === 'auto' ? 'date' : strFmt);
    } else if (isNum) {
        if (strFmt === 'number_comma') {
            formattedVal = num.toLocaleString('en-US');
        } else if (strFmt === 'number_vn') {
            const absNum = Math.abs(num);
            let shortStr = '';
            if (absNum >= 1e9) shortStr = (absNum / 1e9).toFixed(2).replace(/\.00$/, '') + ' Tỷ';
            else if (absNum >= 1e6) shortStr = (absNum / 1e6).toFixed(2).replace(/\.00$/, '') + ' Tr';
            else if (absNum >= 1e3) shortStr = (absNum / 1e3).toFixed(1).replace(/\.0$/, '') + ' K';
            else shortStr = absNum.toString();
            formattedVal = num < 0 ? '-' + shortStr : shortStr;
        } else if (strFmt === 'currency') {
            formattedVal = num.toLocaleString('vi-VN') + ' ₫';
        } else if (strFmt === 'percent') {
            if (Math.abs(num) < 1 && num !== 0) formattedVal = (num * 100).toFixed(1).replace(/\.0$/, '') + '%';
            else formattedVal = num.toFixed(1).replace(/\.0$/, '') + '%';
        } else {
            // Tự động: Giữ tối đa 4 số thập phân nếu là số lẻ
            formattedVal = num.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
        }
    }

    // 2. KIỂM TRA QUY TẮC ĐIỀU KIỆN ĐỘNG
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

    return formattedVal;
}

// HÀM SO SÁNH DỮ LIỆU ĐA KIỂU (Natural Sort)
function compareValues(a, b, fieldType = '') {
    if (a === b) return 0;
    const isAEmpty = (a === null || a === undefined || String(a).trim() === '');
    const isBEmpty = (b === null || b === undefined || String(b).trim() === '');
    if (isAEmpty && isBEmpty) return 0;
    if (isAEmpty) return 1;
    if (isBEmpty) return -1;

    const strA = String(a).trim();
    const strB = String(b).trim();

    // 1. So sánh ngày tháng
    if (isDateValue(a, fieldType) && isDateValue(b, fieldType)) {
        return strA.localeCompare(strB);
    }

    // 2. So sánh số thực
    const isNumA = isNumericValue(a, fieldType);
    const isNumB = isNumericValue(b, fieldType);
    if (isNumA && isNumB) {
        return Number(a) - Number(b);
    }

    // 3. So sánh chuỗi tiếng Việt tự nhiên
    return new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }).compare(strA, strB);
}

// HÀM TRÍCH XUẤT CÁC CỘT HIỂN THỊ
function extractDisplayFields(currentData) {
    if (!currentData) return [];
    const fields = currentData.fields || {};
    const allHeaders = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.headers))
        ? currentData.tables.DEFAULT.headers
        : [];
    const displayFields = [];

    if (fields.dimensions && Array.isArray(fields.dimensions)) {
        fields.dimensions.forEach((f, fIdx) => {
            if (!f) return;
            const rawIdx = allHeaders.findIndex(h => h && ((h.id && h.id === f.id) || h.name === f.name));
            const actualIdx = rawIdx !== -1 ? rawIdx : fIdx;
            if (!displayFields.some(df => df.rawIndex === actualIdx)) {
                displayFields.push({
                    id: f.id || `dim_${actualIdx}`,
                    name: f.name || f.id || `Cột ${actualIdx + 1}`,
                    type: (allHeaders[actualIdx] && allHeaders[actualIdx].type) || f.type || '',
                    rawIndex: actualIdx
                });
            }
        });
    }

    if (fields.metrics && Array.isArray(fields.metrics)) {
        fields.metrics.forEach((f, fIdx) => {
            if (!f) return;
            const rawIdx = allHeaders.findIndex(h => h && ((h.id && h.id === f.id) || h.name === f.name));
            const actualIdx = rawIdx !== -1 ? rawIdx : (displayFields.length + fIdx);
            if (!displayFields.some(df => df.rawIndex === actualIdx)) {
                displayFields.push({
                    id: f.id || `met_${actualIdx}`,
                    name: f.name || f.id || `Cột ${actualIdx + 1}`,
                    type: (allHeaders[actualIdx] && allHeaders[actualIdx].type) || f.type || '',
                    rawIndex: actualIdx
                });
            }
        });
    }

    if (displayFields.length === 0 && allHeaders.length > 0) {
        allHeaders.forEach((h, idx) => {
            if (!h) return;
            displayFields.push({
                id: h.id || `col_${idx}`,
                name: h.name || h.id || `Cột ${idx + 1}`,
                type: h.type || '',
                rawIndex: idx
            });
        });
    }

    return displayFields;
}

// HÀM ĐỒNG BỘ CẤU HÌNH CỘT (GIỮ NGUYÊN THỨ TỰ, ẨN/HIỆN, TÌM KIẾM ĐÃ LƯU)
function syncColumnConfigsWithFields(existingConfigs, displayFields) {
    if (!displayFields || !Array.isArray(displayFields) || displayFields.length === 0) {
        return [];
    }

    if (!existingConfigs || !Array.isArray(existingConfigs) || existingConfigs.length === 0) {
        return displayFields.map((df, idx) => ({
            id: df.id || `col_${idx}`,
            field: df.name || df.id || `col_${idx}`,
            title: df.name || df.id || `Cột ${idx + 1}`,
            visible: true,
            searchable: true,
            format: 'auto',
            sort: 'none',
            type: df.type || '',
            rawIndex: df.rawIndex
        }));
    }

    const result = [];
    const usedRawIndices = new Set();

    existingConfigs.forEach(ec => {
        if (!ec) return;
        const matchedDf = displayFields.find(df => 
            !usedRawIndices.has(df.rawIndex) && (df.name === ec.field || df.id === ec.id || df.name === ec.title)
        );
        if (matchedDf) {
            usedRawIndices.add(matchedDf.rawIndex);
            result.push({
                ...ec,
                field: matchedDf.name,
                title: (ec.title && ec.title !== ec.field) ? ec.title : matchedDf.name,
                visible: ec.visible !== false,
                searchable: ec.searchable !== false,
                sort: ec.sort || 'none',
                format: ec.format || 'auto',
                type: matchedDf.type || ec.type || '',
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
                searchable: true,
                format: 'auto',
                sort: 'none',
                type: df.type || '',
                rawIndex: df.rawIndex
            });
        }
    });

    return result;
}

// HÀM LẤY CẤU HÌNH CỘT ĐÃ LƯU
function loadStoredColumnConfigs(displayFields) {
    const saved = loadFromStorage(USER_CONFIG_STORAGE_KEY);
    return syncColumnConfigsWithFields(saved, displayFields);
}

// HÀM LẤY QUY TẮC MÀU
function loadStoredRules() {
    const saved = loadFromStorage(USER_RULES_STORAGE_KEY);
    return Array.isArray(saved) ? saved : [];
}

// HÀM MỞ MODAL TÙY CHỈNH CỘT BẢNG & QUY TẮC MÀU ĐỘNG (KÈM CHỌN CỘT TÌM KIẾM, SẮP XẾP & PHÂN TRANG 10 CỘT)
function openColumnConfigModal() {
    try {
        if (!currentData) return;
        const displayFields = extractDisplayFields(currentData);
        if (!displayFields || displayFields.length === 0) {
            alert('Chưa có dữ liệu cột hiển thị để cấu hình!');
            return;
        }

        let activeTab = 'columns';
        let modalColPage = 1;
        const modalColPageSize = 10;

        let workingConfigs = JSON.parse(JSON.stringify(userColumnConfigs || loadStoredColumnConfigs(displayFields)));
        let workingRules = JSON.parse(JSON.stringify(userConditionalRules || loadStoredRules()));

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'table-col-config-modal';

        function renderModalContent() {
            const totalColPages = Math.max(1, Math.ceil(workingConfigs.length / modalColPageSize));
            if (modalColPage > totalColPages) modalColPage = totalColPages;
            if (modalColPage < 1) modalColPage = 1;

            const startColIdx = (modalColPage - 1) * modalColPageSize;
            const endColIdx = Math.min(startColIdx + modalColPageSize, workingConfigs.length);
            const pagedConfigs = workingConfigs.slice(startColIdx, endColIdx);

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
                                        <th style="width:35px; text-align:center;">STT</th>
                                        <th style="width:45px; text-align:center;">Hiện</th>
                                        <th style="width:45px; text-align:center;" title="Tích chọn để ô tìm kiếm quét trên cột này">🔍 Tìm</th>
                                        <th style="width:160px;">Tên gốc Looker/BQ</th>
                                        <th style="width:180px;">Tên hiển thị (Label)</th>
                                        <th style="width:150px;">Định dạng (Format)</th>
                                        <th style="width:140px;">Sắp xếp (Sort)</th>
                                        <th style="width:70px; text-align:center;">Thứ tự</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pagedConfigs.map((col, pIdx) => {
                                        const globalIdx = startColIdx + pIdx;
                                        return `
                                            <tr>
                                                <td style="text-align:center; color:#64748b; font-weight:700;">${globalIdx + 1}</td>
                                                <td style="text-align:center;">
                                                    <input type="checkbox" class="col-vis-chk" data-idx="${globalIdx}" ${col.visible !== false ? 'checked' : ''} style="cursor:pointer; width:15px; height:15px;" title="Bật/Tắt hiển thị cột">
                                                </td>
                                                <td style="text-align:center;">
                                                    <input type="checkbox" class="col-search-chk" data-idx="${globalIdx}" ${col.searchable !== false ? 'checked' : ''} style="cursor:pointer; width:15px; height:15px;" title="Tích để tìm kiếm trên cột này">
                                                </td>
                                                <td style="font-family:'JetBrains Mono',monospace; color:#000000; font-size:11.5px; font-weight:600;">${col.field}</td>
                                                <td>
                                                    <input type="text" class="col-config-input col-title-inp" data-idx="${globalIdx}" value="${col.title || col.field}">
                                                </td>
                                                <td>
                                                    <select class="col-config-select col-fmt-sel" data-idx="${globalIdx}">
                                                        <option value="auto" ${col.format === 'auto' ? 'selected' : ''}>Tự động (Auto)</option>
                                                        <option value="date" ${col.format === 'date' ? 'selected' : ''}>Ngày (dd-mm-yyyy)</option>
                                                        <option value="date_ddmmyyyy_hhmmss" ${col.format === 'date_ddmmyyyy_hhmmss' ? 'selected' : ''}>Ngày Giờ (dd-mm-yyyy hh:mm:ss)</option>
                                                        <option value="date_mmyyyy" ${col.format === 'date_mmyyyy' ? 'selected' : ''}>Tháng/Năm (mm/yyyy)</option>
                                                        <option value="date_yymmdd" ${col.format === 'date_yymmdd' ? 'selected' : ''}>Chuẩn Quốc Tế (yyyy-mm-dd)</option>
                                                        <option value="badge" ${col.format === 'badge' ? 'selected' : ''}>Thẻ Badge</option>
                                                        <option value="number_comma" ${col.format === 'number_comma' ? 'selected' : ''}>Số phẩy (1,234,567)</option>
                                                        <option value="number_vn" ${col.format === 'number_vn' ? 'selected' : ''}>Rút gọn VN (1.5 Tr / 2 Tỷ)</option>
                                                        <option value="currency" ${col.format === 'currency' ? 'selected' : ''}>Tiền tệ (1,250,000 ₫)</option>
                                                        <option value="percent" ${col.format === 'percent' ? 'selected' : ''}>Phần trăm (15.5%)</option>
                                                        <option value="monospace" ${col.format === 'monospace' ? 'selected' : ''}>Font Code Monospace</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select class="col-config-select col-sort-sel" data-idx="${globalIdx}">
                                                        <option value="none" ${(!col.sort || col.sort === 'none') ? 'selected' : ''}>-- Mặc định --</option>
                                                        <option value="asc" ${col.sort === 'asc' ? 'selected' : ''}>Tăng dần (ASC ▲)</option>
                                                        <option value="desc" ${col.sort === 'desc' ? 'selected' : ''}>Giảm dần (DESC ▼)</option>
                                                    </select>
                                                </td>
                                                <td style="text-align:center; white-space:nowrap;">
                                                    <button class="btn-move btn-move-up" data-idx="${globalIdx}" ${globalIdx === 0 ? 'disabled' : ''} title="Di chuyển lên">▲</button>
                                                    <button class="btn-move btn-move-down" data-idx="${globalIdx}" ${globalIdx === workingConfigs.length - 1 ? 'disabled' : ''} title="Di chuyển xuống">▼</button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                            
                            ${totalColPages > 1 ? `
                                <div class="modal-pagination">
                                    <span>Hiển thị cột ${startColIdx + 1}–${endColIdx} trên tổng số ${workingConfigs.length} cột</span>
                                    <div class="modal-page-controls">
                                        <button class="modal-page-btn" id="modal-prev-page" ${modalColPage === 1 ? 'disabled' : ''}>‹ Trước</button>
                                        ${Array.from({ length: totalColPages }, (_, i) => i + 1).map(p => `
                                            <button class="modal-page-btn ${p === modalColPage ? 'active' : ''}" data-page="${p}">${p}</button>
                                        `).join('')}
                                        <button class="modal-page-btn" id="modal-next-page" ${modalColPage === totalColPages ? 'disabled' : ''}>Sau ›</button>
                                    </div>
                                </div>
                            ` : ''}
                        ` : `
                            <div>
                                <div style="font-size:12px; color:#475569; margin-bottom:10px; font-weight:500;">
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
                            <button class="btn-modal-cancel" id="btn-cancel-modal">Hủy</button>
                            <button class="btn-modal-save" id="btn-save-modal">Lưu</button>
                        </div>
                    </div>
                </div>
            `;

            overlay.querySelector('#tab-btn-columns').onclick = () => { syncInputsBeforeMove(); activeTab = 'columns'; renderModalContent(); };
            overlay.querySelector('#tab-btn-rules').onclick = () => { syncInputsBeforeMove(); activeTab = 'rules'; renderModalContent(); };
            overlay.querySelector('#btn-close-modal').onclick = () => overlay.remove();
            overlay.querySelector('#btn-cancel-modal').onclick = () => overlay.remove();

            function syncInputsBeforeMove() {
                if (activeTab === 'columns') {
                    for (let pIdx = 0; pIdx < pagedConfigs.length; pIdx++) {
                        const globalIdx = startColIdx + pIdx;
                        const chkVis = overlay.querySelector(`.col-vis-chk[data-idx="${globalIdx}"]`);
                        const chkSearch = overlay.querySelector(`.col-search-chk[data-idx="${globalIdx}"]`);
                        const titleInp = overlay.querySelector(`.col-title-inp[data-idx="${globalIdx}"]`);
                        const fmtSel = overlay.querySelector(`.col-fmt-sel[data-idx="${globalIdx}"]`);
                        const sortSel = overlay.querySelector(`.col-sort-sel[data-idx="${globalIdx}"]`);
                        if (chkVis) workingConfigs[globalIdx].visible = chkVis.checked;
                        if (chkSearch) workingConfigs[globalIdx].searchable = chkSearch.checked;
                        if (titleInp) workingConfigs[globalIdx].title = titleInp.value;
                        if (fmtSel) workingConfigs[globalIdx].format = fmtSel.value;
                        if (sortSel) workingConfigs[globalIdx].sort = sortSel.value;
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
                // Sự kiện phân trang trong Modal
                const prevPageBtn = overlay.querySelector('#modal-prev-page');
                if (prevPageBtn) {
                    prevPageBtn.onclick = () => {
                        syncInputsBeforeMove();
                        if (modalColPage > 1) {
                            modalColPage--;
                            renderModalContent();
                        }
                    };
                }

                const nextPageBtn = overlay.querySelector('#modal-next-page');
                if (nextPageBtn) {
                    nextPageBtn.onclick = () => {
                        syncInputsBeforeMove();
                        if (modalColPage < totalColPages) {
                            modalColPage++;
                            renderModalContent();
                        }
                    };
                }

                overlay.querySelectorAll('.modal-page-btn[data-page]').forEach(btn => {
                    btn.onclick = (e) => {
                        syncInputsBeforeMove();
                        modalColPage = Number(e.target.dataset.page);
                        renderModalContent();
                    };
                });

                // Di chuyển cột lên/xuống
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
                removeFromStorage(USER_CONFIG_STORAGE_KEY);
                removeFromStorage(USER_RULES_STORAGE_KEY);
                userColumnConfigs = null;
                userConditionalRules = [];
                tableState.sortColumn = null;
                overlay.remove();
                renderTable();
            };

            // Lưu & Áp Dụng
            overlay.querySelector('#btn-save-modal').onclick = () => {
                syncInputsBeforeMove();
                userColumnConfigs = workingConfigs;
                userConditionalRules = workingRules;
                
                // Đồng bộ sort từ modal sang tableState nếu có cột được chỉ định sort
                const configSortIdx = userColumnConfigs.findIndex(c => c && c.visible !== false && c.sort && c.sort !== 'none');
                if (configSortIdx !== -1) {
                    tableState.sortColumn = configSortIdx;
                    tableState.sortDirection = userColumnConfigs[configSortIdx].sort;
                }

                // Lưu vào hệ thống lưu trữ đa tầng (localStorage + sessionStorage + window.name)
                saveToStorage(USER_CONFIG_STORAGE_KEY, userColumnConfigs);
                saveToStorage(USER_RULES_STORAGE_KEY, userConditionalRules);

                overlay.remove();
                renderTable();
            };
        }

        renderModalContent();
        document.body.appendChild(overlay);
    } catch (err) {
        console.error('[ExcelViz] openColumnConfigModal error:', err);
    }
}

// HÀM RENDER BẢNG CHÍNH VỚI FULL TÍNH NĂNG & DEFENSIVE HANDLING
function renderTable() {
    try {
        if (!document.body || !currentData) return;

        // Lưu lại trạng thái focus của ô search
        const prevSearchInput = document.getElementById('main-search-input');
        const wasFocused = (document.activeElement === prevSearchInput);
        const cursorPosition = prevSearchInput ? prevSearchInput.selectionStart : null;

        // Đọc cấu hình từ tab Style & Setup của Looker Studio
        const styleConfig = currentData.style || {};
        const rowDensity = (styleConfig.rowDensity && styleConfig.rowDensity.value) || 'normal';
        const tableVariant = (styleConfig.tableVariant && styleConfig.tableVariant.value) || 'striped';
        const fontSize = Number((styleConfig.fontSize && styleConfig.fontSize.value) || '13');
        const showSTT = styleConfig.showSTT ? styleConfig.showSTT.value === true : false;
        const textWrap = styleConfig.textWrap ? styleConfig.textWrap.value === true : false;
        const showSearch = styleConfig.showSearch ? styleConfig.showSearch.value !== false : true;
        const showColConfig = styleConfig.showColConfig ? styleConfig.showColConfig.value !== false : true;

        // Lấy danh sách quy tắc điều kiện động từ Modal (Lưu trữ đa tầng)
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
        const allHeaders = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.headers))
            ? currentData.tables.DEFAULT.headers
            : [];
        const rawRows = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.rows))
            ? currentData.tables.DEFAULT.rows
            : [];

        // Trích xuất các cột cần hiển thị
        const displayFields = extractDisplayFields(currentData);

        // Đồng bộ cấu hình cột với dữ liệu hiện tại
        if (!userColumnConfigs) {
            userColumnConfigs = loadStoredColumnConfigs(displayFields);
        } else {
            userColumnConfigs = syncColumnConfigsWithFields(userColumnConfigs, displayFields);
        }

        // Lọc ra các cột được phép hiển thị (visible !== false)
        const activeColumns = (userColumnConfigs || []).filter(c => c && c.visible !== false);

        // Xác định danh sách cột được tích chọn để tìm kiếm
        const searchableCols = activeColumns.filter(c => c && c.searchable !== false);
        const searchColIndices = (searchableCols.length > 0 ? searchableCols : activeColumns).map(c => c.rawIndex);
        const searchColNames = (searchableCols.length > 0 ? searchableCols : activeColumns).map(c => c.title || c.field);

        let autoPlaceholder = 'Tìm kiếm nhanh...';
        if (searchColNames.length > 0 && searchColNames.length <= 4) {
            autoPlaceholder = `Tìm theo: ${searchColNames.join(', ')}...`;
        } else if (searchColNames.length > 4) {
            autoPlaceholder = `Tìm kiếm (${searchColNames.length} cột)...`;
        }

        const finalPlaceholder = (styleConfig.searchPlaceholder && styleConfig.searchPlaceholder.value && styleConfig.searchPlaceholder.value.trim() !== '')
            ? styleConfig.searchPlaceholder.value
            : autoPlaceholder;

        // 1. FILTER TÌM KIẾM BỎ DẤU TIẾNG VIỆT (remove_accents) TRÊN CÁC CỘT ĐƯỢC CHỌN
        let filteredRows = rawRows;
        if (tableState.searchQuery && tableState.searchQuery.trim() !== '') {
            const words = remove_accents(tableState.searchQuery.trim()).split(/\s+/).filter(Boolean);

            filteredRows = rawRows.filter(row => {
                if (!row) return false;
                return words.every(word => {
                    return searchColIndices.some(colIdx => {
                        const cellVal = row[colIdx];
                        const cleanCell = remove_accents(cellVal);
                        return cleanCell.includes(word);
                    });
                });
            });
        }

        // 2. SORT DỮ LIỆU
        // Nếu chưa bấm sort trên header, kiểm tra xem trong cấu hình cột có đặt sort mặc định không
        let activeSortColIdx = tableState.sortColumn;
        let activeSortDir = tableState.sortDirection;

        if (activeSortColIdx === null) {
            const defaultSortColIdx = activeColumns.findIndex(c => c && c.sort && c.sort !== 'none');
            if (defaultSortColIdx !== -1) {
                activeSortColIdx = defaultSortColIdx;
                activeSortDir = activeColumns[defaultSortColIdx].sort;
            }
        }

        let sortedRows = [...filteredRows];
        if (activeSortColIdx !== null && activeSortColIdx >= 0 && activeSortColIdx < activeColumns.length && activeColumns[activeSortColIdx]) {
            const targetCol = activeColumns[activeSortColIdx];
            const rawIdx = targetCol.rawIndex;
            const dir = activeSortDir === 'desc' ? -1 : 1;
            sortedRows.sort((rowA, rowB) => {
                if (!rowA && !rowB) return 0;
                if (!rowA) return 1;
                if (!rowB) return -1;
                return dir * compareValues(rowA[rawIdx], rowB[rawIdx], targetCol.type);
            });
        }

        // 3. PHÂN TRANG (PAGINATION)
        const totalRows = sortedRows.length;
        const pageSize = tableState.pageSize === -1 ? totalRows : tableState.pageSize;
        const totalPages = Math.max(1, Math.ceil(totalRows / (pageSize || 1)));
        
        if (tableState.currentPage > totalPages) tableState.currentPage = totalPages;
        if (tableState.currentPage < 1) tableState.currentPage = 1;

        const startIdx = (tableState.currentPage - 1) * (pageSize || 1);
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
            const isCurrentlySorted = (activeSortColIdx === colIdx);
            if (isCurrentlySorted) th.className = 'th-sorted';

            let icon = '↕';
            if (isCurrentlySorted) {
                icon = activeSortDir === 'asc' ? '▲' : '▼';
            }

            th.innerHTML = `
                <div class="th-content">
                    <span>${col.title || col.field}</span>
                    <span class="sort-icon">${icon}</span>
                </div>
            `;

            // 3-state sorting trên header: Asc -> Desc -> Reset
            th.addEventListener('click', () => {
                if (tableState.sortColumn === colIdx) {
                    if (tableState.sortDirection === 'asc') {
                        tableState.sortDirection = 'desc';
                    } else {
                        // Click lần 3: Khôi phục sort mặc định
                        tableState.sortColumn = null;
                        tableState.sortDirection = 'asc';
                    }
                } else {
                    tableState.sortColumn = colIdx;
                    tableState.sortDirection = 'asc';
                }
                tableState.currentPage = 1;
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
                if (!row) return;
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
                    const colFmt = col.format || 'auto';
                    
                    const isDate = isDateValue(rawVal, col.type) || String(colFmt).startsWith('date');
                    const isNum = !isDate && (isNumericValue(rawVal, col.type) || ['number_comma', 'number_vn', 'currency', 'percent'].includes(colFmt));

                    if (isNum) {
                        td.className = 'align-right';
                    } else if (isDate) {
                        td.className = 'align-center';
                    } else {
                        td.className = 'align-left';
                    }

                    if (textWrap) td.classList.add('text-wrap-cell');

                    td.innerHTML = formatTableCell(col.field, rawVal, col.format, 'default', userConditionalRules, col.type);
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
                        const val = row ? row[c.rawIndex] : '';
                        if (val === null || val === undefined) {
                            rowData.push('');
                        } else if (isDateValue(val, c.type)) {
                            rowData.push(formatDateValue(val, 'date'));
                        } else {
                            rowData.push(val);
                        }
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

    } catch (err) {
        console.error('[ExcelViz] renderTable error:', err);
    }
}

// HÀM NHẬN DỮ LIỆU TỪ LOOKER STUDIO
function drawVisualization(data) {
    try {
        if (!document.body) return;

        currentData = data;
        renderTable();

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
