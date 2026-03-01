export default function StaffModule({ staffList, fetchOnlineStaffList, removeStaff, loading }) {
    return (
        <div className="staff-management-area">
            <button onClick={fetchOnlineStaffList} className="sync-btn" disabled={loading}>
                🔄 HAND 직원 명단 불러오기
            </button>
            <div className="staff-list">
                {staffList.length === 0 ? (
                    <div style={{padding:'30px', textAlign:'center', color:'#adb5bd', fontSize:'13px'}}>등록된 직원이 없습니다.</div>
                ) : (
                    staffList.map((staff, i) => (
                        <div key={i} className="staff-item">
                            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                                <span style={{fontWeight:'700', color:'#495057'}}>{staff.name}</span>
                                <span style={{fontSize:'12px', color:'#868e96', background:'#f1f3f5', padding:'2px 6px', borderRadius:'4px'}}>{staff.code}</span>
                            </div>
                            <button onClick={() => removeStaff(i)} className="del-btn">삭제</button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}