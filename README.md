# Sistema P2P de Compartir Archivos

Un sistema distribuido de compartir archivos peer-to-peer con arquitectura híbrida que utiliza un servidor de directorio central y peers distribuidos. Construido con Node.js, Express y APIs REST.

## 🏗️ Arquitectura

El sistema consta de 4 microservicios principales:

1. **Servicio de Directorio** - Registro central para gestión de peers e indexación de archivos
2. **Servicio de Consulta de Archivos** - Escaneo y descubrimiento de archivos para cada peer
3. **Servicio de Transferencia** - Operaciones de subida/descarga de archivos
4. **Descubrimiento de Peers** - Bootstrap de red y monitoreo de salud

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 16+ 
- npm

### Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd p2p-file-sharing

# Instalar dependencias
npm install

# Iniciar toda la red
# En Windows (PowerShell):
.\scripts\start-network.ps1

# En Windows (CMD):
scripts\start-network.bat

# En Linux/Mac:
./scripts/start-network.sh
```

### Inicio Manual

```bash
# Iniciar servidor de directorio
node src/microservices/directory-service/index.js

# Iniciar servidores peer (en terminales separadas)
node src/server/p-servidor.js config/peer1.json
node src/server/p-servidor.js config/peer2.json
node src/server/p-servidor.js config/peer3.json
```

## 📁 Estructura del Proyecto

```
src/
├── microservices/
│   ├── directory-service/     # Gestión central del directorio
│   │   ├── registry.service.js
│   │   ├── file-index.service.js
│   │   └── index.js
│   ├── file-query-service/    # Escaneo y descubrimiento de archivos
│   │   ├── file-scanners.js
│   │   └── index.js
│   ├── transfer-service/      # Subida/descarga de archivos
│   │   ├── upload.service.js
│   │   ├── download.service.js
│   │   └── index.js
│   └── peer-discovery/        # Bootstrap de red y salud
│       ├── bootstrap.js
│       └── health-check.js
├── client/                    # Aplicaciones cliente
│   ├── p-cliente.js
│   └── directory-client.js
├── server/                    # Servidor principal
│   └── p-servidor.js
└── utils/                     # Utilidades compartidas
    ├── config-loader.js
    ├── logger.js
    └── network.js
```

## 🔧 Configuración

### Servidor de Directorio (config/directory-server.json)
```json
{
  "serverId": "directory",
  "ip": "0.0.0.0",
  "port": 4000,
  "registryFile": "./shared-files/registry.json"
}
```

### Configuración de Peer (config/peer1.json)
```json
{
  "peerId": "peer1",
  "ip": "0.0.0.0",
  "restPort": 3001,
  "grpcPort": 50051,
  "sharedDirectory": "./shared-files/peer1",
  "friendPrimary": "http://localhost:3002",
  "friendBackup": "http://localhost:3003",
  "directoryServer": "http://localhost:4000"
}
```

## 🌐 Endpoints de API

### Servicio de Directorio (Puerto 4000)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Verificación de salud |
| GET | `/ping` | Prueba de ping |
| POST | `/register` | Registrar peer |
| GET | `/peers` | Listar todos los peers |
| DELETE | `/unregister/:peerId` | Desregistrar peer |
| GET | `/search/:filename` | Buscar archivos |
| GET | `/files` | Listar todos los archivos |
| GET | `/stats` | Estadísticas del sistema |

### Servicios Peer (Puertos 3001-3003)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Verificación de salud |
| GET | `/ping` | Prueba de ping |
| GET | `/files` | Listar archivos del peer |
| POST | `/refresh` | Actualizar lista de archivos |
| GET | `/download/:filename` | Descargar archivo |
| POST | `/upload` | Subir archivo |
| GET | `/search/:filename` | Buscar archivos |

## 🎯 Ejemplos de Uso

### Usando el Cliente CLI

```bash
# Iniciar un cliente peer
node src/client/p-cliente.js config/peer1.json

# Comandos disponibles:
connect                    # Conectar a la red P2P
disconnect                 # Desconectar de la red
peers                      # Listar todos los peers
search <archivo>           # Buscar archivos
download <peerUrl> <archivo>  # Descargar archivo del peer
upload <peerUrl> <archivo>    # Subir archivo al peer
files <peerUrl>            # Obtener archivos del peer
ping <peerUrl>             # Hacer ping a un peer
status                     # Mostrar estado de conexión
```

### Usando la API HTTP

```bash
# Buscar archivos
curl http://localhost:4000/search/document

# Obtener lista de peers
curl http://localhost:4000/peers

# Descargar archivo del peer
curl http://localhost:3001/download/sample1.txt

# Subir archivo al peer
curl -X POST -F "file=@myfile.txt" http://localhost:3001/upload
```

## 🔍 Características

- **Arquitectura Híbrida**: Directorio central + peers distribuidos
- **Descubrimiento de Archivos**: Escaneo e indexación automática de archivos
- **Monitoreo de Salud**: Verificaciones continuas de salud de peers
- **API RESTful**: Endpoints HTTP estándar
- **Manejo de Errores**: Manejo robusto de errores y logging
- **Gestión de Configuración**: Configuración basada en JSON
- **Logging**: Logging comprensivo con timestamps
- **Validación de Archivos**: Validación de tipo y tamaño de archivos
- **Caché**: Caché de resultados de descarga
- **Respaldo**: Respaldo automático de archivos al sobrescribir

## 🛠️ Desarrollo

### Ejecutando Servicios Individuales

```bash
# Solo servicio de directorio
node src/microservices/directory-service/index.js

# Solo servicio de consulta de archivos
node src/microservices/file-query-service/index.js

# Solo servicio de transferencia
node src/microservices/transfer-service/index.js
```

### Pruebas

```bash
# Probar endpoints del servicio de directorio
node src/client/directory-client.js

# Probar conectividad de peers
curl http://localhost:4000/health
curl http://localhost:3001/ping
```

## 📊 Monitoreo

- **Logs**: Escritos en el directorio `logs/`
- **Verificaciones de Salud**: Disponibles en endpoints `/health`
- **Estadísticas**: Disponibles en endpoints `/stats`
- **Estado de Peers**: Monitorear vía endpoint `/peers`

## 🔧 Solución de Problemas

### Problemas Comunes

1. **Conflictos de puertos**: Asegurar que los puertos 3001-3003 y 4000 estén disponibles
2. **Directorio no encontrado**: Ejecutar `mkdir -p config/shared-files/peer{1,2,3}`
3. **Errores de permisos**: Verificar permisos de archivos en directorios compartidos
4. **Fallos de conexión**: Verificar que el servidor de directorio esté ejecutándose primero

### Modo Debug

Establecer variable de entorno para logging detallado:
```bash
DEBUG=* node src/server/p-servidor.js config/peer1.json
```

## 📝 Licencia

Licencia MIT - ver archivo LICENSE para detalles

## 🤝 Contribuir

1. Hacer fork del repositorio
2. Crear una rama de característica
3. Hacer tus cambios
4. Agregar pruebas si es aplicable
5. Enviar un pull request

## 📞 Soporte

Para problemas y preguntas, por favor abrir un issue en el repositorio.