import ExcelJS from 'exceljs';
import { ipcRenderer } from '../utils/ipc';
import { parseNumber } from '../utils/parsers';

const parseMonthlyData = (html) => {
    const parser = new DOMParser(); 
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('#inputTable'); 
    if (!table) return [];
    
    return Array.from(table.querySelectorAll('tbody tr')).map(row => {
        const th = row.querySelector('th'); 
        const tds = row.querySelectorAll('td');
        if (th && tds.length >= 4) { 
            return { 
                rawDate: th.innerText.trim(), 
                card: parseNumber(tds[0].innerText), 
                cash: parseNumber(tds[1].innerText), 
                pay: parseNumber(tds[3].innerText) 
            }; 
        } 
        return null;
    }).filter(i => i);
};

const getMonthRange = (dateStr) => {
    const date = new Date(dateStr); 
    const year = date.getFullYear(); 
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1); 
    const lastDay = new Date(year, month + 1, 0);
    const offset = firstDay.getTimezoneOffset() * 60000;
    const strS = new Date(firstDay.getTime() - offset).toISOString().split('T')[0];
    const strE = new Date(lastDay.getTime() - offset).toISOString().split('T')[0];
    return { strS, strE };
};

export const executeMonthlyExcel = async ({ dates, staffList, addLog, setLoading }) => {
    setLoading(true);
    const range = getMonthRange(dates.start);
    const searchStart = range.strS; 
    const searchEnd = range.strE;
    addLog(`📅 월마감 기간: ${searchStart} ~ ${searchEnd}`);

    let workbook;
    try {
        const buffer = await ipcRenderer.invoke('get-template', 'template.xlsx');
        workbook = new ExcelJS.Workbook(); 
        await workbook.xlsx.load(buffer.buffer);
    } catch (e) { 
        addLog(`❌ 템플릿 로드 실패: ${e.message}`); 
        setLoading(false); 
        return; 
    }

    const targetUrl = 'https://www1.handsos.com/work/detail/report/report_account_Vat.asp';

    if (staffList.length === 0) { 
        addLog("❌ 등록된 직원이 없습니다."); 
        setLoading(false); 
        return; 
    }

    // 디자이너별 루프 시작
    for (let i = 0; i < staffList.length; i++) {
        const staff = staffList[i];
        try {
            addLog(`📡 [${staff.name}] HandSOS 데이터 수집 중...`);
            // HandSOS는 POST 방식인 scrap-data를 그대로 사용합니다.
            const html = await ipcRenderer.invoke('scrap-data', { 
                targetUrl, 
                strDateS: searchStart, 
                strDateE: searchEnd, 
                strMode: 'd', 
                pkStaff: staff.code, 
                staffStatus: '' 
            });
            
            const dataList = parseMonthlyData(html);
            const ws = workbook.getWorksheet(staff.name);

            if (ws) {
                // 1. HandSOS 매출 데이터 기입 (B~D열)
                if (dataList.length > 0) {
                    dataList.forEach(item => {
                        const dateParts = item.rawDate.split('-');
                        if (dateParts.length === 3) {
                            const day = parseInt(dateParts[2], 10); 
                            const r = 7 + day;
                            ws.getCell(`B${r}`).value = item.pay; 
                            ws.getCell(`C${r}`).value = item.card; 
                            ws.getCell(`D${r}`).value = item.cash;
                        }
                    });
                }
            } else {
                addLog(`⚠️ [${staff.name}] 시트 없음`); 
            }
        } catch (innerError) { 
            addLog(`❌ [${staff.name}] 오류: ${innerError.message}`); 
        }
    }

    // 최종 파일 생성 및 다운로드
    try {
        const outBuffer = await workbook.xlsx.writeBuffer();
        const fileName = `월급여_${dates.start.substring(0, 7)}.xlsx`;
        const url = URL.createObjectURL(new Blob([outBuffer]));
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = fileName; 
        a.click();
        addLog("✅ 엑셀 생성 및 다운로드 완료");
    } catch (saveError) { 
        addLog(`❌ 파일 저장 실패: ${saveError.message}`); 
    }
    
    setLoading(false);
};