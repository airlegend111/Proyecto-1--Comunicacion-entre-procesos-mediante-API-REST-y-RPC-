const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const ConfigLoader = require('../../utils/config-loader');
const Logger = require('../../utils/logger');
const RegistryService = require('./registry.service');
const FileIndexService = require('./file-index.service');
const swaggerSpec = require('./swagger.config');

class DirectoryService {
    constructor() {
        this.app = express();
        this.config = null;
        this.logger = null;
        this.registryService = null;
        this.fileIndexService = null;
        this.server = null;
    }

    /**
     * Initialize the directory service
     */
    async initialize() {
        try {
            // Load configuration
            const configLoader = new ConfigLoader();
            this.config = await configLoader.loadConfig('./config/directory-server.json');
            
            // Initialize logger
            this.logger = new Logger('directory-service');
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'directory')) {
                throw new Error('Invalid directory server configuration');
            }

            // Initialize services
            this.registryService = new RegistryService(this.logger, this.config.registryFile);
            this.fileIndexService = new FileIndexService(this.logger, this.registryService);

            // Setup middleware
            this.setupMiddleware();
            
            // Setup routes
            this.setupRoutes();
            
            // Setup error handling
            this.setupErrorHandling();

            this.logger.info('Servicio de directorio inicializado exitosamente', {
                port: this.config.port,
                registryFile: this.config.registryFile
            });
        } catch (error) {
            console.error('Error al inicializar el servicio de directorio:', error.message);
            process.exit(1);
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

        // Swagger UI middleware
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        
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
        /**
         * @swagger
         * /health:
         *   get:
         *     summary: Check the health status of the service
         *     tags: [Health]
         *     responses:
         *       200:
         *         description: Service is healthy
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   example: healthy
         *                 service:
         *                   type: string
         *                   example: directory-service
         *                 timestamp:
         *                   type: string
         *                   format: date-time
         *                 stats:
         *                   type: object
         */
        this.app.get('/health', (req, res) => {
            const stats = this.registryService.getStats();
            res.json({
                status: 'healthy',
                service: 'directory-service',
                timestamp: new Date().toISOString(),
                stats
            });
        });

        // Ping endpoint
        this.app.get('/ping', (req, res) => {
            res.json({
                message: 'pong',
                timestamp: new Date().toISOString()
            });
        });

        /**
         * @swagger
         * /register:
         *   post:
         *     summary: Register a new peer in the network
         *     tags: [Peers]
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - peerId
         *               - ip
         *               - restPort
         *               - grpcPort
         *             properties:
         *               peerId:
         *                 type: string
         *                 description: Unique identifier for the peer
         *               ip:
         *                 type: string
         *                 description: IP address of the peer
         *               restPort:
         *                 type: number
         *                 description: REST API port
         *               grpcPort:
         *                 type: number
         *                 description: gRPC port
         *     responses:
         *       201:
         *         description: Peer successfully registered
         *       400:
         *         description: Invalid request body
         *       500:
         *         description: Internal server error
         */
        this.app.post('/register', async (req, res) => {
            try {
                const result = await this.registryService.registerPeer(req.body);
                const statusCode = result.success ? 201 : 400;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Registration error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        });

        this.app.get('/peers', async (req, res) => {
            try {
                const result = await this.registryService.getPeers();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Get peers error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    peers: []
                });
            }
        });

        this.app.delete('/unregister/:peerId', async (req, res) => {
            try {
                const { peerId } = req.params;
                const result = await this.registryService.unregisterPeer(peerId);
                const statusCode = result.success ? 200 : 404;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Unregistration error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        });

        /**
         * @swagger
         * /search/{filename}:
         *   get:
         *     summary: Search for a file across all peers
         *     tags: [Files]
         *     parameters:
         *       - in: path
         *         name: filename
         *         required: true
         *         schema:
         *           type: string
         *         description: Name of the file to search for
         *     responses:
         *       200:
         *         description: File search results
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                 peers:
         *                   type: array
         *                   items:
         *                     type: object
         *                     properties:
         *                       peerId:
         *                         type: string
         *                       url:
         *                         type: string
         *       500:
         *         description: Internal server error
         */
        this.app.get('/search/:filename', async (req, res) => {
            try {
                const { filename } = req.params;
                const result = await this.fileIndexService.searchFiles(filename);
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('File search error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    filename: req.params.filename,
                    peers: []
                });
            }
        });

        this.app.get('/files', async (req, res) => {
            try {
                const result = await this.fileIndexService.getAllFiles();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Get all files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    files: []
                });
            }
        });

        this.app.get('/files/peer/:peerId', async (req, res) => {
            try {
                const { peerId } = req.params;
                const result = await this.fileIndexService.getFilesByPeer(peerId);
                const statusCode = result.success ? 200 : 404;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Get files by peer error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    peerId: req.params.peerId,
                    files: []
                });
            }
        });

        this.app.get('/stats', async (req, res) => {
            try {
                const result = await this.fileIndexService.getFileStats();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Get stats error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    stats: null
                });
            }
        });

        this.app.post('/cleanup', async (req, res) => {
            try {
                const result = await this.fileIndexService.cleanupOrphanedFiles();
                const statusCode = result.success ? 200 : 500;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Cleanup error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
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
     * Start the directory service
     */
    async start() {
        try {
            await this.initialize();
            
            this.server = this.app.listen(this.config.port, this.config.ip, () => {
                this.logger.info('Servicio de directorio iniciado', {
                    port: this.config.port,
                    ip: this.config.ip,
                    url: `http://${this.config.ip}:${this.config.port}`
                });
            });

            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown());
            process.on('SIGINT', () => this.shutdown());

        } catch (error) {
            this.logger.error('Error al iniciar el servicio de directorio', { error: error.message });
            process.exit(1);
        }
    }

    /**
     * Shutdown the directory service
     */
    async shutdown() {
        try {
            this.logger.info('Deteniendo el servicio de directorio...');
            
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('Servicio de directorio detenido');
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

// Start the service if this file is run directly
if (require.main === module) {
    const directoryService = new DirectoryService();
    directoryService.start().catch(error => {
        console.error('Error al iniciar el servicio de directorio:', error);
        process.exit(1);
    });
}

module.exports = DirectoryService;
