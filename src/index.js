// Import thư viện Looker Studio Community Viz SDK
import * as dscc from '@google/dscc';

// Biến trạng thái runtime trong bộ nhớ JS (Hoàn toàn không dùng storage / localStorage / bridge)
let currentData = null;

const runtimeState = {
    sortOverride: null,       // { rawIndex: number, name: string, direction: 'asc'|'desc' } | null
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

    return new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }).compare(strA, strB);
}

// HÀM TÌM RAW INDEX CỦA FIELD TỪ DATA HEADERS (ƯU TIÊN THEO NAME RỒI MỚI THEO ID)
function findRawIndexForField(field, allHeaders) {
    if (!field || !allHeaders || !Array.isArray(allHeaders)) return -1;
    const targetName = (field.name || '').trim().toLowerCase();
    const targetId = (field.id || '').trim();

    if (targetName) {
        const idx = allHeaders.findIndex(h => h && (h.name || '').trim().toLowerCase() === targetName);
        if (idx !== -1) return idx;
    }

    if (targetId) {
        const idx = allHeaders.findIndex(h => h && h.id === targetId);
        if (idx !== -1) return idx;
    }

    return -1;
}

// HÀM TRÍCH XUẤT CÁC CỘT HIỂN THỊ CỦA BẢNG (DIMENSIONS + METRICS TỪ SETUP)
function extractTableColumns(currentData) {
    if (!currentData) return [];
    const fields = currentData.fields || {};
    const allHeaders = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.headers))
        ? currentData.tables.DEFAULT.headers
        : [];
    const cols = [];

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

    if (fields.metrics && Array.isArray(fields.metrics)) {
        fields.metrics.forEach((f, fIdx) => {
            if (!f) return;
            const rawIdx = findRawIndexForField(f, allHeaders);
            const actualIdx = rawIdx !== -1 ? rawIdx : (cols.length + fIdx);
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
function extractSearchColumns(currentData, tableColumns) {
    if (!currentData) return tableColumns;
    const fields = currentData.fields || {};
    const setupSearchFields = fields.searchFields || [];

    if (Array.isArray(setupSearchFields) && setupSearchFields.length > 0) {
        const allHeaders = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.headers))
            ? currentData.tables.DEFAULT.headers
            : [];

        const matchedSearchCols = [];
        setupSearchFields.forEach(sf => {
            if (!sf) return;
            const rawIdx = findRawIndexForField(sf, allHeaders);
            if (rawIdx !== -1 && !matchedSearchCols.some(mc => mc.rawIndex === rawIdx)) {
                matchedSearchCols.push({
                    fieldId: sf.id,
                    name: sf.name || sf.id,
                    type: (allHeaders[rawIdx] && allHeaders[rawIdx].type) || sf.type || '',
                    rawIndex: rawIdx
                });
            }
        });

        if (matchedSearchCols.length > 0) {
            return matchedSearchCols;
        }
    }

    return tableColumns;
}

// HÀM TRÍCH XUẤT CẤU HÌNH SORT MULTI-LEVEL TỪ SETUP & STYLE (TỐI ĐA 3 CẤP)
function extractSetupSortConfig(currentData, styleConfig) {
    if (!currentData) return [];
    const fields = currentData.fields || {};
    const sortDims = Array.isArray(fields.sortDimensions) ? fields.sortDimensions : [];
    const sortMets = Array.isArray(fields.sortMetrics) ? fields.sortMetrics : [];
    const allSetupSort = [...sortDims, ...sortMets].slice(0, 3);

    if (allSetupSort.length === 0) return [];

    const allHeaders = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.headers))
        ? currentData.tables.DEFAULT.headers
        : [];

    const directions = [
        (styleConfig.sort1Direction && styleConfig.sort1Direction.value) || 'asc',
        (styleConfig.sort2Direction && styleConfig.sort2Direction.value) || 'asc',
        (styleConfig.sort3Direction && styleConfig.sort3Direction.value) || 'asc'
    ];

    const sortLevels = [];
    allSetupSort.forEach((sf, idx) => {
        if (!sf) return;
        const rawIdx = findRawIndexForField(sf, allHeaders);
        if (rawIdx !== -1) {
            sortLevels.push({
                level: idx + 1,
                fieldId: sf.id,
                name: sf.name || sf.id,
                rawIndex: rawIdx,
                direction: directions[idx] || 'asc',
                type: (allHeaders[rawIdx] && allHeaders[rawIdx].type) || sf.type || ''
            });
        }
    });

    return sortLevels;
}

// HÀM TRÍCH XUẤT QUY TẮC TÔ MÀU / BADGE TỪ SETUP & STYLE (RULES 1–3)
function extractSetupConditionalRules(currentData, styleConfig) {
    if (!currentData) return [];
    const fields = currentData.fields || {};
    const condDims = Array.isArray(fields.conditionalFields) ? fields.conditionalFields : [];
    const condMets = Array.isArray(fields.conditionalMetricFields) ? fields.conditionalMetricFields : [];
    const allSetupCond = [...condDims, ...condMets].slice(0, 3);

    const allHeaders = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.headers))
        ? currentData.tables.DEFAULT.headers
        : [];

    const rules = [];
    for (let i = 1; i <= 3; i++) {
        const enabled = styleConfig[`rule${i}_enable`] && styleConfig[`rule${i}_enable`].value === true;
        if (!enabled) continue;

        const boundField = allSetupCond[i - 1];
        let rawIdx = -1;
        let fieldName = '*';

        if (boundField) {
            rawIdx = findRawIndexForField(boundField, allHeaders);
            fieldName = boundField.name || boundField.id;
        }

        const operator = (styleConfig[`rule${i}_operator`] && styleConfig[`rule${i}_operator`].value) || 'contains';
        const value = (styleConfig[`rule${i}_value`] && styleConfig[`rule${i}_value`].value !== undefined) ? String(styleConfig[`rule${i}_value`].value) : '';
        const value2 = (styleConfig[`rule${i}_value2`] && styleConfig[`rule${i}_value2`].value !== undefined) ? String(styleConfig[`rule${i}_value2`].value) : '';
        const style = (styleConfig[`rule${i}_style`] && styleConfig[`rule${i}_style`].value) || 'badge_success';

        rules.push({
            ruleIndex: i,
            rawIndex: rawIdx,
            fieldName: fieldName,
            operator: operator,
            value: value,
            value2: value2,
            style: style
        });
    }

    return rules;
}

// HÀM ĐÁNH GIÁ QUY TẮC ĐIỀU KIỆN ĐỘNG CHO MỘT Ô DỮ LIỆU
function evaluateConditionalRule(rawIdx, val, rules, fieldType = '') {
    if (!rules || rules.length === 0) return null;

    const isNum = isNumericValue(val, fieldType);
    const num = isNum ? Number(val) : NaN;
    const str = (val === null || val === undefined) ? '' : String(val).trim();
    const strNormalized = remove_accents(str);

    for (const rule of rules) {
        if (rule.rawIndex !== -1 && rule.rawIndex !== rawIdx) {
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

// HÀM FORMAT CELL TOÀN DIỆN
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

    const ruleStyle = evaluateConditionalRule(rawIdx, val, rules, fieldType);
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

// HÀM TÍNH TOÁN LEFT OFFSET VÀ CỐ ĐỊNH CỘT (STICKY FROZEN COLUMNS)
function applyFrozenColumnOffsets(table, showSTT) {
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

        // Đánh dấu cột frozen cuối cùng để tạo đường ranh giới đổ bóng đẹp mắt
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

// HÀM MỞ POPUP ẨN/HIỆN CỘT RUNTIME (TỰ KHÔI PHỤC KHI F5)
function openRuntimeColumnsPopup(tableColumns) {
    try {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'runtime-columns-modal';

        overlay.innerHTML = `
            <div class="modal-dialog" style="max-width: 480px;">
                <div class="modal-header">
                    <span style="font-weight: 700; font-size: 13px; color: #0f172a;">👁️ Ẩn / Hiện Cột Hiển Thị (Runtime)</span>
                    <button class="modal-close-btn" id="btn-close-col-modal">✕</button>
                </div>
                <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                    <div style="font-size: 11.5px; color: #64748b; margin-bottom: 8px;">
                        💡 Tích chọn các cột cần xem. Trạng thái chỉ áp dụng trong phiên xem và tự động khôi phục khi F5.
                    </div>
                    <table class="col-config-table">
                        <thead>
                            <tr>
                                <th style="width: 45px; text-align: center;">STT</th>
                                <th style="width: 50px; text-align: center;">Hiện</th>
                                <th>Tên Cột (Looker Setup)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableColumns.map((col, idx) => {
                                const isVisible = !runtimeState.hiddenColumns.has(col.fieldId) && !runtimeState.hiddenColumns.has(col.name);
                                return `
                                    <tr>
                                        <td style="text-align: center; color: #64748b; font-weight: 700;">${idx + 1}</td>
                                        <td style="text-align: center;">
                                            <input type="checkbox" class="runtime-col-chk" data-field-id="${col.fieldId}" data-field-name="${col.name}" ${isVisible ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                                        </td>
                                        <td style="font-weight: 600; color: #0f172a;">${col.name}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-reset" id="btn-show-all-cols">Hiện tất cả</button>
                    <div style="display: flex; gap: 8px;">
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

// HÀM RENDER BẢNG CHÍNH VÀO #EXCELVIZ-APP-ROOT THEO PIPELINE CHUẨN
function renderTable() {
    try {
        if (!currentData) return;
        const appRoot = getAppRoot();
        if (!appRoot) return;

        // Lưu lại trạng thái focus của ô search
        const prevSearchInput = document.getElementById('main-search-input');
        const wasFocused = (document.activeElement === prevSearchInput);
        const cursorPosition = prevSearchInput ? prevSearchInput.selectionStart : null;

        // 1. TRÍCH XUẤT CÁC CỘT BẢNG TỪ SETUP
        const styleConfig = currentData.style || {};
        const fields = currentData.fields || {};
        const tableColumns = extractTableColumns(currentData);
        const searchColumns = extractSearchColumns(currentData, tableColumns);
        const setupSortLevels = extractSetupSortConfig(currentData, styleConfig);
        const setupConditionalRules = extractSetupConditionalRules(currentData, styleConfig);

        // Trích xuất danh sách Dimension cần Cố định cột (Freeze Columns) từ Setup - Kiểm tra CẢ NAME và ID
        const freezeDims = Array.isArray(fields.freezeDimensions) ? fields.freezeDimensions : [];
        const freezeNames = new Set(freezeDims.map(f => (f.name || '').trim().toLowerCase()).filter(Boolean));
        const freezeIds = new Set(freezeDims.map(f => (f.id || '').trim()).filter(Boolean));

        const rowDensity = (styleConfig.rowDensity && styleConfig.rowDensity.value) || 'normal';
        const tableVariant = (styleConfig.tableVariant && styleConfig.tableVariant.value) || 'striped';
        const fontSize = Number((styleConfig.fontSize && styleConfig.fontSize.value) || '13');
        const showSTT = styleConfig.showSTT ? styleConfig.showSTT.value === true : false;
        const textWrap = styleConfig.textWrap ? styleConfig.textWrap.value === true : false;
        const showSearch = styleConfig.showSearch ? styleConfig.showSearch.value !== false : true;
        const showColPopup = styleConfig.showColPopup ? styleConfig.showColPopup.value !== false : true;
        const allowHeaderSort = styleConfig.allowHeaderSort ? styleConfig.allowHeaderSort.value !== false : true;

        // Khởi tạo search text từ Style default
        const defaultSearchTextFromStyle = (styleConfig.defaultSearchText && styleConfig.defaultSearchText.value !== undefined) ? String(styleConfig.defaultSearchText.value) : '';
        if (!searchInitialized || defaultSearchTextFromStyle !== lastDefaultSearchText) {
            runtimeState.searchText = defaultSearchTextFromStyle;
            lastDefaultSearchText = defaultSearchTextFromStyle;
            searchInitialized = true;
        }

        // 2. XÁC ĐỊNH VISIBLE COLUMNS
        const visibleColumns = tableColumns.filter(c => !runtimeState.hiddenColumns.has(c.fieldId) && !runtimeState.hiddenColumns.has(c.name));

        // Đánh dấu trạng thái Freeze cho từng cột (Khớp chính xác theo name hoặc id của field trong Freeze Dimension)
        visibleColumns.forEach(col => {
            const colNameLower = (col.name || '').trim().toLowerCase();
            col.isFrozen = freezeNames.has(colNameLower) || freezeIds.has(col.fieldId);
        });

        // 3. RAW DATA
        const rawRows = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.rows))
            ? currentData.tables.DEFAULT.rows
            : [];

        // 4. PIPELINE BƯỚC 1: SEARCH FILTERING (TRÊN searchColumns TỪ SETUP)
        const searchMode = (styleConfig.searchMode && styleConfig.searchMode.value) || 'contains';
        const caseSensitive = styleConfig.searchCaseSensitive ? styleConfig.searchCaseSensitive.value === true : false;

        let filteredRows = rawRows;
        if (runtimeState.searchText && runtimeState.searchText.trim() !== '') {
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

        // 5. PIPELINE BƯỚC 2: SORTING (RUNTIME OVERRIDE HOẶC MULTI-LEVEL SETUP SORT TỐI ĐA 3 CẤP)
        let sortedRows = [...filteredRows];

        if (runtimeState.sortOverride) {
            // Header click override ưu tiên 1 cột
            const overrideRawIdx = runtimeState.sortOverride.rawIndex;
            const dir = runtimeState.sortOverride.direction === 'desc' ? -1 : 1;
            const targetCol = tableColumns.find(c => c.rawIndex === overrideRawIdx);
            const colType = targetCol ? targetCol.type : '';

            sortedRows.sort((rowA, rowB) => {
                if (!rowA && !rowB) return 0;
                if (!rowA) return 1;
                if (!rowB) return -1;
                return dir * compareValues(rowA[overrideRawIdx], rowB[overrideRawIdx], colType);
            });
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

        // 7. RENDER GIAO DIỆN HTML VÀO #EXCELVIZ-APP-ROOT
        appRoot.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';

        // TOOLBAR PHÍA TRÊN
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

        // Nút Popup Ẩn/Hiện Cột
        if (showColPopup) {
            const btnColPopup = document.createElement('button');
            btnColPopup.className = 'btn-col-config';
            btnColPopup.innerHTML = `<span>👁️ Cột hiển thị (${visibleColumns.length}/${tableColumns.length})</span>`;
            btnColPopup.onclick = () => openRuntimeColumnsPopup(tableColumns);
            toolbarLeft.appendChild(btnColPopup);
        }

        // Ô Tìm kiếm
        if (showSearch) {
            const searchBox = document.createElement('div');
            searchBox.className = 'search-box';
            searchBox.innerHTML = `
                <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            `;

            let autoPlaceholder = (styleConfig.searchPlaceholder && styleConfig.searchPlaceholder.value) || 'Tìm kiếm...';
            if (fields.searchFields && fields.searchFields.length > 0) {
                const searchNames = fields.searchFields.map(f => f.name || f.id);
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
            toolbarLeft.appendChild(searchBox);
        }

        toolbar.appendChild(toolbarLeft);

        // Toolbar Right: Chọn Rows per page runtime
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

            let isSorted = false;
            let sortDir = 'asc';

            if (runtimeState.sortOverride && runtimeState.sortOverride.rawIndex === col.rawIndex) {
                isSorted = true;
                sortDir = runtimeState.sortOverride.direction;
            } else if (!runtimeState.sortOverride && setupSortLevels.length > 0) {
                const matchedLevel = setupSortLevels.find(l => l.rawIndex === col.rawIndex);
                if (matchedLevel) {
                    isSorted = true;
                    sortDir = matchedLevel.direction;
                }
            }

            if (isSorted) th.classList.add('th-sorted');

            let icon = '↕';
            if (isSorted) {
                icon = sortDir === 'asc' ? '▲' : '▼';
            }

            th.innerHTML = `
                <div class="th-content">
                    <span>${col.name}</span>
                    <span class="sort-icon">${icon}</span>
                </div>
            `;

            if (allowHeaderSort) {
                // 3-State Sorting: Click 1: ASC -> Click 2: DESC -> Click 3: Revert to Setup Multi-Level Sort!
                th.addEventListener('click', () => {
                    if (runtimeState.sortOverride && runtimeState.sortOverride.rawIndex === col.rawIndex) {
                        if (runtimeState.sortOverride.direction === 'asc') {
                            runtimeState.sortOverride.direction = 'desc';
                        } else {
                            runtimeState.sortOverride = null;
                        }
                    } else {
                        runtimeState.sortOverride = { rawIndex: col.rawIndex, name: col.name, direction: 'asc' };
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
            td.style.fontSize = '13px';
            td.innerText = runtimeState.searchText ? 'Không tìm thấy dữ liệu phù hợp với từ khóa.' : 'Chưa có dữ liệu. Vui lòng thêm Dimension hoặc Metric.';
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
            pageInfo.textContent = `Hiển thị ${startIdx + 1}–${endIdx} trên tổng số ${totalRows.toLocaleString('vi-VN')} dòng`;
        } else {
            pageInfo.textContent = '0 dòng';
        }
        paginationFooter.appendChild(pageInfo);

        const paginationControls = document.createElement('div');
        paginationControls.className = 'pagination-controls';

        if (totalPages > 1 && pageSize !== -1) {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'page-btn';
            prevBtn.textContent = '‹ Trước';
            prevBtn.disabled = runtimeState.currentPage === 1;
            prevBtn.addEventListener('click', () => {
                if (runtimeState.currentPage > 1) {
                    runtimeState.currentPage--;
                    renderTable();
                }
            });
            paginationControls.appendChild(prevBtn);

            let startPage = Math.max(1, runtimeState.currentPage - 2);
            let endPage = Math.min(totalPages, startPage + 4);
            if (endPage - startPage < 4) {
                startPage = Math.max(1, endPage - 4);
            }

            if (startPage > 1) {
                const firstPageBtn = document.createElement('button');
                firstPageBtn.className = 'page-btn';
                firstPageBtn.textContent = '1';
                firstPageBtn.addEventListener('click', () => { runtimeState.currentPage = 1; renderTable(); });
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
                pBtn.className = `page-btn ${p === runtimeState.currentPage ? 'active' : ''}`;
                pBtn.textContent = p;
                pBtn.addEventListener('click', () => {
                    runtimeState.currentPage = p;
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
            nextBtn.disabled = runtimeState.currentPage === totalPages;
            nextBtn.addEventListener('click', () => {
                if (runtimeState.currentPage < totalPages) {
                    runtimeState.currentPage++;
                    renderTable();
                }
            });
            paginationControls.appendChild(nextBtn);
        }

        paginationFooter.appendChild(paginationControls);
        wrapper.appendChild(paginationFooter);

        appRoot.appendChild(wrapper);

        // TÍNH TOÁN VÀ ÁP DỤNG STICKY LEFT CHO FROZEN COLUMNS (CHÍNH XÁC THEO TỪNG CỘT)
        applyFrozenColumnOffsets(table, showSTT);
        setTimeout(() => applyFrozenColumnOffsets(table, showSTT), 60);

        // KHÔI PHỤC FOCUS Ô SEARCH
        if (wasFocused) {
            const newSearchInput = document.getElementById('main-search-input');
            if (newSearchInput) {
                newSearchInput.focus();
                const pos = cursorPosition !== null ? cursorPosition : newSearchInput.value.length;
                newSearchInput.setSelectionRange(pos, pos);
            }
        }

        // SỰ KIỆN XUẤT FILE EXCEL (.XLSX)
        btnExcel.addEventListener('click', () => {
            try {
                if (!rawRows || rawRows.length === 0) {
                    alert('Không có dữ liệu để xuất file!');
                    return;
                }

                if (visibleColumns.length === 0) {
                    alert('Chưa có cột nào được hiển thị!');
                    return;
                }

                const exportHeaders = [];
                if (showSTT) exportHeaders.push('STT');
                visibleColumns.forEach(c => exportHeaders.push(c.name));

                const rowsToExport = sortedRows.length > 0 ? sortedRows : rawRows;

                const excelRows = rowsToExport.map((row, rIdx) => {
                    const rowData = [];
                    if (showSTT) rowData.push(rIdx + 1);
                    visibleColumns.forEach(c => {
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
