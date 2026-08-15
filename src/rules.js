// ==========================================
// CONDITIONAL FORMATTING & COLOR GROUPS
// ==========================================

import {
    escapeHtml,
    remove_accents,
    isDateValue,
    isNumericValue,
    parseNumericValue,
    formatDateValue,
    formatNumberValue
} from './formatters.js';

import {
    resolveSingleSetupField,
    findTableColumnByField
} from './schema.js';

// HÀM RESOLVE MÀU NỀN CHO CỘT / HEADER
export function resolveBgColor(bgPreset, customHex) {
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
export function resolveTextColor(textPreset, customHex, defaultText = '#DC2626') {
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
export function extractColumnColorGroups(data, styleConfig, tableColumns, warnings) {
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

// HÀM TRÍCH XUẤT QUY TẮC TÔ MÀU / BADGE TỪ SETUP & STYLE
export function extractSetupConditionalRules(data, styleConfig, tableColumns, warnings) {
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

        if (!boundField) continue;

        const matchedCol = findTableColumnByField(boundField, tableColumns);
        if (!matchedCol || matchedCol.rawIndex < 0) {
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

// HÀM ĐÁNH GIÁ QUY TẮC ĐIỀU KIỆN ĐỘNG CHO MỘT Ô DỮ LIỆU
export function evaluateConditionalRule(rawIdx, val, rules, fieldType = '') {
    if (!rules || rules.length === 0) return null;

    const isNum = isNumericValue(val, fieldType);
    const num = isNum ? parseNumericValue(val, fieldType) : NaN;
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
        const targetNum = parseNumericValue(targetVal);
        const targetNum2 = parseNumericValue(targetVal2);

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
export function formatTableCell(rawIdx, val, rules, fieldType = '', datePattern = '', numberPattern = '') {
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
