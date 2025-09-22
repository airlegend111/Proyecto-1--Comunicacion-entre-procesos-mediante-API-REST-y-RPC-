@echo off
echo 🚀 Iniciando red P2P en Windows...

:: Verificar si Node.js está instalado
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ ERROR: Node.js no está instalado o no está en el PATH.
    pause
    exit /b 1
)

:: Crear carpetas compartidas si no existen
if not exist shared-files\peer1 mkdir shared-files\peer1
if not exist shared-files\peer2 mkdir shared-files\peer2
if not exist shared-files\peer3 mkdir shared-files\peer3
if not exist logs mkdir logs

:: Crear algunos archivos de prueba si no existen
if not exist shared-files\peer1\sample1.txt echo Hello from Peer 1! > shared-files\peer1\sample1.txt
if not exist shared-files\peer2\sample2.txt echo Hello from Peer 2! > shared-files\peer2\sample2.txt
if not exist shared-files\peer3\sample3.txt echo Hello from Peer 3! > shared-files\peer3\sample3.txt

echo.
echo 📡 Iniciando Directory Server...
start "Directory Server" cmd /k node src\microservices\directory-service\index.js --config config\directory-server.json

echo ⏳ Esperando 3 segundos...
timeout /t 3 > nul

echo.
echo 👥 Iniciando Peer 1...
start "Peer 1" cmd /k node src\server\p-servidor.js --config config\peer1.json

echo 👥 Iniciando Peer 2...
start "Peer 2" cmd /k node src\server\p-servidor.js --config config\peer2.json

echo 👥 Iniciando Peer 3...
start "Peer 3" cmd /k node src\server\p-servidor.js --config config\peer3.json

echo.
echo ✅ Red P2P iniciada exitosamente!
echo --------------------------------
echo Directory Server: http://localhost:4000/health
echo Peer 1:          http://localhost:3001/health
echo Peer 2:          http://localhost:3002/health
echo Peer 3:          http://localhost:3003/health
echo.
pause
