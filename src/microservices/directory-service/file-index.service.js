const fs = require('fs').promises;
const path = require('path');

class FileIndexService {
    constructor(logger, registryService) {
        this.logger = logger;
        this.registryService = registryService;
    }

    /**
     * Search for files by filename pattern
     * @param {string} filename - Filename or pattern to search
     * @returns {Object} Search results
     */
    async searchFiles(filename) {
        try {
            this.logger.info('Searching files', { filename });
            
            // Get all files from registry
            const allFiles = Array.from(this.registryService.fileIndex.entries());
            
            // Filter files that match the search pattern
            const matchingFiles = allFiles.filter(([file, peers]) => {
                return file.toLowerCase().includes(filename.toLowerCase()) ||
                       filename.toLowerCase().includes(file.toLowerCase());
            });

            // Format results
            const results = matchingFiles.map(([file, peers]) => ({
                filename: file,
                peers: peers.map(peer => ({
                    peerId: peer.peerId,
                    ip: peer.ip,
                    port: peer.restPort,
                    url: `http://${peer.ip}:${peer.restPort}`
                }))
            }));

            this.logger.info('File search completed', { 
                searchTerm: filename,
                resultCount: results.length 
            });

            return {
                success: true,
                searchTerm: filename,
                results,
                count: results.length
            };
        } catch (error) {
            this.logger.error('File search failed', { error: error.message, filename });
            return {
                success: false,
                message: error.message,
                searchTerm: filename,
                results: []
            };
        }
    }

    /**
     * Get all files in the system
     * @returns {Object} All files with their locations
     */
    async getAllFiles() {
        try {
            const allFiles = Array.from(this.registryService.fileIndex.entries());
            
            const results = allFiles.map(([filename, peers]) => ({
                filename,
                peers: peers.map(peer => ({
                    peerId: peer.peerId,
                    ip: peer.ip,
                    port: peer.restPort,
                    url: `http://${peer.ip}:${peer.restPort}`
                })),
                replicaCount: peers.length
            }));

            this.logger.info('Retrieved all files', { fileCount: results.length });

            return {
                success: true,
                files: results,
                count: results.length
            };
        } catch (error) {
            this.logger.error('Failed to get all files', { error: error.message });
            return {
                success: false,
                message: error.message,
                files: []
            };
        }
    }

    /**
     * Get files by peer
     * @param {string} peerId - Peer ID
     * @returns {Object} Files hosted by the peer
     */
    async getFilesByPeer(peerId) {
        try {
            const peer = this.registryService.peers.get(peerId);
            
            if (!peer) {
                throw new Error(`Peer ${peerId} not found`);
            }

            const files = peer.files.map(filename => {
                const filePeers = this.registryService.fileIndex.get(filename) || [];
                return {
                    filename,
                    replicaCount: filePeers.length,
                    locations: filePeers.map(p => ({
                        peerId: p.peerId,
                        ip: p.ip,
                        port: p.restPort,
                        url: `http://${p.ip}:${p.restPort}`
                    }))
                };
            });

            this.logger.info('Retrieved files by peer', { peerId, fileCount: files.length });

            return {
                success: true,
                peerId,
                files,
                count: files.length
            };
        } catch (error) {
            this.logger.error('Failed to get files by peer', { error: error.message, peerId });
            return {
                success: false,
                message: error.message,
                peerId,
                files: []
            };
        }
    }

    /**
     * Get file statistics
     * @returns {Object} File statistics
     */
    async getFileStats() {
        try {
            const allFiles = Array.from(this.registryService.fileIndex.entries());
            const totalFiles = allFiles.length;
            const totalReplicas = allFiles.reduce((sum, [, peers]) => sum + peers.length, 0);
            const averageReplicas = totalFiles > 0 ? (totalReplicas / totalFiles).toFixed(2) : 0;

            // Find most replicated files
            const mostReplicated = allFiles
                .map(([filename, peers]) => ({ filename, replicaCount: peers.length }))
                .sort((a, b) => b.replicaCount - a.replicaCount)
                .slice(0, 10);

            // Find files with single replica
            const singleReplica = allFiles
                .filter(([, peers]) => peers.length === 1)
                .map(([filename]) => filename);

            const stats = {
                totalFiles,
                totalReplicas,
                averageReplicas: parseFloat(averageReplicas),
                mostReplicated,
                singleReplicaCount: singleReplica.length,
                singleReplicaFiles: singleReplica
            };

            this.logger.info('File statistics generated', stats);

            return {
                success: true,
                stats
            };
        } catch (error) {
            this.logger.error('Failed to get file statistics', { error: error.message });
            return {
                success: false,
                message: error.message,
                stats: null
            };
        }
    }

    /**
     * Clean up orphaned file entries
     * @returns {Object} Cleanup result
     */
    async cleanupOrphanedFiles() {
        try {
            const allFiles = Array.from(this.registryService.fileIndex.entries());
            let cleanedCount = 0;

            for (const [filename, peers] of allFiles) {
                // Remove peers that no longer exist
                const validPeers = peers.filter(peer => 
                    this.registryService.peers.has(peer.peerId)
                );

                if (validPeers.length === 0) {
                    this.registryService.fileIndex.delete(filename);
                    cleanedCount++;
                } else if (validPeers.length !== peers.length) {
                    this.registryService.fileIndex.set(filename, validPeers);
                    cleanedCount++;
                }
            }

            await this.registryService.saveRegistry();

            this.logger.info('Orphaned files cleaned up', { cleanedCount });

            return {
                success: true,
                cleanedCount,
                message: `Cleaned up ${cleanedCount} orphaned file entries`
            };
        } catch (error) {
            this.logger.error('Failed to cleanup orphaned files', { error: error.message });
            return {
                success: false,
                message: error.message,
                cleanedCount: 0
            };
        }
    }
}

module.exports = FileIndexService;
