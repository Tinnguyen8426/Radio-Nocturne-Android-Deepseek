@echo off
REM Script to generate and setup keystore for GitHub Actions (Windows)

setlocal enabledelayedexpansion

echo.
echo ======================================
echo Radio Nocturne - Keystore Setup
echo ======================================
echo.

REM Check if keytool is available
where keytool >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: keytool not found. Please install Java SDK.
    echo Download from: https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

REM Input variables
set "KEYSTORE_NAME=radio-nocturne.jks"
set /p KEYSTORE_NAME="Enter keystore filename (default: radio-nocturne.jks): "

:password_input
set /p KEYSTORE_PASS="Enter keystore password: "
set /p KEYSTORE_PASS_CONFIRM="Confirm keystore password: "

if not "!KEYSTORE_PASS!"=="!KEYSTORE_PASS_CONFIRM!" (
    echo Error: Passwords don't match!
    goto password_input
)

set "KEY_ALIAS=radio-nocturne"
set /p KEY_ALIAS="Enter key alias (default: radio-nocturne): "

set /p KEY_PASS="Enter key password (usually same as keystore password): "

set /p FIRST_LAST_NAME="Enter your first and last name: "
set /p ORG_UNIT="Enter your organization unit (optional): "
set /p ORG_NAME="Enter your organization name (optional): "
set /p CITY="Enter your city/locality: "
set /p STATE="Enter your state/province: "
set /p COUNTRY="Enter your country code (2 letters, e.g., VN): "

REM Generate keystore
echo.
echo Generating keystore file...
keytool -genkey -v ^
    -keystore "%KEYSTORE_NAME%" ^
    -keyalg RSA ^
    -keysize 2048 ^
    -validity 10000 ^
    -alias "%KEY_ALIAS%" ^
    -storepass "%KEYSTORE_PASS%" ^
    -keypass "%KEY_PASS%" ^
    -dname "CN=%FIRST_LAST_NAME%, OU=%ORG_UNIT%, O=%ORG_NAME%, L=%CITY%, ST=%STATE%, C=%COUNTRY%"

if %ERRORLEVEL% NEQ 0 (
    echo Error generating keystore!
    pause
    exit /b 1
)

echo.
echo Keystore file created: %KEYSTORE_NAME%
echo.

REM Display keystore info
echo Keystore Information:
echo =====================
keytool -list -v -keystore "%KEYSTORE_NAME%" -storepass "%KEYSTORE_PASS%"

REM Encode to base64
echo.
echo Encoding keystore to base64...
certutil -encode "%KEYSTORE_NAME%" "%KEYSTORE_NAME%.b64"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Base64 file created: %KEYSTORE_NAME%.b64
    echo.
    echo IMPORTANT: Remove the first and last lines from %KEYSTORE_NAME%.b64
    echo before using as KEYSTORE_FILE secret on GitHub!
)

REM Create properties file
echo.
echo Creating keystore.properties file...
(
    echo storeFile=%KEYSTORE_NAME%
    echo storePassword=%KEYSTORE_PASS%
    echo keyAlias=%KEY_ALIAS%
    echo keyPassword=%KEY_PASS%
) > keystore.properties

echo.
echo keystore.properties created
echo.

REM Summary
echo.
echo ======================================
echo Setup Summary
echo ======================================
echo Keystore file: %KEYSTORE_NAME%
echo Key Alias: %KEY_ALIAS%
echo.
echo GitHub Secrets to add:
echo 1. KEYSTORE_FILE = [Content of %KEYSTORE_NAME%.b64 with first and last lines removed]
echo 2. KEYSTORE_PASSWORD = %KEYSTORE_PASS%
echo 3. KEY_ALIAS = %KEY_ALIAS%
echo 4. KEY_PASSWORD = %KEY_PASS%
echo.
echo Warning: Next steps:
echo 1. Move keystore files to android/keystore/ directory:
echo    mkdir android\keystore
echo    move "%KEYSTORE_NAME%" android\keystore\
echo    move keystore.properties android\keystore\
echo.
echo 2. Add to .gitignore:
echo    android/keystore/*.jks
echo    android/keystore/*.jks.b64
echo    android/keystore/keystore.properties
echo.
echo 3. Go to GitHub ^> Settings ^> Secrets and variables ^> Actions
echo 4. Create new secrets with the values above
echo.
echo Done!
echo.
pause
