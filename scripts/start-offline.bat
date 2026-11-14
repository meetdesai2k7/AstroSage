@echo off
set ASTROSAGE_HOST=127.0.0.1
set PORT=3000
echo Building ASTROSAGE local production bundle...
call npm run build
echo Starting ASTROSAGE offline server on http://127.0.0.1:3000
call npm start
