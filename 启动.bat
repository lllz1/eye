@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo 正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo 正在启动「目光所至」...
call npm run dev -- --host 127.0.0.1 --open
pause
