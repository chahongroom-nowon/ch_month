import ExcelJS from 'exceljs';
import { ipcRenderer } from '../utils/ipc';
import { parseNumber } from '../utils/parsers';
import { toNodeBuffer } from '../utils/xlsxPatch';

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

const buildPatches = (workbook, dates, dataList) => {
    const ws0 = workbook.worksheets[0];
    const patches = [{ ref: 'B2', value: `${dates.start} 일일 매출 현황`, type: 'string' }];

    dataList.forEach(data => {
        for (let r = 6; r <= 26; r++) {
            const cell = ws0.getCell(`B${r}`);
            if (cell.text.replace(/\s/g,'').includes(data.name.replace(/\s/g,'')) || (!cell.value && r >= 18)) {
                patches.push(
                    { ref: `B${r}`, value: data.name, type: 'string' },
                    { ref: `C${r}`, value: data.pay, type: 'number' },
                    { ref: `E${r}`, value: data.card, type: 'number' },
                    { ref: `G${r}`, value: data.cash, type: 'number' },
                );
                break;
            }
        }
    });

    return patches;
};

export const executeDailyExcel = async ({ dates, addLog, setLoading }) => {
    setLoading(true);
    addLog(`📅 일마감 날짜: ${dates.start}`);

    let workbook;
    try {
        const templateBuffer = toNodeBuffer(await ipcRenderer.invoke('get-template', 'daily_template.xlsx'));
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(templateBuffer);
    } catch (e) { addLog(`❌ 템플릿 로드 실패: ${e.message}`); setLoading(false); return; }

    const targetUrl = 'https://www1.handsos.com/work/detail/account_daily/account_Daily.asp';
    const fileName = `일마감_${dates.start}.xlsx`;

    try {
        const html = await ipcRenderer.invoke('scrap-data', { targetUrl, strDateS: dates.start, strDateE: dates.start, strMode: 'd', pkStaff: '0', staffStatus: '' });
        const dataList = parseDailyData(html);
        const patches = buildPatches(workbook, dates, dataList);

        if (dataList.length === 0) addLog(`⚠️ HAND 데이터 없음 (템플릿만 생성)`);
        else addLog(`✅ HAND 데이터 ${dataList.length}명 반영`);

        await ipcRenderer.invoke('build-daily-excel', { patches, fileName });
        addLog(dataList.length > 0 ? `✅ 일마감 정산 완료` : `✅ 엑셀 실행 완료`);
    } catch (e) {
        addLog(`❌ 오류: ${e.message}`);
    }

    setLoading(false);
};
