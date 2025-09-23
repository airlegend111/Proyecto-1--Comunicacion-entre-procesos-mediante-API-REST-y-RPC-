const fs = require('fs').promises;
const path = require('path');

class ConfigLoader {
    constructor() {
        this.configs = new Map();
    }

    async loadConfig(configPath) {
        try {
            const fullPath = path.resolve(configPath);
            const configData = await fs.readFile(fullPath, 'utf8');
            const config = JSON.parse(configData);
            this.configs.set(configPath, config);
            return config;
        } catch (error) {
            console.error(`Error loading configuration from ${configPath}:`, error.message);
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    getConfig(configPath) {
        return this.configs.get(configPath) || null;
    }

    validateConfig(config, type) {
        if (!config) return false;
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

module.exports = new ConfigLoader();