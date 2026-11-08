# ========================================================================
#  AI Face Recognition Attendance System - Stop All Services
# ========================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host " Stopping all AI Attendance services on ports 8000 and 3000...          " -ForegroundColor Yellow
Write-Host "========================================================================" -ForegroundColor Yellow

$occupiedPorts = @(8000, 3000)
$stopped = 0
foreach ($port in $occupiedPorts) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $procId = $conn.OwningProcess | Select-Object -Unique -First 1
        Write-Host "Closing process PID $procId listening on port $port..." -ForegroundColor Cyan
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        $stopped++
    }
}

if ($stopped -eq 0) {
    Write-Host "No services were actively listening on ports 8000 or 3000." -ForegroundColor Gray
} else {
    Write-Host "All services stopped successfully." -ForegroundColor Green
}

