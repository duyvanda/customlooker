// =========================================================================
// CUSTOM LOOKER STUDIO TABLE VISUALIZATION (Main Pipeline & Controller)
// =========================================================================

import * as dscc from '@google/dscc';

import {
    escapeHtml,
    remove_accents,
    isDateValue,
    isNumericValue,
    formatDateValue
} from './formatters.js';

import {
    extractTableColumns,
    extractSearchColumns,
    extractSetupSortConfig,
    findTableColumnByField
} from './schema.js';

import {
    extractSetupConditionalRules,
    extractColumnColorGroups,
    formatTableCell
} from './rules.js';

import {
    compareValues
} from './sorters.js';

import {
    calculateSummaryValues,
    createSummaryRowElement
} from './summary.js';

import {
    applyFrozenColumnOffsets,
    setupColumnResizing,
    openRuntimeColumnsPopup
} from './ui.js';

import {
    DOWNLOADER_URL,
    downloadViaHelper,
    extractActiveFilterInfo
} from './export.js';

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

        const rowDensity = (styleConfig.rowDensity && styleConfig.rowDensity.value) || 'compact';
        const tableVariant = (styleConfig.tableVariant && styleConfig.tableVariant.value) || 'bordered';
        const fontSize = Number((styleConfig.fontSize && styleConfig.fontSize.value) || '16');
        const showSTT = styleConfig.showSTT && styleConfig.showSTT.value !== undefined ? styleConfig.showSTT.value === true : true;
        const showSummaryRow = styleConfig.showSummaryRow && styleConfig.showSummaryRow.value !== undefined ? styleConfig.showSummaryRow.value === true : true;
        const summaryPosition = (styleConfig.summaryPosition && styleConfig.summaryPosition.value) || 'top';

        let summaryType = 'sum';
        try {
            const st = styleConfig.summaryType;
            if (st) {
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

        visibleColumns.forEach(col => {
            const colNameLower = (col.name || '').trim().toLowerCase();
            col.isFrozen = freezeFieldIds.has(col.fieldId) || freezeNames.has(colNameLower);
        });

        // 3. RAW DATA
        const rawRows = (currentData.tables && currentData.tables.DEFAULT && Array.isArray(currentData.tables.DEFAULT.rows))
            ? currentData.tables.DEFAULT.rows
            : [];

        // 4. PIPELINE BƯỚC 1: SEARCH FILTERING
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

        // 5. PIPELINE BƯỚC 2: SORTING
        let sortedRows = [...filteredRows];

        if (runtimeState.sortOverride) {
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

        // 5.1 TÍNH TOÁN DÒNG TỔNG CỘNG TRÊN sortedRows
        const { summaryValues } = calculateSummaryValues(
            sortedRows,
            visibleColumns,
            summaryType,
            showSummaryRow,
            metricAggOverridesByName,
            columnNumberFormatMap
        );

        // 6. PIPELINE BƯỚC 3: PAGINATION
        const defaultPageSizeFromStyle = Number((styleConfig.defaultPageSize && styleConfig.defaultPageSize.value !== undefined) ? styleConfig.defaultPageSize.value : 10);
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
        function handleExportExcel(preOpenedWindow = null) {
            try {
                if (!rawRows || rawRows.length === 0) {
                    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
                    alert('Không có dữ liệu để xuất file!');
                    return;
                }
                if (visibleColumns.length === 0) {
                    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
                    alert('Chưa có cột nào được hiển thị!');
                    return;
                }
                const rowsToExport = sortedRows;
                if (rowsToExport.length === 0) {
                    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
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
                        const colNameLower = (c.name || '').trim().toLowerCase();
                        const colNameNoAccent = remove_accents(c.name || '');
                        const colFieldId = (c.fieldId || '').trim().toLowerCase();
                        const colDateFmt = columnDateFormatMap[colNameLower] || columnDateFormatMap[colNameNoAccent] || columnDateFormatMap[colFieldId] || '';

                        const val = row ? row[c.rawIndex] : '';
                        let formattedVal = val;
                        if (val === null || val === undefined) {
                            formattedVal = '';
                        } else if (isDateValue(val, c.type) || Boolean(colDateFmt)) {
                            formattedVal = formatDateValue(val, colDateFmt || '%d-%m-%Y');
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
                }, preOpenedWindow);
            } catch (err) {
                if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
                console.error('[ExcelViz] Export error:', err);
                alert('Lỗi khi xuất file: ' + err.message);
            }
        }

        // HÀM XỬ LÝ XUẤT CSV (BẢO TOÀN SỐ 0 ĐẦU)
        function handleExportCsv(preOpenedWindow = null) {
            try {
                if (!rawRows || rawRows.length === 0) {
                    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
                    alert('Không có dữ liệu để xuất file!');
                    return;
                }
                if (visibleColumns.length === 0) {
                    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
                    alert('Chưa có cột nào được hiển thị!');
                    return;
                }
                const rowsToExport = sortedRows;
                if (rowsToExport.length === 0) {
                    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
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
                        const colNameLower = (c.name || '').trim().toLowerCase();
                        const colNameNoAccent = remove_accents(c.name || '');
                        const colFieldId = (c.fieldId || '').trim().toLowerCase();
                        const colDateFmt = columnDateFormatMap[colNameLower] || columnDateFormatMap[colNameNoAccent] || columnDateFormatMap[colFieldId] || '';

                        const val = row ? row[c.rawIndex] : '';
                        let formattedVal = (val === null || val === undefined) ? '' : val;
                        if (isDateValue(val, c.type) || Boolean(colDateFmt)) {
                            formattedVal = formatDateValue(val, colDateFmt || '%d-%m-%Y');
                        }
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
                }, preOpenedWindow);
            } catch (err) {
                if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
                console.error('[ExcelViz] CSV Export error:', err);
                alert('Lỗi khi xuất CSV: ' + err.message);
            }
        }

        // TOOLBAR PHÍA TRÊN
        const toolbar = document.createElement('div');
        toolbar.className = 'table-toolbar';

        const toolbarLeft = document.createElement('div');
        toolbarLeft.className = 'toolbar-left';

        // Nút Popup Ẩn/Hiện Cột
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
            btnColPopup.onclick = () => openRuntimeColumnsPopup(tableColumns, runtimeState, () => renderTable());
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
            btnExcel.addEventListener('click', () => {
                let preWin = null;
                try {
                    preWin = window.open(DOWNLOADER_URL, '_blank');
                } catch (e) {}
                handleExportExcel(preWin);
            });
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
            btnCsv.addEventListener('click', () => {
                let preWin = null;
                try {
                    preWin = window.open(DOWNLOADER_URL, '_blank');
                } catch (e) {}
                handleExportCsv(preWin);
            });
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
                th.addEventListener('click', (e) => {
                    if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) return;
                    if (runtimeState.sortOverride && runtimeState.sortOverride.fieldId === col.fieldId) {
                        runtimeState.sortOverride.direction = runtimeState.sortOverride.direction === 'asc' ? 'desc' : 'asc';
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

        // NẾU SUMMARY ROW Ở ĐẦU BẢNG (TOP)
        if (showSummaryRow && sortedRows.length > 0 && summaryPosition === 'top') {
            thead.appendChild(createSummaryRowElement(true, showSTT, visibleColumns, summaryValues, summaryLabel, columnColorStyles));
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
            tfoot.appendChild(createSummaryRowElement(false, showSTT, visibleColumns, summaryValues, summaryLabel, columnColorStyles));
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
        setupColumnResizing(table, runtimeState);
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
