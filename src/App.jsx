import { useState, useEffect, useMemo } from 'react';
import './App.css';
import { ipcRenderer, isElectron } from './utils/ipc';
import { parseHandSosData, normalizeName, parseStaffOptions } from './utils/parsers';

// 엑셀 모듈 임포트
import { executeDailyExcel } from './modules/excelDaily';
import { executeMonthlyExcel } from './modules/excelMonthly';

// UI 컴포넌트 임포트
import LoginModule from './components/LoginModule';
import DailyModule from './components/DailyModule';
import MonthlyModule from './components/MonthlyModule';
import StaffModule from './components/StaffModule';
import ReportModule from './components/ReportModule';

export default function App() {
  const [logs, setLogs] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('daily');
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [isNaverLoggedIn, setIsNaverLoggedIn] = useState(false);
  const [naverStoreName, setNaverStoreName] = useState('');
  
  const [naverSales, setNaverSales] = useState(null);
  const [naverDetails, setNaverDetails] = useState([]); 
  const [handSosData, setHandSosData] = useState([]); 
  const [appVersion, setAppVersion] = useState('');
  
  const [showVerify, setShowVerify] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [onlineStaffList, setOnlineStaffList] = useState([]);
  const [selectedStaffCodes, setSelectedStaffCodes] = useState(new Set());

  const getYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; };
  const [dates, setDates] = useState({ start: getYesterday(), end: getYesterday() });
  const [staffList, setStaffList] = useState(() => JSON.parse(localStorage.getItem('staffList') || '[]'));
  
  const [modalState, setModalState] = useState({ type: 'NONE', text: '', version: '', percent: 0 });
  const [lastLog, setLastLog] = useState('준비 완료');

  const addLog = (msg) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${msg}`, ...prev]);
      setLastLog(msg);
  };

  useEffect(() => {
    if (isElectron) {
      ipcRenderer.invoke('get-app-version').then(ver => setAppVersion(ver));
      window.resizeTo(600, 800);

      ipcRenderer.on('update-msg', (e, p) => setModalState({ type: 'INFO', text: p.text, version: '', percent: 0 }));
      ipcRenderer.on('update-available', (e, v) => {
          setModalState({ type: 'PROGRESS', text: '', version: v, percent: 0 });
          ipcRenderer.invoke('start-download');
      });
      ipcRenderer.on('update-not-available', () => { addLog('✅ 현재 최신 버전입니다.'); });
      ipcRenderer.on('download-progress', (e, p) => setModalState(prev => ({ ...prev, type: 'PROGRESS', percent: Math.round(p) })));
      ipcRenderer.on('download-complete', () => setModalState({ type: 'INSTALL', text: '', version: '', percent: 100 }));
      
      setTimeout(() => { addLog('🔄 업데이트 확인 중...'); ipcRenderer.invoke('check-for-updates'); }, 1500);

      return () => { 
          ipcRenderer.removeAllListeners('update-msg'); ipcRenderer.removeAllListeners('update-available'); 
          ipcRenderer.removeAllListeners('update-not-available'); ipcRenderer.removeAllListeners('download-progress'); 
          ipcRenderer.removeAllListeners('download-complete'); 
      };
    }
  }, []);

  useEffect(() => { if (mode === 'daily' && isNaverLoggedIn) fetchNaverSales(dates.start); }, [dates.start, mode]);

  const closeVerifyPanel = () => { setShowVerify(false); window.resizeTo(600, 800); };
  const handleReopenReport = () => { setShowVerify(true); window.resizeTo(1400, 900); };
  const closeModal = () => setModalState({ ...modalState, type: 'NONE' });
  const handleInstall = () => ipcRenderer.invoke('install-now');
  
  const removeStaff = (i) => { const l = staffList.filter((_, idx) => idx !== i); setStaffList(l); localStorage.setItem('staffList', JSON.stringify(l)); };
  const setQuickDate = (type) => { const d = new Date(); if (type === 'yesterday') d.setDate(d.getDate() - 1); const s = d.toISOString().split('T')[0]; setDates({ start: s, end: s }); };
  const handleDateChange = (e) => { const val = e.target.value; setDates({ start: val, end: val }); };

  const fetchOnlineStaffList = async () => {
      if (!isLoggedIn) { alert("먼저 HAND 로그인을 해주세요."); return; }
      setLoading(true);
      try {
          const targetUrl = 'https://www1.handsos.com/work/detail/saleList.asp'; 
          const html = await ipcRenderer.invoke('scrap-data', { targetUrl, strDateS: dates.start, strDateE: dates.end, strMode: 'd', pkStaff: '0', staffStatus: '' });
          const list = parseStaffOptions(html);
          if (list.length > 0) {
              setOnlineStaffList(list);
              const currentCodes = new Set(staffList.map(s => s.code));
              setSelectedStaffCodes(currentCodes);
              setShowStaffModal(true);
              addLog(`✅ 직원 명단 ${list.length}명 발견`);
          } else { alert("직원 명단을 찾을 수 없습니다."); }
      } catch (e) { addLog(`❌ 직원 조회 실패: ${e.message}`); }
      setLoading(false);
  };

  const handleStaffCheck = (code) => { const newSet = new Set(selectedStaffCodes); if (newSet.has(code)) newSet.delete(code); else newSet.add(code); setSelectedStaffCodes(newSet); };
  const saveSelectedStaff = () => { const newStaffList = onlineStaffList.filter(s => selectedStaffCodes.has(s.code)); setStaffList(newStaffList); localStorage.setItem('staffList', JSON.stringify(newStaffList)); setShowStaffModal(false); addLog(`💾 직원 리스트 업데이트 완료 (${newStaffList.length}명)`); };

  const fetchNaverSales = async (date) => {
    setLoading(true);
    try {
      const res = await ipcRenderer.invoke('get-naver-sales', { date });
      if (res.total === -1) {
        setNaverSales(null);
        setNaverDetails([]);
        if (res.reason === 'NO_BIZ_ID') {
          setIsNaverLoggedIn(false);
          addLog('❌ NPay 세션 만료. 다시 로그인해 주세요.');
        } else {
          addLog(`❌ NPay 매출 조회 실패 (${res.reason || 'unknown'})`);
        }
      } else {
        setNaverSales(res.total);
        setNaverDetails(res.detailList);
        setIsNaverLoggedIn(true);
        addLog(`✅ NPay ${date} 매출: ${res.total.toLocaleString()}원 (${res.detailList.length}건)`);
        if (!showVerify) { setShowVerify(true); window.resizeTo(1400, 900); }
      }
    } catch (e) {
      addLog(`❌ NPay 조회 오류: ${e.message}`);
    }
    setLoading(false);
  };

  const handleFetchHandSos = async (skipCheck = false) => {
    if(!skipCheck && !isLoggedIn) return;
    setLoading(true);
    try {
        const targetUrl = 'https://www1.handsos.com/work/detail/account_daily/account_Daily.asp';
        const html = await ipcRenderer.invoke('scrap-data', { targetUrl, strDateS: dates.start, strDateE: dates.end, strMode: 'd', pkStaff: '0', staffStatus: '' });
        const parsedData = parseHandSosData(html);
        if(parsedData) setHandSosData(parsedData);
        else addLog("❌ HAND 테이블 없음");
    } catch (e) { addLog(`❌ 오류: ${e.message}`); }
    setLoading(false);
  };

  const mergedData = useMemo(() => {
    const allDesigners = new Set([ ...handSosData.map(d => normalizeName(d.designer)), ...naverDetails.map(d => normalizeName(d.designer)) ]);
    const result = Array.from(allDesigners).map(normalizedDesignerName => {
        const sosDesignerObj = handSosData.find(d => normalizeName(d.designer) === normalizedDesignerName);
        const naverDesignerList = naverDetails.filter(d => normalizeName(d.designer) === normalizedDesignerName);
        const displayName = sosDesignerObj ? sosDesignerObj.designer : (naverDesignerList[0]?.designer || normalizedDesignerName);
        const sosCustomers = sosDesignerObj ? sosDesignerObj.customers : [];
        const designerCardTotal = sosDesignerObj ? sosDesignerObj.totalCard : 0; 

        const rowMap = new Map();
        sosCustomers.forEach(c => {
            const key = normalizeName(c.name);
            if (!rowMap.has(key)) rowMap.set(key, { name: c.name, sos: 0, sosCard: 0, naver: 0, naverNames: [] });
            const row = rowMap.get(key); row.sos += c.total; row.sosCard += c.card;
        });

        naverDesignerList.forEach(item => {
            const bookerKey = normalizeName(item.name);
            const visitorKey = item.visitor ? normalizeName(item.visitor) : null;
            let matchedKey = null;
            if (visitorKey && rowMap.has(visitorKey)) matchedKey = visitorKey; 
            else if (rowMap.has(bookerKey)) matchedKey = bookerKey; 
            else {
                matchedKey = visitorKey || bookerKey; 
                if (!rowMap.has(matchedKey)) {
                    const displayLabel = item.visitor ? `${item.name}(${item.visitor})` : item.name;
                    rowMap.set(matchedKey, { name: displayLabel, sos: 0, sosCard: 0, naver: 0, naverNames: [] });
                }
            }
            const row = rowMap.get(matchedKey); row.naver += item.price;
            const detailStr = item.visitor ? `${item.name}(방문:${item.visitor})` : item.name;
            row.naverNames.push(detailStr);
        });

        const customers = Array.from(rowMap.values()).map(row => ({
            name: row.name, sos: row.sos, sosCard: row.sosCard, naver: row.naver, diff: row.sos - row.naver, naverDetailName: [...new Set(row.naverNames)].join(', ')
        }));
        
        const totalSos = customers.reduce((a,c) => a + c.sos, 0);
        const totalNaver = customers.reduce((a,c) => a + c.naver, 0);
        return { designer: displayName, totalSos, totalCard: designerCardTotal, totalNaver, customers };
    });
    return result.sort((a, b) => a.designer.localeCompare(b.designer));
  }, [handSosData, naverDetails]);

  const grandTotals = useMemo(() => {
      return mergedData.reduce((acc, cur) => ({ 
          sos: acc.sos + cur.totalSos, card: acc.card + cur.totalCard, naver: acc.naver + cur.totalNaver 
      }), { sos: 0, card: 0, naver: 0 });
  }, [mergedData]);

  const onHandSosLogin = async () => {
      const res = await ipcRenderer.invoke('open-login-window');
      if (res && (res.status === "SUCCESS" || res.status === "ALREADY_OPEN")) {
          setIsLoggedIn(true);
          if (res.storeName) { setStoreName(res.storeName); addLog(`👋 매장: ${res.storeName}`); }
          await handleFetchHandSos(true);
          setShowVerify(true); window.resizeTo(1400, 900); 
      }
  };

  const onNaverLogin = async () => {
      if (isNaverLoggedIn) {
          addLog(`🔄 NPay ${dates.start} 재조회 중...`);
          await fetchNaverSales(dates.start);
          return;
      }
      const res = await ipcRenderer.invoke('open-naver-login');
      if (res && (res.status === "SUCCESS" || res.status === "ALREADY_OPEN")) {
          setIsNaverLoggedIn(true);
          if (res.storeName) { setNaverStoreName(res.storeName); addLog(`✅ 매장: ${res.storeName}`); }
          await fetchNaverSales(dates.start);
      }
  };

  const hasData = handSosData.length > 0 || naverDetails.length > 0;

  return (
    <div className="container">
      <div className="left-panel" style={{ flex: showVerify ? '0 0 450px' : '1' }}>
        <div className="title-area">
            <h1>마감 프로그램</h1>
            <div style={{display:'flex', gap:'5px', alignItems:'center', marginTop:'5px', justifyContent:'center'}}><span className="version-tag">v{appVersion}</span></div>
            <div style={{display:'flex', flexDirection:'column', gap:'5px', marginTop:'15px', alignItems:'center'}}>
                {isLoggedIn && storeName && <div className="store-badge" style={{background:'#e0e7ff', color:'#3730a3'}}><span>🏢</span> {storeName}</div>}
                {isNaverLoggedIn && naverStoreName && <div className="store-badge" style={{background:'#dcfce7', color:'#166534'}}><span>N</span> {naverStoreName}</div>}
            </div>
        </div>

        {/* 1. 로그인 모듈 */}
        <LoginModule 
            isLoggedIn={isLoggedIn} 
            isNaverLoggedIn={isNaverLoggedIn} 
            onHandSosLogin={onHandSosLogin} 
            onNaverLogin={onNaverLogin} 
        />

        <div className="section-card" style={{ opacity: (isLoggedIn || isNaverLoggedIn) ? 1 : 0.6, pointerEvents: (isLoggedIn || isNaverLoggedIn) ? 'auto' : 'none' }}>
            <div className="section-title">Step 2. 작업 선택</div>
            <div className="tab-group">
                <button className={`tab-btn ${mode === 'daily' ? 'active' : ''}`} onClick={() => setMode('daily')}>일마감</button>
                <button className={`tab-btn ${mode === 'monthly' ? 'active' : ''}`} onClick={() => setMode('monthly')}>월마감</button>
                <button className={`tab-btn ${mode === 'staff' ? 'active' : ''}`} onClick={() => setMode('staff')}>직원관리</button>
            </div>
            
            {/* 2~4. 작업 탭 모듈들 */}
            {mode === 'staff' && (
                <StaffModule staffList={staffList} fetchOnlineStaffList={fetchOnlineStaffList} removeStaff={removeStaff} loading={loading} />
            )}
            {mode === 'daily' && (
                <DailyModule 
                    dates={dates} handleDateChange={handleDateChange} setQuickDate={setQuickDate} 
                    onDownload={() => executeDailyExcel({ dates, staffList, addLog, setLoading })} 
                    loading={loading} hasData={hasData} showVerify={showVerify} handleReopenReport={handleReopenReport} 
                />
            )}
            {mode === 'monthly' && (
                <MonthlyModule 
                    dates={dates} handleDateChange={handleDateChange} 
                    onDownload={() => executeMonthlyExcel({ dates, staffList, addLog, setLoading })} 
                    loading={loading} 
                />
            )}
        </div>
        <div className="status-bar"><div className="status-dot"></div><span>{lastLog}</span></div>
        <div className="maker-footer">Developed by <strong>CHAHONG Nowon</strong></div>
      </div>

      {/* 5. 리포트 모듈 */}
      {showVerify && (
          <ReportModule closeVerifyPanel={closeVerifyPanel} grandTotals={grandTotals} mergedData={mergedData} />
      )}

      {/* 모달 창들 */}
      {showStaffModal && (
        <div className="modal-overlay">
            <div className="staff-modal-content">
                <div className="staff-modal-header"><span className="staff-modal-title">직원 명단 선택</span><button onClick={() => setShowStaffModal(false)} style={{border:'none', background:'none', cursor:'pointer', fontSize:'16px'}}>✖</button></div>
                <div className="staff-scroll-area">{onlineStaffList.map((s, i) => (<label key={i} className="staff-checkbox-item"><input type="checkbox" checked={selectedStaffCodes.has(s.code)} onChange={() => handleStaffCheck(s.code)} /><span className="staff-info-text">{s.name}</span><span className="staff-code-text">({s.code})</span></label>))}</div>
                <div className="modal-btn-row"><button className="modal-btn primary" onClick={saveSelectedStaff}>저장하기</button><button className="modal-btn secondary" onClick={() => setShowStaffModal(false)}>취소</button></div>
            </div>
        </div>
      )}

      {modalState.type !== 'NONE' && (
        <div className="modal-overlay">
          <div className="modal-content">
             {modalState.type === 'INFO' && <><h3>🔔 알림</h3><p>{modalState.text}</p><button className="modal-btn primary" onClick={closeModal}>확인</button></>}
             {modalState.type === 'PROGRESS' && <>
                 <h3>자동 업데이트 진행 중...</h3>
                 <p className="modal-desc" style={{marginBottom:'15px', color:'#4b5563'}}>새 버전({modalState.version})을 발견하여<br/>자동으로 다운로드하고 있습니다.</p>
                 <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${modalState.percent}%` }}></div></div>
                 <p className="progress-text">{modalState.percent}%</p>
             </>}
             {modalState.type === 'INSTALL' && <><h3>✅ 준비 완료</h3><p className="modal-desc">업데이트 설치를 위해 재시작합니다.</p><div className="modal-btn-row"><button className="modal-btn primary" onClick={handleInstall}>지금 재시작</button><button className="modal-btn secondary" onClick={closeModal}>나중에</button></div></>}
          </div>
        </div>
      )}
    </div>
  );
}