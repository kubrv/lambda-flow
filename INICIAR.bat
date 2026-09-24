@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  Lambda-Flow — somente local (seu PC)
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  Node.js nao encontrado.
  echo  Instale em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo  Falha no npm install.
    pause
    exit /b 1
  )
)

echo  Gerando build...
call npm run build
if errorlevel 1 (
  echo  Falha no build.
  pause
  exit /b 1
)

echo.
echo  Abrindo http://127.0.0.1:8787
echo  Deixe esta janela aberta enquanto usar o sistema.
echo  Ctrl+C para encerrar.
echo.

start "" "http://127.0.0.1:8787"
node server/local.mjs
pause
