Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Starting AI Attendance Tracker - Backend API   " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\backend"
Write-Host "Running Uvicorn on http://127.0.0.1:8000 ..." -ForegroundColor Green
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
