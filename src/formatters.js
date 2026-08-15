// ==========================================
// FORMATTERS & TYPE PARSERS (Chuẩn BigQuery)
// ==========================================

export const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// COLLATOR TIẾNG VIỆT — Khởi tạo 1 lần duy nhất, tái sử dụng trong toàn bộ vòng sort
export const VI_COLLATOR = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

// HÀM ESCAPE HTML CHỐNG XSS VÀ LỖI VỠ DOM
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// HÀM CHUẨN HÓA BỎ DẤU TIẾNG VIỆT
export function remove_accents(str) {
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
export function isDateValue(val, fieldType = '') {
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

// HÀM PARSE SỐ THỰC CHUẨN XÁC TỪ MỌI ĐỊNH DẠNG (PURE NUMBER, COMMA/DOT THOUSAND SEPARATORS)
export function parseNumericValue(val, fieldType = '') {
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

// HÀM KIỂM TRA SỐ THỰC
export function isNumericValue(val, fieldType = '') {
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

// HÀM BÓC TÁCH CÁC THÀNH PHẦN NGÀY THÁNG ĐA DẠNG
export function parseDateComponents(val) {
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
export function formatDateValue(val, fmtStyle = '%d-%m-%Y') {
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
export function formatNumberValue(val, fmtPattern = '', fieldType = '') {
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
