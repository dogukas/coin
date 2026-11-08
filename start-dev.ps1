# Start Crypto Signal Engine (Backend & Frontend)
Write-Host "🚀 Starting Backend (FastAPI on :8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

Write-Host "🌐 Starting Frontend (Next.js on :3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "✅ Both servers are launching in separate windows." -ForegroundColor Yellow
Write-Host "   Backend: http://localhost:8000"
Write-Host "   Frontend: http://localhost:3000"

