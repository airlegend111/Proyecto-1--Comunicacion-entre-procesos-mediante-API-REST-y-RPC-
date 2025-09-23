@echo off
echo Iniciando peer 1...

rem Matar cualquier proceso node existente
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

rem Establecer variables de entorno
set PEER_CONFIG=./config/peer1.json

rem Iniciar el servidor P2P
start "P2P Server - Peer 1" /min cmd /c "node src/server/p-servidor.js %PEER_CONFIG%"

rem Esperar un momento para que el servidor inicie
timeout /t 3 >nul

rem Iniciar el cliente P2P
start "P2P Client - Peer 1" /min cmd /c "node src/client/p-cliente.js %PEER_CONFIG%"

echo Peer 1 iniciado en:
echo - REST: http://localhost:9001
echo - gRPC: localhost:9002
echo Para detener el peer, cierre esta ventana o presione Ctrl+C