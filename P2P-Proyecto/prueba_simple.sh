#!/bin/bash

# Script de prueba simple - iniciar componentes en secuencia
echo "🚀 Iniciando Sistema P2P - Prueba Simple"

# Activar entorno virtual
source venv/bin/activate

echo "1️⃣ Iniciando Maestro..."
cd maestro
python -m uvicorn server_maestro:app --host 0.0.0.0 --port 9000 &
MAESTRO_PID=$!
cd ..
sleep 3

echo "2️⃣ Iniciando Peer 1..."
cd peer1
python run_peer.py --config config.json &
PEER1_PID=$!
cd ..
sleep 3

echo "3️⃣ Verificando estado..."
echo "Maestro (peers registrados):"
curl -s http://localhost:9000/peers | python -m json.tool

echo ""
echo "Peer 1 (archivos):"
curl -s http://localhost:8000/files | python -m json.tool

echo ""
echo "✅ Sistema básico funcionando. Presiona Enter para continuar con más peers..."
read

echo "4️⃣ Iniciando Peer 2..."
cd peer2
python run_peer.py --config config.json &
PEER2_PID=$!
cd ..
sleep 3

echo "5️⃣ Estado actualizado:"
curl -s http://localhost:9000/peers | python -m json.tool

echo ""
echo "6️⃣ Probando descarga peer-to-peer..."
cd peer2
python client.py --action download --file archivo1.txt
ls -la downloaded_* 2>/dev/null || echo "No hay archivos descargados"
cd ..

echo ""
echo "🎉 Prueba completada. Presiona Ctrl+C para detener todo."

# Función de limpieza
cleanup() {
    echo "🧹 Deteniendo servicios..."
    kill $MAESTRO_PID $PEER1_PID $PEER2_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM
wait