// src/utils/excel.js
import ExcelJS from 'exceljs';
import { ipcRenderer } from './ipc';
import { parseNumber } from './parsers';

// 엑셀용 파싱 로직 (원본 유지)
const parseTableToDataForExcel = (html, currentMode) => {
    const parser = new DOMParser(); const doc = parser.parseFromString(html, 'text/html');
    if (currentMode === 'monthly') {
      const table = doc.querySelector('#inputTable'); if (!table) return null;
      const data = Array.from(table.querySelectorAll('tbody tr')).map(row => {
        const th = row.querySelector('th'); const tds = row.querySelectorAll('td');
        if (th && tds.length >= 4) { return { rawDate: th.innerText.trim(), card: parseNumber(tds[0].innerText), cash: parseNumber(tds[1].innerText), pay: parseNumber(tds[3].innerText) }; } return null;
      }).filter(i => i);
      return { type: 'monthly_result', data: data };
    } else {
      const xpath = "//form/table[1]/tbody/tr[1]/td/table[2]/tbody/tr[2]/td/table";
      const res = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!res) return null;
      const resultList = [];
      res.querySelectorAll('table').forEach(tbl => {
        const name = tbl.querySelector('thead tr td b')?.innerText.trim();
        const allRows = tbl.querySelectorAll('tr'); let dataRow = null;
        for (let row of allRows) { 
            const styleAttr = row.getAttribute('style') || '';
            if (styleAttr.toLowerCase().includes('#eef')) { dataRow = row; break; } 
        }
        if (dataRow) {
            const tds = dataRow.querySelectorAll('td');
            if (name && tds.length >= 6) { resultList.push({ name, cash: parseNumber(tds[2].innerText), card: parseNumber(tds[3].innerText), pay: parseNumber(tds[5].innerText) }); }
        }
      });
      return { type: 'daily_result', data: resultList };
    }
};

const getMonthRange = (dateStr) => {
    const date = new Date(dateStr); const year = date.getFullYear(); const month = date.getMonth(); 
    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
    const offset = firstDay.getTimezoneOffset() * 60000;
    const strS = new Date(firstDay.getTime() - offset).toISOString().split('T')[0];
    const strE = new Date(lastDay.getTime() - offset).toISOString().split('T')[0];
    return { strS, strE };
};

export const handleDownloadExcel = async ({ mode, dates, staffList, internalSales, addLog, setLoading }) => {
    setLoading(true); 
    let searchStart = dates.start; let searchEnd = dates.end;
    
    if (mode === 'monthly') { 
        const range = getMonthRange(dates.start); searchStart = range.strS; searchEnd = range.strE; 
        addLog(`📅 월마감 기간: ${searchStart} ~ ${searchEnd}`); 
    } else { addLog(`📅 일마감 날짜: ${dates.start}`); }

    let workbook;
    try {
      const templateName = mode === 'monthly' ? 'template.xlsx' : 'daily_template.xlsx';
      const buffer = await ipcRenderer.invoke('get-template', templateName);
      workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer.buffer);
    } catch (e) { addLog(`❌ 템플릿 로드 실패: ${e.message}`); setLoading(false); return; }

    const targetUrl = mode === 'monthly' ? 'https://www1.handsos.com/work/detail/report/report_account_Vat.asp' : 'https://www1.handsos.com/work/detail/account_daily/account_Daily.asp';
    const loopList = mode === 'daily' ? [{ name: '전체조회', code: '0' }] : staffList;

    if (mode === 'monthly' && loopList.length === 0) { addLog("❌ 등록된 직원이 없습니다."); setLoading(false); return; }

    for (let i = 0; i < loopList.length; i++) {
      const staff = loopList[i];
      try {
        const html = await ipcRenderer.invoke('scrap-data', { targetUrl, strDateS: searchStart, strDateE: searchEnd, strMode: 'd', pkStaff: staff.code, staffStatus: '' });
        const resultData = parseTableToDataForExcel(html, mode);
        
        if (resultData && resultData.data && resultData.data.length > 0) {
          if (mode === 'monthly') {
             const ws = workbook.getWorksheet(staff.name);
             if (ws) {
               resultData.data.forEach(item => {
                 const dateParts = item.rawDate.split('-');
                 if (dateParts.length === 3) {
                     const day = parseInt(dateParts[2], 10); const r = 7 + day; 
                     ws.getCell(`B${r}`).value = item.pay; ws.getCell(`C${r}`).value = item.card; ws.getCell(`D${r}`).value = item.cash;
                 }
               });
               
               // ★ [신규 기능] 파이어베이스 내수 데이터 매칭 ★
               if (internalSales && internalSales[staff.name]) {
                   const d = internalSales[staff.name];
                   ws.getCell('E53').value = d["직원내수"] || 0;
                   ws.getCell('E54').value = (d["가발"] || 0) + (d["CL"] || 0); 
                   ws.getCell('E55').value = d["재시술"] || 0;
                   ws.getCell('E56').value = d["명함"] || 0;
                   ws.getCell('E57').value = d["블로거ST"] || 0; 
               }
               
               addLog(`✅ [${staff.name}] 데이터 저장 완료`);
             } else { addLog(`⚠️ [${staff.name}] 엑셀 시트가 없습니다.`); }
          } else {
             const ws = workbook.worksheets[0]; const titleCell = ws.getCell('B2'); 
             if(titleCell) titleCell.value = `${dates.start} 일일 매출 현황`;
             let matchCount = 0;
             
             resultData.data.forEach(data => {
               for (let r = 6; r <= 26; r++) {
                 const cell = ws.getCell(`B${r}`);
                 
                 // ★★★ [해결 핵심] 엑셀의 글자(Rich Text 포함)를 완벽하게 읽는 오리지널 방식 복구 ★★★
                 const cellText = cell.text ? String(cell.text).replace(/\s/g, '') : '';
                 const dataName = data.name ? String(data.name).replace(/\s/g, '') : '';
                 
                 if ((cellText && cellText.includes(dataName)) || (!cell.value && r >= 18)) {
                   cell.value = data.name; 
                   ws.getCell(`C${r}`).value = data.pay; 
                   ws.getCell(`E${r}`).value = data.card; 
                   ws.getCell(`G${r}`).value = data.cash;
                   matchCount++; break;
                 }
               }
             });
             addLog(`✅ 총 ${matchCount}명 처리 완료`);
          }
        } else { addLog(`⚠️ [${staff.name}] 데이터 없음`); }
      } catch (innerError) { addLog(`❌ [${staff.name}] 오류: ${innerError.message}`); }
    } 

    try {
        const outBuffer = await workbook.xlsx.writeBuffer();
        let fileName = mode === 'monthly' ? `월급여_${dates.start.substring(0, 7)}.xlsx` : `일마감_${dates.start}.xlsx`;
        if (mode === 'daily') { 
            await ipcRenderer.invoke('open-excel-direct', { buffer: outBuffer, fileName }); 
            addLog("✅ 엑셀 실행 완료"); 
        } else { 
            const url = URL.createObjectURL(new Blob([outBuffer])); 
            const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); 
            addLog("✅ 다운로드 완료"); 
        }
    } catch (saveError) { addLog(`❌ 파일 저장 실패: ${saveError.message}`); }
    setLoading(false);
};