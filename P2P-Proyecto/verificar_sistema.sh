#!/bin/bash

# Script de verificación rápida del Sistema P2P
# Uso: ./verificar_sistema.sh

echo "🔍 VERIFICACIÓN RÁPIDA DEL SISTEMA P2P"
echo "======================================"

# Función para verificar respuesta HTTP
check_endpoint() {
    local url=$1
    local name=$2
    
    if curl -s --connect-timeout 3 "$url" > /dev/null 2>&1; then
        echo "✅ $name: FUNCIONANDO"
        return 0
    else
        echo "❌ $name: NO RESPONDE"
        return 1
    fi
}

# Función para verificar respuesta JSON
check_json_endpoint() {
    local url=$1
    local name=$2
    
    response=$(curl -s --connect-timeout 3 "$url" 2>/dev/null)
    if [ $? -eq 0 ] && echo "$response" | python -m json.tool >/dev/null 2>&1; then
        echo "✅ $name: FUNCIONANDO"
        return 0
    else
        echo "❌ $name: NO RESPONDE O JSON INVÁLIDO"
        return 1
    fi
}

echo ""
echo "🎯 Verificando Servidor Maestro..."
check_json_endpoint "http://localhost:9000/" "Maestro (Estado)"
check_json_endpoint "http://localhost:9000/peers" "Maestro (Peers)"
check_json_endpoint "http://localhost:9000/directory" "Maestro (Directorio)"

echo ""
echo "🔵 Verificando Peer 1..."
check_json_endpoint "http://localhost:9001/" "Peer 1 (Estado)"
check_json_endpoint "http://localhost:9001/files" "Peer 1 (Archivos)"
check_json_endpoint "http://localhost:9001/info" "Peer 1 (Info)"

echo ""
echo "🟢 Verificando Peer 2..."
check_json_endpoint "http://localhost:9003/" "Peer 2 (Estado)"
check_json_endpoint "http://localhost:9003/files" "Peer 2 (Archivos)"
check_json_endpoint "http://localhost:9003/info" "Peer 2 (Info)"

echo ""
echo "🟡 Verificando Peer 3..."
check_json_endpoint "http://localhost:9005/" "Peer 3 (Estado)"
check_json_endpoint "http://localhost:9005/files" "Peer 3 (Archivos)"
check_json_endpoint "http://localhost:9005/info" "Peer 3 (Info)"

echo ""
echo "📊 RESUMEN DEL SISTEMA"
echo "======================"

# Mostrar peers registrados si el maestro funciona
if curl -s --connect-timeout 3 "http://localhost:9000/peers" > /dev/null 2>&1; then
    echo "Peers registrados en el Maestro:"
    curl -s "http://localhost:9000/peers" | python -m json.tool 2>/dev/null || echo "Error al obtener datos"
else
    echo "❌ No se puede conectar al Maestro para obtener información"
fi

echo ""
echo "🔍 PRUEBAS RÁPIDAS"
echo "=================="

# Prueba de localización
echo "Probando localización de archivo1.txt:"
if curl -s --connect-timeout 3 "http://localhost:9000/locate?file=archivo1.txt" > /dev/null 2>&1; then
    curl -s "http://localhost:9000/locate?file=archivo1.txt" | python -m json.tool 2>/dev/null || echo "Error en respuesta"
else
    echo "❌ Error en prueba de localización"
fi

echo ""
echo "💡 COMANDOS ÚTILES"
echo "=================="
echo "Ver directorio completo:    curl http://localhost:9000/directory"
echo "Estado de peers:            curl http://localhost:9000/peers"
echo "Archivos de Peer 1:         curl http://localhost:9001/files"
echo "Buscar archivo:             curl \"http://localhost:9000/locate?file=archivo1.txt\""
echo ""
echo "Transferencia gRPC (desde peer1/):"
echo "  python client.py --action download --file archivo3.txt"
echo ""
echo "📖 Para más información: README_GUIA_EJECUCION.md"