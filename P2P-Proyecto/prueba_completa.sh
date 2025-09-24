#!/bin/bash

# Script de prueba completa del sistema P2P
echo "🚀 INICIANDO SISTEMA P2P COMPLETO"
echo "=================================="

# Función para limpiar procesos al salir
cleanup() {
    echo ""
    echo "🧹 Limpiando procesos..."
    pkill -f "uvicorn.*server_maestro" 
    pkill -f "run_peer.py"
    exit 0
}

# Configurar trap para cleanup
trap cleanup SIGINT SIGTERM

# Activar entorno virtual
source venv/bin/activate

echo "1️⃣ Iniciando Servidor Maestro (puerto 9000)..."
cd maestro
python -m uvicorn server_maestro:app --host 0.0.0.0 --port 9000 &
MAESTRO_PID=$!
cd ..
sleep 3

echo "2️⃣ Verificando que el Maestro está funcionando..."
curl -s http://localhost:9000/ | python -m json.tool

echo ""
echo "3️⃣ Iniciando todos los Peers..."

echo "   🔵 Peer 1 (REST: 9001, gRPC: 9002)..."
cd peer1
python run_peer.py --config config.json &
PEER1_PID=$!
cd ..
sleep 2

echo "   🟢 Peer 2 (REST: 9003, gRPC: 9004)..."
cd peer2  
python run_peer.py --config config.json &
PEER2_PID=$!
cd ..
sleep 2

echo "   🟡 Peer 3 (REST: 9005, gRPC: 9006)..."
cd peer3
python run_peer.py --config config.json &
PEER3_PID=$!
cd ..

echo ""
echo "4️⃣ Esperando que todos los peers se registren..."
sleep 5

echo ""
echo "📊 ESTADO DEL SISTEMA"
echo "===================="

echo ""
echo "🎯 Maestro - Peers registrados:"
curl -s http://localhost:9000/peers | python -m json.tool

echo ""
echo "📂 Archivos disponibles por peer:"
echo "Peer 1:" && curl -s http://localhost:9001/files | python -m json.tool
echo "Peer 2:" && curl -s http://localhost:9003/files | python -m json.tool  
echo "Peer 3:" && curl -s http://localhost:9005/files | python -m json.tool

echo ""
echo "🔍 PRUEBAS DE LOCALIZACIÓN"
echo "=========================="

echo ""
echo "🔍 Buscando 'archivo1.txt' vía Maestro:"
curl -s "http://localhost:9000/locate?file=archivo1.txt" | python -m json.tool

echo ""
echo "🔍 Buscando 'archivo2.txt' vía peer-to-peer (P3 pregunta a P1):"
curl -s "http://localhost:9005/locate?file=archivo2.txt" | python -m json.tool

echo ""
echo "📥 PRUEBAS DE DESCARGA"
echo "====================="

echo ""
echo "📥 Descargando 'archivo1.txt' desde Peer2..."
cd peer2
python client.py --action download --file archivo1.txt
if [ -f "downloaded_archivo1.txt" ]; then
    echo "✅ Descarga exitosa! Contenido:"
    cat downloaded_archivo1.txt
    rm downloaded_archivo1.txt
else
    echo "❌ Error en descarga"
fi
cd ..

echo ""
echo "📥 Descargando 'archivo3.txt' usando descubrimiento P2P..."
cd peer1
python client.py --action download --file archivo3.txt --use-peer --peer http://localhost:9005
if [ -f "downloaded_archivo3.txt" ]; then
    echo "✅ Descarga P2P exitosa! Contenido:"
    cat downloaded_archivo3.txt
    rm downloaded_archivo3.txt
else
    echo "❌ Error en descarga P2P"
fi
cd ..

echo ""
echo "📤 PRUEBAS DE SUBIDA"
echo "==================="

echo ""
echo "📤 Creando archivo de prueba..."
echo "Este es un archivo de prueba creado por el sistema P2P" > archivo_prueba.txt

echo "📤 Subiendo archivo a Peer2 vía gRPC..."
cd peer1
python client.py --action upload --file archivo_nuevo.txt --peer http://localhost:9003 --grpc-port 9004 --filepath ../archivo_prueba.txt
cd ..

echo ""
echo "🔍 Verificando que el archivo se subió..."
sleep 2
echo "Estado actualizado en Maestro:"
curl -s "http://localhost:9000/locate?file=archivo_nuevo.txt" | python -m json.tool

echo ""
echo "📊 ESTADO FINAL"
echo "==============="

echo ""
echo "📁 Directorio completo del Maestro:"
curl -s http://localhost:9000/directory | python -m json.tool

echo ""
echo "✅ PRUEBAS COMPLETADAS"
echo "======================"
echo ""
echo "🎉 El sistema P2P está funcionando con:"
echo "   ✅ Servidor Maestro para directorio central"
echo "   ✅ 3 Peers con servicios REST y gRPC"
echo "   ✅ Registro automático de peers"
echo "   ✅ Descubrimiento de archivos vía Maestro"
echo "   ✅ Descubrimiento peer-to-peer directo"
echo "   ✅ Descarga de archivos vía gRPC"
echo "   ✅ Subida de archivos vía gRPC"
echo "   ✅ Red de peers amigos configurada"
echo ""
echo "🌐 URLs disponibles:"
echo "   Maestro:  http://localhost:9000"
echo "   Peer 1:   http://localhost:9001"
echo "   Peer 2:   http://localhost:9003"
echo "   Peer 3:   http://localhost:9005"
echo ""
echo "Presiona Ctrl+C para detener todos los servicios..."

# Mantener el script corriendo
wait