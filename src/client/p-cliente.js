const ConfigLoader = require('../utils/config-loader');
const Logger = require('../utils/logger');
const NetworkUtils = require('../utils/network');

class P2PClient {
    constructor() {
        this.config = null;
        this.logger = null;
        this.networkUtils = null;
        this.isConnected = false;
    }

    /**
     * Initialize the P2P client
     * @param {string} configPath - Path to configuration file
     */
    async initialize(configPath) {
        try {
            // Load configuration
            const configLoader = new ConfigLoader();
            this.config = await configLoader.loadConfig(configPath);
            
            // Initialize logger
            this.logger = new Logger(`p2p-client-${this.config.peerId}`);
            
            // Initialize network utils
            this.networkUtils = new NetworkUtils(this.logger);
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'peer')) {
                throw new Error('Invalid peer configuration');
            }

            this.logger.info('P2P client initialized', {
                peerId: this.config.peerId,
                directoryServer: this.config.directoryServer
            });
        } catch (error) {
            console.error('Failed to initialize P2P client:', error.message);
            throw error;
        }
    }

    /**
     * Connect to the P2P network
     * @returns {Promise<Object>} Connection result
     */
    async connect() {
        try {
            this.logger.info('Connecting to P2P network...');
            
            // Check if directory server is available
            const isDirectoryAvailable = await this.networkUtils.checkHealth(
                this.config.directoryServer
            );
            
            if (!isDirectoryAvailable) {
                throw new Error('Directory server is not available');
            }

            // Get current files from shared directory
            const files = await this.getCurrentFiles();
            
            // Register with directory server
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

            const result = await this.networkUtils.registerPeer(
                this.config.directoryServer,
                peerData
            );

            if (result.success) {
                this.isConnected = true;
                this.logger.info('Successfully connected to P2P network');
            } else {
                this.logger.error('Failed to connect to P2P network', {
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Connection failed', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Disconnect from the P2P network
     * @returns {Promise<Object>} Disconnection result
     */
    async disconnect() {
        try {
            if (!this.isConnected) {
                return {
                    success: true,
                    message: 'Not connected, nothing to disconnect'
                };
            }

            this.logger.info('Disconnecting from P2P network...');
            
            const result = await this.networkUtils.unregisterPeer(
                this.config.directoryServer,
                this.config.peerId
            );

            if (result.success) {
                this.isConnected = false;
                this.logger.info('Successfully disconnected from P2P network');
            } else {
                this.logger.error('Failed to disconnect from P2P network', {
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Disconnection failed', { error: error.message });
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
    async getPeers() {
        try {
            this.logger.info('Getting peer list...');
            
            const result = await this.networkUtils.getPeers(this.config.directoryServer);
            
            if (result.success) {
                this.logger.info('Peer list retrieved', { 
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
            this.logger.error('Get peers failed', { error: error.message });
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
            this.logger.info('Searching for files', { filename });
            
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
            this.logger.error('Search files failed', { error: error.message });
            return {
                success: false,
                message: error.message,
                filename,
                peers: []
            };
        }
    }

    /**
     * Download file from a peer
     * @param {string} peerUrl - Peer URL
     * @param {string} filename - Filename to download
     * @returns {Promise<Object>} Download result
     */
    async downloadFile(peerUrl, filename) {
        try {
            this.logger.info('Downloading file', { peerUrl, filename });
            
            const result = await this.networkUtils.downloadFile(peerUrl, filename);
            
            if (result.success) {
                this.logger.info('File download completed', { filename });
            } else {
                this.logger.error('File download failed', {
                    filename,
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Download file failed', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Upload file to a peer
     * @param {string} peerUrl - Peer URL
     * @param {Object} fileData - File data
     * @returns {Promise<Object>} Upload result
     */
    async uploadFile(peerUrl, fileData) {
        try {
            this.logger.info('Uploading file', { peerUrl, filename: fileData.filename });
            
            const result = await this.networkUtils.uploadFile(peerUrl, fileData);
            
            if (result.success) {
                this.logger.info('File upload completed', { filename: fileData.filename });
            } else {
                this.logger.error('File upload failed', {
                    filename: fileData.filename,
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Upload file failed', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Get files from a peer
     * @param {string} peerUrl - Peer URL
     * @returns {Promise<Object>} Files list
     */
    async getPeerFiles(peerUrl) {
        try {
            this.logger.info('Getting files from peer', { peerUrl });
            
            const result = await this.networkUtils.getPeerFiles(peerUrl);
            
            if (result.success) {
                this.logger.info('Peer files retrieved', { 
                    peerUrl,
                    fileCount: result.data.count 
                });
            } else {
                this.logger.error('Failed to get peer files', {
                    peerUrl,
                    error: result.error,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Get peer files failed', { error: error.message });
            return {
                success: false,
                message: error.message,
                files: []
            };
        }
    }

    /**
     * Ping a peer
     * @param {string} peerUrl - Peer URL
     * @returns {Promise<Object>} Ping result
     */
    async pingPeer(peerUrl) {
        try {
            this.logger.info('Pinging peer', { peerUrl });
            
            const result = await this.networkUtils.pingPeer(peerUrl);
            
            this.logger.info('Peer ping completed', {
                peerUrl,
                success: result.success,
                responseTime: result.duration
            });
            
            return result;
        } catch (error) {
            this.logger.error('Ping peer failed', { error: error.message });
            return {
                success: false,
                error: error.message,
                duration: 0
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
     * Get connection status
     * @returns {Object} Connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            peerId: this.config?.peerId,
            directoryServer: this.config?.directoryServer,
            restPort: this.config?.restPort,
            grpcPort: this.config?.grpcPort
        };
    }

    /**
     * Interactive command line interface
     */
    async startCLI() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `P2P-Client[${this.config.peerId}]> `
        });

        console.log('\n=== P2P File Sharing Client ===');
        console.log('Available commands:');
        console.log('  connect     - Connect to P2P network');
        console.log('  disconnect  - Disconnect from P2P network');
        console.log('  peers       - List all peers');
        console.log('  search <filename> - Search for files');
        console.log('  download <peerUrl> <filename> - Download file from peer');
        console.log('  upload <peerUrl> <filename> - Upload file to peer');
        console.log('  files <peerUrl> - Get files from peer');
        console.log('  ping <peerUrl> - Ping a peer');
        console.log('  status      - Show connection status');
        console.log('  help        - Show this help');
        console.log('  exit        - Exit the client\n');

        rl.prompt();

        rl.on('line', async (line) => {
            const [command, ...args] = line.trim().split(' ');

            try {
                switch (command.toLowerCase()) {
                    case 'connect':
                        const connectResult = await this.connect();
                        console.log(JSON.stringify(connectResult, null, 2));
                        break;

                    case 'disconnect':
                        const disconnectResult = await this.disconnect();
                        console.log(JSON.stringify(disconnectResult, null, 2));
                        break;

                    case 'peers':
                        const peersResult = await this.getPeers();
                        console.log(JSON.stringify(peersResult, null, 2));
                        break;

                    case 'search':
                        if (args.length === 0) {
                            console.log('Usage: search <filename>');
                            break;
                        }
                        const searchResult = await this.searchFiles(args[0]);
                        console.log(JSON.stringify(searchResult, null, 2));
                        break;

                    case 'download':
                        if (args.length < 2) {
                            console.log('Usage: download <peerUrl> <filename>');
                            break;
                        }
                        const downloadResult = await this.downloadFile(args[0], args[1]);
                        console.log(JSON.stringify(downloadResult, null, 2));
                        break;

                    case 'upload':
                        if (args.length < 2) {
                            console.log('Usage: upload <peerUrl> <filename>');
                            break;
                        }
                        // For demo purposes, create a simple file
                        const fileData = {
                            filename: args[1],
                            content: `Hello from ${this.config.peerId}!`,
                            mimeType: 'text/plain'
                        };
                        const uploadResult = await this.uploadFile(args[0], fileData);
                        console.log(JSON.stringify(uploadResult, null, 2));
                        break;

                    case 'files':
                        if (args.length === 0) {
                            console.log('Usage: files <peerUrl>');
                            break;
                        }
                        const filesResult = await this.getPeerFiles(args[0]);
                        console.log(JSON.stringify(filesResult, null, 2));
                        break;

                    case 'ping':
                        if (args.length === 0) {
                            console.log('Usage: ping <peerUrl>');
                            break;
                        }
                        const pingResult = await this.pingPeer(args[0]);
                        console.log(JSON.stringify(pingResult, null, 2));
                        break;

                    case 'status':
                        console.log(JSON.stringify(this.getStatus(), null, 2));
                        break;

                    case 'help':
                        console.log('Available commands: connect, disconnect, peers, search, download, upload, files, ping, status, help, exit');
                        break;

                    case 'exit':
                        console.log('Goodbye!');
                        rl.close();
                        process.exit(0);
                        break;

                    default:
                        console.log('Unknown command. Type "help" for available commands.');
                }
            } catch (error) {
                console.error('Command error:', error.message);
            }

            rl.prompt();
        });

        rl.on('close', async () => {
            if (this.isConnected) {
                await this.disconnect();
            }
            process.exit(0);
        });
    }
}

// Start the client if this file is run directly
if (require.main === module) {
    const configPath = process.argv[2] || './config/peer1.json';
    const p2pClient = new P2PClient();
    
    p2pClient.initialize(configPath)
        .then(() => p2pClient.startCLI())
        .catch(error => {
            console.error('Failed to start P2P client:', error);
            process.exit(1);
        });
}

module.exports = P2PClient;
