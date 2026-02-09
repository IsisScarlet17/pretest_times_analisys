@echo off
REM ============================================================
REM update_mdaas_cache.bat - Windows Task Scheduler Script
REM ============================================================
REM 
REM Script to update MDaaS metrics cache periodically
REM 
REM Setup Instructions:
REM 1. Open Task Scheduler (taskschd.msc)
REM 2. Create Basic Task
REM 3. Name: "Update MDaaS Cache"
REM 4. Trigger: Daily, repeat every 30 minutes
REM 5. Action: Start a program
REM 6. Program: C:\xampp\php\php.exe
REM 7. Arguments: C:\xampp\htdocs\pretest_times_analisys\php\calculate_mdaas_cache.php
REM 8. Or simply run this batch file
REM 
REM ============================================================

echo Updating MDaaS Metrics Cache...
echo.

C:\xampp\php\php.exe C:\xampp\htdocs\pretest_times_analisys\php\calculate_mdaas_cache.php

echo.
echo Done! Cache updated at %date% %time%
echo.

REM Uncomment to keep window open
REM pause
