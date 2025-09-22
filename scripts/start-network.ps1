# Script de Inicio de la Red P2P de Compartir Archivos para Windows
Write-Host "🚀 Iniciando red P2P..." -ForegroundColor Green

# Verificar si Node.js está instalado
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Node.js no está instalado. Por favor instala Node.js primero." -ForegroundColor Red
    exit 1
}

# Instalar dependencias si node_modules no existe
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

# Crear directorios compartidos
Write-Host "📁 Creando directorios compartidos..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "config/shared-files/peer1" -Force | Out-Null
New-Item -ItemType Directory -Path "config/shared-files/peer2" -Force | Out-Null
New-Item -ItemType Directory -Path "config/shared-files/peer3" -Force | Out-Null
New-Item -ItemType Directory -Path "logs" -Force | Out-Null

# Crear algunos archivos de prueba
Write-Host "📄 Creando archivos de prueba..." -ForegroundColor Cyan
"¡Hola desde Peer 1!" | Out-File -FilePath "config/shared-files/peer1/sample1.txt" -Encoding UTF8
"¡Hola desde Peer 2!" | Out-File -FilePath "config/shared-files/peer2/sample2.txt" -Encoding UTF8
"¡Hola desde Peer 3!" | Out-File -FilePath "config/shared-files/peer3/sample3.txt" -Encoding UTF8
"Documento compartido" | Out-File -FilePath "config/shared-files/peer1/document.txt" -Encoding UTF8
"Otro documento compartido" | Out-File -FilePath "config/shared-files/peer2/document.txt" -Encoding UTF8

# Variables para almacenar los procesos
$processes = @{}

# Función para iniciar un servicio
function Start-Service {
    param(
        [string]$ServiceName,
        [string]$Command,
        [string]$ConfigFile = $null
    )
    
    Write-Host "🚀 Iniciando $ServiceName..." -ForegroundColor Yellow
    
    if ($ConfigFile) {
        $process = Start-Process -FilePath "node" -ArgumentList $Command, $ConfigFile -PassThru -WindowStyle Hidden
    } else {
        $process = Start-Process -FilePath "node" -ArgumentList $Command -PassThru -WindowStyle Hidden
    }
    
    Write-Host "✅ $ServiceName iniciado con PID: $($process.Id)" -ForegroundColor Green
    return $process
}

# Iniciar servidor de directorio
Write-Host ""
Write-Host "📡 Iniciando Servidor de Directorio..." -ForegroundColor Cyan
$processes.Directory = Start-Service "Servidor de Directorio" "src/microservices/directory-service/index.js"

# Esperar a que el servidor de directorio inicie
Write-Host "⏳ Esperando que el servidor de directorio inicie..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Iniciar servidores peer
Write-Host ""
Write-Host "👥 Iniciando Servidores Peer..." -ForegroundColor Cyan
$processes.Peer1 = Start-Service "Servidor Peer 1" "src/server/p-servidor.js" "config/peer1.json"
$processes.Peer2 = Start-Service "Servidor Peer 2" "src/server/p-servidor.js" "config/peer2.json"
$processes.Peer3 = Start-Service "Servidor Peer 3" "src/server/p-servidor.js" "config/peer3.json"

# Esperar a que los servidores peer inicien
Write-Host "⏳ Esperando que los peers inicien..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "✅ ¡Red P2P iniciada exitosamente!" -ForegroundColor Green
Write-Host ""
Write-Host "URLs de servicios:" -ForegroundColor Cyan
Write-Host "  Servidor de Directorio: http://localhost:4000" -ForegroundColor White
Write-Host "  Servidor Peer 1:       http://localhost:3001" -ForegroundColor White
Write-Host "  Servidor Peer 2:       http://localhost:3002" -ForegroundColor White
Write-Host "  Servidor Peer 3:       http://localhost:3003" -ForegroundColor White
Write-Host ""
Write-Host "Endpoints disponibles:" -ForegroundColor Cyan
Write-Host "  Verificaciones de salud: /health" -ForegroundColor White
Write-Host "  Ping:                   /ping" -ForegroundColor White
Write-Host "  Lista de peers:         /peers" -ForegroundColor White
Write-Host "  Búsqueda de archivos:   /search/:filename" -ForegroundColor White
Write-Host "  Descarga de archivos:   /download/:filename" -ForegroundColor White
Write-Host "  Subida de archivos:     /upload" -ForegroundColor White
Write-Host ""
Write-Host "Los logs se están escribiendo en el directorio 'logs'." -ForegroundColor Yellow
Write-Host ""

# Función para detener todos los servicios
function Stop-AllServices {
    Write-Host ""
    Write-Host "🛑 Deteniendo todos los servicios..." -ForegroundColor Red
    
    foreach ($service in $processes.Keys) {
        if ($processes[$service] -and !$processes[$service].HasExited) {
            Write-Host "🛑 Deteniendo $service (PID: $($processes[$service].Id))..." -ForegroundColor Yellow
            $processes[$service].Kill()
        }
    }
    
    Write-Host "✅ Todos los servicios detenidos." -ForegroundColor Green
}

# Configurar manejador para Ctrl+C
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Stop-AllServices
}

# Esperar entrada del usuario para detener
Write-Host "Presiona Ctrl+C para detener todos los servicios..." -ForegroundColor Yellow
Write-Host ""

# Mantener el script ejecutándose y monitorear servicios
try {
    while ($true) {
        Start-Sleep -Seconds 10
        
        # Verificar si algún servicio se ha detenido
        foreach ($service in $processes.Keys) {
            if ($processes[$service] -and $processes[$service].HasExited) {
                Write-Host "❌ ¡El $service se detuvo inesperadamente!" -ForegroundColor Red
                Stop-AllServices
                exit 1
            }
        }
    }
} catch {
    Stop-AllServices
}
