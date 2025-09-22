const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const ConnectionManager = require('./connection.manager');

class DirectoryGrpcClient {
  constructor() {
    this.client = null;
    this.config = {
      host: process.env.DIRECTORY_HOST || 'localhost',
      port: process.env.DIRECTORY_PORT || 50051,
      maxRetries: 3,
      retryDelay: 1000
    };
    
    this.connectionManager = new ConnectionManager();
    this.initializeClient();
  }
  
  initializeClient() {
    try {
      const PROTO_PATH = path.join(__dirname, '../protos/directory.proto');
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
      
      const DirectoryService = grpc.loadPackageDefinition(packageDefinition).directory.DirectoryService;
      
      this.client = new DirectoryService(
        `${this.config.host}:${this.config.port}`,
        grpc.credentials.createInsecure(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': true
        }
      );
      
      this.connectionManager.addConnection('directory', this.client);
    } catch (error) {
      console.error('Failed to initialize Directory gRPC client:', error);
      throw error;
    }
  }
  
  async withRetry(operation, ...args) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation.apply(this, args);
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.maxRetries) {
          console.warn(`Directory client attempt ${attempt} failed:`, error.message);
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }
    
    throw lastError;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async registerPeer(peerData) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        this.client.RegisterPeer(peerData, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });
    });
  }
  
  async unregisterPeer(peerId) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        this.client.UnregisterPeer({ peer_id: peerId }, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });
    });
  }
  
  async getPeers(includeFiles = false) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        this.client.GetPeers({ include_files: includeFiles }, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });
    });
  }
  
  async searchFiles(query) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        this.client.SearchFiles(query, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        });
      });
    });
  }
  
  async updatePeerFiles(peerId, files) {
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        this.client.UpdatePeerFiles(
          { peer_id: peerId, files },
          (error, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(response);
            }
          }
        );
      });
    });
  }
  
  async ping() {
    // Implementar un ping básico usando GetPeers con timeout
    return this.withRetry(async () => {
      return new Promise((resolve, reject) => {
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 5);
        
        this.client.GetPeers(
          { include_files: false },
          { deadline },
          (error, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(true);
            }
          }
        );
      });
    });
  }
  
  close() {
    if (this.client) {
      this.client.close();
      this.connectionManager.removeConnection('directory');
    }
  }
}

module.exports = new DirectoryGrpcClient();