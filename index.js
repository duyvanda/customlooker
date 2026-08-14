// 1. NHÃšNG THÆ¯ VIá»†N SHEETJS QUA CDN VÃ€O DOM Cá»¦A COMPONENT
const script = document.createElement('script');
script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
document.head.appendChild(script);

// HÃ m phá»¥: Kiá»ƒm tra chuá»—i cÃ³ pháº£i lÃ  Ä‘á»‹nh dáº¡ng NgÃ y thÃ¡ng / Timestamp há»£p lá»‡ khÃ´ng
function isValidDate(dateStr) {
    if (typeof dateStr !== 'string') return false;
    // Chuá»—i timestamp thÆ°á»ng chá»©a dáº¥u gáº¡ch ngang (-), gáº¡ch chÃ©o (/) hoáº·c dáº¥u hai cháº¥m (:)
    if (!dateStr.includes('-') && !dateStr.includes('/') && !dateStr.includes(':')) return false;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
}

// 2. HÃ€M CHÃNH: Váº¼ GIAO DIá»†N VÃ€ Xá»¬ LÃ Dá»® LIá»†U Tá»ª LOOKER STUDIO
function drawVisualization(data) {
    if (!data.rows && data.tables && data.tables.DEFAULT) data.rows = data.tables.DEFAULT.rows;
    // Clear giao diá»‡n cÅ© Ä‘á»ƒ trÃ¡nh bá»‹ Ä‘Ã¨ dá»¯ liá»‡u khi ngÆ°á»i dÃ¹ng thay Ä‘á»•i Filter
    document.body.innerHTML = '';

    // Táº¡o container chÃ­nh
    const container = document.createElement('div');
    container.className = 'container';

    // Táº O NÃšT Báº¤M DOWNLOAD EXCEL
    const btn = document.createElement('button');
    btn.className = 'btn-excel';
    btn.innerHTML = 'ðŸ“Š Xuáº¥t File Excel (.xlsx)';
    container.appendChild(btn);

    // Táº O Báº¢NG HTML Äá»‚ PREVIEW TRÃŠN DASHBOARD
    const table = document.createElement('table');
    table.className = 'preview-table';

    // Láº¥y danh sÃ¡ch tÃªn cá»™t (Headers) tá»« viá»‡c map cáº£ Dimensions vÃ  Metrics
    const headers = [];
    if (data.fields.dimensions) {
        data.fields.dimensions.forEach(f => headers.push(f.name));
    }
    if (data.fields.metrics) {
        data.fields.metrics.forEach(f => headers.push(f.name));
    }

    // Táº¡o dÃ²ng Header cho báº£ng HTML
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(hText => {
        const th = document.createElement('th');
        th.innerText = hText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Äá»• dá»¯ liá»‡u vÃ o cÃ¡c dÃ²ng (Rows) cho báº£ng HTML Preview
    const tbody = document.createElement('tbody');
    if (data.rows) {
        data.rows.forEach(rowData => {
            const tr = document.createElement('tr');
            rowData.forEach(cellData => {
                const td = document.createElement('td');
                td.innerText = (cellData === null || cellData === undefined) ? '' : cellData;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }
    table.appendChild(tbody);
    container.appendChild(table);
    document.body.appendChild(container);

    // 3. Xá»¬ LÃ LOGIC CLICK NÃšT DOWNLOAD EXCEL (Ã‰P KIá»‚U FLOAT, STRING, TIMESTAMP)
    btn.addEventListener('click', () => {
        if (typeof XLSX === 'undefined') {
            alert('ThÆ° viá»‡n Excel Ä‘ang Ä‘Æ°á»£c táº£i tá»« CDN, vui lÃ²ng thá»­ láº¡i sau 1-2 giÃ¢y!');
            return;
        }

        if (!data.rows || data.rows.length === 0) {
            alert('KhÃ´ng cÃ³ dá»¯ liá»‡u Ä‘á»ƒ xuáº¥t file!');
            return;
        }

        // Biáº¿n Ä‘á»•i máº£ng dá»¯ liá»‡u thÃ´ tá»« Looker Studio thÃ nh máº£ng Object chuáº©n cho SheetJS
        const excelData = data.rows.map(row => {
            let rowObject = {};
            headers.forEach((headerName, index) => {
                const cellValue = row[index];

                // KIá»‚M TRA VÃ€ Ã‰P KIá»‚U Dá»® LIá»†U CHI TIáº¾T
                if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') {
                    rowObject[headerName] = ''; // Xá»­ lÃ½ Ã´ trá»‘ng rá»—ng
                } else if (!isNaN(cellValue) && String(cellValue).trim() !== '') {
                    // Xá»¬ LÃ KIá»‚U FLOAT / INT: Chuyá»ƒn chuá»—i sá»‘ thÃ nh Number thá»±c táº¿ Ä‘á»ƒ tÃ­nh toÃ¡n cÃ´ng thá»©c trong Excel
                    rowObject[headerName] = Number(cellValue);
                } else if (isValidDate(String(cellValue))) {
                    // Xá»¬ LÃ KIá»‚U TIMESTAMP: Chuyá»ƒn thÃ nh Ä‘á»‘i tÆ°á»£ng Date cá»§a JavaScript
                    rowObject[headerName] = new Date(cellValue);
                } else {
                    // Xá»¬ LÃ KIá»‚U STRING: Giá»¯ nguyÃªn vÄƒn báº£n thuáº§n tÃºy
                    rowObject[headerName] = String(cellValue);
                }
            });
            return rowObject;
        });

        // Khá»Ÿi táº¡o Workbook vÃ  Sheet (cellDates: true báº¯t buá»™c pháº£i cÃ³ Ä‘á»ƒ giá»¯ kiá»ƒu NgÃ y thÃ¡ng)
        const worksheet = XLSX.utils.json_to_sheet(excelData, { cellDates: true });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "RawData_Export");

        // Äá»ŠNH Dáº NG FORMAT HIá»‚N THá»Š CHO Ã” NGÃ€Y THÃNG TRONG EXCEL
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Cháº¡y tá»« dÃ²ng 1, bá» qua dÃ²ng Header (R=0)
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
                if (!worksheet[cell_ref]) continue;

                // Náº¿u SheetJS nháº­n diá»‡n Ã´ nÃ y lÃ  kiá»ƒu Date (t === 'd')
                if (worksheet[cell_ref].t === 'd') {
                    // GÃ¡n format hiá»ƒn thá»‹ chuáº©n NÄƒm-ThÃ¡ng-NgÃ y Giá»:PhÃºt:GiÃ¢y cho Excel
                    worksheet[cell_ref].z = 'yyyy-mm-dd hh:mm:ss';
                }
            }
        }

        // Tá»° Äá»˜NG GIÃƒN Äá»˜ Rá»˜NG Cá»˜T (TrÃ¡nh lá»—i che máº¥t chá»¯ biáº¿n thÃ nh kÃ½ tá»± ### trong Excel)
        const max_chars = headers.map((h, i) => {
            return Math.max(
                h.length,
                ...excelData.map(row => {
                    const val = row[h];
                    if (val instanceof Date) return 19; // Äá»™ dÃ i máº·c Ä‘á»‹nh cho chuá»—i yyyy-mm-dd hh:mm:ss
                    return val ? String(val).length : 0;
                })
            );
        });
        // Set Ä‘á»™ rá»™ng cho cÃ¡c cá»™t (+3 Ä‘Æ¡n vá»‹ Ä‘á»‡m cho Ä‘áº¹p, giá»›i háº¡n tá»‘i Ä‘a rá»™ng 50 Ä‘á»ƒ trÃ¡nh cá»™t quÃ¡ to)
        worksheet['!cols'] = max_chars.map(w => ({ w: Math.min(w + 3, 50) }));

        // Táº£i file .xlsx xuá»‘ng mÃ¡y ngÆ°á»i dÃ¹ng kÃ¨m ngÃ y xuáº¥t file
        const todayStr = new Date().toISOString().slice(0, 10);
        const fileName = `Bao_cao_rawdata_${todayStr}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    });
}

// 4. ÄÄ‚NG KÃ SUBSCRIBER Äá»‚ NHáº¬N Dá»® LIá»†U Tá»ª LOOKER STUDIO
// Sá»­ dá»¥ng dscc.tableTransform giÃºp mapping dá»¯ liá»‡u dáº¡ng báº£ng pháº³ng cá»±c ká»³ gá»n
dscc.subscribeToData(drawVisualization, { transform: dscc.tableTransform });