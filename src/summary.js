// ==========================================
// SUMMARY ROW CALCULATOR & DOM GENERATOR
// ==========================================

import {
    remove_accents,
    parseNumericValue,
    formatNumberValue
} from './formatters.js';

// HÀM TÍNH TOÁN DÒNG TỔNG HỢP TRÊN TOÀN BỘ DỮ LIỆU ĐÃ LỌC (sortedRows)
export function calculateSummaryValues(sortedRows, visibleColumns, summaryType, showSummaryRow, metricAggOverridesByName, columnNumberFormatMap) {
    const summaryValues = {};
    const colSummaryTypeMap = {};

    if (showSummaryRow && sortedRows.length > 0) {
        visibleColumns.forEach(col => {
            if (col.isMetric) {
                const colNameLower = (col.name || '').trim().toLowerCase();
                const colNameNoAccent = remove_accents(col.name || '');
                const colFieldId = (col.fieldId || '').trim().toLowerCase();
                const colNumFmt = columnNumberFormatMap[colNameLower] || columnNumberFormatMap[colNameNoAccent] || columnNumberFormatMap[colFieldId] || '';

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
                let maxDecimalPlaces = 0;

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

                    let formattedSummary = '';
                    if (colNumFmt) {
                        formattedSummary = formatNumberValue(finalVal, colNumFmt, col.type);
                    } else {
                        let fractionDigits;
                        if (colAggType === 'count') {
                            fractionDigits = 0;
                        } else if (colAggType === 'avg') {
                            fractionDigits = Math.min(Math.max(maxDecimalPlaces, 2), 6);
                        } else {
                            fractionDigits = Math.min(maxDecimalPlaces, 6);
                        }
                        formattedSummary = finalVal.toLocaleString('en-US', {
                            minimumFractionDigits: 0,
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

    return { summaryValues, colSummaryTypeMap };
}

// HÀM TẠO DÒNG TỔNG CỘNG (DÙNG CHO THEAD HOẶC TFOOT)
export function createSummaryRowElement(isHeader = false, showSTT, visibleColumns, summaryValues, summaryLabel, columnColorStyles) {
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
