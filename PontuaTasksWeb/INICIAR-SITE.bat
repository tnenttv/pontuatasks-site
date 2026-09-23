@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Pontua Tasks - servidor local" /D "%~dp0" cmd /k py -m http.server 8000
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python nao foi encontrado neste computador.
    echo Instale Python e marque a opcao para adicionar Python ao PATH.
    pause
    exit /b 1
  )
  start "Pontua Tasks - servidor local" /D "%~dp0" cmd /k python -m http.server 8000
)
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000"
