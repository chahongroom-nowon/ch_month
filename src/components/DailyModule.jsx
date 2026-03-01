export default function DailyModule({ dates, handleDateChange, setQuickDate, onDownload, loading, hasData, showVerify, handleReopenReport }) {
    return (
        <div className="date-control">
            <div className="date-btn-group">
                <button className="sub-btn" onClick={() => setQuickDate('yesterday')}>⏮ 어제</button>
                <button className="sub-btn" onClick={() => setQuickDate('today')}>오늘</button>
            </div>
            <input type="date" value={dates.start} onChange={handleDateChange} className="main-date-input" />
            
            {hasData && !showVerify ? (
                <div className="info-box clickable" onClick={handleReopenReport}>
                    <div className="info-icon">📊</div>
                    <div className="info-text"><strong>리포트 다시 열기</strong><br/>이미 조회된 데이터를 다시 확인합니다.</div>
                </div>
            ) : (!showVerify && (
                <div className="info-box">
                    <div className="info-icon">👉</div>
                    <div className="info-text">로그인하면 <strong>일 마감 리포트</strong>가<br/>자동으로 실행됩니다.</div>
                </div>
            ))}
            
            <button className="big-btn" onClick={onDownload} disabled={loading} style={{ marginTop: '15px', background: '#4b5563' }}>
                엑셀 다운로드
            </button>
        </div>
    );
}