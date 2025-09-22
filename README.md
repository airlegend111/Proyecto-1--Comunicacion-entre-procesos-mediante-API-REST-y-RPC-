# P2P File Sharing System

A distributed peer-to-peer file sharing system with hybrid architecture using a central directory server and distributed peers. Built with Node.js, Express, and REST APIs.

## 🏗️ Architecture

The system consists of 4 main microservices:

1. **Directory Service** - Central registry for peer management and file indexing
2. **File Query Service** - File scanning and discovery for each peer
3. **Transfer Service** - File upload/download operations
4. **Peer Discovery** - Network bootstrap and health monitoring

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd p2p-file-sharing

# Install dependencies
npm install

# Start the entire network
./scripts/start-network.sh
```

### Manual Start

```bash
# Start directory server
node src/microservices/directory-service/index.js

# Start peer servers (in separate terminals)
node src/server/p-servidor.js config/peer1.json
node src/server/p-servidor.js config/peer2.json
node src/server/p-servidor.js config/peer3.json
```

## 📁 Project Structure

```
src/
├── microservices/
│   ├── directory-service/     # Central directory management
│   │   ├── registry.service.js
│   │   ├── file-index.service.js
│   │   └── index.js
│   ├── file-query-service/    # File scanning and discovery
│   │   ├── file-scanners.js
│   │   └── index.js
│   ├── transfer-service/      # File upload/download
│   │   ├── upload.service.js
│   │   ├── download.service.js
│   │   └── index.js
│   └── peer-discovery/        # Network bootstrap and health
│       ├── bootstrap.js
│       └── health-check.js
├── client/                    # Client applications
│   ├── p-cliente.js
│   └── directory-client.js
├── server/                    # Main server
│   └── p-servidor.js
└── utils/                     # Shared utilities
    ├── config-loader.js
    ├── logger.js
    └── network.js
```

## 🔧 Configuration

### Directory Server (config/directory-server.json)
```json
{
  "serverId": "directory",
  "ip": "0.0.0.0",
  "port": 4000,
  "registryFile": "./shared-files/registry.json"
}
```

### Peer Configuration (config/peer1.json)
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

## 🌐 API Endpoints

### Directory Service (Port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ping` | Ping test |
| POST | `/register` | Register peer |
| GET | `/peers` | List all peers |
| DELETE | `/unregister/:peerId` | Unregister peer |
| GET | `/search/:filename` | Search files |
| GET | `/files` | List all files |
| GET | `/stats` | System statistics |

### Peer Services (Ports 3001-3003)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ping` | Ping test |
| GET | `/files` | List peer files |
| POST | `/refresh` | Refresh file list |
| GET | `/download/:filename` | Download file |
| POST | `/upload` | Upload file |
| GET | `/search/:filename` | Search files |

## 🎯 Usage Examples

### Using the CLI Client

```bash
# Start a peer client
node src/client/p-cliente.js config/peer1.json

# Available commands:
connect                    # Connect to P2P network
disconnect                 # Disconnect from network
peers                      # List all peers
search <filename>          # Search for files
download <peerUrl> <file>  # Download file from peer
upload <peerUrl> <file>    # Upload file to peer
files <peerUrl>            # Get files from peer
ping <peerUrl>             # Ping a peer
status                     # Show connection status
```

### Using HTTP API

```bash
# Search for files
curl http://localhost:4000/search/document

# Get peer list
curl http://localhost:4000/peers

# Download file from peer
curl http://localhost:3001/download/sample1.txt

# Upload file to peer
curl -X POST -F "file=@myfile.txt" http://localhost:3001/upload
```

## 🔍 Features

- **Hybrid Architecture**: Central directory + distributed peers
- **File Discovery**: Automatic file scanning and indexing
- **Health Monitoring**: Continuous peer health checks
- **RESTful API**: Standard HTTP endpoints
- **Error Handling**: Robust error handling and logging
- **Configuration Management**: JSON-based configuration
- **Logging**: Comprehensive logging with timestamps
- **File Validation**: File type and size validation
- **Caching**: Download result caching
- **Backup**: Automatic file backup on overwrite

## 🛠️ Development

### Running Individual Services

```bash
# Directory service only
node src/microservices/directory-service/index.js

# File query service only
node src/microservices/file-query-service/index.js

# Transfer service only
node src/microservices/transfer-service/index.js
```

### Testing

```bash
# Test directory service endpoints
node src/client/directory-client.js

# Test peer connectivity
curl http://localhost:4000/health
curl http://localhost:3001/ping
```

## 📊 Monitoring

- **Logs**: Written to `logs/` directory
- **Health Checks**: Available at `/health` endpoints
- **Statistics**: Available at `/stats` endpoints
- **Peer Status**: Monitor via `/peers` endpoint

## 🔧 Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3001-3003 and 4000 are available
2. **Directory not found**: Run `mkdir -p config/shared-files/peer{1,2,3}`
3. **Permission errors**: Check file permissions in shared directories
4. **Connection failures**: Verify directory server is running first

### Debug Mode

Set environment variable for detailed logging:
```bash
DEBUG=* node src/server/p-servidor.js config/peer1.json
```

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions, please open an issue in the repository.