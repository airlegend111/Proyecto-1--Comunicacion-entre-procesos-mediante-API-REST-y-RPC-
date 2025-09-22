const ConfigLoader = require('../../utils/config-loader');
const Logger = require('../../utils/logger');
const NetworkUtils = require('../../utils/network');

class BootstrapService {
    constructor() {
        this.config = null;
        this.logger = null;
        this.networkUtils = null;
        this.isRegistered = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds
    }

    /**
     * Initialize the bootstrap service
     * @param {string} configPath - Path to configuration file
     */
    async initialize(configPath) {
        try {
            // Load configuration
            const configLoader = new ConfigLoader();
            this.config = await configLoader.loadConfig(configPath);
            
            // Initialize logger
            this.logger = new Logger(`bootstrap-${this.config.peerId}`);
            
            // Initialize network utils
            this.networkUtils = new NetworkUtils(this.logger);
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'peer')) {
                throw new Error('Invalid peer configuration');
            }

            this.logger.info('Bootstrap service initialized', {
                peerId: this.config.peerId,
                restPort: this.config.restPort,
                directoryServer: this.config.directoryServer
            });
        } catch (error) {
            console.error('Failed to initialize bootstrap service:', error.message);
            throw error;
        }
    }

    /**
     * Connect to the P2P network
     * @returns {Promise<Object>} Connection result
     */
    async connectToNetwork() {
        try {
            this.logger.info('Attempting to connect to P2P network');
            
            // Check if directory server is available
            const isDirectoryAvailable = await this.networkUtils.checkHealth(
                this.config.directoryServer
            );
            
            if (!isDirectoryAvailable) {
                throw new Error('Directory server is not available');
            }

            // Register with directory server
            const registrationResult = await this.registerWithDirectoryServer();
            
            if (registrationResult.success) {
                this.isRegistered = true;
                this.retryCount = 0;
                
                this.logger.info('Successfully connected to P2P network', {
                    peerId: this.config.peerId,
                    directoryServer: this.config.directoryServer
                });
                
                return {
                    success: true,
                    message: 'Connected to P2P network',
                    peerId: this.config.peerId
                };
            } else {
                throw new Error(registrationResult.message || 'Registration failed');
            }
        } catch (error) {
            this.logger.error('Failed to connect to P2P network', { 
                error: error.message,
                retryCount: this.retryCount
            });
            
            return {
                success: false,
                message: error.message,
                retryCount: this.retryCount
            };
        }
    }

    /**
     * Register with directory server
     * @returns {Promise<Object>} Registration result
     */
    async registerWithDirectoryServer() {
        try {
            // Get current files from shared directory
            const files = await this.getCurrentFiles();
            
            const peerData = {
                peerId: this.config.peerId,
                ip: this.config.ip,
                restPort: this.config.restPort,
                grpcPort: this.config.grpcPort,
                files: files,
                friendPrimary: this.config.friendPrimary,
                friendBackup: this.config.friendBackup,
                status: 'online',
                lastSeen: new Date().toISOString()
            };

            this.logger.info('Registering with directory server', {
                peerId: this.config.peerId,
                fileCount: files.length
            });

            const result = await this.networkUtils.registerPeer(
                this.config.directoryServer,
                peerData
            );

            if (result.success) {
                this.logger.info('Successfully registered with directory server');
            } else {
                this.logger.error('Failed to register with directory server', {
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Registration error', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Unregister from directory server
     * @returns {Promise<Object>} Unregistration result
     */
    async unregisterFromDirectoryServer() {
        try {
            if (!this.isRegistered) {
                return {
                    success: true,
                    message: 'Not registered, nothing to unregister'
                };
            }

            this.logger.info('Unregistering from directory server', {
                peerId: this.config.peerId
            });

            const result = await this.networkUtils.unregisterPeer(
                this.config.directoryServer,
                this.config.peerId
            );

            if (result.success) {
                this.isRegistered = false;
                this.logger.info('Successfully unregistered from directory server');
            } else {
                this.logger.error('Failed to unregister from directory server', {
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Unregistration error', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Get current files from shared directory
     * @returns {Promise<Array>} List of files
     */
    async getCurrentFiles() {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            const files = [];
            const scanDirectory = async (dirPath, relativePath = '') => {
                try {
                    const entries = await fs.readdir(dirPath, { withFileTypes: true });
                    
                    for (const entry of entries) {
                        const fullPath = path.join(dirPath, entry.name);
                        const relativeFilePath = path.join(relativePath, entry.name);
                        
                        if (entry.isDirectory()) {
                            await scanDirectory(fullPath, relativeFilePath);
                        } else if (entry.isFile()) {
                            files.push(entry.name);
                        }
                    }
                } catch (error) {
                    this.logger.warn('Failed to scan directory', { 
                        directory: dirPath, 
                        error: error.message 
                    });
                }
            };

            await scanDirectory(this.config.sharedDirectory);
            
            this.logger.debug('Current files retrieved', { 
                fileCount: files.length,
                files: files.slice(0, 10) // Log first 10 files
            });
            
            return files;
        } catch (error) {
            this.logger.error('Failed to get current files', { error: error.message });
            return [];
        }
    }

    /**
     * Update registration with current files
     * @returns {Promise<Object>} Update result
     */
    async updateRegistration() {
        try {
            if (!this.isRegistered) {
                return await this.connectToNetwork();
            }

            const files = await this.getCurrentFiles();
            
            const peerData = {
                peerId: this.config.peerId,
                ip: this.config.ip,
                restPort: this.config.restPort,
                grpcPort: this.config.grpcPort,
                files: files,
                friendPrimary: this.config.friendPrimary,
                friendBackup: this.config.friendBackup,
                status: 'online',
                lastSeen: new Date().toISOString()
            };

            this.logger.info('Updating registration', {
                peerId: this.config.peerId,
                fileCount: files.length
            });

            const result = await this.networkUtils.registerPeer(
                this.config.directoryServer,
                peerData
            );

            if (result.success) {
                this.logger.info('Registration updated successfully');
            } else {
                this.logger.error('Failed to update registration', {
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Update registration error', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Get peer list from directory server
     * @returns {Promise<Object>} Peer list
     */
    async getPeerList() {
        try {
            const result = await this.networkUtils.getPeers(this.config.directoryServer);
            
            if (result.success) {
                this.logger.info('Retrieved peer list', { 
                    peerCount: result.data.count 
                });
            } else {
                this.logger.error('Failed to get peer list', {
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Get peer list error', { error: error.message });
            return {
                success: false,
                message: error.message,
                peers: []
            };
        }
    }

    /**
     * Search for files in the network
     * @param {string} filename - Filename to search
     * @returns {Promise<Object>} Search results
     */
    async searchFiles(filename) {
        try {
            const result = await this.networkUtils.searchFiles(
                this.config.directoryServer,
                filename
            );
            
            if (result.success) {
                this.logger.info('File search completed', {
                    filename,
                    resultCount: result.data.count
                });
            } else {
                this.logger.error('File search failed', {
                    filename,
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Search files error', { error: error.message });
            return {
                success: false,
                message: error.message,
                filename,
                peers: []
            };
        }
    }

    /**
     * Retry connection with exponential backoff
     * @returns {Promise<Object>} Connection result
     */
    async retryConnection() {
        if (this.retryCount >= this.maxRetries) {
            this.logger.error('Max retries exceeded', { 
                maxRetries: this.maxRetries,
                retryCount: this.retryCount
            });
            return {
                success: false,
                message: 'Max retries exceeded'
            };
        }

        this.retryCount++;
        const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
        
        this.logger.info('Retrying connection', {
            attempt: this.retryCount,
            delay: `${delay}ms`
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        
        return await this.connectToNetwork();
    }

    /**
     * Get connection status
     * @returns {Object} Connection status
     */
    getStatus() {
        return {
            isRegistered: this.isRegistered,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            peerId: this.config?.peerId,
            directoryServer: this.config?.directoryServer
        };
    }

    /**
     * Start periodic registration updates
     * @param {number} interval - Update interval in milliseconds
     */
    startPeriodicUpdates(interval = 30000) { // 30 seconds default
        this.logger.info('Starting periodic registration updates', { interval });
        
        this.updateInterval = setInterval(async () => {
            try {
                await this.updateRegistration();
            } catch (error) {
                this.logger.error('Periodic update failed', { error: error.message });
            }
        }, interval);
    }

    /**
     * Stop periodic registration updates
     */
    stopPeriodicUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            this.logger.info('Periodic registration updates stopped');
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down bootstrap service...');
            
            this.stopPeriodicUpdates();
            
            if (this.isRegistered) {
                await this.unregisterFromDirectoryServer();
            }
            
            this.logger.info('Bootstrap service shutdown complete');
        } catch (error) {
            this.logger.error('Error during shutdown', { error: error.message });
        }
    }
}

module.exports = BootstrapService;
