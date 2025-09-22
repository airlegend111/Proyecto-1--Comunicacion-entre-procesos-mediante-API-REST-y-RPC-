#!/bin/bash

# Script de Inicio de la Red P2P de Compartir Archivos
echo "🚀 Iniciando red P2P..."

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado. Por favor instala Node.js primero."
    exit 1
fi

# Instalar dependencias si node_modules no existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Crear directorios compartidos
echo "📁 Creando directorios compartidos..."
mkdir -p config/shared-files/peer1
mkdir -p config/shared-files/peer2
mkdir -p config/shared-files/peer3
mkdir -p logs

# Crear algunos archivos de prueba
echo "📄 Creando archivos de prueba..."
echo "¡Hola desde Peer 1!" > config/shared-files/peer1/sample1.txt
echo "¡Hola desde Peer 2!" > config/shared-files/peer2/sample2.txt
echo "¡Hola desde Peer 3!" > config/shared-files/peer3/sample3.txt
echo "Documento compartido" > config/shared-files/peer1/document.txt
echo "Otro documento compartido" > config/shared-files/peer2/document.txt

# Función para iniciar un servicio
start_service() {
    local service_name=$1
    local command=$2
    local config_file=$3
    
    echo "🚀 Iniciando $service_name..."
    if [ -n "$config_file" ]; then
        $command $config_file &
    else
        $command &
    fi
    local pid=$!
    echo "✅ $service_name iniciado con PID: $pid"
    echo $pid
}

# Iniciar servidor de directorio
echo ""
echo "📡 Iniciando Servidor de Directorio..."
DIR_PID=$(start_service "Servidor de Directorio" "node src/microservices/directory-service/index.js")

# Esperar a que el servidor de directorio inicie
echo "⏳ Esperando que el servidor de directorio inicie..."
sleep 3

# Iniciar servidores peer
echo ""
echo "👥 Iniciando Servidores Peer..."
P1_PID=$(start_service "Servidor Peer 1" "node src/server/p-servidor.js" "config/peer1.json")
P2_PID=$(start_service "Servidor Peer 2" "node src/server/p-servidor.js" "config/peer2.json")
P3_PID=$(start_service "Servidor Peer 3" "node src/server/p-servidor.js" "config/peer3.json")

# Esperar a que los servidores peer inicien
echo "⏳ Esperando que los peers inicien..."
sleep 5

echo ""
echo "✅ ¡Red P2P iniciada exitosamente!"
echo ""
echo "URLs de servicios:"
echo "  Servidor de Directorio: http://localhost:4000"
echo "  Servidor Peer 1:       http://localhost:3001"
echo "  Servidor Peer 2:       http://localhost:3002"
echo "  Servidor Peer 3:       http://localhost:3003"
echo ""
echo "Endpoints disponibles:"
echo "  Verificaciones de salud: /health"
echo "  Ping:                   /ping"
echo "  Lista de peers:         /peers"
echo "  Búsqueda de archivos:   /search/:filename"
echo "  Descarga de archivos:   /download/:filename"
echo "  Subida de archivos:     /upload"
echo ""
echo "Los logs se están escribiendo en el directorio 'logs'."
echo ""

# Función para detener todos los servicios
stop_services() {
    echo ""
    echo "🛑 Deteniendo todos los servicios..."
    
    # Detener servidores peer
    if [ -n "$P1_PID" ] && kill -0 $P1_PID 2>/dev/null; then
        echo "🛑 Deteniendo Servidor Peer 1 (PID: $P1_PID)..."
        kill $P1_PID
    fi
    
    if [ -n "$P2_PID" ] && kill -0 $P2_PID 2>/dev/null; then
        echo "🛑 Deteniendo Servidor Peer 2 (PID: $P2_PID)..."
        kill $P2_PID
    fi
    
    if [ -n "$P3_PID" ] && kill -0 $P3_PID 2>/dev/null; then
        echo "🛑 Deteniendo Servidor Peer 3 (PID: $P3_PID)..."
        kill $P3_PID
    fi
    
    # Detener servidor de directorio al final
    if [ -n "$DIR_PID" ] && kill -0 $DIR_PID 2>/dev/null; then
        echo "🛑 Deteniendo Servidor de Directorio (PID: $DIR_PID)..."
        kill $DIR_PID
    fi
    
    echo "✅ Todos los servicios detenidos."
}

# Configurar manejadores de señales
trap stop_services SIGINT SIGTERM

# Esperar entrada del usuario para detener
echo "Presiona Ctrl+C para detener todos los servicios..."
echo ""

# Mantener el script ejecutándose y monitorear servicios
while true; do
    sleep 10
    
    # Verificar si algún servicio se ha detenido
    if ! kill -0 $DIR_PID 2>/dev/null; then
        echo "❌ ¡El servidor de directorio se detuvo inesperadamente!"
        break
    fi
    
    if ! kill -0 $P1_PID 2>/dev/null; then
        echo "❌ ¡El servidor peer 1 se detuvo inesperadamente!"
        break
    fi
    
    if ! kill -0 $P2_PID 2>/dev/null; then
        echo "❌ ¡El servidor peer 2 se detuvo inesperadamente!"
        break
    fi
    
    if ! kill -0 $P3_PID 2>/dev/null; then
        echo "❌ ¡El servidor peer 3 se detuvo inesperadamente!"
        break
    fi
done

# Limpiar
stop_services
