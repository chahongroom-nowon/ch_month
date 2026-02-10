@echo off
chcp 65001
cls
echo ========================================================
echo  🚀 차홍 마감 프로그램 자동 배포 (안전모드)
echo ========================================================
echo.

set /p ver="📌 버전 입력 (예: 1.3.3): "

echo.
echo [1/3] 변경 사항 저장 중...
call git add .
call git commit -m "버전 %ver% 업데이트"

echo.
echo [2/3] 버전 생성 중...
:: cmd /c를 사용하여 npm이 배치 파일을 종료하지 못하게 막습니다.
cmd /c "npm version %ver%"

echo.
echo [3/3] GitHub로 발사! 🚀
call git push
call git push origin v%ver%

echo.
echo ========================================================
echo  🎉 배포 완료! GitHub Actions를 확인하세요.
echo ========================================================
pause