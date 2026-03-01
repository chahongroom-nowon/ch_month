export default function LoginModule({ isLoggedIn, isNaverLoggedIn, onHandSosLogin, onNaverLogin }) {
    return (
        <div className="section-card">
            <div className="section-title">Step 1. 스마트 로그인</div>
            <div className="btn-row">
                <button className="big-btn" onClick={onHandSosLogin} style={{ background: isLoggedIn ? '#4b5563' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
                    {isLoggedIn ? 'HAND 재조회' : 'HAND 로그인'}
                </button>
                <button className="big-btn" onClick={onNaverLogin} style={{ background: isNaverLoggedIn ? '#16a34a' : 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
                    {isNaverLoggedIn ? 'NPay 재조회' : 'NPay 로그인'}
                </button>
            </div>
        </div>
    );
}