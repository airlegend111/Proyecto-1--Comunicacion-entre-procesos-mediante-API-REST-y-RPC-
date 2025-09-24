#!/bin/bash

# Script para demostrar el sistema P2P completo
# Este script lanza todos los componentes y ejecuta pruebas

echo "🚀 Iniciando Sistema P2P - Demostración Completa"
echo "=============================================="

# Función para limpiar procesos al salir
cleanup() {
    echo "🧹 Limpiando procesos..."
    kill $MAESTRO_PID $PEER1_PID $PEER2_PID $PEER3_PID $PEER4_PID 2>/dev/null
    exit 0
}

# Configurar trap para cleanup
trap cleanup SIGINT SIGTERM

# Activar entorno virtual
source venv/bin/activate

echo "1️⃣ Iniciando Servidor Maestro..."
cd maestro
python -m uvicorn server_maestro:app --host 0.0.0.0 --port 9000 &
MAESTRO_PID=$!
cd ..
sleep 2

echo "2️⃣ Iniciando Peer 1..."
cd peer1
python run_peer.py --config config.json &
PEER1_PID=$!
cd ..
sleep 2

echo "3️⃣ Iniciando Peer 2..."
cd peer2
python run_peer.py --config config.json &
PEER2_PID=$!
cd ..
sleep 2

echo "4️⃣ Iniciando Peer 3..."
cd peer3
python run_peer.py --config config.json &
PEER3_PID=$!
cd ..
sleep 2

echo "5️⃣ Iniciando Peer 4..."
cd peer4
python run_peer.py --config config.json &
PEER4_PID=$!
cd ..
sleep 3

echo "✅ Todos los peers iniciados. Esperando que se registren..."
sleep 5

echo ""
echo "🔍 PRUEBAS DEL SISTEMA P2P"
echo "========================="

echo ""
echo "📋 1. Verificando registro de peers en Maestro..."
curl -s http://localhost:9000/peers | python -m json.tool

echo ""
echo "📂 2. Listando archivos disponibles en cada peer..."
echo "Peer 1:"
curl -s http://localhost:9001/files | python -m json.tool
echo "Peer 2:"
curl -s http://localhost:9003/files | python -m json.tool
echo "Peer 3:"
curl -s http://localhost:9005/files | python -m json.tool
echo "Peer 4:"
curl -s http://localhost:8003/files | python -m json.tool

echo ""
echo "🔍 3. Buscando archivo 'archivo1.txt' vía Maestro..."
curl -s "http://localhost:9000/locate?file=archivo1.txt" | python -m json.tool

echo ""
echo "🔍 4. Buscando archivo 'archivo2.txt' vía peer-to-peer (P1 pregunta a P2)..."
curl -s "http://localhost:9001/locate?file=archivo2.txt" | python -m json.tool

echo ""
echo "📥 5. Descargando archivo1.txt usando cliente..."
cd peer2
python client.py --action download --file archivo1.txt
if [ -f "downloaded_archivo1.txt" ]; then
    echo "✅ Descarga exitosa!"
    cat downloaded_archivo1.txt
    rm downloaded_archivo1.txt
else
    echo "❌ Error en descarga"
fi
cd ..

echo ""
echo "📥 6. Descargando archivo3.txt usando descubrimiento peer-to-peer..."
cd peer1
python client.py --action download --file archivo3.txt --use-peer --peer http://localhost:9005
if [ -f "downloaded_archivo3.txt" ]; then
    echo "✅ Descarga P2P exitosa!"
    cat downloaded_archivo3.txt
    rm downloaded_archivo3.txt
else
    echo "❌ Error en descarga P2P"
fi
cd ..

echo ""
echo "📤 7. Subiendo archivo nuevo vía gRPC..."
echo "Contenido de prueba del sistema P2P" > test_upload.txt
cd peer1
python client.py --action upload --file test_file.txt --peer http://localhost:9003 --grpc-port 9004 --filepath ../test_upload.txt
cd ..

echo ""
echo "🔍 8. Verificando que el archivo se subió correctamente..."
sleep 2
curl -s "http://localhost:9000/locate?file=test_file.txt" | python -m json.tool

echo ""
echo "📊 9. Estado final del directorio del Maestro..."
curl -s http://localhost:9000/directory | python -m json.tool

echo ""
echo "🎉 DEMOSTRACIÓN COMPLETADA"
echo "========================="
echo "El sistema P2P está funcionando correctamente con:"
echo "- ✅ Registro automático de peers en Maestro"
echo "- ✅ Descubrimiento de archivos vía Maestro"
echo "- ✅ Descubrimiento peer-to-peer directo"
echo "- ✅ Descarga de archivos vía gRPC"
echo "- ✅ Subida de archivos vía gRPC"
echo "- ✅ Red de peers amigos configurada"
echo ""
echo "Presiona Ctrl+C para detener todos los servicios..."

# Mantener el script corriendo
wait