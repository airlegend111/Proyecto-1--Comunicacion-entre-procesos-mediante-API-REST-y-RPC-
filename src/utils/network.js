const axios = require('axios');

class NetworkUtils {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Make HTTP request with error handling
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     * @param {Object} data - Request data
     * @param {Object} headers - Request headers
     * @returns {Promise<Object>} Response data
     */
    async makeRequest(method, url, data = null, headers = {}) {
        try {
            const config = {
                method,
                url,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                timeout: 10000 // 10 seconds timeout
            };

            if (data) {
                config.data = data;
            }

            this.logger.debug(`Making ${method} request to ${url}`, { data, headers });
            const response = await axios(config);
            
            this.logger.debug(`Request successful`, { 
                status: response.status, 
                data: response.data 
            });
            
            return {
                success: true,
                data: response.data,
                status: response.status
            };
        } catch (error) {
            this.logger.error(`Request failed: ${method} ${url}`, {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            return {
                success: false,
                error: error.message,
                status: error.response?.status || 0,
                data: error.response?.data || null
            };
        }
    }

    /**
     * Check if a service is healthy
     * @param {string} url - Service URL
     * @param {string} healthEndpoint - Health check endpoint
     * @returns {Promise<boolean>} True if healthy
     */
    async checkHealth(url, healthEndpoint = '/health') {
        try {
            const response = await this.makeRequest('GET', `${url}${healthEndpoint}`);
            return response.success && response.status === 200;
        } catch (error) {
            this.logger.warn(`Health check failed for ${url}`, { error: error.message });
            return false;
        }
    }

    /**
     * Ping a peer
     * @param {string} peerUrl - Peer URL
     * @returns {Promise<Object>} Ping result
     */
    async pingPeer(peerUrl) {
        const startTime = Date.now();
        const response = await this.makeRequest('GET', `${peerUrl}/ping`);
        const duration = Date.now() - startTime;
        
        return {
            success: response.success,
            duration,
            status: response.status,
            error: response.error
        };
    }

    /**
     * Register peer with directory server
     * @param {string} directoryUrl - Directory server URL
     * @param {Object} peerData - Peer registration data
     * @returns {Promise<Object>} Registration result
     */
    async registerPeer(directoryUrl, peerData) {
        return await this.makeRequest('POST', `${directoryUrl}/register`, peerData);
    }

    /**
     * Unregister peer from directory server
     * @param {string} directoryUrl - Directory server URL
     * @param {string} peerId - Peer ID
     * @returns {Promise<Object>} Unregistration result
     */
    async unregisterPeer(directoryUrl, peerId) {
        return await this.makeRequest('DELETE', `${directoryUrl}/unregister/${peerId}`);
    }

    /**
     * Get peer list from directory server
     * @param {string} directoryUrl - Directory server URL
     * @returns {Promise<Object>} Peer list
     */
    async getPeers(directoryUrl) {
        return await this.makeRequest('GET', `${directoryUrl}/peers`);
    }

    /**
     * Search files in directory server
     * @param {string} directoryUrl - Directory server URL
     * @param {string} filename - Filename to search
     * @returns {Promise<Object>} Search results
     */
    async searchFiles(directoryUrl, filename) {
        return await this.makeRequest('GET', `${directoryUrl}/search/${filename}`);
    }

    /**
     * Get files from a peer
     * @param {string} peerUrl - Peer URL
     * @returns {Promise<Object>} Files list
     */
    async getPeerFiles(peerUrl) {
        return await this.makeRequest('GET', `${peerUrl}/files`);
    }

    /**
     * Refresh files in a peer
     * @param {string} peerUrl - Peer URL
     * @returns {Promise<Object>} Refresh result
     */
    async refreshPeerFiles(peerUrl) {
        return await this.makeRequest('POST', `${peerUrl}/refresh`);
    }

    /**
     * Download file from peer
     * @param {string} peerUrl - Peer URL
     * @param {string} filename - Filename to download
     * @returns {Promise<Object>} Download result
     */
    async downloadFile(peerUrl, filename) {
        return await this.makeRequest('GET', `${peerUrl}/download/${filename}`);
    }

    /**
     * Upload file to peer
     * @param {string} peerUrl - Peer URL
     * @param {Object} fileData - File data
     * @returns {Promise<Object>} Upload result
     */
    async uploadFile(peerUrl, fileData) {
        return await this.makeRequest('POST', `${peerUrl}/upload`, fileData);
    }
}

module.exports = NetworkUtils;
