export const parseNumber = (str) => {
    const match = str?.toString().match(/-?[\d,]+/);
    return match ? parseInt(match[0].replace(/[^0-9-]/g, ''), 10) : 0;
};

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
            const rowText = row.innerText || '';
            if (rowText.includes('▲') || rowText.includes('▼')) return;
            const tds = row.querySelectorAll('td');
            if (tds.length < 5) return;
            let name = "";
            let pay = 0;
            let card = 0;
            let etc = 0;
            if (tds.length === 15 || tds.length === 14) {
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
                etc = parseNumber(tds[9]?.innerText);
            } else if (tds.length === 13) {
                name = lastCustomerName;
                pay = parseNumber(tds[6]?.innerText);
                card = parseNumber(tds[4]?.innerText);
                etc = parseNumber(tds[7]?.innerText);
            } else return;
            // 예약금 등 기타 결제 방식도 매출 누락 없이 고객 매출에 합산
            if (!customerMap.has(name)) customerMap.set(name, { total: 0, card: 0 });
            const current = customerMap.get(name);
            current.total += pay + etc;
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
