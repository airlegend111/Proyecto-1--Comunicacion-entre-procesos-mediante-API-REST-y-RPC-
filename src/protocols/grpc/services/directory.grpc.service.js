const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs').promises;

class DirectoryGrpcService {
  constructor() {
    this.peers = new Map(); // peerId -> peerData
    this.files = new Map(); // filename -> [peerIds]
    this.loadProtoDefinitions();
  }
  
  loadProtoDefinitions() {
    const PROTO_PATH = path.join(__dirname, '../protos/directory.proto');
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    
    this.proto = grpc.loadPackageDefinition(packageDefinition).directory;
  }
  
  // Implementación de servicios gRPC
  async registerPeer(call, callback) {
    try {
      const { peer_id, address, port, files } = call.request;
      
      const peerData = {
        peer_id,
        address,
        port,
        files: files || [],
        last_seen: Date.now(),
        status: 'ONLINE'
      };
      
      this.peers.set(peer_id, peerData);
      
      // Actualizar índice de archivos
      files?.forEach(file => {
        if (!this.files.has(file.filename)) {
          this.files.set(file.filename, []);
        }
        this.files.get(file.filename).push(peer_id);
      });
      
      callback(null, {
        response: {
          success: true,
          message: 'Peer registered successfully',
          timestamp: Date.now()
        },
        peer: peerData
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  async unregisterPeer(call, callback) {
    try {
      const { peer_id } = call.request;
      
      if (!this.peers.has(peer_id)) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: 'Peer not found'
        });
      }
      
      // Remover archivos del índice
      const peer = this.peers.get(peer_id);
      peer.files?.forEach(file => {
        const peersWithFile = this.files.get(file.filename) || [];
        const filtered = peersWithFile.filter(id => id !== peer_id);
        if (filtered.length === 0) {
          this.files.delete(file.filename);
        } else {
          this.files.set(file.filename, filtered);
        }
      });
      
      this.peers.delete(peer_id);
      
      callback(null, {
        response: {
          success: true,
          message: 'Peer unregistered successfully',
          timestamp: Date.now()
        }
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  async getPeers(call, callback) {
    try {
      const { include_files } = call.request;
      const peers = Array.from(this.peers.values());
      
      if (!include_files) {
        peers.forEach(peer => {
          delete peer.files;
        });
      }
      
      callback(null, {
        response: {
          success: true,
          message: 'Peers retrieved successfully',
          timestamp: Date.now()
        },
        peers
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  async searchFiles(call, callback) {
    try {
      const { filename, checksum, min_size, max_size } = call.request;
      const fileLocations = [];
      
      // Buscar por nombre exacto
      if (filename && this.files.has(filename)) {
        const peerIds = this.files.get(filename);
        
        peerIds.forEach(peerId => {
          const peer = this.peers.get(peerId);
          if (peer && peer.status === 'ONLINE') {
            const file = peer.files?.find(f => f.filename === filename);
            
            if (file) {
              // Aplicar filtros adicionales
              let matches = true;
              
              if (checksum && file.checksum !== checksum) matches = false;
              if (min_size && file.size < min_size) matches = false;
              if (max_size && file.size > max_size) matches = false;
              
              if (matches) {
                fileLocations.push({
                  file,
                  peer
                });
              }
            }
          }
        });
      }
      
      callback(null, {
        response: {
          success: true,
          message: `Found ${fileLocations.length} file locations`,
          timestamp: Date.now()
        },
        file_locations: fileLocations
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  // Métodos de utilidad para REST API
  async registerPeerRest(peerData) {
    return new Promise((resolve, reject) => {
      this.registerPeer({ request: peerData }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }
  
  async getPeersRest(options = {}) {
    return new Promise((resolve, reject) => {
      this.getPeers({ request: options }, (error, response) => {
        if (error) reject(error);
        else resolve(response.peers);
      });
    });
  }
  
  async searchFilesRest(query) {
    return new Promise((resolve, reject) => {
      this.searchFiles({ request: query }, (error, response) => {
        if (error) reject(error);
        else resolve(response.file_locations);
      });
    });
  }
  
  async unregisterPeerRest(peerId) {
    return new Promise((resolve, reject) => {
      this.unregisterPeer({ request: { peer_id: peerId } }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }
}

module.exports = new DirectoryGrpcService();
