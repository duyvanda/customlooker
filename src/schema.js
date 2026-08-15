// =======================================================
// SCHEMA & SETUP FIELD EXTRACTORS (Looker Studio DSCC Map)
// =======================================================

// HÀM TÌM RAW INDEX CỦA FIELD TỪ DATA HEADERS (ƯU TIÊN ID TRƯỚC -> NAME FALLBACK)
export function findRawIndexForField(field, allHeaders) {
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
export function findTableColumnByField(field, tableColumns) {
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
export function resolveSingleSetupField(dimensionField, metricField, label) {
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
export function extractTableColumns(data) {
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
                else if (rawAgg === 'COUNT') fieldSummaryType = 'count';
                else if (rawAgg === 'COUNT_DISTINCT') fieldSummaryType = 'countd';

                cols.push({
                    fieldId: f.id || `met_${actualIdx}`,
                    name: f.name || f.id || `Cột ${cols.length + 1}`,
                    type: (allHeaders[actualIdx] && allHeaders[actualIdx].type) || f.type || '',
                    rawIndex: actualIdx,
                    isMetric: true,
                    fieldSummaryType
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
export function extractSearchColumns(data, tableColumns, warnings) {
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
export function extractSetupSortConfig(data, styleConfig, tableColumns, warnings) {
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
