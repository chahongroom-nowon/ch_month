export default function ReportModule({ closeVerifyPanel, grandTotals, mergedData }) {
    return (
        <div className="right-panel">
            <div className="panel-header">
                <span className="panel-title">📅 일 마감 리포트</span>
                <button className="close-btn" onClick={closeVerifyPanel}>닫기 X</button>
            </div>
            <div className="list-container">
                <div className="summary-card">
                    <div className="sum-item"><div className="sum-label">HAND</div><div className="sum-value blue">{grandTotals.sos.toLocaleString()}</div></div>
                    <div className="divider"></div>
                    <div className="sum-item"><div className="sum-label" style={{color:'#7c3aed'}}>Card</div><div className="sum-value" style={{color:'#7c3aed'}}>{grandTotals.card.toLocaleString()}</div></div>
                    <div className="divider"></div>
                    <div className="sum-item"><div className="sum-label">Naver Pay</div><div className="sum-value green">{grandTotals.naver.toLocaleString()}</div></div>
                    <div className="divider"></div>
                    <div className="sum-item"><div className="sum-label">Gap</div><div className={`sum-value ${(grandTotals.sos - grandTotals.naver) === 0 ? 'green' : 'red'}`}>{(grandTotals.sos - grandTotals.naver).toLocaleString()}</div></div>
                </div>
                {mergedData.length === 0 ? (
                    <div style={{padding:20, textAlign:'center', color:'#999'}}>데이터를 불러오는 중입니다...</div>
                ) : (
                    <div className="grid-layout">
                        {mergedData.map((data, idx) => {
                            const totalDiff = data.totalSos - data.totalNaver;
                            const isTotalMatch = totalDiff === 0;
                            const cardClass = isTotalMatch ? 'staff-card' : 'staff-card error';
                            return (
                                <div key={idx} className={cardClass}>
                                    <div className="card-header">
                                        <div>
                                            <div className="staff-name">💇‍♀️ {data.designer}</div>
                                            <div style={{marginTop:'5px'}}>
                                                {isTotalMatch ? <span className="badge match">일치</span> : <span className="badge mismatch">차액 {totalDiff.toLocaleString()}</span>}
                                            </div>
                                        </div>
                                        <div className="header-amounts">
                                            <div className="amt-row"><span style={{color:'#6b7280'}}>H:</span> {data.totalSos.toLocaleString()}</div>
                                            <div className="amt-row"><span style={{color:'#7c3aed'}}>C:</span> {data.totalCard.toLocaleString()}</div>
                                            <div className="amt-row"><span style={{color:'#059669'}}>N:</span> {data.totalNaver.toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div>
                                        {data.customers.map((c, cIdx) => {
                                            const isMatch = c.diff === 0;
                                            const rowClass = isMatch ? 'customer-row match' : 'customer-row mismatch';
                                            return (
                                                <div key={cIdx} className={rowClass}>
                                                    <div className="row-top"><span>{c.name}</span><span style={{color: isMatch ? '#059669' : '#dc2626'}}>{isMatch ? '일치' : `${c.diff.toLocaleString()}`}</span></div>
                                                    <div className="row-detail"><span>HAND(Pay)</span><span>{c.sos.toLocaleString()}</span></div>
                                                    <div className="row-detail" style={{color:'#7c3aed'}}><span>HAND(Card)</span><span>{c.sosCard.toLocaleString()}</span></div>
                                                    <div className="row-detail nb"><span>{c.naverDetailName || 'Naver'}</span><span>{c.naver.toLocaleString()}</span></div>
                                                </div>
                                            );
                                        })}
                                        {data.customers.length === 0 && <div style={{color:'#999', fontSize:'12px', textAlign:'center', padding:'10px'}}>내역 없음</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}