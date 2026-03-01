import ExcelJS from 'exceljs';
import { ipcRenderer } from '../utils/ipc';
import { parseNumber } from '../utils/parsers';

const parseDailyData = (html) => {
    const parser = new DOMParser(); const doc = parser.parseFromString(html, 'text/html');
    const xpath = "//form/table[1]/tbody/tr[1]/td/table[2]/tbody/tr[2]/td/table";
    const res = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!res) return [];
    
    const resultList = [];
    res.querySelectorAll('table').forEach(tbl => {
        const name = tbl.querySelector('thead tr td b')?.innerText.trim();
        const allRows = tbl.querySelectorAll('tr'); let dataRow = null;
        for (let row of allRows) { 
            const styleAttr = row.getAttribute('style'); 
            if (styleAttr && styleAttr.toLowerCase().includes('#eef')) { dataRow = row; break; } 
        }
        if (dataRow) {
            const tds = dataRow.querySelectorAll('td');
            if (name && tds.length >= 6) { 
                resultList.push({ name, cash: parseNumber(tds[2].innerText), card: parseNumber(tds[3].innerText), pay: parseNumber(tds[5].innerText) }); 
            }
        }
    });
    return resultList;
};

export const executeDailyExcel = async ({ dates, addLog, setLoading }) => {
    setLoading(true);
    addLog(`📅 일마감 날짜: ${dates.start}`);

    let workbook;
    try {
        const buffer = await ipcRenderer.invoke('get-template', 'daily_template.xlsx');
        workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer.buffer);
    } catch (e) { addLog(`❌ 템플릿 로드 실패: ${e.message}`); setLoading(false); return; }

    const targetUrl = 'https://www1.handsos.com/work/detail/account_daily/account_Daily.asp';

    try {
        const html = await ipcRenderer.invoke('scrap-data', { targetUrl, strDateS: dates.start, strDateE: dates.start, strMode: 'd', pkStaff: '0', staffStatus: '' });
        const dataList = parseDailyData(html);

        if (dataList.length > 0) {
            const ws0 = workbook.worksheets[0]; const titleCell = ws0.getCell('B2');
            if(titleCell) titleCell.value = `${dates.start} 일일 매출 현황`;

            dataList.forEach(data => {
                for (let r = 6; r <= 26; r++) {
                    const cell = ws0.getCell(`B${r}`);
                    // ★★★ 사용자님 원본 100% 복구: cell.text 방식으로 되돌려 일마감 빈파일 현상 완벽 해결 ★★★
                    if (cell.text.replace(/\s/g,'').includes(data.name.replace(/\s/g,'')) || (!cell.value && r >= 18)) {
                        cell.value = data.name; 
                        ws0.getCell(`C${r}`).value = data.pay; 
                        ws0.getCell(`E${r}`).value = data.card; 
                        ws0.getCell(`G${r}`).value = data.cash;
                        break;
                    }
                }
            });
            addLog(`✅ 일마감 정산 완료`);
        } else { addLog(`⚠️ 데이터 없음`); }
    } catch (innerError) { addLog(`❌ 오류: ${innerError.message}`); }

    try {
        const outBuffer = await workbook.xlsx.writeBuffer();
        let fileName = `일마감_${dates.start}.xlsx`;
        await ipcRenderer.invoke('open-excel-direct', { buffer: outBuffer, fileName });
        addLog("✅ 엑셀 실행 완료");
    } catch (saveError) { addLog(`❌ 파일 저장 실패: ${saveError.message}`); }
    setLoading(false);
};