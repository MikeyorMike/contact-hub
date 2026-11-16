@echo off
chcp 65001 >nul
echo 正在抓取演示截图...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0capture-screenshots.ps1" %*
echo.
pause
