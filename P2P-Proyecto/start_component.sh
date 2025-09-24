#!/bin/bash

# Script para iniciar componentes individuales del sistema P2P
# Uso: ./start_component.sh [maestro|peer1|peer2|peer3|peer4]

COMPONENT=$1

if [ -z "$COMPONENT" ]; then
    echo "Uso: ./start_component.sh [maestro|peer1|peer2|peer3]"
    echo ""
    echo "Ejemplos:"
    echo "  ./start_component.sh maestro    # Inicia solo el Maestro"
    echo "  ./start_component.sh peer1      # Inicia solo el Peer 1"
    echo ""
    echo "Para iniciar todo el sistema automáticamente:"
    echo "  ./prueba_completa.sh"
    exit 1
fi

# Activar entorno virtual
source venv/bin/activate

case $COMPONENT in
    "maestro")
        echo "🎯 Iniciando Servidor Maestro en puerto 9000..."
        cd maestro
        python -m uvicorn server_maestro:app --host 0.0.0.0 --port 9000 --reload
        ;;
    "peer1")
        echo "🔵 Iniciando Peer 1 (REST: 9001, gRPC: 9002)..."
        cd peer1
        python run_peer.py --config config.json
        ;;
    "peer2")
        echo "🟢 Iniciando Peer 2 (REST: 9003, gRPC: 9004)..."
        cd peer2
        python run_peer.py --config config.json
        ;;
    "peer3")
        echo "🟡 Iniciando Peer 3 (REST: 9005, gRPC: 9006)..."
        cd peer3
        python run_peer.py --config config.json
        ;;
    *)
        echo "❌ Componente desconocido: $COMPONENT"
        echo "Componentes válidos: maestro, peer1, peer2, peer3"
        exit 1
        ;;
esac