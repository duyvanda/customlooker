// ==========================================
// NATURAL DATA COMPARATOR & MULTI-LEVEL SORT
// ==========================================

import {
    isDateValue,
    parseNumericValue,
    getDateSortKey,
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

    // 1. SO SÁNH NGÀY THÁNG THEO TRÌNH TỰ THỜI GIAN THỰC TẾ (Chronological Timestamp Sort)
    const isDateCol = isDateValue(a, fieldType) || isDateValue(b, fieldType);
    if (isDateCol) {
        const dateKeyA = getDateSortKey(a, fieldType);
        const dateKeyB = getDateSortKey(b, fieldType);

        if (dateKeyA !== null && dateKeyB !== null) {
            return dateKeyA.localeCompare(dateKeyB);
        }
        // Đưa các giá trị không hợp lệ (như '0', chuỗi rỗng) xuống dưới cùng
        if (dateKeyA !== null && dateKeyB === null) return -1;
        if (dateKeyA === null && dateKeyB !== null) return 1;
    }

    // 2. SO SÁNH SỐ THỰC (Numeric Sort)
    const numA = parseNumericValue(a, fieldType);
    const numB = parseNumericValue(b, fieldType);
    if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
    }

    // 3. SO SÁNH CHUỖI TIẾNG VIỆT TỰ NHIÊN (Natural String Sort)
    const strA = String(a).trim();
    const strB = String(b).trim();
    return VI_COLLATOR.compare(strA, strB);
}
