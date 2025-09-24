const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const rateLimit = require('express-rate-limit');

const configLoader = require('../utils/config-loader');
const Logger = require('../utils/logger');
const BootstrapService = require('../microservices/peer-discovery/bootstrap');
const HealthCheckService = require('../microservices/peer-discovery/health-check');
const PeerGrpcService = require('../protocols/grpc/services/peer.grpc.service');

class P2PServer {
    constructor() {
        this.app = express();
        this.config = null;
        this.logger = null;
        this.bootstrapService = null;
        this.healthCheckService = null;
        this.server = null;
        this.grpcServer = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the P2P server
     * @param {string} configPath - Path to configuration file
     */
    async initialize(configPath) {
        try {
            // Load configuration
            this.config = await configLoader.loadConfig(configPath);
            
            // Initialize logger
            this.logger = new Logger(`p2p-server-${this.config.peerId}`);
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'peer')) {
                throw new Error('Invalid peer configuration');
            }

            // Initialize services
            this.bootstrapService = new BootstrapService();
            await this.bootstrapService.initialize(configPath);
            
            this.healthCheckService = new HealthCheckService(this.config, this.logger);

            // Initialize gRPC server (temporarily disabled)
            // await this.initializeGrpcServer();

            // Setup middleware
            this.setupMiddleware();
            
            // Setup routes
            this.setupRoutes();
            
            // Setup error handling
            this.setupErrorHandling();

            this.isInitialized = true;
            this.logger.info('Servidor P2P inicializado exitosamente', {
                peerId: this.config.peerId,
                restPort: this.config.restPort,
                grpcPort: this.config.grpcPort,
                sharedDirectory: this.config.sharedDirectory
            });
        } catch (error) {
            console.error('Error al inicializar el servidor P2P:', error.message);
            throw error;
        }
    }

    /**
     * Initialize gRPC server
     */
    async initializeGrpcServer() {
        try {
            // Load proto definitions
            const PROTO_PATH = path.join(__dirname, '../protocols/grpc/protos/peer.proto');
            const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });
            
            const proto = grpc.loadPackageDefinition(packageDefinition).peer;
            
            // Create gRPC server
            this.grpcServer = new grpc.Server();
            
            // Add services
            this.grpcServer.addService(proto.PeerService.service, {
                getFiles: this.handleGetFiles.bind(this),
                transferFile: this.handleTransferFile.bind(this),
                receiveFile: this.handleReceiveFile.bind(this),
                checkFileAvailability: this.handleCheckFileAvailability.bind(this),
                getFileMetadata: this.handleGetFileMetadata.bind(this),
                ping: this.handlePing.bind(this),
                getPeerStatus: this.handleGetPeerStatus.bind(this),
                cancelTransfer: this.handleCancelTransfer.bind(this)
            });
            
            this.logger.info('gRPC server initialized', {
                grpcPort: this.config.grpcPort
            });
        } catch (error) {
            this.logger.error('Failed to initialize gRPC server', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup middleware
     */
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        
        // Rate limiting for API endpoints
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: {
                success: false,
                message: 'Too many requests from this IP, please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);

        // More restrictive rate limiting for file operations
        const fileLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 100, // limit each IP to 100 file operations per windowMs
            message: {
                success: false,
                message: 'Too many file operations from this IP, please try again later.'
            }
        });
        this.app.use(['/upload', '/download'], fileLimiter);
        
        // CORS middleware
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));

        // Logging middleware
        this.app.use(morgan('combined', {
            stream: {
                write: (message) => this.logger.info(message.trim())
            }
        }));

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request timing middleware
        this.app.use((req, res, next) => {
            req.startTime = Date.now();
            next();
        });

        // Concurrency tracking middleware
        this.app.use((req, res, next) => {
            if (!this.activeConnections) {
                this.activeConnections = 0;
            }
            this.activeConnections++;
            
            res.on('finish', () => {
                this.activeConnections--;
            });
            
            next();
        });
    }

    /**
     * Setup routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                const healthResult = await this.healthCheckService.performHealthCheck();
                res.json(healthResult);
            } catch (error) {
                this.logger.error('Health check error', { error: error.message });
                res.status(500).json({
                    status: 'error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Ping endpoint
        this.app.get('/ping', (req, res) => {
            res.json({
                message: 'pong',
                timestamp: new Date().toISOString(),
                peerId: this.config.peerId
            });
        });

        // --- INTEGRACIÓN TRANSFER SERVICE ---
        const swaggerUi = require('swagger-ui-express');
        const getSwaggerSpec = require('../microservices/transfer-service/swagger.config');
        const UploadService = require('../microservices/transfer-service/upload.service');
        const DownloadService = require('../microservices/transfer-service/download.service');
        const Logger = require('../utils/logger');
        const path = require('path');
        const fs = require('fs');

        // Instanciar servicios con la configuración del peer
        const transferLogger = new Logger(`transfer-service-${this.config.peerId}`);
        const uploadService = new UploadService(transferLogger, this.config.sharedDirectory);
        const downloadService = new DownloadService(transferLogger, this.config.sharedDirectory);

        // Swagger UI para cada peer
        const swaggerSpec = getSwaggerSpec({ port: this.config.restPort, peerName: this.config.peerId });
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

        // Endpoint de upload
        this.app.post('/upload', async (req, res) => {
            try {
                const { filename, content, mimeType, overwrite = false } = req.body;
                if (!filename || !content) {
                    return res.status(400).json({ success: false, message: 'filename y content son requeridos' });
                }
                
                // Upload directo sin usar el servicio
                const filePath = path.join(this.config.sharedDirectory, filename);
                const fileDir = path.dirname(filePath);
                
                // Crear directorio si no existe
                await fs.promises.mkdir(fileDir, { recursive: true });
                
                // Verificar si el archivo existe
                try {
                    await fs.promises.access(filePath);
                    if (!overwrite) {
                        return res.status(400).json({ 
                            success: false, 
                            message: `File ${filename} already exists. Use overwrite option to replace.` 
                        });
                    }
                } catch (error) {
                    // Archivo no existe, continuar
                }
                
                // Escribir archivo
                const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
                await fs.promises.writeFile(filePath, buffer);
                
                // Obtener estadísticas del archivo
                const stats = await fs.promises.stat(filePath);
                
                res.status(201).json({
                    success: true,
                    filename,
                    path: filePath,
                    size: stats.size,
                    mimeType,
                    uploadedAt: new Date().toISOString(),
                    message: 'File uploaded successfully'
                });
            } catch (error) {
                transferLogger.error('Upload error', { error: error.message });
                res.status(500).json({ success: false, message: 'Upload failed' });
            }
        });

        // Endpoint de download con búsqueda dinámica en peers
        this.app.get('/download/:filename', async (req, res) => {
            try {
                const { filename } = req.params;
                const filePath = path.join(this.config.sharedDirectory, filename);
                
                // Verificar si el archivo existe localmente
                try {
                    await fs.promises.access(filePath);
                    const stats = await fs.promises.stat(filePath);
                    
                    if (!stats.isFile()) {
                        return res.status(404).json({ 
                            success: false, 
                            message: `${filename} is not a file` 
                        });
                    }
                    
                    // Configurar headers para descarga
                    res.set({
                        'Content-Type': 'application/octet-stream',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Content-Length': stats.size.toString()
                    });
                    
                    // Enviar el archivo
                    const fileStream = fs.createReadStream(filePath);
                    fileStream.pipe(res);
                    
                } catch (error) {
                    // Si no existe localmente, buscar en otros peers
                    const axios = require('axios');
                    let peers = [];
                    try {
                        const directoryServerUrl = this.config.directoryServer;
                        const response = await axios.get(`${directoryServerUrl}/search/${filename}`);
                        if (response.status === 200 && response.data && response.data.success && Array.isArray(response.data.locations)) {
                            peers = response.data.locations
                                .filter(peer => peer.rest && typeof peer.rest === 'string' && peer.rest.startsWith('http'))
                                .map(peer => ({ restUrl: peer.rest }));
                        }
                    } catch (err) {
                        transferLogger.error('Error fetching peers with file from directory server', { error: err.message });
                    }

                    if (peers.length === 0) {
                        return res.status(404).json({ 
                            success: false, 
                            message: `File ${filename} not found in any peer` 
                        });
                    }

                    // Intentar descargar de otros peers
                    const result = await downloadService.downloadFile(filename, { peers });
                    if (result.success) {
                        res.set({
                            'Content-Type': 'application/octet-stream',
                            'Content-Disposition': `attachment; filename="${filename}"`,
                            'Content-Length': result.size.toString()
                        });
                        const fileStream = fs.createReadStream(result.path);
                        fileStream.pipe(res);
                    } else {
                        res.status(404).json(result);
                    }
                }
            } catch (error) {
                transferLogger.error('Download error', { error: error.message });
                res.status(500).json({ success: false, message: 'Download failed' });
            }
        });

        // Connect to network (registro con rest_url usando puerto real)
        this.app.post('/connect', async (req, res) => {
            try {
                const axios = require('axios');
                // Construir la URL REST real del peer usando el puerto de configuración
                const restUrl = `http://localhost:${this.config.restPort}`;
                // Obtener archivos compartidos
                const fs = require('fs');
                const path = require('path');
                let sharedFiles = [];
                try {
                    sharedFiles = fs.readdirSync(this.config.sharedDirectory).filter(f => fs.statSync(path.join(this.config.sharedDirectory, f)).isFile());
                } catch (err) {
                    this.logger.error('Error leyendo archivos compartidos', { error: err.message });
                }
                // Registrar en el servidor maestro
                const response = await axios.post(`${this.config.directoryServer}/register`, {
                    peer: this.config.peerId,
                    files: sharedFiles,
                    grpc_port: this.config.grpcPort,
                    rest_url: restUrl
                });
                const result = response.data;
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Connect error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // Disconnect from network
        this.app.post('/disconnect', async (req, res) => {
            try {
                const result = await this.bootstrapService.unregisterFromDirectoryServer();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Disconnect error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // Get peer list
        this.app.get('/peers', async (req, res) => {
            try {
                const result = await this.bootstrapService.getPeerList();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Get peers error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message,
                    peers: []
                });
            }
        });

        // Search files
        this.app.get('/search/:filename', async (req, res) => {
            try {
                const { filename } = req.params;
                const result = await this.bootstrapService.searchFiles(filename);
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Search files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message,
                    filename: req.params.filename,
                    peers: []
                });
            }
        });

        // List files in this peer
        this.app.get('/files', async (req, res) => {
            try {
                const files = await this.bootstrapService.getCurrentFiles();
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    files: files,
                    count: files.length,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                this.logger.error('List files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message,
                    files: []
                });
            }
        });

        // Update registration
        this.app.post('/update', async (req, res) => {
            try {
                const result = await this.bootstrapService.updateRegistration();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Update registration error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // Get server status
        this.app.get('/status', (req, res) => {
            const bootstrapStatus = this.bootstrapService.getStatus();
            const healthStatus = this.healthCheckService.getHealthStatus();
            
            res.json({
                peerId: this.config.peerId,
                isInitialized: this.isInitialized,
                bootstrap: bootstrapStatus,
                health: healthStatus,
                concurrency: {
                    activeConnections: this.activeConnections || 0,
                    maxConnections: 1000, // Configurable limit
                    memoryUsage: process.memoryUsage(),
                    uptime: process.uptime()
                },
                config: {
                    restPort: this.config.restPort,
                    grpcPort: this.config.grpcPort,
                    sharedDirectory: this.config.sharedDirectory,
                    directoryServer: this.config.directoryServer
                },
                timestamp: new Date().toISOString()
            });
        });

        // Start periodic health checks
        this.app.post('/health/start', (req, res) => {
            try {
                const { interval = 30000 } = req.body;
                this.healthCheckService.startPeriodicChecks(interval);
                
                res.json({
                    success: true,
                    message: 'Periodic health checks started',
                    interval
                });
            } catch (error) {
                this.logger.error('Start health checks error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // Stop periodic health checks
        this.app.post('/health/stop', (req, res) => {
            try {
                this.healthCheckService.stopPeriodicChecks();
                
                res.json({
                    success: true,
                    message: 'Periodic health checks stopped'
                });
            } catch (error) {
                this.logger.error('Stop health checks error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // Start periodic registration updates
        this.app.post('/bootstrap/start', (req, res) => {
            try {
                const { interval = 30000 } = req.body;
                this.bootstrapService.startPeriodicUpdates(interval);
                
                res.json({
                    success: true,
                    message: 'Periodic registration updates started',
                    interval
                });
            } catch (error) {
                this.logger.error('Start bootstrap updates error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // Stop periodic registration updates
        this.app.post('/bootstrap/stop', (req, res) => {
            try {
                this.bootstrapService.stopPeriodicUpdates();
                
                res.json({
                    success: true,
                    message: 'Periodic registration updates stopped'
                });
            } catch (error) {
                this.logger.error('Stop bootstrap updates error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
        });

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint not found',
                path: req.originalUrl
            });
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
            this.logger.error('Unhandled error', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method
            });

            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        });
    }

    /**
     * gRPC Service Handlers
     */
    async handleGetFiles(call, callback) {
        try {
            const result = await PeerGrpcService.getFiles(call, callback);
            callback(null, result);
        } catch (error) {
            this.logger.error('gRPC GetFiles error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handleTransferFile(call) {
        try {
            await PeerGrpcService.transferFile(call);
        } catch (error) {
            this.logger.error('gRPC TransferFile error', { error: error.message });
            call.destroy({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handleReceiveFile(call, callback) {
        try {
            await PeerGrpcService.receiveFile(call, callback);
        } catch (error) {
            this.logger.error('gRPC ReceiveFile error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handleCheckFileAvailability(call, callback) {
        try {
            const { filename } = call.request;
            const filePath = path.join(this.config.sharedDirectory, filename);
            
            try {
                await fs.promises.access(filePath);
                const stats = await fs.promises.stat(filePath);
                
                callback(null, {
                    response: {
                        success: true,
                        message: 'File available',
                        timestamp: Date.now()
                    },
                    available: true,
                    file_info: {
                        filename,
                        size: stats.size,
                        created_at: stats.birthtimeMs,
                        modified_at: stats.mtimeMs
                    },
                    estimated_transfer_time: Math.ceil(stats.size / (1024 * 1024)) // Rough estimate in seconds
                });
            } catch (error) {
                callback(null, {
                    response: {
                        success: false,
                        message: 'File not available',
                        timestamp: Date.now()
                    },
                    available: false
                });
            }
        } catch (error) {
            this.logger.error('gRPC CheckFileAvailability error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handleGetFileMetadata(call, callback) {
        try {
            const { filename } = call.request;
            const filePath = path.join(this.config.sharedDirectory, filename);
            
            try {
                const stats = await fs.promises.stat(filePath);
                const checksum = await PeerGrpcService.calculateChecksum(filePath);
                
                callback(null, {
                    response: {
                        success: true,
                        message: 'File metadata retrieved',
                        timestamp: Date.now()
                    },
                    file: {
                        filename,
                        size: stats.size,
                        created_at: stats.birthtimeMs,
                        modified_at: stats.mtimeMs,
                        checksum,
                        mime_type: PeerGrpcService.getMimeType(filename)
                    },
                    permissions: {
                        can_download: true,
                        can_preview: true,
                        allowed_peers: [],
                        access_level: 'public'
                    }
                });
            } catch (error) {
                callback({
                    code: grpc.status.NOT_FOUND,
                    details: 'File not found'
                });
            }
        } catch (error) {
            this.logger.error('gRPC GetFileMetadata error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handlePing(call, callback) {
        try {
            const { requesting_peer_id, timestamp } = call.request;
            const currentTime = Date.now();
            const latency = currentTime - timestamp;
            
            callback(null, {
                response: {
                    success: true,
                    message: 'Pong',
                    timestamp: currentTime
                },
                timestamp: currentTime,
                latency_ms: latency,
                peer_status: {
                    status: 'healthy',
                    uptime: process.uptime(),
                    memory_usage: process.memoryUsage(),
                    cpu_usage: process.cpuUsage()
                }
            });
        } catch (error) {
            this.logger.error('gRPC Ping error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handleGetPeerStatus(call, callback) {
        try {
            const { requesting_peer_id, include_detailed } = call.request;
            
            const status = {
                status: 'healthy',
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                cpu_usage: process.cpuUsage()
            };
            
            let resources = null;
            if (include_detailed) {
                resources = {
                    available_storage: 1000000000, // 1GB placeholder
                    used_storage: 100000000, // 100MB placeholder
                    cpu_usage: 0.1,
                    memory_usage: 0.2,
                    active_connections: 1,
                    network_bandwidth: 1000000 // 1MB/s placeholder
                };
            }
            
            callback(null, {
                response: {
                    success: true,
                    message: 'Peer status retrieved',
                    timestamp: Date.now()
                },
                status,
                resources,
                active_transfers: []
            });
        } catch (error) {
            this.logger.error('gRPC GetPeerStatus error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    async handleCancelTransfer(call, callback) {
        try {
            const { transfer_id, requesting_peer_id, reason } = call.request;
            
            // Placeholder implementation - in a real system, you'd track active transfers
            this.logger.info('Transfer cancellation requested', { transfer_id, reason });
            
            callback(null, {
                response: {
                    success: true,
                    message: 'Transfer cancelled',
                    timestamp: Date.now()
                },
                cancelled: true
            });
        } catch (error) {
            this.logger.error('gRPC CancelTransfer error', { error: error.message });
            callback({
                code: grpc.status.INTERNAL,
                details: error.message
            });
        }
    }

    /**
     * Start the P2P server
     * @param {string} configPath - Path to configuration file
     */
    async start(configPath) {
        try {
            await this.initialize(configPath);
            
            this.server = this.app.listen(this.config.restPort, this.config.ip, () => {
                this.logger.info('Servidor P2P REST iniciado', {
                    port: this.config.restPort,
                    ip: this.config.ip,
                    url: `http://${this.config.ip}:${this.config.restPort}`
                });
            });

            // Start gRPC server (temporarily disabled)
            // const grpcAddress = `${this.config.ip}:${this.config.grpcPort}`;
            // this.grpcServer.bindAsync(grpcAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
            //     if (err) {
            //         this.logger.error('Failed to start gRPC server', { error: err.message });
            //         throw err;
            //     }
            //     this.grpcServer.start();
            //     this.logger.info('Servidor P2P gRPC iniciado', {
            //         port: this.config.grpcPort,
            //         ip: this.config.ip,
            //         address: grpcAddress
            //     });
            // });

            // Auto-connect to network
            setTimeout(async () => {
                try {
                    await this.bootstrapService.connectToNetwork();
                    this.bootstrapService.startPeriodicUpdates();
                    this.healthCheckService.startPeriodicChecks();
                } catch (error) {
                    this.logger.error('Auto-connect failed', { error: error.message });
                }
            }, 2000); // Wait 2 seconds before auto-connecting

            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown());
            process.on('SIGINT', () => this.shutdown());

        } catch (error) {
            this.logger.error('Error al iniciar el servidor P2P', { error: error.message });
            process.exit(1);
        }
    }

    /**
     * Shutdown the P2P server
     */
    async shutdown() {
        try {
            this.logger.info('Deteniendo el servidor P2P...');
            
            if (this.bootstrapService) {
                await this.bootstrapService.shutdown();
            }
            
            if (this.healthCheckService) {
                await this.healthCheckService.shutdown();
            }
            
            // Shutdown gRPC server
            if (this.grpcServer) {
                this.grpcServer.forceShutdown();
                this.logger.info('Servidor gRPC detenido');
            }
            
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('Servidor P2P detenido');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        } catch (error) {
            this.logger.error('Error durante el cierre', { error: error.message });
            process.exit(1);
        }
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    // Buscar el argumento --config y tomar el valor siguiente
    let configPath = './config/peer1.json';
    const configIndex = process.argv.indexOf('--config');
    if (configIndex !== -1 && process.argv[configIndex + 1]) {
        configPath = process.argv[configIndex + 1];
    }
    const p2pServer = new P2PServer();
    p2pServer.start(configPath).catch(error => {
        console.error('Error al iniciar el servidor P2P:', error);
        process.exit(1);
    });
}

module.exports = P2PServer; 