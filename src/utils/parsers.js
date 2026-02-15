// src/utils/parsers.js

// 숫자만 추출
export const parseNumber = (str) => parseInt(str?.replace(/[^0-9]/g, '') || '0', 10);

// 이름 정규화 (직급, 공백 제거)
export const normalizeName = (name) => {
    if (!name) return '';
    let cleanName = name.replace(/^([sbSB])(\.|\s+)|([sbSB])(?=[가-힣])/g, '');
    cleanName = cleanName.replace(/디자이너|실장|수석|점장|원장|부원장/g, '');
    return cleanName.replace(/\s/g, '');
};

// 직원 목록 파싱
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

// ★ HandSOS 데이터 파싱 (강력한 필터 적용됨) ★
export const parseHandSosData = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const xpath = "//form/table[1]/tbody/tr[1]/td/table[2]/tbody/tr[2]/td/table";
    const res = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!res) return null; 

    const designerGroups = [];
    
    // 1. 제외할 단어들 (기본)
    const excludeKeywords = ['합계', '소계', '총계', '고객매출계', '전체합계', '누계', '점판', '선불'];

    res.querySelectorAll('table').forEach(tbl => {
      const designerName = tbl.querySelector('thead tr td b')?.innerText.trim();
      
      // 디자이너 이름이 없거나, 통계용 테이블이면 스킵
      if (!designerName || excludeKeywords.some(kw => designerName.includes(kw))) return;
      
      const customerMap = new Map();
      let lastCustomerName = "미지정"; 
      const allRows = tbl.querySelectorAll('tr');

      allRows.forEach(row => {
        const styleAttr = row.getAttribute('style') || '';
        // 배경색이 #eef(회색계열, 주로 소계/합계 행)이면 스킵
        if (styleAttr.toLowerCase().includes('#eef')) return;
        
        const tds = row.querySelectorAll('td');
        if (tds.length < 5) return;
        
        let name = "";
        let pay = 0;
        let card = 0; 

        if (tds.length === 15) {
            name = tds[1].innerText.trim();
            
            // ★★★ [강력 필터] 이름이 이상하면 무조건 버림 ★★★
            // 1. 제외 키워드 포함
            if (excludeKeywords.some(kw => name.includes(kw))) return;
            // 2. 특수기호(=, ▲, +)가 포함된 경우 (통계 행일 확률 100%)
            if (name.includes('=') || name.includes('▲') || name.includes('+')) return;
            // 3. 이름에 숫자가 3개 이상 포함된 경우 (예: "1,922,000원") -> 사람이 아님
            if ((name.match(/\d/g) || []).length >= 3) return;

            if (name) lastCustomerName = name; else name = lastCustomerName;
            
            pay = parseNumber(tds[8]?.innerText);
            card = parseNumber(tds[6]?.innerText); 

        } else if (tds.length === 13) {
            name = lastCustomerName; 
            
            // 병합된 행이라도 지난 이름이 금지어면 무시
            if (excludeKeywords.some(kw => name.includes(kw))) return;
            if (name.includes('=') || name.includes('▲') || (name.match(/\d/g) || []).length >= 3) return;

            pay = parseNumber(tds[6]?.innerText);
            card = parseNumber(tds[4]?.innerText);
        } else return;

        if (!customerMap.has(name)) {
            customerMap.set(name, { total: 0, card: 0 });
        }
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
          designerGroups.push({ 
              designer: designerName, 
              customers, 
              totalAmount: groupTotal, 
              totalCard: groupCard
          });
      }
    });
    return designerGroups;
};