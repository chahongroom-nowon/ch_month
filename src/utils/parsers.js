export const parseNumber = (str) => parseInt(str?.toString().replace(/[^0-9]/g, '') || '0', 10);

export const normalizeName = (name) => {
    if (!name) return '';
    // 이모티콘(👤), 공백 제거 후 "님" 앞의 이름만 추출
    const match = name.match(/[^\\s👤]+(?=님)/);
    let cleanName = match ? match[0].trim() : name.replace(/[👤\s]/g, '').split('님')[0];
    
    cleanName = cleanName.replace(/^([sbSB])(\.|\s+)|([sbSB])(?=[가-힣])/g, '');
    cleanName = cleanName.replace(/디자이너|실장|수석|점장|원장|부원장/g, '');
    return cleanName.replace(/\s/g, '');
};

export const parseStaffOptions = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const select = doc.querySelector('#pkStaff');
    if (!select) return [];
    const options = select.querySelectorAll('option');
    const list = [];
    options.forEach(opt => {
        const val = opt.value;
        const text = opt.innerText.trim();
        if (val && val !== "" && !text.includes("선택")) { list.push({ code: val, name: text }); }
    });
    return list;
};

export const parseHandSosData = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const xpath = "//form/table[1]/tbody/tr[1]/td/table[2]/tbody/tr[2]/td/table";
    const res = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!res) return null; 

    const designerGroups = [];
    const excludeKeywords = ['합계', '소계', '총계', '고객매출계', '전체합계', '누계', '매출계', '점판', '선불'];

    res.querySelectorAll('table').forEach(tbl => {
        const designerName = tbl.querySelector('thead tr td b')?.innerText.trim();
        if (!designerName) return;

        const cleanDesigner = designerName.replace(/\s/g, '');
        if (excludeKeywords.some(kw => cleanDesigner.includes(kw))) return;

        const customerMap = new Map();
        let lastCustomerName = "미지정"; 
        let guestCount = 1;
        const allRows = tbl.querySelectorAll('tr');

        allRows.forEach(row => {
            const styleAttr = row.getAttribute('style') || '';
            if (styleAttr.toLowerCase().includes('#eef')) return;
            const tds = row.querySelectorAll('td');
            if (tds.length < 5) return;
            let name = "";
            let pay = 0;
            let card = 0; 
            if (tds.length === 15) {
                name = tds[1]?.innerText.trim() || '';
                const cleanName = name.replace(/\s/g, ''); 
                if (excludeKeywords.some(kw => cleanName.includes(kw))) return;
                if (!name) name = lastCustomerName; 
                else if (cleanName.includes('손님') || cleanName.includes('비회원')) {
                    name = `손님(${guestCount++})`;
                    lastCustomerName = name; 
                } else lastCustomerName = name;
                pay = parseNumber(tds[8]?.innerText);
                card = parseNumber(tds[6]?.innerText); 
            } else if (tds.length === 13) {
                name = lastCustomerName; 
                pay = parseNumber(tds[6]?.innerText);
                card = parseNumber(tds[4]?.innerText);
            } else return;
            if (!customerMap.has(name)) customerMap.set(name, { total: 0, card: 0 });
            const current = customerMap.get(name);
            current.total += pay; 
            current.card += card; 
        });

        const customers = [];
        let groupTotal = 0;
        let groupCard = 0;
        customerMap.forEach((val, key) => { 
            if (val.total > 0 || val.card > 0) { 
                customers.push({ name: key, total: val.total, card: val.card }); 
                groupTotal += val.total;
                groupCard += val.card;
            } 
        });
        if (customers.length > 0) {
            designerGroups.push({ designer: designerName, customers, totalAmount: groupTotal, totalCard: groupCard });
        }
    });
    return designerGroups;
};

/**
 * 이미지의 실제 HTML 구조(.staff-group > .staff-header > b)에 맞게 수정한 파서
 */
export const parseInternalSalesData = (html) => {
    console.log("--- 내수 데이터 파싱 시작 ---");
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const result = {}; 
    
    // 1. 이미지에 보이는 가장 바깥쪽 컨테이너인 .staff-group을 찾습니다.
    const staffGroups = doc.querySelectorAll('.staff-group');
    console.log("발견된 직원 그룹 수:", staffGroups.length);

    staffGroups.forEach((group, index) => {
        // 2. 이름 추출: .staff-header 내의 b 태그에서 "정예은님" 추출
        const headerB = group.querySelector('.staff-header b');
        if (!headerB) return;
        
        const rawText = headerB.innerText.trim();
        const staffName = normalizeName(rawText);
        console.log(`[${index}] 파싱 중인 직원:`, staffName);

        const categories = { "직원내수": 0, "가발": 0, "CL": 0, "재시술": 0, "명함": 0, "블로거ST": 0 };
        
        // 3. 테이블 탐색: 이미지상의 클래스명인 .summary-table을 찾습니다.
        const summaryTable = group.querySelector('.summary-table');
        
        if (summaryTable) {
            const ths = summaryTable.querySelectorAll('tr th');
            const tds = summaryTable.querySelectorAll('tr td');
            
            ths.forEach((th, idx) => {
                const key = th.innerText.trim();
                const val = parseNumber(tds[idx]?.innerText);
                
                // 블로거ST 항목 처리 및 나머지 매칭
                if (key === "블로거ST" || key === "블로거" || key === "ST") {
                    categories["블로거ST"] += val;
                } else if (categories.hasOwnProperty(key)) {
                    categories[key] = val;
                }
            });
            console.log(`   > ${staffName} 데이터 수집 완료:`, categories);
        }
        
        result[staffName] = categories;
    });
    
    console.log("--- 최종 파싱 결과:", result);
    return result;
};