const fs = require('fs').promises;
const path = require('path');

class ConfigLoader {
    constructor() {
        this.configs = new Map();
    }

    /**
     * Load configuration from JSON file
     * @param {string} configPath - Path to the configuration file
     * @returns {Promise<Object>} Configuration object
     */
    async loadConfig(configPath) {
        try {
            const fullPath = path.resolve(configPath);
            const configData = await fs.readFile(fullPath, 'utf8');
            const config = JSON.parse(configData);
            
            // Cache the configuration
            this.configs.set(configPath, config);
            
            console.log(`✅ Configuration loaded from: ${fullPath}`);
            return config;
        } catch (error) {
            console.error(`❌ Error loading configuration from ${configPath}:`, error.message);
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    /**
     * Get cached configuration
     * @param {string} configPath - Path to the configuration file
     * @returns {Object|null} Cached configuration or null
     */
    getConfig(configPath) {
        return this.configs.get(configPath) || null;
    }

    /**
     * Load all peer configurations
     * @param {string} configDir - Directory containing peer configurations
     * @returns {Promise<Array>} Array of peer configurations
     */
    async loadPeerConfigs(configDir = './config') {
        try {
            const peerConfigs = [];
            const files = await fs.readdir(configDir);
            
            for (const file of files) {
                if (file.startsWith('peer') && file.endsWith('.json')) {
                    const configPath = path.join(configDir, file);
                    const config = await this.loadConfig(configPath);
                    peerConfigs.push(config);
                }
            }
            
            return peerConfigs;
        } catch (error) {
            console.error('❌ Error loading peer configurations:', error.message);
            throw error;
        }
    }

    /**
     * Validate configuration structure
     * @param {Object} config - Configuration object to validate
     * @param {string} type - Type of configuration ('directory' or 'peer')
     * @returns {boolean} True if valid
     */
    validateConfig(config, type) {
        if (type === 'directory') {
            return config.serverId && config.ip && config.port && config.registryFile;
        } else if (type === 'peer') {
            return config.peerId && config.ip && config.restPort && 
                   config.grpcPort && config.sharedDirectory && 
                   config.directoryServer;
        }
        return false;
    }
}

module.exports = ConfigLoader;
