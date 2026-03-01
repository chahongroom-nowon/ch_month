export default function MonthlyModule({ dates, handleDateChange, onDownload, loading }) {
    return (
        <div className="date-control">
            <div className="date-btn-group">
                <button className="sub-btn" onClick={() => handleDateChange({ target: { value: dates.start }})}>⏮ 어제</button>
                <button className="sub-btn" onClick={() => handleDateChange({ target: { value: dates.start }})}>오늘</button>
            </div>
            <input type="date" value={dates.start} onChange={handleDateChange} className="main-date-input" />
            <button className="big-btn" onClick={onDownload} disabled={loading} style={{ marginTop: '15px', background: '#4b5563' }}>
                엑셀 다운로드
            </button>
        </div>
    );
}