const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const ConfigLoader = require('../../utils/config-loader');
const Logger = require('../../utils/logger');
const FileScanner = require('./file-scanners');

class FileQueryService {
    constructor() {
        this.app = express();
        this.config = null;
        this.logger = null;
        this.fileScanner = null;
        this.server = null;
        this.watcher = null;
    }

    /**
     * Initialize the file query service
     */
    async initialize() {
        try {
            // Load configuration
            const configLoader = new ConfigLoader();
            this.config = await configLoader.loadConfig('./config/peer1.json'); // Default to peer1
            
            // Initialize logger
            this.logger = new Logger('file-query-service');
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'peer')) {
                throw new Error('Invalid peer configuration');
            }

            // Initialize file scanner
            this.fileScanner = new FileScanner(this.logger, this.config.sharedDirectory);

            // Setup middleware
            this.setupMiddleware();
            
            // Setup routes
            this.setupRoutes();
            
            // Setup error handling
            this.setupErrorHandling();

            // Initial directory scan
            await this.fileScanner.scanDirectory();

            this.logger.info('File query service initialized successfully', {
                port: this.config.restPort,
                sharedDirectory: this.config.sharedDirectory
            });
        } catch (error) {
            console.error('Failed to initialize file query service:', error.message);
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
            const stats = this.fileScanner.getStats();
            res.json({
                status: 'healthy',
                service: 'file-query-service',
                timestamp: new Date().toISOString(),
                peerId: this.config.peerId,
                stats
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

        // Get all files
        this.app.get('/files', async (req, res) => {
            try {
                const files = this.fileScanner.getFiles();
                const stats = this.fileScanner.getStats();
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    files: files.map(file => ({
                        name: file.name,
                        path: file.path,
                        size: file.size,
                        modified: file.modified,
                        created: file.created,
                        extension: file.extension
                    })),
                    count: files.length,
                    stats
                });
            } catch (error) {
                this.logger.error('Get files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    files: []
                });
            }
        });

        // Refresh files (rescan directory)
        this.app.post('/refresh', async (req, res) => {
            try {
                await this.fileScanner.scanDirectory();
                const files = this.fileScanner.getFiles();
                const stats = this.fileScanner.getStats();
                
                this.logger.info('Files refreshed', { fileCount: files.length });
                
                res.json({
                    success: true,
                    message: 'Files refreshed successfully',
                    peerId: this.config.peerId,
                    files: files.map(file => ({
                        name: file.name,
                        path: file.path,
                        size: file.size,
                        modified: file.modified,
                        created: file.created,
                        extension: file.extension
                    })),
                    count: files.length,
                    stats
                });
            } catch (error) {
                this.logger.error('Refresh files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to refresh files'
                });
            }
        });

        // Search files by name
        this.app.get('/files/search/:pattern', async (req, res) => {
            try {
                const { pattern } = req.params;
                const files = this.fileScanner.searchFiles(pattern);
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    searchPattern: pattern,
                    files: files.map(file => ({
                        name: file.name,
                        path: file.path,
                        size: file.size,
                        modified: file.modified,
                        created: file.created,
                        extension: file.extension
                    })),
                    count: files.length
                });
            } catch (error) {
                this.logger.error('Search files error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Search failed',
                    files: []
                });
            }
        });

        // Get files by extension
        this.app.get('/files/extension/:ext', async (req, res) => {
            try {
                const { ext } = req.params;
                const files = this.fileScanner.getFilesByExtension(ext);
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    extension: ext,
                    files: files.map(file => ({
                        name: file.name,
                        path: file.path,
                        size: file.size,
                        modified: file.modified,
                        created: file.created,
                        extension: file.extension
                    })),
                    count: files.length
                });
            } catch (error) {
                this.logger.error('Get files by extension error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to get files by extension',
                    files: []
                });
            }
        });

        // Get specific file info
        this.app.get('/files/:filename', async (req, res) => {
            try {
                const { filename } = req.params;
                const file = this.fileScanner.getFile(filename);
                
                if (!file) {
                    return res.status(404).json({
                        success: false,
                        message: 'File not found',
                        filename
                    });
                }

                // Get additional file content info
                const contentInfo = await this.fileScanner.getFileContentInfo(filename);
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    file: {
                        name: file.name,
                        path: file.path,
                        size: file.size,
                        modified: file.modified,
                        created: file.created,
                        extension: file.extension,
                        mimeType: contentInfo.mimeType,
                        isText: contentInfo.isText
                    }
                });
            } catch (error) {
                this.logger.error('Get file info error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to get file info'
                });
            }
        });

        // Validate file access
        this.app.get('/files/:filename/validate', async (req, res) => {
            try {
                const { filename } = req.params;
                const isValid = await this.fileScanner.validateFileAccess(filename);
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    filename,
                    accessible: isValid
                });
            } catch (error) {
                this.logger.error('File validation error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'File validation failed'
                });
            }
        });

        // Get file statistics
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = this.fileScanner.getStats();
                
                res.json({
                    success: true,
                    peerId: this.config.peerId,
                    stats
                });
            } catch (error) {
                this.logger.error('Get stats error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to get statistics'
                });
            }
        });

        // Start/stop directory watching
        this.app.post('/watch/start', async (req, res) => {
            try {
                if (this.watcher) {
                    return res.json({
                        success: true,
                        message: 'Directory watcher already running'
                    });
                }

                this.watcher = await this.fileScanner.watchDirectory((files) => {
                    this.logger.info('Directory changed, files updated', { 
                        fileCount: files.length 
                    });
                });

                res.json({
                    success: true,
                    message: 'Directory watcher started'
                });
            } catch (error) {
                this.logger.error('Start watcher error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to start directory watcher'
                });
            }
        });

        this.app.post('/watch/stop', async (req, res) => {
            try {
                if (this.watcher) {
                    this.fileScanner.stopWatching(this.watcher);
                    this.watcher = null;
                }

                res.json({
                    success: true,
                    message: 'Directory watcher stopped'
                });
            } catch (error) {
                this.logger.error('Stop watcher error', { error: error.message });
                res.status(500).json({
                    success: false,
                    message: 'Failed to stop directory watcher'
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
     * Start the file query service
     */
    async start() {
        try {
            await this.initialize();
            
            this.server = this.app.listen(this.config.restPort, this.config.ip, () => {
                this.logger.info('File query service started', {
                    port: this.config.restPort,
                    ip: this.config.ip,
                    url: `http://${this.config.ip}:${this.config.restPort}`
                });
            });

            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown());
            process.on('SIGINT', () => this.shutdown());

        } catch (error) {
            this.logger.error('Failed to start file query service', { error: error.message });
            process.exit(1);
        }
    }

    /**
     * Shutdown the file query service
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down file query service...');
            
            if (this.watcher) {
                this.fileScanner.stopWatching(this.watcher);
                this.watcher = null;
            }
            
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('File query service stopped');
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
    const fileQueryService = new FileQueryService();
    fileQueryService.start().catch(error => {
        console.error('Failed to start file query service:', error);
        process.exit(1);
    });
}

module.exports = FileQueryService;
