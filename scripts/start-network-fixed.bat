@echo off
chcp 65001 >nul
echo Iniciando red P2P corregida...

REM Verificar si Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js no esta instalado. Por favor instala Node.js primero.
    pause
    exit /b 1
)

REM Instalar dependencias si node_modules no existe
if not exist "node_modules" (
    echo Instalando dependencias...
    npm install
)

REM Crear directorios compartidos
echo Creando directorios compartidos...
if not exist "shared-files\peer1" mkdir "shared-files\peer1"
if not exist "shared-files\peer2" mkdir "shared-files\peer2"
if not exist "shared-files\peer3" mkdir "shared-files\peer3"
if not exist "logs" mkdir "logs"

REM Crear algunos archivos de prueba basicos
echo Creando archivos de prueba basicos...
echo Hola desde Peer 1! > "shared-files\peer1\sample1.txt"
echo Hola desde Peer 2! > "shared-files\peer2\sample2.txt"
echo Hola desde Peer 3! > "shared-files\peer3\sample3.txt"

echo.
echo Iniciando Servidor de Directorio...
start "Servidor de Directorio" /min cmd /c "node src\microservices\directory-service\index.js config\directory-server.json"

REM Esperar a que el servidor de directorio inicie
echo Esperando que el servidor de directorio inicie...
timeout /t 5 /nobreak >nul

echo.
echo Iniciando Servidores Peer...
start "Servidor Peer 1" /min cmd /c "node src\server\p-servidor.js config\peer1.json"
timeout /t 3 /nobreak >nul
start "Servidor Peer 2" /min cmd /c "node src\server\p-servidor.js config\peer2.json"
timeout /t 3 /nobreak >nul
start "Servidor Peer 3" /min cmd /c "node src\server\p-servidor.js config\peer3.json"

REM Esperar a que los servidores peer inicien
echo Esperando que los peers inicien...
timeout /t 8 /nobreak >nul

echo.
echo Red P2P iniciada exitosamente!
echo.
echo URLs de servicios:
echo   Servidor de Directorio: http://localhost:9000
echo   Servidor Peer 1:       http://localhost:9001
echo   Servidor Peer 2:       http://localhost:9003
echo   Servidor Peer 3:       http://localhost:9005
echo.
echo Endpoints disponibles:
echo   Verificaciones de salud: /health
echo   Ping:                   /ping
echo   Lista de peers:         /peers
echo   Busqueda de archivos:   /search/:filename
echo   Descarga de archivos:   /download/:filename
echo   Subida de archivos:     /upload
echo.
echo Los logs se estan escribiendo en el directorio 'logs'.
echo.
echo Documentacion API (Swagger UI):
echo   Servidor de Directorio: http://localhost:9000/api-docs
echo   Servidor Peer 1:       http://localhost:9001/api-docs
echo   Servidor Peer 2:       http://localhost:9003/api-docs
echo   Servidor Peer 3:       http://localhost:9005/api-docs
echo.

REM Abrir Swagger UI en el navegador
echo Abriendo documentacion API en el navegador...
start http://localhost:9000/api-docs
timeout /t 2 /nobreak >nul
start http://localhost:9001/api-docs
timeout /t 2 /nobreak >nul
start http://localhost:9003/api-docs
timeout /t 2 /nobreak >nul
start http://localhost:9005/api-docs
echo.

echo Presiona cualquier tecla para detener todos los servicios...
pause >nul

echo.
echo Deteniendo todos los servicios...
taskkill /f /im node.exe >nul 2>nul
echo Todos los servicios detenidos.
pause
