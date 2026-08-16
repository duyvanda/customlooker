// ==========================================
// EXPORT HELPERS (Excel & CSV via Helper Tab)
// ==========================================

export const DOWNLOADER_URL = 'https://storage.googleapis.com/analytics_merap/excelchart3/downloader.html';
const DOWNLOADER_ORIGIN = new URL(DOWNLOADER_URL).origin;

const HANDSHAKE_INTERVAL_MS = 250;
const HANDSHAKE_MAX_ATTEMPTS = 120;

// HÀM HIỂN THỊ MODAL TRỢ GIÚP KHI BỊ CHẶN POPUP (KHÔNG CẦN F5 TRANG)
export function showPopupBlockedFallback(payload) {
    const existing = document.getElementById('popup-blocked-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'popup-blocked-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 480px; text-align: center; padding: 32px 28px; border-radius: 16px;">
            <div style="font-size: 42px; margin-bottom: 12px;">🚫</div>
            <h3 style="margin: 0 0 10px; font-size: 20px; font-weight: 800; color: #0f172a;">Trình duyệt đã chặn cửa sổ bật lên</h3>
            <p style="margin: 0 0 20px; font-size: 14.5px; color: #64748b; line-height: 1.5;">
                Vui lòng chọn <strong>"Luôn cho phép cửa sổ bật lên"</strong> trên thanh địa chỉ URL, sau đó bấm nút bên dưới để tải file ngay mà <strong>không cần tải lại trang (F5)</strong>.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btn-cancel-blocked" class="btn-modal-reset" style="padding: 10px 18px; font-weight: 600;">Đóng</button>
                <button id="btn-retry-download" class="btn-modal-save" style="padding: 10px 24px; font-weight: 700; background: #009B9E;">🚀 Mở Tab Tải File Ngay</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const btnCancel = modal.querySelector('#btn-cancel-blocked');
    if (btnCancel) btnCancel.onclick = () => modal.remove();

    const btnRetry = modal.querySelector('#btn-retry-download');
    if (btnRetry) {
        btnRetry.onclick = () => {
            modal.remove();
            const newWin = window.open(DOWNLOADER_URL, '_blank');
            if (newWin) {
                downloadViaHelper(payload, newWin);
            } else {
                alert('Vui lòng chọn "Luôn cho phép popup" trên thanh địa chỉ URL trình duyệt rồi bấm lại nút này.');
            }
        };
    }
}

// HÀM MỞ HELPER XUẤT EXCEL / CSV THEO GIAO THỨC HANDSHAKE (CHỈ GỬI PAYLOAD ĐÚNG 1 LẦN)
export function downloadViaHelper(payload, existingWindow = null) {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (ok) => {
            if (settled) return;
            settled = true;
            resolve(Boolean(ok));
        };

        try {
            let helperWindow = existingWindow;
            if (!helperWindow || helperWindow.closed) {
                helperWindow = window.open(DOWNLOADER_URL, '_blank');
            }

            if (!helperWindow) {
                showPopupBlockedFallback(payload);
                finish(false);
                return;
            }

            let attempts = 0;
            let payloadSent = false;
            let interval = null;
            let timeout = null;

            const cleanup = () => {
                if (interval) clearInterval(interval);
                if (timeout) clearTimeout(timeout);
                interval = null;
                timeout = null;
                window.removeEventListener('message', onMessage);
            };

            const sendPayloadOnce = () => {
                if (payloadSent || helperWindow.closed) return;
                payloadSent = true;
                try {
                    helperWindow.postMessage(payload, DOWNLOADER_ORIGIN);
                } catch (e) {
                    console.error('[ExcelViz] postMessage payload error:', e);
                    cleanup();
                    finish(false);
                }
            };

            function onMessage(event) {
                if (event.source !== helperWindow || event.origin !== DOWNLOADER_ORIGIN) {
                    return;
                }

                const type = event.data && event.data.type;
                if (type === 'DOWNLOADER_READY' || type === 'DOWNLOADER_PONG') {
                    if (interval) {
                        clearInterval(interval);
                        interval = null;
                    }
                    sendPayloadOnce();
                    return;
                }

                if (type === 'DOWNLOADER_PAYLOAD_ACK' || type === 'DOWNLOADER_READY_ACK') {
                    cleanup();
                    finish(true);
                }
            }

            window.addEventListener('message', onMessage);

            const pingHelper = () => {
                if (payloadSent) return;
                if (helperWindow.closed) {
                    cleanup();
                    finish(false);
                    return;
                }

                attempts++;
                try {
                    helperWindow.postMessage({ type: 'DOWNLOADER_PING' }, DOWNLOADER_ORIGIN);
                } catch (e) {
                    console.error('[ExcelViz] downloader handshake error:', e);
                    cleanup();
                    finish(false);
                    return;
                }

                if (attempts >= HANDSHAKE_MAX_ATTEMPTS) {
                    cleanup();
                    try {
                        if (!helperWindow.closed) helperWindow.close();
                    } catch (e) {}
                    alert('Không thể kết nối tới tab tải file. Vui lòng thử lại.');
                    finish(false);
                }
            };

            pingHelper();

            if (!settled && !payloadSent) {
                interval = setInterval(pingHelper, HANDSHAKE_INTERVAL_MS);
            }

            timeout = setTimeout(() => {
                if (payloadSent) {
                    cleanup();
                    finish(false);
                }
            }, 60000);

        } catch (e) {
            console.error('[ExcelViz] download error:', e);
            finish(false);
        }
    });
}

// HÀM TRÍCH XUẤT THÔNG TIN DATE RANGE NGUYÊN BẢN TỪ LOOKER STUDIO API
export function extractActiveFilterInfo(data) {
    const filterInfo = {};
    if (data && data.dateRanges && data.dateRanges.DEFAULT) {
        filterInfo.dateRange = data.dateRanges.DEFAULT;
    }
    return filterInfo;
}

