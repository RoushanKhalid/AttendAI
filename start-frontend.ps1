Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Starting AI Attendance Tracker - Next.js UI   " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\frontend"
Write-Host "Running Next.js Dev Server on http://localhost:3000 ..." -ForegroundColor Green
npm run dev
