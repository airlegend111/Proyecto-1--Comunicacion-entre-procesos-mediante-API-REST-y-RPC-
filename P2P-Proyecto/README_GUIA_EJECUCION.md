# 🌐 Sistema P2P de Compartición de Archivos

## 📋 Descripción General

Este sistema **Peer-to-Peer (P2P)** permite compartir archivos entre varios nodos (peers) de manera distribuida y descentralizada, usando Python. La arquitectura combina un servidor de directorio central (Maestro) y comunicación directa entre peers usando **API REST** y **gRPC**.

## 🏗️ Arquitectura del Sistema

### Componentes Principales

- **🎯 Maestro** (`maestro/`):
  - Servidor central que registra los peers y los archivos disponibles en la red
  - Permite localizar qué peer tiene cada archivo
  - Puerto: **9000**

- **🔵🟢🟡 Peers** (`peer1/`, `peer2/`, `peer3/`):
  - Cada peer tiene microservicios REST y gRPC
  - **REST**: consultas, registro, descubrimiento y listado de archivos
  - **gRPC**: transferencia de archivos (upload/download)
  - Cliente P2P para interactuar con otros peers y el Maestro

### Puertos Utilizados
- **Maestro**: 9000
- **Peer 1**: REST 9001, gRPC 9002
- **Peer 2**: REST 9003, gRPC 9004
- **Peer 3**: REST 9005, gRPC 9006

## 🚀 Funcionalidades Implementadas

- ✅ Registro automático de peers en el Maestro al iniciar
- ✅ Listado y consulta de archivos disponibles en cada peer
- ✅ Descubrimiento de archivos vía Maestro (centralizado) y entre peers amigos (descentralizado)
- ✅ Transferencia de archivos entre peers usando gRPC
- ✅ Configuración dinámica de cada peer mediante archivo `config.json`
- ✅ Concurrencia en los servidores gRPC usando ThreadPoolExecutor
- ✅ Red de peers amigos (primario y suplente) para consultas distribuidas
- ✅ **Actualización automática del maestro** después de transferencias gRPC

## 📁 Estructura del Proyecto

```
P2P-Proyecto/
├── maestro/
│   ├── server_maestro.py          # Servidor central
│   └── config.json               # Configuración del maestro
├── peer1/
│   ├── server_rest.py            # API REST del peer
│   ├── server_grpc.py            # Servidor gRPC
│   ├── client.py                 # Cliente P2P
│   ├── run_peer.py               # Ejecutor principal
│   ├── config.json               # Configuración del peer
│   └── shared/                   # Archivos compartidos
│       └── archivo1.txt
├── peer2/ (estructura similar)
│   └── shared/
│       └── archivo2.txt
├── peer3/ (estructura similar)
│   └── shared/
│       └── archivo3.txt
├── proto/
│   └── files.proto               # Definición gRPC
├── common/
│   ├── files_pb2.py              # Archivos generados gRPC
│   ├── files_pb2_grpc.py
│   └── grpc_client.py            # Cliente gRPC común
├── venv/                         # Entorno virtual Python
├── prueba_completa.sh            # Script de prueba automática
└── README_GUIA_EJECUCION.md      # Esta guía
```

## 🛠️ Requisitos Previos

### Software Necesario
- **Python 3.8+**
- **pip** (gestor de paquetes Python)
- **curl** (para pruebas HTTP)

### Verificar Instalación
```bash
python3 --version
pip --version
curl --version
```

## ⚙️ Instalación y Configuración

### 1. Clonar o Acceder al Proyecto
```bash
cd /ruta/al/proyecto/P2P-Proyecto
```

### 2. Activar Entorno Virtual
```bash
source venv/bin/activate
```

### 3. Verificar Dependencias (Opcional)
```bash
pip list
```

**Dependencias principales:**
- fastapi
- uvicorn
- grpcio
- grpcio-tools
- requests
- protobuf

## 🚀 Ejecución del Sistema

### Opción 1: Ejecución Automática Completa

Para una demostración rápida con todas las pruebas:

```bash
# Activar entorno virtual
source venv/bin/activate

# Ejecutar sistema completo con pruebas
bash prueba_completa.sh
```

### Opción 2: Ejecución Manual Paso a Paso

Para mayor control y debugging:

#### Terminal 1 - Servidor Maestro
```bash
cd maestro
source ../venv/bin/activate
python -m uvicorn server_maestro:app --host 0.0.0.0 --port 9000
```

#### Terminal 2 - Peer 1
```bash
cd peer1
source ../venv/bin/activate
python run_peer.py --config config.json
```

#### Terminal 3 - Peer 2
```bash
cd peer2
source ../venv/bin/activate
python run_peer.py --config config.json
```

#### Terminal 4 - Peer 3
```bash
cd peer3
source ../venv/bin/activate
python run_peer.py --config config.json
```

## 🧪 Verificación y Pruebas

### 1. Verificar Estado del Sistema

#### Estado del Maestro
```bash
curl http://localhost:9000/
```

#### Peers Registrados
```bash
curl http://localhost:9000/peers
```

#### Archivos por Peer
```bash
curl http://localhost:9001/files    # Peer 1
curl http://localhost:9003/files    # Peer 2
curl http://localhost:9005/files    # Peer 3
```

#### Directorio Completo
```bash
curl http://localhost:9000/directory
```

### 2. Pruebas de Descubrimiento

#### Localización vía Maestro
```bash
curl "http://localhost:9000/locate?file=archivo1.txt"
curl "http://localhost:9000/locate?file=archivo2.txt"
curl "http://localhost:9000/locate?file=archivo3.txt"
```

#### Descubrimiento Peer-to-Peer
```bash
# Peer 3 busca archivo1.txt usando red de amigos
curl "http://localhost:9005/locate?file=archivo1.txt"
```

### 3. Transferencias gRPC

#### Descarga de Archivos
```bash
cd peer1
source ../venv/bin/activate

# Descargar archivo3.txt desde Peer 3
python client.py --action download --file archivo3.txt

# Verificar descarga
ls -la downloaded_*
cat downloaded_archivo3.txt
```

#### Subida de Archivos
```bash
# Crear archivo de prueba
echo "Este es un archivo de prueba para transferencia" > test_file.txt

# Subir archivo a Peer 2
python client.py --action upload --file archivo_prueba.txt --peer http://localhost:9003 --grpc-port 9004 --filepath test_file.txt
```

#### Verificar Actualización Automática
```bash
# El archivo debería aparecer automáticamente en el maestro
curl "http://localhost:9000/locate?file=archivo_prueba.txt"

# Y en la lista de archivos del peer destino
curl http://localhost:9003/files
```

## 🌐 Endpoints Disponibles

### 🎯 Servidor Maestro (Puerto 9000)

| Método | Endpoint | Descripción | Ejemplo |
|--------|----------|-------------|---------|
| GET | `/` | Estado del servidor | `curl http://localhost:9000/` |
| GET | `/peers` | Lista de peers registrados | `curl http://localhost:9000/peers` |
| GET | `/directory` | Directorio completo | `curl http://localhost:9000/directory` |
| GET | `/locate?file=X` | Localizar archivo | `curl "http://localhost:9000/locate?file=archivo1.txt"` |

### 🔵🟢🟡 Peers (Puertos 9001, 9003, 9005)

| Método | Endpoint | Descripción | Ejemplo |
|--------|----------|-------------|---------|
| GET | `/` | Estado del peer | `curl http://localhost:9001/` |
| GET | `/files` | Archivos locales | `curl http://localhost:9001/files` |
| GET | `/info` | Información del peer | `curl http://localhost:9001/info` |
| GET | `/search?file=X` | Búsqueda local | `curl "http://localhost:9001/search?file=archivo1.txt"` |
| GET | `/locate?file=X` | Descubrimiento P2P | `curl "http://localhost:9001/locate?file=archivo2.txt"` |
| POST | `/refresh` | Actualizar registro | `curl -X POST http://localhost:9001/refresh` |

## 🔧 Comandos de Cliente gRPC

### Sintaxis General
```bash
python client.py --action [download|upload|locate] [parámetros]
```

### Ejemplos de Uso

#### Descargar Archivo
```bash
python client.py --action download --file nombre_archivo.txt
```

#### Subir Archivo
```bash
python client.py --action upload \
  --file nombre_destino.txt \
  --peer http://localhost:9003 \
  --grpc-port 9004 \
  --filepath ruta_archivo_local.txt
```

#### Localizar Archivo
```bash
python client.py --action locate --file archivo.txt
```

#### Descubrimiento Peer-to-Peer
```bash
python client.py --action download \
  --file archivo.txt \
  --use-peer \
  --peer http://localhost:9005
```

## 🔄 Flujo de Operaciones Típico

1. **🚀 Inicio**: Cada peer lee su configuración, escanea archivos y se registra en el Maestro
2. **🔍 Descubrimiento**: 
   - Vía Maestro: consulta centralizada
   - Vía peer amigo: consulta distribuida
3. **📥📤 Transferencia**: Download y upload de archivos usando gRPC
4. **🔄 Actualización**: Registro automático en maestro después de cambios

## 🛑 Detener el Sistema

### Detener Componentes Individuales
Presiona `Ctrl+C` en cada terminal donde esté corriendo un componente.

### Detener Todo el Sistema
```bash
# Buscar procesos
ps aux | grep -E "(uvicorn|run_peer)" | grep -v grep

# Matar procesos específicos
kill [PID1] [PID2] [PID3] [PID4]

# O forzar limpieza de puertos
sudo fuser -k 9000/tcp 9001/tcp 9002/tcp 9003/tcp 9004/tcp 9005/tcp 9006/tcp
```

## 🐛 Resolución de Problemas

### Error: Puerto en Uso
```bash
# Verificar qué proceso usa el puerto
sudo lsof -i :9000

# Liberar puerto específico
sudo fuser -k 9000/tcp
```

### Error: Conexión gRPC Rechazada
- Verificar que el peer destino esté corriendo
- Comprobar que el puerto gRPC esté disponible
- Revisar configuración en `config.json`

### Error: Peer No Se Registra
- Verificar que el Maestro esté corriendo
- Comprobar URL del maestro en configuración
- Revisar logs de conexión

### Actualización Manual del Registro
```bash
# Si un peer no refleja cambios automáticamente
curl -X POST http://localhost:9001/refresh
```

## 📊 Características Técnicas

- **Arquitectura**: Microservicios distribuidos
- **Protocolos**: REST API + gRPC
- **Concurrencia**: ThreadPoolExecutor para gRPC
- **Descubrimiento**: Dual (centralizado + P2P)
- **Persistencia**: Sistema de archivos local
- **Configuración**: JSON dinámico por peer
- **Red**: Topología de peers amigos configurables

## 🤝 Contribuciones

Este es un sistema educativo para demostrar conceptos P2P. Para mejoras o extensiones:

1. Fork el proyecto
2. Crea una rama para tu feature
3. Realiza tus cambios
4. Prueba exhaustivamente
5. Envía un pull request

## 📄 Licencia

Proyecto educativo - uso libre para aprendizaje y demostración.

---

**🎯 ¡Disfruta explorando el sistema P2P!** Para cualquier duda, revisa los logs de los componentes o utiliza los endpoints de estado para debugging.