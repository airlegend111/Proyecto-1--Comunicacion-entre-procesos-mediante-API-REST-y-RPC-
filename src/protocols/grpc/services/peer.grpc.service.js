const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class PeerGrpcService {
  constructor() {
    this.sharedFilesPath = path.join(process.cwd(), 'shared-files');
    this.loadProtoDefinitions();
    this.ensureSharedFilesDirectory();
  }
  
  loadProtoDefinitions() {
    const PROTO_PATH = path.join(__dirname, '../protos/peer.proto');
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    
    this.proto = grpc.loadPackageDefinition(packageDefinition).peer;
  }
  
  async ensureSharedFilesDirectory() {
    try {
      await fs.mkdir(this.sharedFilesPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create shared-files directory:', error);
    }
  }
  
  async calculateChecksum(filePath) {
    const hash = crypto.createHash('sha256');
    const data = await fs.readFile(filePath);
    hash.update(data);
    return hash.digest('hex');
  }
  
  // Implementación de servicios gRPC
  async getFiles(call, callback) {
    try {
      const { include_metadata } = call.request;
      const files = [];
      
      const fileList = await fs.readdir(this.sharedFilesPath);
      
      for (const filename of fileList) {
        const filePath = path.join(this.sharedFilesPath, filename);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.isFile()) {
            const fileData = {
              filename,
              size: stats.size,
              created_at: stats.birthtimeMs,
              modified_at: stats.mtimeMs
            };
            
            if (include_metadata) {
              fileData.checksum = await this.calculateChecksum(filePath);
              fileData.mime_type = this.getMimeType(filename);
            }
            
            files.push(fileData);
          }
        } catch (statError) {
          console.warn(`Failed to get stats for ${filename}:`, statError);
        }
      }
      
      callback(null, {
        response: {
          success: true,
          message: `Retrieved ${files.length} files`,
          timestamp: Date.now()
        },
        files
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  async transferFile(call) {
    try {
      const { filename, offset = 0, chunk_size = 1024 * 64 } = call.request;
      const filePath = path.join(this.sharedFilesPath, filename);
      
      // Verificar que el archivo existe
      await fs.access(filePath);
      
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      let currentOffset = offset;
      const fileHandle = await fs.open(filePath, 'r');
      
      try {
        while (currentOffset < fileSize) {
          const remainingBytes = fileSize - currentOffset;
          const bytesToRead = Math.min(chunk_size, remainingBytes);
          
          const buffer = Buffer.alloc(bytesToRead);
          const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, currentOffset);
          
          const isLast = currentOffset + bytesRead >= fileSize;
          let checksum = '';
          
          if (isLast) {
            checksum = await this.calculateChecksum(filePath);
          }
          
          call.write({
            chunk: buffer.slice(0, bytesRead),
            offset: currentOffset,
            is_last: isLast,
            checksum: checksum
          });
          
          currentOffset += bytesRead;
        }
        
        call.end();
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      call.destroy({
        code: grpc.status.NOT_FOUND,
        details: `File not found: ${error.message}`
      });
    }
  }
  
  async receiveFile(call, callback) {
    let fileInfo = null;
    let fileHandle = null;
    let receivedBytes = 0;
    let filePath = '';
    
    try {
      call.on('data', async (request) => {
        try {
          if (request.file_info) {
            // Primera parte: información del archivo
            fileInfo = request.file_info;
            filePath = path.join(this.sharedFilesPath, fileInfo.filename);
            
            // Crear archivo
            fileHandle = await fs.open(filePath, 'w');
          } else if (request.chunk && fileHandle) {
            // Escribir chunk
            await fileHandle.write(request.chunk, 0, request.chunk.length, receivedBytes);
            receivedBytes += request.chunk.length;
          }
        } catch (chunkError) {
          console.error('Error processing chunk:', chunkError);
          call.destroy({
            code: grpc.status.INTERNAL,
            details: chunkError.message
          });
        }
      });
      
      call.on('end', async () => {
        try {
          if (fileHandle) {
            await fileHandle.close();
            fileHandle = null;
          }
          
          // Verificar tamaño
          if (fileInfo && receivedBytes !== fileInfo.total_size) {
            await fs.unlink(filePath); // Eliminar archivo corrupto
            return callback({
              code: grpc.status.DATA_LOSS,
              details: 'File size mismatch'
            });
          }
          
          // Verificar checksum si se proporciona
          if (fileInfo?.checksum) {
            const actualChecksum = await this.calculateChecksum(filePath);
            if (actualChecksum !== fileInfo.checksum) {
              await fs.unlink(filePath);
              return callback({
                code: grpc.status.DATA_LOSS,
                details: 'Checksum mismatch'
              });
            }
          }
          
          callback(null, {
            response: {
              success: true,
              message: 'File received successfully',
              timestamp: Date.now()
            },
            saved_path: filePath
          });
        } catch (endError) {
          callback({
            code: grpc.status.INTERNAL,
            details: endError.message
          });
        }
      });
      
      call.on('error', async (error) => {
        if (fileHandle) {
          await fileHandle.close();
          fileHandle = null;
        }
        
        if (filePath) {
          try {
            await fs.unlink(filePath);
          } catch (unlinkError) {
            console.warn('Failed to cleanup partial file:', unlinkError);
          }
        }
        
        callback({
          code: grpc.status.ABORTED,
          details: error.message
        });
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  async ping(call, callback) {
    try {
      const { message } = call.request;
      
      callback(null, {
        response: {
          success: true,
          message: 'Pong',
          timestamp: Date.now()
        },
        message: `Echo: ${message}`,
        timestamp: Date.now()
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip',
      '.json': 'application/json',
      '.xml': 'application/xml'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
  
  // Métodos de utilidad para REST API
  async getFilesRest(includeMetadata = false) {
    return new Promise((resolve, reject) => {
      this.getFiles({ request: { include_metadata: includeMetadata } }, (error, response) => {
        if (error) reject(error);
        else resolve(response.files);
      });
    });
  }
  
  async refreshFileList() {
    return this.getFilesRest(true);
  }
}

module.exports = new PeerGrpcService();