
echo "🚀 Iniciando red P2P..."

# Levantar servidor de directorio
echo "📡 Iniciando Directory Server..."
node src/microservices/directory-service/index.js --config ./config/directory-server.json &
DIR_PID=$!

# Esperar para que el server inicie antes de peers
sleep 2

# Levantar peers
echo "👤 Iniciando Peer 1..."
node src/server/p-servidor.js --config ./config/peer1.json &
P1_PID=$!

echo "👤 Iniciando Peer 2..."
node src/server/p-servidor.js --config ./config/peer2.json &
P2_PID=$!

echo "👤 Iniciando Peer 3..."
node src/server/p-servidor.js --config ./config/peer3.json &
P3_PID=$!

echo "✅ Red iniciada. Presiona Ctrl+C para detener."
wait $DIR_PID $P1_PID $P2_PID $P3_PID
