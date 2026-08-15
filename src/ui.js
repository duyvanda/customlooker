// ==========================================
// UI HELPERS (Sticky Freeze, Resizing & Modal)
// ==========================================

import { escapeHtml } from './formatters.js';

// HÀM TÍNH TOÁN LEFT OFFSET VÀ CỐ ĐỊNH CỘT (STICKY FROZEN COLUMNS)
export function applyFrozenColumnOffsets(table) {
    if (!table) return;
    try {
        const theadRows = Array.from(table.querySelectorAll('thead tr'));
        if (theadRows.length === 0) return;
        const thList = Array.from(theadRows[0].children);
        const tbodyRows = Array.from(table.querySelectorAll('tbody tr'));
        const tfootRows = Array.from(table.querySelectorAll('tfoot tr'));
        const allDataRows = [...theadRows.slice(1), ...tbodyRows, ...tfootRows];

        let leftOffset = 0;
        let lastFrozenColIdx = -1;

        thList.forEach((th, colIdx) => {
            if (th.classList.contains('frozen-column')) {
                const width = th.getBoundingClientRect().width || th.offsetWidth;
                th.style.left = `${leftOffset}px`;

                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) {
                        td.style.left = `${leftOffset}px`;
                    }
                });

                leftOffset += width;
                lastFrozenColIdx = colIdx;
            } else {
                th.style.left = '';
                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.style.left = '';
                });
            }
        });

        // Đánh dấu cột frozen cuối cùng
        thList.forEach((th, colIdx) => {
            if (colIdx === lastFrozenColIdx) {
                th.classList.add('frozen-column-last');
                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.classList.add('frozen-column-last');
                });
            } else {
                th.classList.remove('frozen-column-last');
                allDataRows.forEach(row => {
                    const td = row.children[colIdx];
                    if (td) td.classList.remove('frozen-column-last');
                });
            }
        });
    } catch (e) {
        console.warn('[ExcelViz] applyFrozenColumnOffsets error:', e);
    }
}

// HÀM KHỞI TẠO TÍNH NĂNG KÉO GIÃN ĐỘ RỘNG CỘT (DRAG-TO-RESIZE)
export function setupColumnResizing(table, runtimeState) {
    if (!table) return;
    const resizers = table.querySelectorAll('.col-resizer');
    resizers.forEach(resizer => {
        let startX = 0;
        let startWidth = 0;
        let th = null;
        let fieldId = '';

        function onMouseMove(e) {
            if (!th) return;
            const deltaX = e.pageX - startX;
            const newWidth = Math.max(35, Math.round(startWidth + deltaX));
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
            th.style.maxWidth = `${newWidth}px`;
            if (fieldId) {
                runtimeState.columnWidths[fieldId] = newWidth;
            }
            applyFrozenColumnOffsets(table);
        }

        function onMouseUp() {
            if (resizer) resizer.classList.remove('resizing');
            document.body.classList.remove('resizing-col');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            applyFrozenColumnOffsets(table);
        }

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            th = resizer.parentElement;
            if (!th) return;
            fieldId = resizer.getAttribute('data-field-id') || '';
            startX = e.pageX;
            startWidth = th.getBoundingClientRect().width || th.offsetWidth;

            resizer.classList.add('resizing');
            document.body.classList.add('resizing-col');

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Nhấp đúp để khôi phục độ rộng mặc định của cột
        resizer.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            th = resizer.parentElement;
            if (!th) return;
            fieldId = resizer.getAttribute('data-field-id') || '';
            th.style.width = '';
            th.style.minWidth = '';
            th.style.maxWidth = '';
            if (fieldId) {
                delete runtimeState.columnWidths[fieldId];
            }
            applyFrozenColumnOffsets(table);
        });

        // Chặn sự kiện click để không kích hoạt sắp xếp header
        resizer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
}

// HÀM MỞ POPUP ẨN/HIỆN CỘT RUNTIME (TỰ KHÔI PHỤC KHI F5)
export function openRuntimeColumnsPopup(tableColumns, runtimeState, onApply) {
    try {
        const existingModal = document.getElementById('runtime-columns-modal');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'runtime-columns-modal';

        overlay.innerHTML = `
            <div class="modal-dialog modal-dialog-col-config">
                <div class="modal-header">
                    <span class="modal-title">👁️ Cột hiển thị</span>
                    <button class="modal-close-btn" id="btn-close-col-modal">✕</button>
                </div>
                <div class="modal-body col-config-scroll-area">
                    <div class="modal-subtitle">
                        Thay đổi chỉ áp dụng trong phiên xem và sẽ khôi phục khi tải lại trang.
                    </div>
                    <table class="col-config-table">
                        <thead>
                            <tr>
                                <th class="col-config-stt">STT</th>
                                <th class="col-config-chk-cell">Hiện</th>
                                <th>Tên Cột (Looker Setup)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableColumns.map((col, idx) => {
                                const isVisible = !runtimeState.hiddenColumns.has(col.fieldId) && !runtimeState.hiddenColumns.has(col.name);
                                return `
                                    <tr>
                                        <td class="col-config-stt">${idx + 1}</td>
                                        <td class="col-config-chk-cell">
                                            <input type="checkbox" class="runtime-col-chk col-config-chk" data-field-id="${escapeHtml(col.fieldId)}" data-field-name="${escapeHtml(col.name)}" ${isVisible ? 'checked' : ''}>
                                        </td>
                                        <td class="col-config-name">${escapeHtml(col.name)}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-reset" id="btn-show-all-cols">Hiện tất cả</button>
                    <div class="modal-footer-actions">
                        <button class="btn-modal-save" id="btn-apply-col-modal">Xong</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeModal = () => { overlay.remove(); };

        const btnClose = overlay.querySelector('#btn-close-col-modal');
        if (btnClose) btnClose.addEventListener('click', closeModal);

        const btnShowAll = overlay.querySelector('#btn-show-all-cols');
        if (btnShowAll) {
            btnShowAll.addEventListener('click', () => {
                overlay.querySelectorAll('.runtime-col-chk').forEach(chk => { chk.checked = true; });
            });
        }

        const btnApply = overlay.querySelector('#btn-apply-col-modal');
        if (btnApply) {
            btnApply.addEventListener('click', () => {
                runtimeState.hiddenColumns.clear();
                overlay.querySelectorAll('.runtime-col-chk').forEach(chk => {
                    const fid = chk.getAttribute('data-field-id');
                    if (!chk.checked && fid) {
                        runtimeState.hiddenColumns.add(fid);
                    }
                });
                closeModal();
                if (typeof onApply === 'function') onApply();
            });
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    } catch (e) {
        console.error('[ExcelViz] Column config modal error:', e);
    }
}
