const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const ConfigLoader = require('../../utils/config-loader');
const Logger = require('../../utils/logger');
const UploadService = require('./upload.service');
const DownloadService = require('./download.service');
const swaggerSpec = require('./swagger.config');

class TransferService {
    constructor() {
        this.app = express();
        this.config = null;
        this.logger = null;
        this.uploadService = null;
        this.downloadService = null;
        this.server = null;
        this.upload = null;
    }

    /**
     * Initialize the transfer service
     */
    async initialize() {
        try {
            // Load configuration
            const configLoader = new ConfigLoader();
            this.config = await configLoader.loadConfig('./config/peer1.json'); // Default to peer1
            
            // Initialize logger
            this.logger = new Logger('transfer-service');
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'peer')) {
                throw new Error('Invalid peer configuration');
            }

            // Initialize services
            this.uploadService = new UploadService(this.logger, this.config.sharedDirectory);
            this.downloadService = new DownloadService(this.logger, this.config.sharedDirectory);

            // Setup multer for file uploads
            this.setupMulter();

            // Setup middleware
            this.setupMiddleware();
            
            // Setup routes
            this.setupRoutes();
            
            // Setup error handling
            this.setupErrorHandling();

            this.logger.info('Transfer service initialized successfully', {
                port: this.config.restPort,
                sharedDirectory: this.config.sharedDirectory
            });
        } catch (error) {
            console.error('Failed to initialize transfer service:', error.message);
            process.exit(1);
        }
    }

    /**
     * Setup multer for file uploads
     */
    setupMulter() {
        const storage = multer.memoryStorage();
        
        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 100 * 1024 * 1024, // 100MB
                files: 10 // Maximum 10 files per request
            },
            fileFilter: (req, file, cb) => {
                // Allow all file types for now, validation is done in upload service
                cb(null, true);
            }
        });
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
            allowedHeaders: ['Content-Type', 'Authorization', 'Range']
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
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const uploadStats = this.uploadService.getUploadStats();
            const downloadStats = this.downloadService.getDownloadStats();
            
            res.json({
                status: 'healthy',
                service: 'transfer-service',
                timestamp: new Date().toISOString(),
                peerId: this.config.peerId,
                uploadStats,
                downloadStats
            });
        });

        // Ping endpoint
        this.app.get('/ping', (req, res) => {
            res.json({
                message: 'pong',
                timestamp: new Date().toISOString(),
                peerId: this.config.peerId
            });
        });

        /**
         * @swagger
         * /download/{filename}:
         *   get:
         *     summary: Download a file
         *     tags: [Files]
         *     parameters:
         *       - in: path
         *         name: filename
         *         required: true
         *         schema:
         *           type: string
         *         description: The name of the file to download
         *       - in: query
         *         name: includeContent
         *         schema:
         *           type: boolean
         *           default: true
         *         description: Whether to include file content in response
         *       - in: query
         *         name: includeMetadata
         *         schema:
         *           type: boolean
         *           default: true
         *         description: Whether to include file metadata
         *       - in: query
         *         name: validateHash
         *         schema:
         *           type: boolean
         *           default: false
         *         description: Whether to validate file hash
         *     responses:
         *       200:
         *         description: File downloaded successfully
         *         content:
         *           application/octet-stream:
         *             schema:
         *               type: string
         *               format: binary
         *       404:
         *         description: File not found
         *       500:
         *         description: Internal server error
         */
        this.app.get('/download/:filename', async (req, res) => {
            try {
                const { filename } = req.params;
                const { includeContent = 'true', includeMetadata = 'true', validateHash = 'false' } = req.query;
                
                // Parse range header for partial downloads
                let range = null;
                if (req.headers.range) {
                    const rangeMatch = req.headers.range.match(/bytes=(\d+)-(\d+)?/);
                    if (rangeMatch) {
                        range = {
                            start: parseInt(rangeMatch[1]),
                            end: parseInt(rangeMatch[2]) || undefined
                        };
                    }
                }

                const options = {
                    includeContent: includeContent === 'true',
                    includeMetadata: includeMetadata === 'true',
                    validateHash: validateHash === 'true',
                    range
                };

                const result = await this.downloadService.downloadFile(filename, options);

                if (result.success) {
                    // Set appropriate headers
                    res.set({
                        'Content-Type': 'application/octet-stream',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Content-Length': result.size.toString()
                    });

                    if (range) {
                        res.set({
                            'Content-Range': `bytes ${range.start}-${range.end || result.size - 1}/${result.size}`,
                            'Accept-Ranges': 'bytes'
                        });
                        res.status(206); // Partial Content
                    }

                    if (result.content) {
                        res.send(result.content);
                    } else {
                        res.json(result);
                    }
                } else {
                    res.status(404).json(result);
                }
            } catch (error) {
                this.logger.error('Download error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Download failed'
                });
            }
        });

        /**
         * @swagger
         * /upload:
         *   post:
         *     summary: Upload a single file
         *     tags: [Files]
         *     consumes:
         *       - multipart/form-data
         *     requestBody:
         *       required: true
         *       content:
         *         multipart/form-data:
         *           schema:
         *             type: object
         *             properties:
         *               file:
         *                 type: string
         *                 format: binary
         *               overwrite:
         *                 type: boolean
         *                 default: false
         *     responses:
         *       201:
         *         description: File uploaded successfully
         *       400:
         *         description: No file provided or invalid request
         *       500:
         *         description: Upload failed
         */
        this.app.post('/upload', this.upload.single('file'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'No file provided'
                    });
                }

                const { overwrite = 'false' } = req.body;
                
                const fileData = {
                    filename: req.file.originalname,
                    content: req.file.buffer,
                    mimeType: req.file.mimetype
                };

                const options = {
                    overwrite: overwrite === 'true'
                };

                const result = await this.uploadService.uploadFile(fileData, options);
                
                const statusCode = result.success ? 201 : 400;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Upload error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Upload failed'
                });
            }
        });

        // Upload multiple files
        this.app.post('/upload/multiple', this.upload.array('files', 10), async (req, res) => {
            try {
                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'No files provided'
                    });
                }

                const { overwrite = 'false' } = req.body;
                
                const filesData = req.files.map(file => ({
                    filename: file.originalname,
                    content: file.buffer,
                    mimeType: file.mimetype
                }));

                const options = {
                    overwrite: overwrite === 'true'
                };

                const result = await this.uploadService.uploadMultipleFiles(filesData, options);
                
                const statusCode = result.success ? 201 : 400;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Multiple upload error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Multiple upload failed'
                });
            }
        });

        // Get file info
        this.app.get('/files/:filename/info', async (req, res) => {
            try {
                const { filename } = req.params;
                const result = await this.downloadService.getFileInfo(filename);
                
                const statusCode = result.success ? 200 : 404;
                res.status(statusCode).json(result);
            } catch (error) {
                this.logger.error('Get file info error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to get file info'
                });
            }
        });

        // List available files
        this.app.get('/files', async (req, res) => {
            try {
                const { 
                    includeMetadata = 'false', 
                    filter = null,
                    sortBy = 'name',
                    sortOrder = 'asc'
                } = req.query;

                const options = {
                    includeMetadata: includeMetadata === 'true',
                    filter: filter ? (file) => file.filename.toLowerCase().includes(filter.toLowerCase()) : null,
                    sortBy,
                    sortOrder
                };

                const result = await this.downloadService.listAvailableFiles(options);
                
                res.json(result);
            } catch (error) {
                this.logger.error('List files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to list files'
                });
            }
        });

        // Download multiple files (as ZIP)
        this.app.post('/download/multiple', async (req, res) => {
            try {
                const { filenames, includeContent = true } = req.body;
                
                if (!Array.isArray(filenames) || filenames.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Filenames array is required'
                    });
                }

                const options = { includeContent };
                const result = await this.downloadService.downloadMultipleFiles(filenames, options);
                
                res.json(result);
            } catch (error) {
                this.logger.error('Multiple download error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Multiple download failed'
                });
            }
        });

        // Get upload/download statistics
        this.app.get('/stats', async (req, res) => {
            try {
                const uploadStats = this.uploadService.getUploadStats();
                const downloadStats = this.downloadService.getDownloadStats();
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    uploadStats,
                    downloadStats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                this.logger.error('Get stats error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to get statistics'
                });
            }
        });

        // Clear download cache
        this.app.post('/cache/clear', async (req, res) => {
            try {
                this.downloadService.clearCache();
                
                res.json({
                    success: true,
                    message: 'Download cache cleared'
                });
            } catch (error) {
                this.logger.error('Clear cache error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to clear cache'
                });
            }
        });

        // Cleanup old backups
        this.app.post('/cleanup/backups', async (req, res) => {
            try {
                const { maxAge = 24 * 60 * 60 * 1000 } = req.body; // 24 hours default
                
                const result = await this.uploadService.cleanupOldBackups(maxAge);
                
                res.json(result);
            } catch (error) {
                this.logger.error('Cleanup backups error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to cleanup backups'
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
        // Multer error handling
        this.app.use((error, req, res, next) => {
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: 'File too large'
                    });
                } else if (error.code === 'LIMIT_FILE_COUNT') {
                    return res.status(400).json({
                        success: false,
                        message: 'Too many files'
                    });
                }
            }
            next(error);
        });

        // General error handling
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
     * Start the transfer service
     */
    async start() {
        try {
            await this.initialize();
            
            this.server = this.app.listen(this.config.restPort, this.config.ip, () => {
                this.logger.info('Transfer service started', {
                    port: this.config.restPort,
                    ip: this.config.ip,
                    url: `http://${this.config.ip}:${this.config.restPort}`
                });
            });

            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown());
            process.on('SIGINT', () => this.shutdown());

        } catch (error) {
            this.logger.error('Failed to start transfer service', { error: error.message });
            process.exit(1);
        }
    }

    /**
     * Shutdown the transfer service
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down transfer service...');
            
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('Transfer service stopped');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        } catch (error) {
            this.logger.error('Error during shutdown', { error: error.message });
            process.exit(1);
        }
    }
}

// Start the service if this file is run directly
if (require.main === module) {
    const transferService = new TransferService();
    transferService.start().catch(error => {
        console.error('Failed to start transfer service:', error);
        process.exit(1);
    });
}

module.exports = TransferService;
