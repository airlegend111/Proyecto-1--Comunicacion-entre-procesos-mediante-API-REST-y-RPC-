@echo off
echo Iniciando el servidor de directorio...

rem Matar cualquier instancia previa del servidor
taskkill /F /IM node.exe >nul 2>&1

rem Esperar un momento para asegurarse de que el puerto se libere
timeout /t 2 >nul

rem Iniciar el servidor
start "Directory Server" /min cmd /c "node src/microservices/directory-service/index.js ./config/directory-server.json"

rem Esperar a que el servidor esté listo
timeout /t 3 >nul

echo Servidor iniciado en http://localhost:9000
echo Para detener el servidor, cierre esta ventana o presione Ctrl+C