const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs').promises;
const ConnectionManager = require('./connection.manager');

class PeerGrpcClient {
  constructor() {
    this.clients = new Map(); // peerId -> client
    this.connectionManager = new ConnectionManager();
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      chunkSize: 1024 * 64 // 64KB
    };
    
    this.loadProtoDefinition();
  }
  
  loadProtoDefinition() {
    const PROTO_PATH = path.join(__dirname, '../protos/peer.proto');
    this.packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    
    this.PeerService = grpc.loadPackageDefinition(this.packageDefinition).peer.PeerService;
  }
  
  createClient(address, port) {
    const clientKey = `${address}:${port}`;
    
    if (!this.clients.has(clientKey)) {
      const client = new this.PeerService(
        `${address}:${port}`,
        grpc.credentials.createInsecure(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': true
        }
      );
      
      this.clients.set(clientKey, client);
      this.connectionManager.addConnection(clientKey, client);
    }
    
    return this.clients.get(clientKey);
  }
  
  async withRetry(operation, ...args) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation.apply(this, args);
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.maxRetries) {
          console.warn(`Peer client attempt ${attempt} failed:`, error.message);
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }
    
    throw lastError;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async getFiles(address, port, includeMetadata = false) {
    return this.withRetry(async () => {
      const client = this.createClient(address, port);
      
      return new Promise((resolve, reject) => {
        client.GetFiles(
          { include_metadata: includeMetadata },
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
  
  async downloadFile(address, port, filename, savePath) {
    return this.withRetry(async () => {
      const client = this.createClient(address, port);
      
      return new Promise((resolve, reject) => {
        const call = client.TransferFile({
          filename,
          offset: 0,
          chunk_size: this.config.chunkSize
        });
        
        let fileHandle = null;
        let receivedBytes = 0;
        let expectedChecksum = '';
        
        call.on('data', async (response) => {
          try {
            const { chunk, offset, is_last, checksum } = response;
            
            if (!fileHandle) {
              fileHandle = await fs.open(savePath, 'w');
            }
            
            await fileHandle.write(chunk, 0, chunk.length, offset);
            receivedBytes += chunk.length;
            
            if (is_last && checksum) {
              expectedChecksum = checksum;
            }
          } catch (writeError) {
            reject(writeError);
          }
        });
        
        call.on('end', async () => {
          try {
            if (fileHandle) {
              await fileHandle.close();
            }
            
            // Verificar checksum si se proporcionó
            if (expectedChecksum) {
              const crypto = require('crypto');
              const hash = crypto.createHash('sha256');
              const data = await fs.readFile(savePath);
              hash.update(data);
              const actualChecksum = hash.digest('hex');
              
              if (actualChecksum !== expectedChecksum) {
                await fs.unlink(savePath);
                return reject(new Error('File checksum verification failed'));
              }
            }
            
            resolve({
              filename,
              savePath,
              size: receivedBytes,
              checksum: expectedChecksum
            });
          } catch (error) {
            reject(error);
          }
        });
        
        call.on('error', async (error) => {
          if (fileHandle) {
            await fileHandle.close();
          }
          
          try {
            await fs.unlink(savePath);
          } catch (unlinkError) {
            console.warn('Failed to cleanup partial download:', unlinkError);
          }
          
          reject(error);
        });
      });
    });
  }
  
  async uploadFile(address, port, filePath, filename) {
    return this.withRetry(async () => {
      const client = this.createClient(address, port);
      
      return new Promise(async (resolve, reject) => {
        try {
          const stats = await fs.stat(filePath);
          
          // Calcular checksum
          const crypto = require('crypto');
          const hash = crypto.createHash('sha256');
          const data = await fs.readFile(filePath);
          hash.update(data);
          const checksum = hash.digest('hex');
          
          const call = client.ReceiveFile((error, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(response);
            }
          });
          
          // Enviar información del archivo
          call.write({
            file_info: {
              filename,
              total_size: stats.size,
              checksum
            }
          });
          
          // Enviar archivo en chunks
          const fileHandle = await fs.open(filePath, 'r');
          let offset = 0;
          
          try {
            while (offset < stats.size) {
              const remainingBytes = stats.size - offset;
              const bytesToRead = Math.min(this.config.chunkSize, remainingBytes);
              
              const buffer = Buffer.alloc(bytesToRead);
              const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, offset);
              
              call.write({
                chunk: buffer.slice(0, bytesRead)
              });
              
              offset += bytesRead;
            }
            
            call.end();
          } finally {
            await fileHandle.close();
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  async ping(address, port, message = 'ping') {
    return this.withRetry(async () => {
      const client = this.createClient(address, port);
      
      return new Promise((resolve, reject) => {
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 5);
        
        client.Ping(
          { message },
          { deadline },
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
  
  closeConnection(address, port) {
    const clientKey = `${address}:${port}`;
    const client = this.clients.get(clientKey);
    
    if (client) {
      client.close();
      this.clients.delete(clientKey);
      this.connectionManager.removeConnection(clientKey);
    }
  }
  
  closeAllConnections() {
    for (const [key, client] of this.clients) {
      client.close();
      this.connectionManager.removeConnection(key);
    }
    
    this.clients.clear();
  }
}

module.exports = new PeerGrpcClient();