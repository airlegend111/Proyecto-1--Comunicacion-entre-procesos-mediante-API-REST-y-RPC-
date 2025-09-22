const fs = require('fs').promises;
const path = require('path');

class RegistryService {
    constructor(logger, registryFile) {
        this.logger = logger;
        this.registryFile = registryFile;
        this.peers = new Map();
        this.fileIndex = new Map();
        this.loadRegistry();
    }

    /**
     * Load registry from file
     */
    async loadRegistry() {
        try {
            const registryPath = path.resolve(this.registryFile);
            const data = await fs.readFile(registryPath, 'utf8');
            const registry = JSON.parse(data);
            
            this.peers = new Map(registry.peers || []);
            this.fileIndex = new Map(registry.fileIndex || []);
            
            this.logger.info('Registry loaded successfully', {
                peerCount: this.peers.size,
                fileCount: this.fileIndex.size
            });
        } catch (error) {
            this.logger.warn('Registry file not found, creating new registry', { error: error.message });
            await this.saveRegistry();
        }
    }

    /**
     * Save registry to file
     */
    async saveRegistry() {
        try {
            const registryPath = path.resolve(this.registryFile);
            const registryDir = path.dirname(registryPath);
            
            // Ensure directory exists
            await fs.mkdir(registryDir, { recursive: true });
            
            const registry = {
                peers: Array.from(this.peers.entries()),
                fileIndex: Array.from(this.fileIndex.entries()),
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
            this.logger.debug('Registry saved successfully');
        } catch (error) {
            this.logger.error('Failed to save registry', { error: error.message });
            throw error;
        }
    }

    /**
     * Register a new peer
     * @param {Object} peerData - Peer registration data
     * @returns {Object} Registration result
     */
    async registerPeer(peerData) {
        try {
            const { peerId, ip, restPort, files = [] } = peerData;
            
            if (!peerId || !ip || !restPort) {
                throw new Error('Missing required fields: peerId, ip, restPort');
            }

            const peerInfo = {
                peerId,
                ip,
                restPort,
                files: files || [],
                status: 'online',
                registeredAt: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            };

            this.peers.set(peerId, peerInfo);
            
            // Update file index
            await this.updateFileIndex(peerId, files);
            
            await this.saveRegistry();
            
            this.logger.info('Peer registered successfully', { peerId, ip, restPort });
            
            return {
                success: true,
                message: 'Peer registered successfully',
                peer: peerInfo
            };
        } catch (error) {
            this.logger.error('Failed to register peer', { error: error.message, peerData });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Unregister a peer
     * @param {string} peerId - Peer ID to unregister
     * @returns {Object} Unregistration result
     */
    async unregisterPeer(peerId) {
        try {
            if (!this.peers.has(peerId)) {
                throw new Error(`Peer ${peerId} not found`);
            }

            const peer = this.peers.get(peerId);
            
            // Remove files from index
            for (const filename of peer.files) {
                const filePeers = this.fileIndex.get(filename) || [];
                const updatedPeers = filePeers.filter(p => p.peerId !== peerId);
                
                if (updatedPeers.length === 0) {
                    this.fileIndex.delete(filename);
                } else {
                    this.fileIndex.set(filename, updatedPeers);
                }
            }

            this.peers.delete(peerId);
            await this.saveRegistry();
            
            this.logger.info('Peer unregistered successfully', { peerId });
            
            return {
                success: true,
                message: 'Peer unregistered successfully'
            };
        } catch (error) {
            this.logger.error('Failed to unregister peer', { error: error.message, peerId });
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Get all registered peers
     * @returns {Object} Peers list
     */
    async getPeers() {
        try {
            const peersList = Array.from(this.peers.values()).map(peer => ({
                peerId: peer.peerId,
                ip: peer.ip,
                restPort: peer.restPort,
                files: peer.files,
                status: peer.status,
                registeredAt: peer.registeredAt,
                lastSeen: peer.lastSeen
            }));

            this.logger.debug('Retrieved peers list', { count: peersList.length });
            
            return {
                success: true,
                peers: peersList,
                count: peersList.length
            };
        } catch (error) {
            this.logger.error('Failed to get peers', { error: error.message });
            return {
                success: false,
                message: error.message,
                peers: []
            };
        }
    }

    /**
     * Search for files
     * @param {string} filename - Filename to search
     * @returns {Object} Search results
     */
    async searchFiles(filename) {
        try {
            const filePeers = this.fileIndex.get(filename) || [];
            
            const results = filePeers.map(peer => ({
                peerId: peer.peerId,
                ip: peer.ip,
                port: peer.restPort,
                url: `http://${peer.ip}:${peer.restPort}`
            }));

            this.logger.info('File search completed', { 
                filename, 
                resultCount: results.length 
            });
            
            return {
                success: true,
                filename,
                peers: results,
                count: results.length
            };
        } catch (error) {
            this.logger.error('Failed to search files', { error: error.message, filename });
            return {
                success: false,
                message: error.message,
                filename,
                peers: []
            };
        }
    }

    /**
     * Update file index for a peer
     * @param {string} peerId - Peer ID
     * @param {Array} files - List of files
     */
    async updateFileIndex(peerId, files) {
        try {
            const peer = this.peers.get(peerId);
            if (!peer) return;

            // Remove old files from index
            for (const oldFile of peer.files) {
                const filePeers = this.fileIndex.get(oldFile) || [];
                const updatedPeers = filePeers.filter(p => p.peerId !== peerId);
                
                if (updatedPeers.length === 0) {
                    this.fileIndex.delete(oldFile);
                } else {
                    this.fileIndex.set(oldFile, updatedPeers);
                }
            }

            // Add new files to index
            for (const filename of files) {
                const filePeers = this.fileIndex.get(filename) || [];
                const existingPeer = filePeers.find(p => p.peerId === peerId);
                
                if (!existingPeer) {
                    filePeers.push({
                        peerId,
                        ip: peer.ip,
                        restPort: peer.restPort
                    });
                    this.fileIndex.set(filename, filePeers);
                }
            }

            // Update peer's file list
            peer.files = files;
            peer.lastSeen = new Date().toISOString();
            
            this.logger.debug('File index updated', { peerId, fileCount: files.length });
        } catch (error) {
            this.logger.error('Failed to update file index', { error: error.message, peerId });
        }
    }

    /**
     * Update peer status
     * @param {string} peerId - Peer ID
     * @param {string} status - New status
     */
    async updatePeerStatus(peerId, status) {
        try {
            if (this.peers.has(peerId)) {
                const peer = this.peers.get(peerId);
                peer.status = status;
                peer.lastSeen = new Date().toISOString();
                await this.saveRegistry();
                
                this.logger.debug('Peer status updated', { peerId, status });
            }
        } catch (error) {
            this.logger.error('Failed to update peer status', { error: error.message, peerId });
        }
    }

    /**
     * Get registry statistics
     * @returns {Object} Registry statistics
     */
    getStats() {
        return {
            peerCount: this.peers.size,
            fileCount: this.fileIndex.size,
            onlinePeers: Array.from(this.peers.values()).filter(p => p.status === 'online').length
        };
    }
}

module.exports = RegistryService;
