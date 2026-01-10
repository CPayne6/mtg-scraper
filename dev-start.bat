@echo off
REM Development environment startup script for Windows

echo Starting ScoutLGS Development Environment...
echo.

REM Check if .env files exist
set "missing_env=0"

if not exist "apps\api\.env" (
    echo Warning: apps\api\.env not found
    if exist "apps\api\.env.example" (
        echo    Creating from apps\api\.env.example...
        copy "apps\api\.env.example" "apps\api\.env" >nul
        echo    Created apps\api\.env - please review and update values
    ) else (
        echo    No example file found. Please create apps\api\.env
        set "missing_env=1"
    )
) else (
    echo apps\api\.env exists
)

if not exist "apps\ui\.env" (
    echo Warning: apps\ui\.env not found
    if exist "apps\ui\.env.example" (
        echo    Creating from apps\ui\.env.example...
        copy "apps\ui\.env.example" "apps\ui\.env" >nul
        echo    Created apps\ui\.env - please review and update values
    ) else (
        echo    No example file found. Please create apps\ui\.env
        set "missing_env=1"
    )
) else (
    echo apps\ui\.env exists
)

if not exist "apps\scraper\.env" (
    echo Warning: apps\scraper\.env not found
    if exist "apps\scraper\.env.example" (
        echo    Creating from apps\scraper\.env.example...
        copy "apps\scraper\.env.example" "apps\scraper\.env" >nul
        echo    Created apps\scraper\.env - please review and update values
    ) else (
        echo    No example file found. Please create apps\scraper\.env
        set "missing_env=1"
    )
) else (
    echo apps\scraper\.env exists
)

if not exist "apps\scheduler\.env" (
    echo Warning: apps\scheduler\.env not found
    if exist "apps\scheduler\.env.example" (
        echo    Creating from apps\scheduler\.env.example...
        copy "apps\scheduler\.env.example" "apps\scheduler\.env" >nul
        echo    Created apps\scheduler\.env - please review and update values
    ) else (
        echo    No example file found. Please create apps\scheduler\.env
        set "missing_env=1"
    )
) else (
    echo apps\scheduler\.env exists
)

echo.

REM Check if Docker is running
echo Checking if Docker is running...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)
echo Docker is running
echo.

REM Start docker-compose
echo Starting Docker containers with hot reload...
echo This may take a few minutes on first run...
echo.

docker-compose -f docker-compose.dev.yml up --build

echo.
echo Development environment stopped
pause
