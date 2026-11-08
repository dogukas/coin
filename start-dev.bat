@echo off
echo [1/2] Starting Backend (FastAPI :8000)...
start "Crypto Backend" cmd /k "cd backend && venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

echo [2/2] Starting Frontend (Next.js :3000)...
start "Crypto Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both services are starting in separate terminal windows.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8000

