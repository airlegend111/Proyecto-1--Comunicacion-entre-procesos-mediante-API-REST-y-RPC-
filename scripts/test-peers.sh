#!/bin/bash
echo "🔍 Probando estado de los peers..."

for port in 3001 3002 3003
do
  echo "Ping a Peer en puerto $port..."
  curl -s http://localhost:$port/health || echo "❌ Peer en $port no responde"
  echo
done
