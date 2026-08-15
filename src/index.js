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
    searchText: ''            // Từ khóa tìm kiếm tạm thời do viewer nhập
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

    return /^-?\d+(\.\d+)?$/.test(s);
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

// HÀM ĐỊNH DẠNG NGÀY THÁNG ĐA DẠNG (Chuẩn hóa dd-mm-yyyy)
function formatDateValue(val, fmtStyle = 'date') {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();

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

    const isNumA = isNumericValue(a, fieldType);
    const isNumB = isNumericValue(b, fieldType);
    if (isNumA && isNumB) {
        return Number(a) - Number(b);
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
                    rawIndex: actualIdx
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
                cols.push({
                    fieldId: f.id || `met_${actualIdx}`,
                    name: f.name || f.id || `Cột ${cols.length + 1}`,
                    type: (allHeaders[actualIdx] && allHeaders[actualIdx].type) || f.type || '',
                    rawIndex: actualIdx
                });
            }
        });
    }

    // 3. Fallback allHeaders nếu chưa chọn dimensions/metrics
    if (cols.length === 0 && allHeaders.length > 0) {
        allHeaders.forEach((h, idx) => {
            if (!h) return;
            cols.push({
                fieldId: h.id || `col_${idx}`,
                name: h.name || h.id || `Cột ${idx + 1}`,
                type: h.type || '',
                rawIndex: idx
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
    return bgMap[bgPreset] || '#FEF08A';
}

// HÀM RESOLVE MÀU CHỮ CHO CỘT / HEADER
function resolveTextColor(textPreset, customHex, defaultText = '#DC2626') {
    if (textPreset === 'custom' && customHex && customHex.trim()) {
        let hex = customHex.trim();
        if (!hex.startsWith('#') && !hex.startsWith('rgb')) hex = '#' + hex;
        return hex;
    }
    const textMap = {
        red: '#DC2626',
        black: '#0F172A',
        white: '#FFFFFF',
        green: '#15803D',
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
function formatTableCell(rawIdx, val, rules, fieldType = '') {
    if (val === null || val === undefined || String(val).trim() === '') {
        return '';
    }

    const str = String(val).trim();
    const isDate = isDateValue(val, fieldType);
    const isNum = !isDate && isNumericValue(val, fieldType);
    const num = isNum ? Number(val) : NaN;

    let formattedVal = str;
    if (isDate) {
        formattedVal = formatDateValue(str, 'date');
    } else if (isNum) {
        formattedVal = num.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
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
        const theadRow = table.querySelector('thead tr');
        if (!theadRow) return;
        const thList = Array.from(theadRow.children);
        const tbodyRows = Array.from(table.querySelectorAll('tbody tr'));

        let leftOffset = 0;
        let lastFrozenColIdx = -1;

        thList.forEach((th, colIdx) => {
            if (th.classList.contains('frozen-column')) {
                const width = th.getBoundingClientRect().width || th.offsetWidth;
                th.style.left = `${leftOffset}px`;

                tbodyRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) {
                        td.style.left = `${leftOffset}px`;
                    }
                });

                leftOffset += width;
                lastFrozenColIdx = colIdx;
            } else {
                th.style.left = '';
                tbodyRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.style.left = '';
                });
            }
        });

        // Đánh dấu cột frozen cuối cùng
        thList.forEach((th, colIdx) => {
            if (colIdx === lastFrozenColIdx) {
                th.classList.add('frozen-column-last');
                tbodyRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.classList.add('frozen-column-last');
                });
            } else {
                th.classList.remove('frozen-column-last');
                tbodyRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.classList.remove('frozen-column-last');
                });
            }
        });
    } catch (e) {
        console.warn('[ExcelViz] applyFrozenColumnOffsets error:', e);
    }
}

// HÀM GẮN RESIZEOBSERVER TỰ ĐỘNG CẬP NHẬT KHI RESIZE CONTAINER
function setupResizeObserver(element, callback) {
    if (typeof ResizeObserver === 'undefined') return;
    if (currentResizeObserver) {
        currentResizeObserver.disconnect();
    }
    currentResizeObserver = new ResizeObserver(() => {
        callback();
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
            sttTh.innerText = 'STT';
            headerRow.appendChild(sttTh);
        }

        visibleColumns.forEach((col) => {
            const th = document.createElement('th');
            if (col.isFrozen) th.classList.add('frozen-column');

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
            `;

            if (allowHeaderSort) {
                // 3-State Sorting: Click 1: ASC -> Click 2: DESC -> Click 3: Revert to Setup Multi-Level Sort
                th.addEventListener('click', () => {
                    if (runtimeState.sortOverride && runtimeState.sortOverride.fieldId === col.fieldId) {
                        if (runtimeState.sortOverride.direction === 'asc') {
                            runtimeState.sortOverride.direction = 'desc';
                        } else {
                            runtimeState.sortOverride = null;
                        }
                    } else {
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

                    const rawVal = row[col.rawIndex];
                    const isDate = isDateValue(rawVal, col.type);
                    const isNum = !isDate && isNumericValue(rawVal, col.type);

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

                    td.innerHTML = formatTableCell(col.rawIndex, rawVal, setupConditionalRules, col.type);
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
        scrollContainer.appendChild(table);
        wrapper.appendChild(scrollContainer);

        // PAGINATION FOOTER
        const paginationFooter = document.createElement('div');
        paginationFooter.className = 'table-pagination';

        const pageInfo = document.createElement('div');
        pageInfo.className = 'pagination-info';
        if (totalRows > 0) {
            const sizeLabel = pageSize === -1 ? 'Tất cả' : `${pageSize} dòng/trang`;
            pageInfo.textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên ${totalRows.toLocaleString('vi-VN')} dòng (${sizeLabel})`;
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

        // TÍNH TOÁN VÀ ÁP DỤNG STICKY LEFT CHO FROZEN COLUMNS
        applyFrozenColumnOffsets(table);
        setTimeout(() => applyFrozenColumnOffsets(table), 60);

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

// HÀM NHẬN DỮ LIỆU TỪ LOOKER STUDIO
function drawVisualization(data) {
    try {
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
