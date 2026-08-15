// Import thư viện Looker Studio Community Viz SDK
import * as dscc from '@google/dscc';

// Biến trạng thái runtime trong bộ nhớ JS
let currentData = null;
let currentResizeObserver = null;

const runtimeState = {
    sortOverride: null,       // { fieldId: string, direction: 'asc'|'desc' } | null
    currentPage: 1,
    pageSizeOverride: null,   // number | null (null: dùng default từ Style)
    hiddenColumns: new Set(), // Set chứa fieldId hoặc tên cột bị ẩn tạm thời trong runtime
    searchText: '',           // Từ khóa tìm kiếm tạm thời do viewer nhập
    columnWidths: {}          // { [fieldIdOrName: string]: number } (Độ rộng cột khi kéo giãn trực tiếp)
};

let searchInitialized = false;
let lastDefaultSearchText = null;

// HÀM TẠO VÀ LẤY APP ROOT CONTAINER
function getAppRoot() {
    let root = document.getElementById('excelviz-app-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'excelviz-app-root';
        if (document.body) {
            document.body.appendChild(root);
        }
    }
    return root;
}

// HỖ TRỢ KÍCH HOẠT FOCUS / CHỌN CHART KHI NHẤP CHUỘT Ở EDIT MODE
try {
    window.addEventListener('click', () => { try { window.focus(); } catch (e) { } });
    window.addEventListener('mousedown', () => { try { window.focus(); } catch (e) { } });
} catch (e) { }

// HÀM ESCAPE HTML CHỐNG XSS VÀ LỖI VỠ DOM
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// HÀM CHUẨN HÓA BỎ DẤU TIẾNG VIỆT
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

// HÀM KIỂM TRA ĐỊNH DẠNG NGÀY THÁNG
function isDateValue(val, fieldType = '') {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    if (str === '') return false;

    const ft = String(fieldType || '').toUpperCase();
    if (ft && (ft.includes('DATE') || ft.includes('YEAR') || ft.includes('TIME') || ft.includes('MONTH') || ft.includes('DAY'))) {
        return true;
    }

    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(str)) return true;
    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})(\d{2})(\d{2})$/.test(str)) return true;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str) || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(str)) return true;

    return false;
}

// HÀM KIỂM TRA SỐ THỰC
function isNumericValue(val, fieldType = '') {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return false;

    const ft = String(fieldType || '').toUpperCase();
    if (ft && (ft.includes('DATE') || ft.includes('YEAR') || ft.includes('TIME') || ft.includes('MONTH') || ft.includes('DAY') || ft === 'TEXT' || ft === 'STRING')) {
        return false;
    }

    const s = String(val).trim();
    if (s === '') return false;
    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(s)) return false;

    if (typeof val === 'number') return !isNaN(val);
    if (typeof val !== 'string') return false;

    return !isNaN(parseNumericValue(val, fieldType));
}

// HÀM PARSE SỐ THỰC CHUẨN XÁC TỪ MỌI ĐỊNH DẠNG (PURE NUMBER, COMMA/DOT THOUSAND SEPARATORS)
function parseNumericValue(val, fieldType = '') {
    if (val === null || val === undefined || typeof val === 'boolean') return NaN;
    if (typeof val === 'number') return isNaN(val) ? NaN : val;

    const ft = String(fieldType || '').toUpperCase();
    if (ft && (ft.includes('DATE') || ft.includes('YEAR') || ft.includes('TIME') || ft.includes('MONTH') || ft.includes('DAY') || ft === 'TEXT' || ft === 'STRING')) {
        return NaN;
    }

    let str = String(val).trim();
    if (!str) return NaN;
    if (/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(str)) return NaN;

    if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf('.') > str.lastIndexOf(',')) {
            str = str.replace(/,/g, '');
        } else {
            str = str.replace(/\./g, '').replace(/,/g, '.');
        }
    } else if (str.includes(',')) {
        const parts = str.split(',');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
            str = str.replace(/,/g, '');
        } else {
            str = str.replace(/,/g, '.');
        }
    } else if (str.includes('.')) {
        const parts = str.split('.');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && !parts[0].includes('-'))) {
            str = str.replace(/\./g, '');
        }
    }

    const num = Number(str);
    return isNaN(num) ? NaN : num;
}

// COLLATOR TIẾNG VIỆT — Khởi tạo 1 lần duy nhất, tái sử dụng trong toàn bộ vòng sort
const VI_COLLATOR = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

// HÀM MỞ HELPER XUẤT EXCEL (VƯỢT QUA GIỚI HẠN SANDBOX ALLOW-DOWNLOADS CỦA GOOGLE)
const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart3/downloader.html';

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

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// HÀM BÓC TÁCH CÁC THÀNH PHẦN NGÀY THÁNG ĐA DẠNG
function parseDateComponents(val) {
    if (val === null || val === undefined || val === '') return null;
    const str = String(val).trim();
    if (!str) return null;

    let yyyy = '', mm = '01', dd = '01', hh = '00', min = '00', ss = '00';

    // 1. 8 số YYYYMMDD: 20260815
    const match8 = str.match(/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
    if (match8) {
        yyyy = match8[1]; mm = match8[2]; dd = match8[3];
    }
    // 2. 14 số YYYYMMDDHHMMSS: 20260815143000
    else if (str.match(/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})(\d{2})(\d{2})$/)) {
        const m = str.match(/^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})(\d{2})(\d{2})$/);
        yyyy = m[1]; mm = m[2]; dd = m[3]; hh = m[4]; min = m[5]; ss = m[6];
    }
    // 3. Chuẩn ISO / Database YYYY-MM-DD hoặc YYYY/MM/DD kèm giờ tùy chọn
    else if (str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)) {
        const m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        yyyy = m[1];
        mm = m[2].padStart(2, '0');
        dd = m[3].padStart(2, '0');
        hh = (m[4] || '00').padStart(2, '0');
        min = (m[5] || '00').padStart(2, '0');
        ss = (m[6] || '00').padStart(2, '0');
    }
    // 4. Chuẩn DD-MM-YYYY hoặc DD/MM/YYYY
    else if (str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)) {
        const m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        dd = m[1].padStart(2, '0');
        mm = m[2].padStart(2, '0');
        yyyy = m[3];
        hh = (m[4] || '00').padStart(2, '0');
        min = (m[5] || '00').padStart(2, '0');
        ss = (m[6] || '00').padStart(2, '0');
    } else {
        return null;
    }

    const mNum = Math.max(0, Math.min(11, parseInt(mm, 10) - 1));
    const dNum = parseInt(dd, 10);
    const yNum = parseInt(yyyy, 10);
    const dateObj = new Date(yNum, mNum, dNum, parseInt(hh, 10), parseInt(min, 10), parseInt(ss, 10));
    const dayOfWeek = isNaN(dateObj.getTime()) ? 0 : dateObj.getDay();

    return {
        yyyy, yy: yyyy.slice(-2),
        mm, m: String(mNum + 1),
        dd, d: String(dNum),
        hh, h12: String((parseInt(hh, 10) % 12) || 12).padStart(2, '0'),
        min, ss,
        ampm: parseInt(hh, 10) >= 12 ? 'PM' : 'AM',
        monthName: MONTH_NAMES_EN[mNum] || '',
        monthShort: MONTH_SHORT_EN[mNum] || '',
        dayName: WEEKDAY_NAMES_EN[dayOfWeek] || '',
        dayShort: WEEKDAY_SHORT_EN[dayOfWeek] || ''
    };
}

// HÀM ĐỊNH DẠNG NGÀY THÁNG THEO CHUẨN BIGQUERY FORMAT ELEMENTS (%Y, %m, %d, %H, %M, %S...)
function formatDateValue(val, fmtStyle = '%d-%m-%Y') {
    if (val === null || val === undefined || val === '') return '';
    const comp = parseDateComponents(val);
    if (!comp) return String(val).trim();

    let pattern = String(fmtStyle || '%d-%m-%Y').trim();

    // Map các alias viết tắt quen thuộc
    if (pattern === 'date' || pattern === 'dmy' || pattern.toLowerCase() === 'dd-mm-yyyy') pattern = '%d-%m-%Y';
    else if (pattern.toLowerCase() === 'dd/mm/yyyy') pattern = '%d/%m/%Y';
    else if (pattern === 'date_yymmdd' || pattern === 'ymd' || pattern.toLowerCase() === 'yyyy-mm-dd') pattern = '%Y-%m-%d';
    else if (pattern.toLowerCase() === 'yyyy/mm/dd') pattern = '%Y/%m/%d';
    else if (pattern === 'date_mmyyyy' || pattern === 'my' || pattern.toLowerCase() === 'mm/yyyy') pattern = '%m/%Y';
    else if (pattern === 'date_yyyy' || pattern.toLowerCase() === 'yyyy') pattern = '%Y';
    else if (pattern === 'date_ddmmyyyy_hhmmss' || pattern === 'datetime' || pattern.toLowerCase() === 'dd-mm-yyyy hh:mm:ss') pattern = '%d-%m-%Y %H:%M:%S';

    return pattern
        .replace(/%Y/g, comp.yyyy)
        .replace(/%y/g, comp.yy)
        .replace(/%m/g, comp.mm)
        .replace(/%B/g, comp.monthName)
        .replace(/%b|%h/g, comp.monthShort)
        .replace(/%d/g, comp.dd)
        .replace(/%e/g, comp.d)
        .replace(/%H/g, comp.hh)
        .replace(/%I/g, comp.h12)
        .replace(/%M/g, comp.min)
        .replace(/%S/g, comp.ss)
        .replace(/%p/g, comp.ampm)
        .replace(/%A/g, comp.dayName)
        .replace(/%a/g, comp.dayShort);
}

// HÀM ĐỊNH DẠNG SỐ THEO CHUẨN BIGQUERY FORMAT (%'.2f, %'d, %'.0f, vnd, usd...)
function formatNumberValue(val, fmtPattern = '', fieldType = '') {
    if (val === null || val === undefined || String(val).trim() === '') return '';
    const num = parseNumericValue(val, fieldType);
    if (isNaN(num)) return String(val).trim();

    const pattern = String(fmtPattern || '').trim();
    if (!pattern || pattern.toLowerCase() === 'auto') {
        return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
    }

    const patLower = pattern.toLowerCase();

    // 1. Tiền tệ VNĐ: %'.0f ₫, vnd, vnđ, dong, đ, #,##0 ₫
    if (patLower === 'vnd' || patLower === 'vnđ' || patLower === 'dong' || patLower === 'đ' || pattern.includes('₫') || patLower.includes('vnd')) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ₫';
    }

    // 2. Tiền tệ USD: $%'.2f, usd, $, $#,##0.00
    if (patLower === 'usd' || pattern.startsWith('$') || patLower.includes('usd')) {
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // 3. Phần trăm (Percent): %'.2f%%, %'.0f%%, percent, percent_2, 0.00%
    if (pattern.endsWith('%%') || pattern.endsWith('%') || patLower.includes('percent') || patLower.includes('pct')) {
        let decPlaces = 2;
        const mDec = pattern.match(/\.(\d+)f/i) || pattern.match(/\.(0+)/);
        if (mDec) {
            decPlaces = mDec[1].startsWith('0') ? mDec[1].length : parseInt(mDec[1], 10);
        } else if (patLower === 'percent' || patLower === 'pct') {
            decPlaces = 1;
        }

        let pVal = num;
        if (Math.abs(num) <= 1 && num !== 0) {
            pVal = num * 100;
        }
        return pVal.toLocaleString('en-US', { minimumFractionDigits: decPlaces, maximumFractionDigits: decPlaces }) + '%';
    }

    // 4. Compact / Rút gọn K/M/B
    if (patLower === 'compact' || patLower === 'kmb' || patLower === 'short') {
        return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(num);
    }

    // 5. Chuẩn BigQuery Format: %'[width][.precision]f hoặc %'d
    const excelMatch = pattern.match(/0\.(0+)/);
    let precision = -1;
    if (pattern.match(/%'\.?(\d+)f/i)) {
        precision = parseInt(pattern.match(/%'\.?(\d+)f/i)[1], 10);
    } else if (pattern.match(/%\.?(\d+)f/i)) {
        precision = parseInt(pattern.match(/%\.?(\d+)f/i)[1], 10);
    } else if (excelMatch) {
        precision = excelMatch[1].length;
    } else if (pattern.includes("%'d") || pattern.includes("%d") || pattern === 'int' || pattern === 'integer' || pattern === '#,##0' || pattern === '0') {
        precision = 0;
    }

    if (precision >= 0) {
        const hasThousandsSep = pattern.includes("'") || pattern.includes('#,##0') || !pattern.includes('%.');
        if (hasThousandsSep) {
            return num.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision });
        } else {
            return num.toFixed(precision);
        }
    }

    return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// HÀM TRÍCH XUẤT THÔNG TIN DATE RANGE NGUYÊN BẢN TỪ LOOKER STUDIO API
function extractActiveFilterInfo(data) {
    const filterInfo = {};
    if (data && data.dateRanges && data.dateRanges.DEFAULT) {
        filterInfo.dateRange = data.dateRanges.DEFAULT;
    }
    return filterInfo;
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

    if (isDateValue(a, fieldType) && isDateValue(b, fieldType)) {
        return strA.localeCompare(strB);
    }

    const numA = parseNumericValue(a, fieldType);
    const numB = parseNumericValue(b, fieldType);
    if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
    }

    return VI_COLLATOR.compare(strA, strB);
}

// HÀM TÌM RAW INDEX CỦA FIELD TỪ DATA HEADERS (ƯU TIÊN ID TRƯỚC -> NAME FALLBACK)
function findRawIndexForField(field, allHeaders) {
    if (!field || !allHeaders || !Array.isArray(allHeaders)) return -1;
    const targetId = (field.id || '').trim();
    const targetName = (field.name || '').trim().toLowerCase();

    // 1. Ưu tiên tuyệt đối khớp theo field.id trước
    if (targetId) {
        const idx = allHeaders.findIndex(h => h && h.id === targetId);
        if (idx !== -1) return idx;
    }

    // 2. Fallback theo field.name
    if (targetName) {
        const idx = allHeaders.findIndex(h => h && (h.name || '').trim().toLowerCase() === targetName);
        if (idx !== -1) return idx;
    }

    return -1;
}

// HÀM TẬP TRUNG TÌM CỘT BẢNG TỪ FIELD (CENTRALIZED FIELD RESOLVER: field.id -> field.name)
function findTableColumnByField(field, tableColumns) {
    if (!field || !Array.isArray(tableColumns)) return null;
    const targetId = (field.id || '').trim();
    const targetName = (field.name || '').trim().toLowerCase();

    if (targetId) {
        const match = tableColumns.find(col => col.fieldId && col.fieldId === targetId);
        if (match) return match;
    }

    if (targetName) {
        const match = tableColumns.find(col => col.name && col.name.trim().toLowerCase() === targetName);
        if (match) return match;
    }

    return null;
}

// HÀM VALIDATE SLOT SETUP (CHỈ CHO PHÉP CHỌN DIMENSION HOẶC METRIC TRÊN MỘT SLOT)
function resolveSingleSetupField(dimensionField, metricField, label) {
    if (dimensionField && metricField) {
        return {
            field: null,
            error: `${label}: Chỉ được chọn Dimension hoặc Metric, không chọn cả hai.`
        };
    }
    return {
        field: dimensionField || metricField || null,
        error: null
    };
}

// HÀM TRÍCH XUẤT CÁC CỘT HIỂN THỊ CỦA BẢNG (DIMENSIONS + METRICS TỪ SETUP)
function extractTableColumns(data) {
    if (!data) return [];
    const fields = data.fields || {};
    const allHeaders = (data.tables && data.tables.DEFAULT && Array.isArray(data.tables.DEFAULT.headers))
        ? data.tables.DEFAULT.headers
        : [];
    const cols = [];

    // 1. Dimensions
    if (fields.dimensions && Array.isArray(fields.dimensions)) {
        fields.dimensions.forEach((f, fIdx) => {
            if (!f) return;
            const rawIdx = findRawIndexForField(f, allHeaders);
            const actualIdx = rawIdx !== -1 ? rawIdx : fIdx;
            if (!cols.some(c => c.rawIndex === actualIdx)) {
                cols.push({
                    fieldId: f.id || `dim_${actualIdx}`,
                    name: f.name || f.id || `Cột ${cols.length + 1}`,
                    type: (allHeaders[actualIdx] && allHeaders[actualIdx].type) || f.type || '',
                    rawIndex: actualIdx,
                    isMetric: false
                });
            }
        });
    }

    // 2. Metrics (Fallback index tính từ metricStartIndex cố định, tránh nhảy index)
    const metricStartIndex = cols.length;
    if (fields.metrics && Array.isArray(fields.metrics)) {
        fields.metrics.forEach((f, fIdx) => {
            if (!f) return;
            const rawIdx = findRawIndexForField(f, allHeaders);
            const actualIdx = rawIdx !== -1 ? rawIdx : (metricStartIndex + fIdx);
            if (!cols.some(c => c.rawIndex === actualIdx)) {
                // Đọc aggregation từ Looker Studio field definition (SUM, AVG, MIN, MAX, COUNT, AUTO, etc.)
                const rawAgg = (f.aggregation || '').toUpperCase().trim();
                // Map Looker Studio aggregation về internal summaryType
                let fieldSummaryType = null;
                if (rawAgg === 'SUM') fieldSummaryType = 'sum';
                else if (rawAgg === 'AVG' || rawAgg === 'AVERAGE') fieldSummaryType = 'avg';
                else if (rawAgg === 'MIN') fieldSummaryType = 'min';
                else if (rawAgg === 'MAX') fieldSummaryType = 'max';
                else if (rawAgg === 'COUNT' || rawAgg === 'COUNT_DISTINCT') fieldSummaryType = 'count';
                // AUTO hoặc không rõ → null → fallback về global summaryType khi tính

                cols.push({
                    fieldId: f.id || `met_${actualIdx}`,
                    name: f.name || f.id || `Cột ${cols.length + 1}`,
                    type: (allHeaders[actualIdx] && allHeaders[actualIdx].type) || f.type || '',
                    rawIndex: actualIdx,
                    isMetric: true,
                    fieldSummaryType // null nếu AUTO/unknown, hoặc 'sum'/'avg'/'min'/'max'/'count'
                });
            }
        });
    }


    // 3. Fallback allHeaders nếu chưa chọn dimensions/metrics
    if (cols.length === 0 && allHeaders.length > 0) {
        allHeaders.forEach((h, idx) => {
            if (!h) return;
            const isM = (h.type === 'NUMBER' || h.type === 'PERCENT' || h.type === 'CURRENCY' || h.type === 'METRIC');
            cols.push({
                fieldId: h.id || `col_${idx}`,
                name: h.name || h.id || `Cột ${idx + 1}`,
                type: h.type || '',
                rawIndex: idx,
                isMetric: isM
            });
        });
    }

    return cols;
}

// HÀM TRÍCH XUẤT CÁC CỘT TÌM KIẾM TỪ SETUP (searchFields)
function extractSearchColumns(data, tableColumns, warnings) {
    if (!data) return [];
    const fields = data.fields || {};
    const setupSearchFields = fields.searchFields || [];

    if (Array.isArray(setupSearchFields) && setupSearchFields.length > 0) {
        const matchedSearchCols = [];
        setupSearchFields.forEach(sf => {
            if (!sf) return;
            const matchedCol = findTableColumnByField(sf, tableColumns);
            if (matchedCol) {
                if (!matchedSearchCols.some(mc => mc.fieldId === matchedCol.fieldId)) {
                    matchedSearchCols.push(matchedCol);
                }
            } else if (warnings) {
                const fname = sf.name || sf.id;
                warnings.push(`Tìm kiếm: Cột "${fname}" không nằm trong danh sách Dimension/Metric của bảng.`);
            }
        });
        return matchedSearchCols;
    }

    return [];
}

// HÀM TRÍCH XUẤT CẤU HÌNH SORT TỪ SETUP & STYLE (TỐI ĐA 3 CẤP TƯỜNG MINH, CÓ VALIDATION)
function extractSetupSortConfig(data, styleConfig, tableColumns, warnings) {
    if (!data) return [];
    const fields = data.fields || {};

    const directions = [
        (styleConfig.sort1Direction && styleConfig.sort1Direction.value) || 'asc',
        (styleConfig.sort2Direction && styleConfig.sort2Direction.value) || 'asc',
        (styleConfig.sort3Direction && styleConfig.sort3Direction.value) || 'asc'
    ];

    const sortLevels = [];

    for (let i = 1; i <= 3; i++) {
        const dimField = (Array.isArray(fields[`sort${i}Dimension`]) && fields[`sort${i}Dimension`][0]) || null;
        const metField = (Array.isArray(fields[`sort${i}Metric`]) && fields[`sort${i}Metric`][0]) || null;

        const resolved = resolveSingleSetupField(dimField, metField, `Sort ${i}`);
        if (resolved.error && warnings) {
            warnings.push(resolved.error);
        }

        let boundField = resolved.field;

        // Fallback tương thích cấu hình cũ
        if (!boundField && !resolved.error) {
            const legacyDims = Array.isArray(fields.sortDimensions) ? fields.sortDimensions : [];
            const legacyMets = Array.isArray(fields.sortMetrics) ? fields.sortMetrics : [];
            const legacyList = [...legacyDims, ...legacyMets];
            boundField = legacyList[i - 1] || null;
        }

        if (boundField) {
            const matchedCol = findTableColumnByField(boundField, tableColumns);
            if (matchedCol && matchedCol.rawIndex >= 0) {
                sortLevels.push({
                    level: i,
                    fieldId: matchedCol.fieldId,
                    name: matchedCol.name,
                    rawIndex: matchedCol.rawIndex,
                    direction: directions[i - 1] || 'asc',
                    type: matchedCol.type || ''
                });
            } else if (warnings) {
                const fname = boundField.name || boundField.id || `Cột ${i}`;
                warnings.push(`Sort ${i}: Cột "${fname}" không nằm trong danh sách Dimension/Metric của bảng.`);
            }
        }
    }

    return sortLevels;
}

// HÀM TRÍCH XUẤT QUY TẮC TÔ MÀU / BADGE TỪ SETUP & STYLE (P0: HARDEN MAPPING, STRICT VALIDATION)
function extractSetupConditionalRules(data, styleConfig, tableColumns, warnings) {
    if (!data) return [];
    const fields = data.fields || {};
    const rules = [];

    for (let i = 1; i <= 3; i++) {
        const enabled = styleConfig[`rule${i}_enable`] && styleConfig[`rule${i}_enable`].value === true;
        if (!enabled) continue;

        const dimField = (Array.isArray(fields[`rule${i}Dimension`]) && fields[`rule${i}Dimension`][0]) || null;
        const metField = (Array.isArray(fields[`rule${i}Metric`]) && fields[`rule${i}Metric`][0]) || null;

        const resolved = resolveSingleSetupField(dimField, metField, `Quy tắc ${i}`);
        if (resolved.error && warnings) {
            warnings.push(resolved.error);
        }

        let boundField = resolved.field;

        // Fallback tương thích cấu hình cũ
        if (!boundField && !resolved.error) {
            const legacyDims = Array.isArray(fields.conditionalFields) ? fields.conditionalFields : [];
            const legacyMets = Array.isArray(fields.conditionalMetricFields) ? fields.conditionalMetricFields : [];
            const legacyList = [...legacyDims, ...legacyMets];
            boundField = legacyList[i - 1] || null;
        }

        // Rule bật nhưng chưa chọn field -> SKIP
        if (!boundField) {
            continue;
        }

        const matchedCol = findTableColumnByField(boundField, tableColumns);
        if (!matchedCol || matchedCol.rawIndex < 0) {
            // Field không map được vào Table Data -> SKIP & báo warning
            if (warnings) {
                const fname = boundField.name || boundField.id || `Cột ${i}`;
                warnings.push(`Quy tắc ${i}: Cột "${fname}" không nằm trong danh sách Dimension/Metric của bảng.`);
            }
            continue;
        }

        const operator = (styleConfig[`rule${i}_operator`] && styleConfig[`rule${i}_operator`].value) || 'contains';
        const value = (styleConfig[`rule${i}_value`] && styleConfig[`rule${i}_value`].value !== undefined) ? String(styleConfig[`rule${i}_value`].value) : '';
        const value2 = (styleConfig[`rule${i}_value2`] && styleConfig[`rule${i}_value2`].value !== undefined) ? String(styleConfig[`rule${i}_value2`].value) : '';
        const style = (styleConfig[`rule${i}_style`] && styleConfig[`rule${i}_style`].value) || 'badge_success';

        rules.push({
            ruleIndex: i,
            rawIndex: matchedCol.rawIndex,
            fieldId: matchedCol.fieldId,
            fieldName: matchedCol.name,
            operator: operator,
            value: value,
            value2: value2,
            style: style
        });
    }

    return rules;
}

// HÀM RESOLVE MÀU NỀN CHO CỘT / HEADER
function resolveBgColor(bgPreset, customHex) {
    if (bgPreset === 'custom' && customHex && customHex.trim()) {
        let hex = customHex.trim();
        if (!hex.startsWith('#') && !hex.startsWith('rgb')) hex = '#' + hex;
        return hex;
    }
    const bgMap = {
        teal: '#E6F7F7',
        merap_teal: '#009B9E',
        merap_navy: '#202657',
        merap_light: '#F0FDFA',
        yellow: '#FEF08A',
        orange: '#FED7AA',
        green: '#BBF7D0',
        blue: '#BAE6FD',
        red: '#FECACA',
        purple: '#E9D5FF',
        gray: '#E2E8F0',
        dark: '#1E293B',
        white: '#FFFFFF'
    };
    return bgMap[bgPreset] || '#E6F7F7';
}

// HÀM RESOLVE MÀU CHỮ CHO CỘT / HEADER
function resolveTextColor(textPreset, customHex, defaultText = '#DC2626') {
    if (textPreset === 'custom' && customHex && customHex.trim()) {
        let hex = customHex.trim();
        if (!hex.startsWith('#') && !hex.startsWith('rgb')) hex = '#' + hex;
        return hex;
    }
    const textMap = {
        teal: '#009B9E',
        merap_teal: '#009B9E',
        merap_navy: '#202657',
        red: '#DC2626',
        black: '#0F172A',
        white: '#FFFFFF',
        green: '#009B9E',
        blue: '#0284C7',
        orange: '#C2410C'
    };
    return textMap[textPreset] || defaultText;
}

// HÀM TRÍCH XUẤT CÁC NHÓM TÔ MÀU CỘT & HEADER TỪ SETUP VÀ STYLE
function extractColumnColorGroups(data, styleConfig, tableColumns, warnings) {
    if (!data) return new Map();
    const fields = data.fields || {};
    const columnStyles = new Map();

    for (let i = 1; i <= 3; i++) {
        const enabled = styleConfig[`colGroup${i}_enable`] && styleConfig[`colGroup${i}_enable`].value === true;
        if (!enabled) continue;

        const dims = Array.isArray(fields[`colGroup${i}Dimensions`]) ? fields[`colGroup${i}Dimensions`] : [];
        const mets = Array.isArray(fields[`colGroup${i}Metrics`]) ? fields[`colGroup${i}Metrics`] : [];
        const boundFields = [...dims, ...mets].filter(Boolean);

        if (boundFields.length === 0) continue;

        const target = (styleConfig[`colGroup${i}_target`] && styleConfig[`colGroup${i}_target`].value) || 'header_only';
        const bgPreset = (styleConfig[`colGroup${i}_bg`] && styleConfig[`colGroup${i}_bg`].value) || (i === 1 ? 'yellow' : (i === 2 ? 'blue' : 'green'));
        const customBg = (styleConfig[`colGroup${i}_customBg`] && styleConfig[`colGroup${i}_customBg`].value !== undefined) ? String(styleConfig[`colGroup${i}_customBg`].value) : '';
        const textPreset = (styleConfig[`colGroup${i}_textColor`] && styleConfig[`colGroup${i}_textColor`].value) || (i === 1 ? 'red' : (i === 2 ? 'blue' : 'green'));
        const customTextColor = (styleConfig[`colGroup${i}_customTextColor`] && styleConfig[`colGroup${i}_customTextColor`].value !== undefined) ? String(styleConfig[`colGroup${i}_customTextColor`].value) : '';
        const bold = styleConfig[`colGroup${i}_bold`] ? styleConfig[`colGroup${i}_bold`].value !== false : true;
        const italic = styleConfig[`colGroup${i}_italic`] ? styleConfig[`colGroup${i}_italic`].value === true : false;
        const align = (styleConfig[`colGroup${i}_align`] && styleConfig[`colGroup${i}_align`].value) || 'default';

        const bgColor = resolveBgColor(bgPreset, customBg);
        const textColor = resolveTextColor(textPreset, customTextColor, bgPreset === 'dark' ? '#FFFFFF' : '#DC2626');

        boundFields.forEach(bf => {
            const matchedCol = findTableColumnByField(bf, tableColumns);
            if (matchedCol && matchedCol.rawIndex >= 0) {
                columnStyles.set(matchedCol.rawIndex, {
                    groupIndex: i,
                    target: target,
                    bgColor: bgColor,
                    textColor: textColor,
                    bold: bold,
                    italic: italic,
                    align: align
                });
            } else if (warnings) {
                const fname = bf.name || bf.id || `Cột nhóm ${i}`;
                warnings.push(`Tô màu nhóm ${i}: Cột "${fname}" không nằm trong danh sách cột hiển thị của bảng.`);
            }
        });
    }

    return columnStyles;
}

// HÀM ĐÁNH GIÁ QUY TẮC ĐIỀU KIỆN ĐỘNG CHO MỘT Ô DỮ LIỆU
function evaluateConditionalRule(rawIdx, val, rules, fieldType = '') {
    if (!rules || rules.length === 0) return null;

    const isNum = isNumericValue(val, fieldType);
    const num = isNum ? Number(val) : NaN;
    const str = (val === null || val === undefined) ? '' : String(val).trim();
    const strNormalized = remove_accents(str);

    for (const rule of rules) {
        if (rule.rawIndex !== rawIdx) {
            continue;
        }

        let matched = false;
        const targetVal = (rule.value || '').trim();
        const targetVal2 = (rule.value2 || '').trim();
        const targetNormalized = remove_accents(targetVal);
        const targetNum = Number(targetVal);
        const targetNum2 = Number(targetVal2);

        const op = rule.operator;

        if (op === 'empty') {
            matched = (val === null || val === undefined || str === '');
        } else if (op === 'notEmpty') {
            matched = (val !== null && val !== undefined && str !== '');
        } else if (op === 'pos') {
            matched = isNum && num >= 0;
        } else if (op === 'neg') {
            matched = isNum && num < 0;
        } else if (op === 'contains') {
            matched = targetNormalized !== '' && strNormalized.includes(targetNormalized);
        } else if (op === 'equals') {
            matched = (isNum && !isNaN(targetNum)) ? (num === targetNum) : (strNormalized === targetNormalized);
        } else if (op === 'notEquals') {
            matched = (isNum && !isNaN(targetNum)) ? (num !== targetNum) : (strNormalized !== targetNormalized);
        } else if (op === 'startsWith') {
            matched = targetNormalized !== '' && strNormalized.startsWith(targetNormalized);
        } else if (op === 'endsWith') {
            matched = targetNormalized !== '' && strNormalized.endsWith(targetNormalized);
        } else if (op === 'between') {
            if (isNum && !isNaN(targetNum) && !isNaN(targetNum2)) {
                const min = Math.min(targetNum, targetNum2);
                const max = Math.max(targetNum, targetNum2);
                matched = num >= min && num <= max;
            }
        } else if (isNum && !isNaN(targetNum)) {
            if (op === '>') matched = num > targetNum;
            else if (op === '>=') matched = num >= targetNum;
            else if (op === '<') matched = num < targetNum;
            else if (op === '<=') matched = num <= targetNum;
        }

        if (matched) {
            return rule.style;
        }
    }

    return null;
}

// HÀM FORMAT CELL TOÀN DIỆN VÀ ESCAPE HTML AN TOÀN
function formatTableCell(rawIdx, val, rules, fieldType = '', datePattern = '', numberPattern = '') {
    if (val === null || val === undefined || String(val).trim() === '') {
        return '';
    }

    const str = String(val).trim();
    const isDate = isDateValue(val, fieldType) || Boolean(datePattern);
    const isNum = !isDate && (isNumericValue(val, fieldType) || Boolean(numberPattern));
    const num = isNum ? parseNumericValue(val, fieldType) : NaN;

    let formattedVal = str;
    if (isDate) {
        formattedVal = formatDateValue(str, datePattern || '%d-%m-%Y');
    } else if (isNum && !isNaN(num)) {
        formattedVal = formatNumberValue(val, numberPattern || 'auto', fieldType);
    }

    const safeStr = escapeHtml(str);
    const safeFormattedVal = escapeHtml(formattedVal);

    const ruleStyle = evaluateConditionalRule(rawIdx, val, rules, fieldType);
    if (ruleStyle) {
        if (ruleStyle === 'badge_success') return `<span class="badge badge-success">✓ ${safeStr}</span>`;
        if (ruleStyle === 'badge_danger') return `<span class="badge badge-danger">✕ ${safeStr}</span>`;
        if (ruleStyle === 'badge_warning') return `<span class="badge badge-warning">⏳ ${safeStr}</span>`;
        if (ruleStyle === 'badge_info') return `<span class="badge badge-info">${safeStr}</span>`;
        if (ruleStyle === 'badge_gray') return `<span class="badge badge-default">${safeStr}</span>`;
        if (ruleStyle === 'color_green') return `<span class="color-green">${safeFormattedVal}</span>`;
        if (ruleStyle === 'color_red') return `<span class="color-red">${safeFormattedVal}</span>`;
        if (ruleStyle === 'color_amber') return `<span class="color-amber">${safeFormattedVal}</span>`;
        if (ruleStyle === 'color_cyan') return `<span class="color-cyan">${safeFormattedVal}</span>`;
        if (ruleStyle === 'color_pos_neg') {
            return (isNum && num < 0)
                ? `<span class="color-pos-neg-neg">${safeFormattedVal}</span>`
                : `<span class="color-pos-neg-pos">${safeFormattedVal}</span>`;
        }
        if (ruleStyle === 'bg_yellow_red_bold') return `<span class="cell-bg-yellow-red-bold">${safeFormattedVal}</span>`;
        if (ruleStyle === 'bg_green_dark') return `<span class="cell-bg-green-dark">${safeFormattedVal}</span>`;
        if (ruleStyle === 'bg_red_dark') return `<span class="cell-bg-red-dark">${safeFormattedVal}</span>`;
        if (ruleStyle === 'bg_blue_dark') return `<span class="cell-bg-blue-dark">${safeFormattedVal}</span>`;
    }

    return safeFormattedVal;
}

// HÀM TÍNH TOÁN LEFT OFFSET VÀ CỐ ĐỊNH CỘT (STICKY FROZEN COLUMNS)
function applyFrozenColumnOffsets(table) {
    if (!table) return;
    try {
        const theadRows = Array.from(table.querySelectorAll('thead tr'));
        if (theadRows.length === 0) return;
        const thList = Array.from(theadRows[0].children);
        const tbodyRows = Array.from(table.querySelectorAll('tbody tr'));
        const tfootRows = Array.from(table.querySelectorAll('tfoot tr'));
        const allDataRows = [...theadRows.slice(1), ...tbodyRows, ...tfootRows];

        let leftOffset = 0;
        let lastFrozenColIdx = -1;

        thList.forEach((th, colIdx) => {
            if (th.classList.contains('frozen-column')) {
                const width = th.getBoundingClientRect().width || th.offsetWidth;
                th.style.left = `${leftOffset}px`;

                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) {
                        td.style.left = `${leftOffset}px`;
                    }
                });

                leftOffset += width;
                lastFrozenColIdx = colIdx;
            } else {
                th.style.left = '';
                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.style.left = '';
                });
            }
        });

        // Đánh dấu cột frozen cuối cùng
        thList.forEach((th, colIdx) => {
            if (colIdx === lastFrozenColIdx) {
                th.classList.add('frozen-column-last');
                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.classList.add('frozen-column-last');
                });
            } else {
                th.classList.remove('frozen-column-last');
                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.classList.remove('frozen-column-last');
                });
            }
        });
    } catch (e) {
        console.warn('[ExcelViz] applyFrozenColumnOffsets error:', e);
    }
}

// HÀM KHỞI TẠO TÍNH NĂNG KÉO GIÃN ĐỘ RỘNG CỘT (DRAG-TO-RESIZE)
function setupColumnResizing(table) {
    if (!table) return;
    const resizers = table.querySelectorAll('.col-resizer');
    resizers.forEach(resizer => {
        let startX = 0;
        let startWidth = 0;
        let th = null;
        let fieldId = '';

        function onMouseMove(e) {
            if (!th) return;
            const deltaX = e.pageX - startX;
            const newWidth = Math.max(35, Math.round(startWidth + deltaX));
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
            th.style.maxWidth = `${newWidth}px`;
            if (fieldId) {
                runtimeState.columnWidths[fieldId] = newWidth;
            }
            applyFrozenColumnOffsets(table);
        }

        function onMouseUp() {
            if (resizer) resizer.classList.remove('resizing');
            document.body.classList.remove('resizing-col');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            applyFrozenColumnOffsets(table);
        }

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            th = resizer.parentElement;
            if (!th) return;
            fieldId = resizer.getAttribute('data-field-id') || '';
            startX = e.pageX;
            startWidth = th.getBoundingClientRect().width || th.offsetWidth;

            resizer.classList.add('resizing');
            document.body.classList.add('resizing-col');

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Nhấp đúp để khôi phục độ rộng mặc định của cột
        resizer.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            th = resizer.parentElement;
            if (!th) return;
            fieldId = resizer.getAttribute('data-field-id') || '';
            th.style.width = '';
            th.style.minWidth = '';
            th.style.maxWidth = '';
            if (fieldId) {
                delete runtimeState.columnWidths[fieldId];
            }
            applyFrozenColumnOffsets(table);
        });

        // Chặn sự kiện click để không kích hoạt sắp xếp header
        resizer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
}

// HÀM GẮN RESIZEOBSERVER TỰ ĐỘNG CẬP NHẬT KHI RESIZE CONTAINER (BATCHING RAF)
function setupResizeObserver(element, callback) {
    if (typeof ResizeObserver === 'undefined') return;
    if (currentResizeObserver) {
        currentResizeObserver.disconnect();
    }
    let rafId = null;
    currentResizeObserver = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            callback();
        });
    });
    currentResizeObserver.observe(element);
}

// HÀM MỞ POPUP ẨN/HIỆN CỘT RUNTIME (TỰ KHÔI PHỤC KHI F5)
function openRuntimeColumnsPopup(tableColumns) {
    try {
        const existingModal = document.getElementById('runtime-columns-modal');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'runtime-columns-modal';

        overlay.innerHTML = `
            <div class="modal-dialog modal-dialog-col-config">
                <div class="modal-header">
                    <span class="modal-title">👁️ Cột hiển thị</span>
                    <button class="modal-close-btn" id="btn-close-col-modal">✕</button>
                </div>
                <div class="modal-body col-config-scroll-area">
                    <div class="modal-subtitle">
                        Thay đổi chỉ áp dụng trong phiên xem và sẽ khôi phục khi tải lại trang.
                    </div>
                    <table class="col-config-table">
                        <thead>
                            <tr>
                                <th class="col-config-stt">STT</th>
                                <th class="col-config-chk-cell">Hiện</th>
                                <th>Tên Cột (Looker Setup)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableColumns.map((col, idx) => {
                                const isVisible = !runtimeState.hiddenColumns.has(col.fieldId) && !runtimeState.hiddenColumns.has(col.name);
                                return `
                                    <tr>
                                        <td class="col-config-stt">${idx + 1}</td>
                                        <td class="col-config-chk-cell">
                                            <input type="checkbox" class="runtime-col-chk col-config-chk" data-field-id="${escapeHtml(col.fieldId)}" data-field-name="${escapeHtml(col.name)}" ${isVisible ? 'checked' : ''}>
                                        </td>
                                        <td class="col-config-name">${escapeHtml(col.name)}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-reset" id="btn-show-all-cols">Hiện tất cả</button>
                    <div class="modal-footer-actions">
                        <button class="btn-modal-save" id="btn-apply-col-modal">Xong</button>
                    </div>
                </div>
            </div>
        `;

        overlay.querySelector('#btn-close-col-modal').onclick = () => overlay.remove();

        overlay.querySelector('#btn-show-all-cols').onclick = () => {
            runtimeState.hiddenColumns.clear();
            overlay.remove();
            renderTable();
        };

        overlay.querySelector('#btn-apply-col-modal').onclick = () => {
            const chks = overlay.querySelectorAll('.runtime-col-chk');
            chks.forEach(chk => {
                const fid = chk.dataset.fieldId;
                const fname = chk.dataset.fieldName;
                if (!chk.checked) {
                    runtimeState.hiddenColumns.add(fid);
                    runtimeState.hiddenColumns.add(fname);
                } else {
                    runtimeState.hiddenColumns.delete(fid);
                    runtimeState.hiddenColumns.delete(fname);
                }
            });
            overlay.remove();
            renderTable();
        };

        document.body.appendChild(overlay);
    } catch (err) {
        console.error('[ExcelViz] openRuntimeColumnsPopup error:', err);
    }
}

// HÀM RENDER BẢNG CHÍNH THEO PIPELINE CHUẨN
function renderTable() {
    try {
        if (!currentData) return;
        const appRoot = getAppRoot();
        if (!appRoot) return;

        // Lưu lại trạng thái focus của ô search
        const prevSearchInput = document.getElementById('main-search-input');
        const wasFocused = (document.activeElement === prevSearchInput);
        const cursorPosition = prevSearchInput ? prevSearchInput.selectionStart : null;

        // Lưu lại vị trí cuộn ngang/dọc của bảng để tránh bị văng về cột 1 khi sort / tương tác
        const prevScrollContainer = appRoot.querySelector('.table-scroll-container');
        const prevScrollLeft = prevScrollContainer ? prevScrollContainer.scrollLeft : 0;
        const prevScrollTop = prevScrollContainer ? prevScrollContainer.scrollTop : 0;

        // 1. TRÍCH XUẤT SCHEMA CỘT VÀ QUY TẮC
        const styleConfig = currentData.style || {};
        const fields = currentData.fields || {};
        const configWarnings = [];
        const tableColumns = extractTableColumns(currentData);
        const searchColumns = extractSearchColumns(currentData, tableColumns, configWarnings);
        const setupSortLevels = extractSetupSortConfig(currentData, styleConfig, tableColumns, configWarnings);
        const setupConditionalRules = extractSetupConditionalRules(currentData, styleConfig, tableColumns, configWarnings);
        const columnColorStyles = extractColumnColorGroups(currentData, styleConfig, tableColumns, configWarnings);

        // Trích xuất Freeze Dimensions (Chỉ áp dụng cho Dimension)
        const freezeDims = Array.isArray(fields.freezeDimensions) ? fields.freezeDimensions : [];
        const freezeFieldIds = new Set();
        const freezeNames = new Set();

        freezeDims.forEach(f => {
            if (!f) return;
            const matched = findTableColumnByField(f, tableColumns);
            if (matched) {
                freezeFieldIds.add(matched.fieldId);
                freezeNames.add((matched.name || '').trim().toLowerCase());
            } else {
                const fname = f.name || f.id;
                configWarnings.push(`Cố định cột: Cột "${fname}" không nằm trong danh sách Dimension/Metric của bảng.`);
            }
        });

        const rowDensity = (styleConfig.rowDensity && styleConfig.rowDensity.value) || 'normal';
        const tableVariant = (styleConfig.tableVariant && styleConfig.tableVariant.value) || 'striped';
        const fontSize = Number((styleConfig.fontSize && styleConfig.fontSize.value) || '13');
        const showSTT = styleConfig.showSTT && styleConfig.showSTT.value !== undefined ? styleConfig.showSTT.value === true : true;
        const showSummaryRow = styleConfig.showSummaryRow && styleConfig.showSummaryRow.value !== undefined ? styleConfig.showSummaryRow.value === true : true;
        const summaryPosition = (styleConfig.summaryPosition && styleConfig.summaryPosition.value) || 'top';

        let summaryType = 'sum';
        try {
            const st = styleConfig.summaryType;
            if (st) {
                // Looker Studio SELECT_SINGLE có thể trả về: string, { value }, { stringVal }, { defaultValue }
                const rawVal = typeof st === 'string' ? st
                    : (st.value !== undefined && st.value !== null && String(st.value).trim() !== '' ? String(st.value).trim()
                        : (st.stringVal !== undefined && st.stringVal !== null && String(st.stringVal).trim() !== '' ? String(st.stringVal).trim()
                            : (st.defaultValue !== undefined ? String(st.defaultValue) : 'sum')));
                summaryType = rawVal.toLowerCase().trim();
            }
        } catch (e) {
            summaryType = 'sum';
        }
        if (!['sum', 'avg', 'min', 'max', 'count'].includes(summaryType)) summaryType = 'sum';

        // Parse per-column summary config: "Doanh Thu:avg, Số Lượng:sum, don gia:min"
        // Hỗ trợ trực tiếp:
        // 1. Tên cột hiển thị (Tiếng Việt có dấu / không dấu / không phân biệt hoa thường): "Doanh Thu:avg", "so luong:sum"
        // 2. Mã trường (Field ID): "qt_met1:min"
        const metricAggOverridesByName = {};
        try {
            const perColRaw = (styleConfig.perColumnSummary && styleConfig.perColumnSummary.value !== undefined)
                ? String(styleConfig.perColumnSummary.value).trim() : '';
            if (perColRaw) {
                perColRaw.split(',').forEach(part => {
                    const trimmed = part.trim();
                    if (!trimmed) return;
                    const lastColonIdx = trimmed.lastIndexOf(':');
                    if (lastColonIdx !== -1) {
                        const colKey = trimmed.substring(0, lastColonIdx).trim();
                        const aggVal = trimmed.substring(lastColonIdx + 1).trim().toLowerCase();
                        if (['sum', 'avg', 'min', 'max', 'count'].includes(aggVal) && colKey) {
                            metricAggOverridesByName[colKey.toLowerCase()] = aggVal;
                            metricAggOverridesByName[remove_accents(colKey)] = aggVal;
                        }
                    }
                });
            }
        } catch (e) { /* ignore parse errors */ }

        // Parse per-column Date/Time format config (Chuẩn BigQuery): "Ngày Giao:%d/%m/%Y, Created At:%Y-%m-%d %H:%M:%S"
        const columnDateFormatMap = {};
        try {
            const rawDateFmt = (styleConfig.perColumnDateFormat && styleConfig.perColumnDateFormat.value !== undefined)
                ? String(styleConfig.perColumnDateFormat.value).trim() : '';
            if (rawDateFmt) {
                rawDateFmt.split(',').forEach(part => {
                    const trimmed = part.trim();
                    if (!trimmed) return;
                    const lastColonIdx = trimmed.lastIndexOf(':');
                    if (lastColonIdx !== -1) {
                        const colKey = trimmed.substring(0, lastColonIdx).trim();
                        const fmtVal = trimmed.substring(lastColonIdx + 1).trim();
                        if (colKey && fmtVal) {
                            columnDateFormatMap[colKey.toLowerCase()] = fmtVal;
                            columnDateFormatMap[remove_accents(colKey)] = fmtVal;
                        }
                    }
                });
            }
        } catch (e) { /* ignore parse errors */ }

        // Parse per-column Number format config (Chuẩn BigQuery / Format): "Doanh Thu:%'.2f, Số Lượng:%'d, Tỷ Lệ:%'.2f%%"
        const columnNumberFormatMap = {};
        try {
            const rawNumFmt = (styleConfig.perColumnNumberFormat && styleConfig.perColumnNumberFormat.value !== undefined)
                ? String(styleConfig.perColumnNumberFormat.value).trim() : '';
            if (rawNumFmt) {
                rawNumFmt.split(',').forEach(part => {
                    const trimmed = part.trim();
                    if (!trimmed) return;
                    const lastColonIdx = trimmed.lastIndexOf(':');
                    if (lastColonIdx !== -1) {
                        const colKey = trimmed.substring(0, lastColonIdx).trim();
                        const fmtVal = trimmed.substring(lastColonIdx + 1).trim();
                        if (colKey && fmtVal) {
                            columnNumberFormatMap[colKey.toLowerCase()] = fmtVal;
                            columnNumberFormatMap[remove_accents(colKey)] = fmtVal;
                        }
                    }
                });
            }
        } catch (e) { /* ignore parse errors */ }

        let autoSummaryLabel = 'Tổng cộng';
        if (summaryType === 'avg') autoSummaryLabel = 'Trung bình (Avg)';
        else if (summaryType === 'min') autoSummaryLabel = 'Nhỏ nhất (Min)';
        else if (summaryType === 'max') autoSummaryLabel = 'Lớn nhất (Max)';
        else if (summaryType === 'count') autoSummaryLabel = 'Số dòng (Count)';

        const rawSummaryLabel = (styleConfig.summaryLabel && styleConfig.summaryLabel.value !== undefined) ? String(styleConfig.summaryLabel.value).trim() : '';
        // Nếu user đặt label tùy chỉnh → dùng label đó; còn lại dùng auto
        const summaryLabel = (rawSummaryLabel && rawSummaryLabel !== 'Tổng cộng' && rawSummaryLabel !== autoSummaryLabel)
            ? rawSummaryLabel
            : autoSummaryLabel;

        const textWrap = styleConfig.textWrap ? styleConfig.textWrap.value === true : false;
        const showSearch = styleConfig.showSearch ? styleConfig.showSearch.value !== false : true;
        const showColPopup = styleConfig.showColPopup ? styleConfig.showColPopup.value !== false : true;
        const showExcelExport = styleConfig.showExcelExport ? styleConfig.showExcelExport.value !== false : true;
        const showCsvExport = styleConfig.showCsvExport ? styleConfig.showCsvExport.value !== false : true;
        const allowHeaderSort = styleConfig.allowHeaderSort ? styleConfig.allowHeaderSort.value !== false : true;

        // Độ rộng cột tối đa (Max Width)
        const colMaxWidthVal = (styleConfig.colMaxWidth && styleConfig.colMaxWidth.value !== undefined) ? String(styleConfig.colMaxWidth.value) : '300';
        const colMaxWidthCss = (colMaxWidthVal === 'none' || colMaxWidthVal === '-1') ? 'none' : (colMaxWidthVal.endsWith('px') ? colMaxWidthVal : `${colMaxWidthVal}px`);

        // Khởi tạo search text từ Style default
        const defaultSearchTextFromStyle = (styleConfig.defaultSearchText && styleConfig.defaultSearchText.value !== undefined) ? String(styleConfig.defaultSearchText.value) : '';
        if (!searchInitialized || defaultSearchTextFromStyle !== lastDefaultSearchText) {
            runtimeState.searchText = defaultSearchTextFromStyle;
            lastDefaultSearchText = defaultSearchTextFromStyle;
            searchInitialized = true;
        }

        // 2. XÁC ĐỊNH VISIBLE COLUMNS
        const visibleColumns = tableColumns.filter(c => !runtimeState.hiddenColumns.has(c.fieldId) && !runtimeState.hiddenColumns.has(c.name));

        // Đánh dấu trạng thái Freeze cho từng cột Dimension
        visibleColumns.forEach(col => {
            const colNameLower = (col.name || '').trim().toLowerCase();
            col.isFrozen = freezeFieldIds.has(col.fieldId) || freezeNames.has(colNameLower);
        });

        // 3. RAW DATA
        const rawRows = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.rows))
            ? currentData.tables.DEFAULT.rows
            : [];

        // 4. PIPELINE BƯỚC 1: SEARCH FILTERING (Chỉ chạy khi có searchColumns được cấu hình)
        const canSearch = searchColumns.length > 0;
        const searchMode = (styleConfig.searchMode && styleConfig.searchMode.value) || 'contains';
        const caseSensitive = styleConfig.searchCaseSensitive ? styleConfig.searchCaseSensitive.value === true : false;

        let filteredRows = rawRows;
        if (canSearch && runtimeState.searchText && runtimeState.searchText.trim() !== '') {
            const queryRaw = runtimeState.searchText.trim();
            const query = caseSensitive ? queryRaw : remove_accents(queryRaw);
            const queryWords = query.split(/\s+/).filter(Boolean);

            filteredRows = rawRows.filter(row => {
                if (!row) return false;
                return searchColumns.some(col => {
                    const rawVal = row[col.rawIndex];
                    if (rawVal === null || rawVal === undefined) return false;
                    const cellStr = caseSensitive ? String(rawVal) : remove_accents(rawVal);

                    if (searchMode === 'equals') {
                        return cellStr === query;
                    } else if (searchMode === 'startsWith') {
                        return cellStr.startsWith(query);
                    } else {
                        return queryWords.every(word => cellStr.includes(word));
                    }
                });
            });
        }

        // 5. PIPELINE BƯỚC 2: SORTING (RUNTIME OVERRIDE BẰNG fieldId HOẶC MULTI-LEVEL SETUP SORT)
        let sortedRows = [...filteredRows];

        if (runtimeState.sortOverride) {
            // Header click override ưu tiên 1 cột theo fieldId
            const overrideCol = tableColumns.find(c => c.fieldId === runtimeState.sortOverride.fieldId);
            if (overrideCol) {
                const overrideRawIdx = overrideCol.rawIndex;
                const dir = runtimeState.sortOverride.direction === 'desc' ? -1 : 1;
                const colType = overrideCol.type;

                sortedRows.sort((rowA, rowB) => {
                    if (!rowA && !rowB) return 0;
                    if (!rowA) return 1;
                    if (!rowB) return -1;
                    return dir * compareValues(rowA[overrideRawIdx], rowB[overrideRawIdx], colType);
                });
            } else {
                runtimeState.sortOverride = null;
            }
        } else if (setupSortLevels.length > 0) {
            // Multi-level sort: Cấp 1 -> Cấp 2 -> Cấp 3
            sortedRows.sort((rowA, rowB) => {
                if (!rowA && !rowB) return 0;
                if (!rowA) return 1;
                if (!rowB) return -1;

                for (const level of setupSortLevels) {
                    const dir = level.direction === 'desc' ? -1 : 1;
                    const res = compareValues(rowA[level.rawIndex], rowB[level.rawIndex], level.type);
                    if (res !== 0) {
                        return dir * res;
                    }
                }
                return 0;
            });
        }

        // 5.1 TÍNH TOÁN DÒNG TỔNG CỘNG (CHỈ TÍNH CHO CÁC CỘT METRICS)
        // Thứ tự ưu tiên: perColumnSummary text (m1:sum) > field.aggregation > global summaryType
        const summaryValues = {};
        const colSummaryTypeMap = {};
        if (showSummaryRow && sortedRows.length > 0) {
            visibleColumns.forEach(col => {
                if (col.isMetric) {
                    const colNameLower = (col.name || '').trim().toLowerCase();
                    const colNameNoAccent = remove_accents(col.name || '');
                    const colFieldId = (col.fieldId || '').trim().toLowerCase();

                    // Ưu tiên 1: Ghi đè theo tên cột / không dấu / fieldId trong perColumnSummary
                    // Ưu tiên 2: field.aggregation từ Looker Studio metadata
                    // Ưu tiên 3: global summaryType dropdown
                    const manualOverride = metricAggOverridesByName[colNameLower]
                        || metricAggOverridesByName[colNameNoAccent]
                        || metricAggOverridesByName[colFieldId]
                        || null;

                    const colAggType = manualOverride || col.fieldSummaryType || summaryType;
                    colSummaryTypeMap[col.fieldId] = colAggType;

                    let colSum = 0;
                    let colMin = Infinity;
                    let colMax = -Infinity;
                    let validNumCount = 0;
                    let maxDecimalPlaces = 0; // tự detect từ data thực tế của cột

                    sortedRows.forEach(row => {
                        if (!row) return;
                        const val = row[col.rawIndex];
                        if (val !== null && val !== undefined && val !== '') {
                            const num = parseNumericValue(val, col.type);
                            if (!isNaN(num)) {
                                colSum += num;
                                if (num < colMin) colMin = num;
                                if (num > colMax) colMax = num;
                                validNumCount++;

                                // Detect số chữ số thập phân từ num đã parse (không parse lại string)
                                // String(18123.456) = "18123.456" → 3 decimals ✅
                                // String(185887200) = "185887200" → 0 decimals ✅
                                // Tránh false-negative: "18,123.456" → num=18123.456 → String → "18123.456" → 3 ✅
                                const numStr = String(num);
                                const dotIdx = numStr.indexOf('.');
                                if (dotIdx !== -1) {
                                    const dec = numStr.length - dotIdx - 1;
                                    if (dec > 0 && dec <= 6) maxDecimalPlaces = Math.max(maxDecimalPlaces, dec);
                                }
                            }
                        }
                    });

                    if (validNumCount > 0) {
                        let finalVal = colSum;
                        if (colAggType === 'avg') {
                            finalVal = colSum / validNumCount;
                        } else if (colAggType === 'min') {
                            finalVal = (colMin !== Infinity) ? colMin : 0;
                        } else if (colAggType === 'max') {
                            finalVal = (colMax !== -Infinity) ? colMax : 0;
                        } else if (colAggType === 'count') {
                            finalVal = validNumCount;
                        }
                        // else: SUM — giữ colSum

                        let formattedSummary = '';
                        if (colNumFmt) {
                            formattedSummary = formatNumberValue(finalVal, colNumFmt, col.type);
                        } else {
                            // Xác định số chữ số thập phân khi hiển thị:
                            // - COUNT: luôn 0 (số nguyên)
                            // - AVG: tối thiểu 2 decimal (avg thường sinh số lẻ), nhưng không quá 6
                            // - SUM/MIN/MAX: theo đúng độ chính xác của data gốc (0 nếu toàn số nguyên)
                            let fractionDigits;
                            if (colAggType === 'count') {
                                fractionDigits = 0;
                            } else if (colAggType === 'avg') {
                                fractionDigits = Math.min(Math.max(maxDecimalPlaces, 2), 6);
                            } else {
                                fractionDigits = Math.min(maxDecimalPlaces, 6); // sum/min/max: theo data gốc
                            }
                            formattedSummary = finalVal.toLocaleString('en-US', {
                                minimumFractionDigits: 0,      // không thêm 0 thừa cuối
                                maximumFractionDigits: fractionDigits
                            });
                        }

                        summaryValues[col.fieldId] = {
                            raw: finalVal,
                            formatted: formattedSummary,
                            isNumeric: true,
                            aggType: colAggType
                        };
                    } else {
                        summaryValues[col.fieldId] = {
                            raw: null,
                            formatted: '',
                            isNumeric: false
                        };
                    }
                } else {
                    summaryValues[col.fieldId] = {
                        raw: null,
                        formatted: '',
                        isNumeric: false
                    };
                }
            });
        }


        // HÀM TẠO DÒNG TỔNG CỘNG (DÙNG CHO THEAD HOẶC TFOOT)
        function createSummaryRowElement(isHeader = false) {
            const footerRow = document.createElement('tr');
            footerRow.className = 'summary-row';

            if (showSTT) {
                const sttCell = document.createElement(isHeader ? 'th' : 'td');
                sttCell.className = 'cell-stt frozen-column summary-cell summary-sigma';
                sttCell.textContent = '∑';
                sttCell.style.cursor = 'default';
                sttCell.style.textAlign = 'center';
                footerRow.appendChild(sttCell);
            }

            let isFirstDataCol = true;

            visibleColumns.forEach((col) => {
                const cell = document.createElement(isHeader ? 'th' : 'td');
                cell.className = 'summary-cell';
                if (col.isFrozen) cell.classList.add('frozen-column');
                cell.style.cursor = 'default';

                const sumData = summaryValues[col.fieldId];
                if (sumData && sumData.isNumeric) {
                    cell.classList.add('align-right', 'summary-number');
                    cell.textContent = sumData.formatted;
                } else {
                    if (isFirstDataCol) {
                        cell.classList.add('align-left', 'summary-label');
                        cell.textContent = summaryLabel;
                        isFirstDataCol = false;
                    } else {
                        cell.textContent = '';
                    }
                }

                const colStyle = columnColorStyles.get(col.rawIndex);
                if (colStyle && (colStyle.target === 'data_only' || colStyle.target === 'full_column')) {
                    if (colStyle.bold) cell.style.setProperty('font-weight', '700', 'important');
                }

                footerRow.appendChild(cell);
            });

            return footerRow;
        }


        // 6. PIPELINE BƯỚC 3: PAGINATION
        const defaultPageSizeFromStyle = Number((styleConfig.defaultPageSize && styleConfig.defaultPageSize.value !== undefined) ? styleConfig.defaultPageSize.value : 20);
        const pageSize = runtimeState.pageSizeOverride !== null ? runtimeState.pageSizeOverride : defaultPageSizeFromStyle;

        const totalRows = sortedRows.length;
        const actualPageSize = pageSize === -1 ? totalRows : pageSize;
        const totalPages = Math.max(1, Math.ceil(totalRows / (actualPageSize || 1)));

        if (runtimeState.currentPage > totalPages) runtimeState.currentPage = totalPages;
        if (runtimeState.currentPage < 1) runtimeState.currentPage = 1;

        const startIdx = (runtimeState.currentPage - 1) * (actualPageSize || 1);
        const endIdx = pageSize === -1 ? totalRows : Math.min(startIdx + actualPageSize, totalRows);
        const pageRows = sortedRows.slice(startIdx, endIdx);

        // 7. RENDER GIAO DIỆN HTML
        appRoot.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        wrapper.style.setProperty('--app-font-size', `${fontSize}px`);
        if (appRoot) {
            appRoot.style.setProperty('--app-font-size', `${fontSize}px`);
        }

        // CẢNH BÁO CẤU HÌNH KHÔNG HỢP LỆ (NẾU CÓ)
        if (configWarnings.length > 0) {
            const warnBox = document.createElement('div');
            warnBox.className = 'config-warning';
            const warnContent = configWarnings.length === 1
                ? `⚠️ <strong>Cấu hình chưa hợp lệ:</strong> ${escapeHtml(configWarnings[0])}`
                : `⚠️ <strong>Có ${configWarnings.length} cảnh báo cấu hình:</strong> ${escapeHtml(configWarnings.join(' | '))}`;
            warnBox.innerHTML = warnContent;
            wrapper.appendChild(warnBox);
        }

        // HÀM XỬ LÝ XUẤT EXCEL
        function handleExportExcel() {
            try {
                if (!rawRows || rawRows.length === 0) {
                    alert('Không có dữ liệu để xuất file!');
                    return;
                }
                if (visibleColumns.length === 0) {
                    alert('Chưa có cột nào được hiển thị!');
                    return;
                }
                const rowsToExport = sortedRows;
                if (rowsToExport.length === 0) {
                    alert('Không có dòng dữ liệu nào phù hợp với bộ lọc để xuất!');
                    return;
                }

                const exportHeaders = [];
                if (showSTT) exportHeaders.push('STT');
                visibleColumns.forEach(c => exportHeaders.push(c.name));

                const excelRows = [];
                const excelDataObjects = [];
                rowsToExport.forEach((row, rIdx) => {
                    const rowData = [];
                    const rowObj = {};
                    if (showSTT) {
                        rowData.push(rIdx + 1);
                        rowObj['STT'] = rIdx + 1;
                    }
                    visibleColumns.forEach(c => {
                        const val = row ? row[c.rawIndex] : '';
                        let formattedVal = val;
                        if (val === null || val === undefined) {
                            formattedVal = '';
                        } else if (isDateValue(val, c.type)) {
                            formattedVal = formatDateValue(val, 'date');
                        }
                        rowData.push(formattedVal);
                        rowObj[c.name] = formattedVal;
                    });
                    excelRows.push(rowData);
                    excelDataObjects.push(rowObj);
                });

                // Bổ sung dòng Tổng cộng vào Excel (nếu bật)
                if (showSummaryRow && rowsToExport.length > 0) {
                    const summaryRowExcel = [];
                    const summaryRowObj = {};
                    if (showSTT) {
                        summaryRowExcel.push('∑');
                        summaryRowObj['STT'] = '∑';
                    }
                    let isFirstDataCol = true;
                    visibleColumns.forEach(c => {
                        const sumData = summaryValues[c.fieldId];
                        if (sumData && sumData.isNumeric) {
                            summaryRowExcel.push(sumData.raw);
                            summaryRowObj[c.name] = sumData.raw;
                        } else if (isFirstDataCol) {
                            summaryRowExcel.push(summaryLabel);
                            summaryRowObj[c.name] = summaryLabel;
                            isFirstDataCol = false;
                        } else {
                            summaryRowExcel.push('');
                            summaryRowObj[c.name] = '';
                        }
                    });
                    if (summaryPosition === 'top') {
                        excelRows.unshift(summaryRowExcel);
                        excelDataObjects.unshift(summaryRowObj);
                    } else {
                        excelRows.push(summaryRowExcel);
                        excelDataObjects.push(summaryRowObj);
                    }
                }

                const todayStr = new Date().toISOString().slice(0, 10);
                const fileName = `Bao_cao_rawdata_${todayStr}.xlsx`;
                const filterInfo = extractActiveFilterInfo(currentData);

                downloadViaHelper({
                    type: 'EXCEL_DOWNLOAD',
                    headers: exportHeaders,
                    rows: excelRows,
                    excelData: excelDataObjects,
                    filterInfo: filterInfo,
                    fileName: fileName
                });
            } catch (err) {
                console.error('[ExcelViz] Export error:', err);
                alert('Lỗi khi xuất file: ' + err.message);
            }
        }

        // HÀM XỬ LÝ XUẤT CSV (BẢO TOÀN SỐ 0 ĐẦU)
        function handleExportCsv() {
            try {
                if (!rawRows || rawRows.length === 0) {
                    alert('Không có dữ liệu để xuất file!');
                    return;
                }
                if (visibleColumns.length === 0) {
                    alert('Chưa có cột nào được hiển thị!');
                    return;
                }
                const rowsToExport = sortedRows;
                if (rowsToExport.length === 0) {
                    alert('Không có dòng dữ liệu nào phù hợp với bộ lọc để xuất!');
                    return;
                }

                const exportHeaders = [];
                if (showSTT) exportHeaders.push('STT');
                visibleColumns.forEach(c => exportHeaders.push(c.name));

                const csvRows = [];
                rowsToExport.forEach((row, rIdx) => {
                    const rowData = [];
                    if (showSTT) rowData.push(rIdx + 1);
                    visibleColumns.forEach(c => {
                        const val = row ? row[c.rawIndex] : '';
                        let formattedVal = (val === null || val === undefined) ? '' : val;
                        if (isDateValue(val, c.type)) formattedVal = formatDateValue(val, 'date');
                        rowData.push(formattedVal);
                    });
                    csvRows.push(rowData);
                });

                // Bổ sung dòng Tổng cộng vào CSV (nếu bật)
                if (showSummaryRow && rowsToExport.length > 0) {
                    const summaryRowCsv = [];
                    if (showSTT) summaryRowCsv.push('∑');
                    let isFirstDataCol = true;
                    visibleColumns.forEach(c => {
                        const sumData = summaryValues[c.fieldId];
                        if (sumData && sumData.isNumeric) {
                            summaryRowCsv.push(sumData.raw);
                        } else if (isFirstDataCol) {
                            summaryRowCsv.push(summaryLabel);
                            isFirstDataCol = false;
                        } else {
                            summaryRowCsv.push('');
                        }
                    });
                    if (summaryPosition === 'top') {
                        csvRows.unshift(summaryRowCsv);
                    } else {
                        csvRows.push(summaryRowCsv);
                    }
                }

                const todayStr = new Date().toISOString().slice(0, 10);
                const csvFileName = `Bao_cao_rawdata_${todayStr}.csv`;
                const filterInfo = extractActiveFilterInfo(currentData);

                downloadViaHelper({
                    type: 'CSV_DOWNLOAD',
                    headers: exportHeaders,
                    rows: csvRows,
                    filterInfo: filterInfo,
                    fileName: csvFileName
                });
            } catch (err) {
                console.error('[ExcelViz] CSV Export error:', err);
                alert('Lỗi khi xuất CSV: ' + err.message);
            }
        }

        // TOOLBAR PHÍA TRÊN
        const toolbar = document.createElement('div');
        toolbar.className = 'table-toolbar';

        const toolbarLeft = document.createElement('div');
        toolbarLeft.className = 'toolbar-left';

        // Nút Popup Ẩn/Hiện Cột (Bánh răng cài đặt đặt đầu tiên)
        if (showColPopup) {
            const btnColPopup = document.createElement('button');
            btnColPopup.className = 'btn-col-config';
            btnColPopup.title = `Tùy chỉnh cột hiển thị (${visibleColumns.length}/${tableColumns.length})`;
            btnColPopup.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>(${visibleColumns.length}/${tableColumns.length})</span>
            `;
            btnColPopup.onclick = () => openRuntimeColumnsPopup(tableColumns);
            toolbarLeft.appendChild(btnColPopup);
        }

        // Nút Xuất Excel (Cảnh báo đỏ nếu >200k dòng)
        if (showExcelExport) {
            const isHeavyExcel = totalRows > 200000;
            const btnExcel = document.createElement('button');
            btnExcel.className = `btn-excel ${isHeavyExcel ? 'btn-excel-danger' : ''}`;
            btnExcel.id = 'btn-main-excel-export';
            const excelLabel = isHeavyExcel ? 'Excel (>200k)' : 'Excel (<200k)';
            btnExcel.title = isHeavyExcel ? 'Cảnh báo: Dữ liệu lớn trên 200k dòng có thể gây chậm hoặc đơ trình duyệt. Khuyên dùng nút CSV.' : 'Xuất file Excel .xlsx';
            btnExcel.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>${excelLabel}</span>
            `;
            btnExcel.addEventListener('click', handleExportExcel);
            toolbarLeft.appendChild(btnExcel);
        }

        // Nút Xuất CSV (Bảo toàn số 0 đầu)
        if (showCsvExport) {
            const btnCsv = document.createElement('button');
            btnCsv.className = 'btn-csv';
            btnCsv.id = 'btn-main-csv-export';
            btnCsv.title = 'Xuất file CSV .csv';
            btnCsv.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>CSV</span>
            `;
            btnCsv.addEventListener('click', handleExportCsv);
            toolbarLeft.appendChild(btnCsv);
        }

        // Ô Tìm kiếm (Chỉ hiện khi có chọn searchFields ở Setup)
        if (showSearch && canSearch) {
            const searchBox = document.createElement('div');
            searchBox.className = 'search-box';
            searchBox.innerHTML = `
                <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            `;

            let autoPlaceholder = (styleConfig.searchPlaceholder && styleConfig.searchPlaceholder.value) || 'Tìm kiếm...';
            if (searchColumns.length > 0) {
                const searchNames = searchColumns.map(f => f.name || f.fieldId);
                autoPlaceholder = searchNames.length <= 3 ? `Tìm theo: ${searchNames.join(', ')}...` : `Tìm theo ${searchNames.length} cột đã chọn...`;
            }

            const searchInput = document.createElement('input');
            searchInput.id = 'main-search-input';
            searchInput.className = 'search-input';
            searchInput.type = 'text';
            searchInput.placeholder = autoPlaceholder;
            searchInput.value = runtimeState.searchText;

            searchInput.addEventListener('input', (e) => {
                runtimeState.searchText = e.target.value;
                runtimeState.currentPage = 1;
                renderTable();
            });

            searchBox.appendChild(searchInput);

            // Nút Clear Search (×)
            if (runtimeState.searchText) {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'search-clear-btn';
                clearBtn.innerHTML = '✕';
                clearBtn.title = 'Xóa tìm kiếm';
                clearBtn.addEventListener('click', () => {
                    runtimeState.searchText = '';
                    runtimeState.currentPage = 1;
                    renderTable();
                });
                searchBox.appendChild(clearBtn);
            }

            toolbarLeft.appendChild(searchBox);
        }

        toolbar.appendChild(toolbarLeft);

        // Toolbar Right: Dòng / trang
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
            if (pageSize === size) opt.selected = true;
            pageSelect.appendChild(opt);
        });
        pageSelect.addEventListener('change', (e) => {
            runtimeState.pageSizeOverride = Number(e.target.value);
            runtimeState.currentPage = 1;
            renderTable();
        });
        toolbarRight.appendChild(pageSelect);

        toolbar.appendChild(toolbarRight);
        wrapper.appendChild(toolbar);

        // KHUNG CHỨA BẢNG
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'table-scroll-container';

        const table = document.createElement('table');
        table.className = `preview-table table-${tableVariant} density-${rowDensity} ${textWrap ? '' : 'text-nowrap'}`;
        table.style.fontSize = `${fontSize}px`;
        table.style.setProperty('--col-max-width', colMaxWidthCss);

        // THEAD
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        if (showSTT) {
            const sttTh = document.createElement('th');
            sttTh.className = 'cell-stt frozen-column';
            sttTh.style.cursor = 'default';
            const sttCustomWidth = runtimeState.columnWidths['__stt__'];
            if (sttCustomWidth) {
                sttTh.style.width = `${sttCustomWidth}px`;
                sttTh.style.minWidth = `${sttCustomWidth}px`;
                sttTh.style.maxWidth = `${sttCustomWidth}px`;
            }
            sttTh.innerHTML = `
                <div class="th-content" style="justify-content: center; text-align: center;">
                    <span>STT</span>
                </div>
                <div class="col-resizer" data-field-id="__stt__" title="Kéo để đổi độ rộng (Nhấp đúp để đặt lại)"></div>
            `;
            headerRow.appendChild(sttTh);
        }

        visibleColumns.forEach((col) => {
            const th = document.createElement('th');
            if (col.isFrozen) th.classList.add('frozen-column');

            const customWidth = runtimeState.columnWidths[col.fieldId] || runtimeState.columnWidths[col.name];
            if (customWidth) {
                th.style.width = `${customWidth}px`;
                th.style.minWidth = `${customWidth}px`;
                th.style.maxWidth = `${customWidth}px`;
            }

            const colStyle = columnColorStyles.get(col.rawIndex);
            if (colStyle && (colStyle.target === 'header_only' || colStyle.target === 'full_column')) {
                th.style.setProperty('background-color', colStyle.bgColor, 'important');
                th.style.setProperty('color', colStyle.textColor, 'important');
                if (colStyle.bold) th.style.setProperty('font-weight', '700', 'important');
                if (colStyle.italic) th.style.setProperty('font-style', 'italic', 'important');
            }

            let sortHtml = '<span class="sort-icon">↕</span>';

            if (runtimeState.sortOverride && runtimeState.sortOverride.fieldId === col.fieldId) {
                th.classList.add('th-sorted', 'th-sorted-override');
                const icon = runtimeState.sortOverride.direction === 'asc' ? '▲' : '▼';
                const iconColorStyle = colStyle ? `color: ${colStyle.textColor} !important;` : '';
                sortHtml = `<span class="sort-icon sort-override" style="${iconColorStyle}">${icon}</span>`;
            } else if (!runtimeState.sortOverride && setupSortLevels.length > 0) {
                const matchedLevel = setupSortLevels.find(l => l.fieldId === col.fieldId || l.rawIndex === col.rawIndex);
                if (matchedLevel) {
                    th.classList.add('th-sorted');
                    const icon = matchedLevel.direction === 'asc' ? '▲' : '▼';
                    const iconColorStyle = colStyle ? `color: ${colStyle.textColor} !important;` : '';
                    sortHtml = `<span class="sort-icon" style="${iconColorStyle}"><span class="sort-level">${matchedLevel.level}</span>${icon}</span>`;
                }
            }

            let alignStyle = '';
            if (colStyle && colStyle.align && colStyle.align !== 'default') {
                if (colStyle.align === 'center') alignStyle = 'justify-content: center; text-align: center;';
                else if (colStyle.align === 'right') alignStyle = 'justify-content: flex-end; text-align: right;';
                else if (colStyle.align === 'left') alignStyle = 'justify-content: flex-start; text-align: left;';
            }

            const freezeIconHtml = col.isFrozen ? '<span class="freeze-pin">📌</span>' : '';

            th.innerHTML = `
                <div class="th-content" style="${alignStyle}">
                    ${freezeIconHtml}
                    <span>${escapeHtml(col.name)}</span>
                    ${sortHtml}
                </div>
                <div class="col-resizer" data-field-id="${escapeHtml(col.fieldId)}" title="Kéo để đổi độ rộng (Nhấp đúp để đặt lại)"></div>
            `;

            if (allowHeaderSort) {
                // 2-State Sorting: Click same column toggles asc ↔ desc. Click different column → asc.
                // (Removed null/reset state to prevent sort indicator jumping to Setup default column)
                th.addEventListener('click', (e) => {
                    if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) return;
                    if (runtimeState.sortOverride && runtimeState.sortOverride.fieldId === col.fieldId) {
                        // Same column: toggle asc ↔ desc
                        runtimeState.sortOverride.direction = runtimeState.sortOverride.direction === 'asc' ? 'desc' : 'asc';
                    } else {
                        // Different column: start with asc
                        runtimeState.sortOverride = { fieldId: col.fieldId, direction: 'asc' };
                    }
                    runtimeState.currentPage = 1;
                    renderTable();
                });
            } else {
                th.style.cursor = 'default';
            }

            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // NẾU SUMMARY ROW Ở ĐẦU BẢNG (TOP): ĐẶT NGAY TRONG THEAD DƯỚI HEADER ROW
        if (showSummaryRow && sortedRows.length > 0 && summaryPosition === 'top') {
            thead.appendChild(createSummaryRowElement(true));
        }

        table.appendChild(thead);

        // TBODY
        const tbody = document.createElement('tbody');
        if (pageRows.length > 0) {
            pageRows.forEach((row, rIdx) => {
                if (!row) return;
                const tr = document.createElement('tr');

                if (showSTT) {
                    const sttTd = document.createElement('td');
                    sttTd.className = 'cell-stt frozen-column';
                    sttTd.innerText = startIdx + rIdx + 1;
                    tr.appendChild(sttTd);
                }

                visibleColumns.forEach((col) => {
                    const td = document.createElement('td');
                    if (col.isFrozen) td.classList.add('frozen-column');

                    const colNameLower = (col.name || '').trim().toLowerCase();
                    const colNameNoAccent = remove_accents(col.name || '');
                    const colFieldId = (col.fieldId || '').trim().toLowerCase();

                    const colDateFmt = columnDateFormatMap[colNameLower] || columnDateFormatMap[colNameNoAccent] || columnDateFormatMap[colFieldId] || '';
                    const colNumFmt = columnNumberFormatMap[colNameLower] || columnNumberFormatMap[colNameNoAccent] || columnNumberFormatMap[colFieldId] || '';

                    const rawVal = row[col.rawIndex];
                    const isDate = isDateValue(rawVal, col.type) || Boolean(colDateFmt);
                    const isNum = !isDate && (isNumericValue(rawVal, col.type) || Boolean(colNumFmt));

                    if (isNum) td.classList.add('align-right');
                    else if (isDate) td.classList.add('align-center');
                    else td.classList.add('align-left');

                    if (textWrap) td.classList.add('text-wrap-cell');

                    const colStyle = columnColorStyles.get(col.rawIndex);
                    if (colStyle && (colStyle.target === 'data_only' || colStyle.target === 'full_column')) {
                        td.style.setProperty('background-color', colStyle.bgColor, 'important');
                        td.style.setProperty('color', colStyle.textColor, 'important');
                        if (colStyle.bold) td.style.setProperty('font-weight', '700', 'important');
                        if (colStyle.italic) td.style.setProperty('font-style', 'italic', 'important');
                    }

                    td.innerHTML = formatTableCell(col.rawIndex, rawVal, setupConditionalRules, col.type, colDateFmt, colNumFmt);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = (showSTT ? 1 : 0) + (visibleColumns.length || 1);
            td.style.textAlign = 'center';
            td.style.padding = '40px 20px';
            td.style.color = '#94a3b8';
            td.style.fontSize = `${fontSize}px`;
            td.innerText = (canSearch && runtimeState.searchText) ? 'Không tìm thấy dữ liệu phù hợp với từ khóa.' : 'Chưa có dữ liệu. Vui lòng thêm Dimension hoặc Metric.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        // TFOOT: DÒNG TỔNG CỘNG Ở CHÂN BẢNG (KHI CHỌN BOTTOM)
        if (showSummaryRow && sortedRows.length > 0 && summaryPosition === 'bottom') {
            const tfoot = document.createElement('tfoot');
            tfoot.appendChild(createSummaryRowElement(false));
            table.appendChild(tfoot);
        }

        scrollContainer.appendChild(table);
        wrapper.appendChild(scrollContainer);

        // PAGINATION FOOTER
        const paginationFooter = document.createElement('div');
        paginationFooter.className = 'table-pagination';

        const pageInfo = document.createElement('div');
        pageInfo.className = 'pagination-info';
        if (totalRows > 0) {
            const sizeLabel = pageSize === -1 ? 'Tất cả' : `${pageSize} dòng/trang`;
            pageInfo.textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên ${totalRows.toLocaleString('en-US')} dòng (${sizeLabel})`;
        } else {
            pageInfo.textContent = '0 dòng';
        }
        paginationFooter.appendChild(pageInfo);

        if (totalPages > 1 && pageSize !== -1) {
            const paginationControls = document.createElement('div');
            paginationControls.className = 'pagination-controls';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'page-btn page-btn-prev';
            prevBtn.innerHTML = '❮ Trước';
            prevBtn.disabled = runtimeState.currentPage <= 1;
            prevBtn.addEventListener('click', () => {
                if (runtimeState.currentPage > 1) {
                    runtimeState.currentPage--;
                    renderTable();
                }
            });
            paginationControls.appendChild(prevBtn);

            const pageIndicator = document.createElement('span');
            pageIndicator.className = 'page-indicator';
            pageIndicator.textContent = `Trang ${runtimeState.currentPage} / ${totalPages}`;
            paginationControls.appendChild(pageIndicator);

            const nextBtn = document.createElement('button');
            nextBtn.className = 'page-btn page-btn-next';
            nextBtn.innerHTML = 'Sau ❯';
            nextBtn.disabled = runtimeState.currentPage >= totalPages;
            nextBtn.addEventListener('click', () => {
                if (runtimeState.currentPage < totalPages) {
                    runtimeState.currentPage++;
                    renderTable();
                }
            });
            paginationControls.appendChild(nextBtn);

            paginationFooter.appendChild(paginationControls);
        }

        wrapper.appendChild(paginationFooter);

        appRoot.appendChild(wrapper);

        // KHÔI PHỤC VỊ TRÍ CUỘN (SCROLL POSITION)
        if (scrollContainer && (prevScrollLeft > 0 || prevScrollTop > 0)) {
            scrollContainer.scrollLeft = prevScrollLeft;
            scrollContainer.scrollTop = prevScrollTop;
        }

        // KHỞI TẠO TÍNH NĂNG KÉO GIÃN CỘT VÀ TÍNH TOÁN STICKY LEFT CHO FROZEN COLUMNS
        setupColumnResizing(table);
        applyFrozenColumnOffsets(table);
        setTimeout(() => {
            applyFrozenColumnOffsets(table);
            if (scrollContainer && (prevScrollLeft > 0 || prevScrollTop > 0)) {
                scrollContainer.scrollLeft = prevScrollLeft;
                scrollContainer.scrollTop = prevScrollTop;
            }
        }, 60);

        // GẮN RESIZEOBSERVER TỰ ĐỘNG CẬP NHẬT KHI RESIZE CONTAINER
        setupResizeObserver(table, () => applyFrozenColumnOffsets(table));

        // KHÔI PHỤC FOCUS Ô SEARCH
        if (wasFocused) {
            const newSearchInput = document.getElementById('main-search-input');
            if (newSearchInput) {
                newSearchInput.focus();
                const pos = cursorPosition !== null ? cursorPosition : newSearchInput.value.length;
                newSearchInput.setSelectionRange(pos, pos);
            }
        }

    } catch (err) {
        console.error('[ExcelViz] renderTable error:', err);
    }
}

// HÀM NHẬN DỮ LIỆU TỪ LOOKER STUDIO (BATCHING VỚI RAF ĐỂ CHỐNG LAG RESIZE)
let renderRafId = null;
function drawVisualization(data) {
    try {
        currentData = data;
        if (renderRafId) cancelAnimationFrame(renderRafId);
        renderRafId = requestAnimationFrame(() => {
            renderTable();
        });
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
