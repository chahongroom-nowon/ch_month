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

// ★ HandSOS 데이터 파싱 (카드 매출 로직 수정됨) ★
export const parseHandSosData = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const xpath = "//form/table[1]/tbody/tr[1]/td/table[2]/tbody/tr[2]/td/table";
    const res = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!res) return null; 

    const designerGroups = [];
    res.querySelectorAll('table').forEach(tbl => {
      const designerName = tbl.querySelector('thead tr td b')?.innerText.trim();
      if (!designerName) return;
      
      const customerMap = new Map();
      let lastCustomerName = "미지정"; 
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
            name = tds[1].innerText.trim();
            if (name.includes('소') && name.includes('계')) return;
            if (name) lastCustomerName = name; else name = lastCustomerName;
            
            pay = parseNumber(tds[8].innerText);
            card = parseNumber(tds[6].innerText); 

        } else if (tds.length === 13) {
            name = lastCustomerName; 
            pay = parseNumber(tds[6].innerText);
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
        // ★★★ [수정됨] 페이(total)가 0이라도 카드(card) 매출이 있으면 포함 ★★★
        if (val.total > 0 || val.card > 0) { 
            customers.push({ name: key, total: val.total, card: val.card }); 
            groupTotal += val.total;
            groupCard += val.card;
        } 
      });

      // 매출이 하나라도 있는 디자이너만 그룹에 추가
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