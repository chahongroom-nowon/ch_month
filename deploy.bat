@echo off
chcp 65001
cls
echo ========================================================
echo  🚀 차홍 마감 프로그램 자동 배포 시스템
echo ========================================================
echo.

:: 1. 버전 입력 받기
set /p ver="📌 업데이트할 버전 번호를 입력하세요 (예: 1.3.1): "

echo.
echo 💾 1. 변경된 코드를 먼저 저장(Commit)합니다...
call git add .
call git commit -m "버전 %ver% 업데이트 준비"

echo.
echo 🏷️ 2. package.json 버전을 %ver%로 변경하고 태그를 만듭니다...
call npm version %ver%

if %errorlevel% neq 0 (
    echo.
    echo ❌ 오류 발생! 이미 존재하는 버전이거나, git 상태가 꼬였습니다.
    echo    (같은 버전을 두 번 입력했는지 확인해보세요)
    pause
    exit /b
)

echo.
echo ☁️ 3. GitHub로 코드를 업로드합니다...
call git push
call git push origin v%ver%

echo.
echo ========================================================
echo  🎉 배포 성공! [v%ver%]
echo     잠시 후 GitHub Actions가 빌드를 시작합니다.
echo ========================================================
pause