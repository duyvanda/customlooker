// ==========================================
// EXPORT HELPERS (Excel & CSV via Helper Tab)
// ==========================================

export const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart3/downloader.html';

// HÀM MỞ HELPER XUẤT EXCEL (VƯỢT QUA GIỚI HẠN SANDBOX ALLOW-DOWNLOADS CỦA GOOGLE)
export function downloadViaHelper(payload) {
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

// HÀM TRÍCH XUẤT THÔNG TIN DATE RANGE NGUYÊN BẢN TỪ LOOKER STUDIO API
export function extractActiveFilterInfo(data) {
    const filterInfo = {};
    if (data && data.dateRanges && data.dateRanges.DEFAULT) {
        filterInfo.dateRange = data.dateRanges.DEFAULT;
    }
    return filterInfo;
}
