@echo off
chcp 65001 >nul
set "PATH=%PATH%;C:\Users\Admin\.mingit\cmd;C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin"

echo ========================================================
echo   HE THONG HO TRO DAY CODE MY COFFEE HOUSE LEN GITHUB
echo ========================================================
echo.

git push -u origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [THONG BAO] Neu ban chua dang nhap GitHub, vui long chay lenh sau de xac thuc:
    echo     gh auth login
    echo Sau do chay lai file nay!
) else (
    echo.
    echo ========================================================
    echo   DA DAY TOAN BO DU AN LEN GITHUB THANH CONG!
    echo ========================================================
)
echo.
pause

