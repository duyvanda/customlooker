// ==========================================
// NATURAL DATA COMPARATOR & MULTI-LEVEL SORT
// ==========================================

import {
    isDateValue,
    parseNumericValue,
    VI_COLLATOR
} from './formatters.js';

// HÀM SO SÁNH DỮ LIỆU ĐA KIỂU (Natural Sort)
export function compareValues(a, b, fieldType = '') {
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
