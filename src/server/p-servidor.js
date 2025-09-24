const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const configLoader = require('../utils/config-loader');
const Logger = require('../utils/logger');
const BootstrapService = require('../microservices/peer-discovery/bootstrap');
const HealthCheckService = require('../microservices/peer-discovery/health-check');

class P2PServer {
    constructor() {
        this.app = express();
        this.config = null;
        this.logger = null;
        this.bootstrapService = null;
        this.healthCheckService = null;
        this.server = null;
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
     * Setup middleware
     */
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        
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
                const fileData = { filename, content, mimeType };
                const result = await uploadService.uploadFile(fileData, { overwrite });
                const statusCode = result.success ? 201 : 400;
                res.status(statusCode).json(result);
            } catch (error) {
                transferLogger.error('Upload error', { error: error.message });
                res.status(500).json({ success: false, message: 'Upload failed' });
            }
        });

        // Endpoint de download
        this.app.get('/download/:filename', async (req, res) => {
            try {
                const { filename } = req.params;
                const result = await downloadService.downloadFile(filename);
                if (result.success) {
                    const filePath = path.join(this.config.sharedDirectory, filename);
                    try {
                        await fs.promises.access(filePath);
                        res.set({
                            'Content-Type': 'application/octet-stream',
                            'Content-Disposition': `attachment; filename="${filename}"`,
                            'Content-Length': result.size.toString()
                        });
                        const fileStream = fs.createReadStream(filePath);
                        fileStream.pipe(res);
                    } catch (error) {
                        res.status(404).json({ success: false, message: `File ${filename} not found`, error: error.message });
                    }
                } else {
                    res.status(404).json(result);
                }
            } catch (error) {
                transferLogger.error('Download error', { error: error.message });
                res.status(500).json({ success: false, message: 'Download failed' });
            }
        });

        // Connect to network
        this.app.post('/connect', async (req, res) => {
            try {
                const result = await this.bootstrapService.connectToNetwork();
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
     * Start the P2P server
     * @param {string} configPath - Path to configuration file
     */
    async start(configPath) {
        try {
            await this.initialize(configPath);
            
            this.server = this.app.listen(this.config.restPort, this.config.ip, () => {
                this.logger.info('Servidor P2P iniciado', {
                    port: this.config.restPort,
                    ip: this.config.ip,
                    url: `http://${this.config.ip}:${this.config.restPort}`
                });
            });

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