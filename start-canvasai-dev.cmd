@echo off
setlocal

cd /d "C:\Users\Masaya Kitagawa\APP DEV\CanvasAI"
start "CanvasAI Dev Server" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Masaya Kitagawa\APP DEV\CanvasAI'; npm run dev -- --hostname 127.0.0.1 --port 3000"

timeout /t 6 /nobreak >nul
start "" "http://127.0.0.1:3000"
