
#!/bin/bash

# P2P File Sharing Network Startup Script
echo "🚀 Iniciando red P2P..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado. Por favor instala Node.js primero."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Create shared directories
echo "📁 Creando directorios compartidos..."
mkdir -p config/shared-files/peer1
mkdir -p config/shared-files/peer2
mkdir -p config/shared-files/peer3
mkdir -p logs

# Create some sample files for testing
echo "📄 Creando archivos de prueba..."
echo "Hello from Peer 1!" > config/shared-files/peer1/sample1.txt
echo "Hello from Peer 2!" > config/shared-files/peer2/sample2.txt
echo "Hello from Peer 3!" > config/shared-files/peer3/sample3.txt
echo "Shared document" > config/shared-files/peer1/document.txt
echo "Another shared document" > config/shared-files/peer2/document.txt

# Function to start a service
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

# Start directory server
echo ""
echo "📡 Iniciando Directory Server..."
DIR_PID=$(start_service "Directory Server" "node src/microservices/directory-service/index.js")

# Wait for directory server to start
echo "⏳ Esperando que el servidor de directorio inicie..."
sleep 3

# Start peer servers
echo ""
echo "👥 Iniciando Peer Servers..."
P1_PID=$(start_service "Peer 1 Server" "node src/server/p-servidor.js" "config/peer1.json")
P2_PID=$(start_service "Peer 2 Server" "node src/server/p-servidor.js" "config/peer2.json")
P3_PID=$(start_service "Peer 3 Server" "node src/server/p-servidor.js" "config/peer3.json")

# Wait for peer servers to start
echo "⏳ Esperando que los peers inicien..."
sleep 5

echo ""
echo "✅ Red P2P iniciada exitosamente!"
echo ""
echo "URLs de servicios:"
echo "  Directory Server: http://localhost:4000"
echo "  Peer 1 Server:    http://localhost:3001"
echo "  Peer 2 Server:    http://localhost:3002"
echo "  Peer 3 Server:    http://localhost:3003"
echo ""
echo "Endpoints disponibles:"
echo "  Health checks:    /health"
echo "  Ping:            /ping"
echo "  Peer list:       /peers"
echo "  File search:     /search/:filename"
echo "  File download:   /download/:filename"
echo "  File upload:     /upload"
echo ""
echo "Los logs se están escribiendo en el directorio 'logs'."
echo ""

# Function to stop all services
stop_services() {
    echo ""
    echo "🛑 Deteniendo todos los servicios..."
    
    # Stop peer servers
    if [ -n "$P1_PID" ] && kill -0 $P1_PID 2>/dev/null; then
        echo "🛑 Deteniendo Peer 1 Server (PID: $P1_PID)..."
        kill $P1_PID
    fi
    
    if [ -n "$P2_PID" ] && kill -0 $P2_PID 2>/dev/null; then
        echo "🛑 Deteniendo Peer 2 Server (PID: $P2_PID)..."
        kill $P2_PID
    fi
    
    if [ -n "$P3_PID" ] && kill -0 $P3_PID 2>/dev/null; then
        echo "🛑 Deteniendo Peer 3 Server (PID: $P3_PID)..."
        kill $P3_PID
    fi
    
    # Stop directory server last
    if [ -n "$DIR_PID" ] && kill -0 $DIR_PID 2>/dev/null; then
        echo "🛑 Deteniendo Directory Server (PID: $DIR_PID)..."
        kill $DIR_PID
    fi
    
    echo "✅ Todos los servicios detenidos."
}

# Set up signal handlers
trap stop_services SIGINT SIGTERM

# Wait for user input to stop
echo "Presiona Ctrl+C para detener todos los servicios..."
echo ""

# Keep the script running and monitor services
while true; do
    sleep 10
    
    # Check if any service has stopped
    if ! kill -0 $DIR_PID 2>/dev/null; then
        echo "❌ Directory server se detuvo inesperadamente!"
        break
    fi
    
    if ! kill -0 $P1_PID 2>/dev/null; then
        echo "❌ Peer 1 server se detuvo inesperadamente!"
        break
    fi
    
    if ! kill -0 $P2_PID 2>/dev/null; then
        echo "❌ Peer 2 server se detuvo inesperadamente!"
        break
    fi
    
    if ! kill -0 $P3_PID 2>/dev/null; then
        echo "❌ Peer 3 server se detuvo inesperadamente!"
        break
    fi
done

# Clean up
stop_services
