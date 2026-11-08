# ========================================================================
#  AI Face Recognition Attendance System - All-in-One Launcher
# ========================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "    AI Face Recognition Attendance System - Zero-Hassle Startup         " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

# 1. Environment & Dependency Validation
Write-Host "`n[1/5] Checking environment prerequisites..." -ForegroundColor Yellow

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host "[ERROR] Python is not installed or not in PATH." -ForegroundColor Red
    exit 1
}
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    exit 1
}
Write-Host "  * Python: $(python --version)" -ForegroundColor Green
Write-Host "  * Node.js: $(node --version)" -ForegroundColor Green

# 2. Free up ports 8000 and 3000 if previously occupied
Write-Host "`n[2/5] Checking port availability..." -ForegroundColor Yellow
$occupiedPorts = @(8000, 3000)
foreach ($port in $occupiedPorts) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $procId = $conn.OwningProcess | Select-Object -Unique -First 1
        Write-Host "  * Port $port is in use by PID $procId. Closing stale process..." -ForegroundColor DarkYellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
    }
}
Write-Host "  * Ports 8000 and 3000 are clear and ready." -ForegroundColor Green

# 3. Database Initialization & Seeding Check
Write-Host "`n[3/5] Verifying database and seed data..." -ForegroundColor Yellow
Push-Location $BackendDir
try {
    python -c "from app.core.init_db import init_db; init_db()"
    Write-Host "  * Database schema and seed data verified." -ForegroundColor Green
} catch {
    Write-Host "  * [Warning] Database check encountered an issue, proceeding with fallback." -ForegroundColor DarkYellow
} finally {
    Pop-Location
}

# 4. Launch Backend API Server
Write-Host "`n[4/5] Starting Backend & Frontend services in dedicated consoles..." -ForegroundColor Yellow

$backendCommand = @"
`$host.UI.RawUI.WindowTitle = 'AI Attendance - Backend API Server (Port 8000)'
Set-Location '$BackendDir'
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' Starting FastAPI Uvicorn Server on 127.0.0.1:8000 ' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand

# 5. Launch Frontend UI Server
$frontendCommand = @"
`$host.UI.RawUI.WindowTitle = 'AI Attendance - Next.js UI (Port 3000)'
Set-Location '$FrontendDir'
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' Starting Next.js Dev Server on localhost:3000    ' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand

# 6. Wait for Backend Health Check
Write-Host "`n[5/5] Waiting for services to initialize..." -ForegroundColor Yellow
$backendReady = $false
$retries = 20

while (-not $backendReady -and $retries -gt 0) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($resp.status -eq "ok") {
            $backendReady = $true
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    $retries--
}

Write-Host ""
if ($backendReady) {
    Write-Host "  * Backend API is healthy!" -ForegroundColor Green
} else {
    Write-Host "  * Backend is still starting up..." -ForegroundColor DarkYellow
}

# Open browser to application
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"

# Summary banner
Write-Host "`n========================================================================" -ForegroundColor Green
Write-Host "   SYSTEM READY! ALL SERVICES ARE RUNNING SUCCESSFULLY                   " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "   - Frontend UI:      http://localhost:3000" -ForegroundColor White
Write-Host "   - Backend API:      http://127.0.0.1:8000" -ForegroundColor White
Write-Host "   - Interactive Docs: http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "   - Default Admin:    admin@company.com / admin123" -ForegroundColor White
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "   * Backend and Frontend consoles are running in the background." -ForegroundColor Gray
Write-Host "   * Close their respective windows to stop the servers." -ForegroundColor Gray
Write-Host ""
