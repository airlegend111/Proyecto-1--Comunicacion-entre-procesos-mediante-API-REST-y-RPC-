const Logger = require('../../utils/logger');
const NetworkUtils = require('../../utils/network');

class HealthCheckService {
    constructor(config, logger = null) {
        this.config = config;
        this.logger = logger || new Logger(`health-check-${config.peerId}`);
        this.networkUtils = new NetworkUtils(this.logger);
        this.healthStatus = {
            isHealthy: false,
            lastCheck: null,
            friendPrimary: { status: 'unknown', lastCheck: null, responseTime: 0 },
            friendBackup: { status: 'unknown', lastCheck: null, responseTime: 0 },
            directoryServer: { status: 'unknown', lastCheck: null, responseTime: 0 }
        };
        this.checkInterval = null;
    }

    /**
     * Perform comprehensive health check
     * @returns {Promise<Object>} Health check result
     */
    async performHealthCheck() {
        try {
            this.logger.info('Starting comprehensive health check');
            
            const startTime = Date.now();
            const checks = await Promise.allSettled([
                this.checkDirectoryServer(),
                this.checkFriendPrimary(),
                this.checkFriendBackup(),
                this.checkSelfHealth()
            ]);

            const results = {
                timestamp: new Date().toISOString(),
                peerId: this.config.peerId,
                overallHealth: 'healthy',
                checks: {},
                responseTime: Date.now() - startTime
            };

            // Process check results
            checks.forEach((check, index) => {
                const checkNames = ['directoryServer', 'friendPrimary', 'friendBackup', 'self'];
                const checkName = checkNames[index];
                
                if (check.status === 'fulfilled') {
                    results.checks[checkName] = check.value;
                } else {
                    results.checks[checkName] = {
                        status: 'error',
                        message: check.reason.message || 'Unknown error'
                    };
                }
            });

            // Determine overall health
            const failedChecks = Object.values(results.checks).filter(
                check => check.status !== 'healthy' && check.status !== 'online'
            );
            
            if (failedChecks.length === 0) {
                results.overallHealth = 'healthy';
                this.healthStatus.isHealthy = true;
            } else if (failedChecks.length < Object.keys(results.checks).length) {
                results.overallHealth = 'degraded';
                this.healthStatus.isHealthy = false;
            } else {
                results.overallHealth = 'unhealthy';
                this.healthStatus.isHealthy = false;
            }

            this.healthStatus.lastCheck = new Date().toISOString();
            
            this.logger.info('Health check completed', {
                overallHealth: results.overallHealth,
                responseTime: results.responseTime,
                failedChecks: failedChecks.length
            });

            return results;
        } catch (error) {
            this.logger.error('Health check failed', { error: error.message });
            return {
                timestamp: new Date().toISOString(),
                peerId: this.config.peerId,
                overallHealth: 'error',
                message: error.message,
                checks: {}
            };
        }
    }

    /**
     * Check directory server health
     * @returns {Promise<Object>} Directory server health status
     */
    async checkDirectoryServer() {
        try {
            const startTime = Date.now();
            const isHealthy = await this.networkUtils.checkHealth(this.config.directoryServer);
            const responseTime = Date.now() - startTime;

            const result = {
                status: isHealthy ? 'healthy' : 'unhealthy',
                url: this.config.directoryServer,
                responseTime,
                lastCheck: new Date().toISOString()
            };

            this.healthStatus.directoryServer = result;
            
            this.logger.debug('Directory server check completed', result);
            return result;
        } catch (error) {
            this.logger.error('Directory server check failed', { error: error.message });
            const result = {
                status: 'error',
                url: this.config.directoryServer,
                message: error.message,
                lastCheck: new Date().toISOString()
            };
            this.healthStatus.directoryServer = result;
            return result;
        }
    }

    /**
     * Check friend primary peer health
     * @returns {Promise<Object>} Friend primary health status
     */
    async checkFriendPrimary() {
        try {
            if (!this.config.friendPrimary) {
                return {
                    status: 'not_configured',
                    message: 'Friend primary not configured'
                };
            }

            const startTime = Date.now();
            const pingResult = await this.networkUtils.pingPeer(this.config.friendPrimary);
            const responseTime = Date.now() - startTime;

            const result = {
                status: pingResult.success ? 'online' : 'offline',
                url: this.config.friendPrimary,
                responseTime,
                lastCheck: new Date().toISOString(),
                error: pingResult.error
            };

            this.healthStatus.friendPrimary = result;
            
            this.logger.debug('Friend primary check completed', result);
            return result;
        } catch (error) {
            this.logger.error('Friend primary check failed', { error: error.message });
            const result = {
                status: 'error',
                url: this.config.friendPrimary,
                message: error.message,
                lastCheck: new Date().toISOString()
            };
            this.healthStatus.friendPrimary = result;
            return result;
        }
    }

    /**
     * Check friend backup peer health
     * @returns {Promise<Object>} Friend backup health status
     */
    async checkFriendBackup() {
        try {
            if (!this.config.friendBackup) {
                return {
                    status: 'not_configured',
                    message: 'Friend backup not configured'
                };
            }

            const startTime = Date.now();
            const pingResult = await this.networkUtils.pingPeer(this.config.friendBackup);
            const responseTime = Date.now() - startTime;

            const result = {
                status: pingResult.success ? 'online' : 'offline',
                url: this.config.friendBackup,
                responseTime,
                lastCheck: new Date().toISOString(),
                error: pingResult.error
            };

            this.healthStatus.friendBackup = result;
            
            this.logger.debug('Friend backup check completed', result);
            return result;
        } catch (error) {
            this.logger.error('Friend backup check failed', { error: error.message });
            const result = {
                status: 'error',
                url: this.config.friendBackup,
                message: error.message,
                lastCheck: new Date().toISOString()
            };
            this.healthStatus.friendBackup = result;
            return result;
        }
    }

    /**
     * Check self health (local services)
     * @returns {Promise<Object>} Self health status
     */
    async checkSelfHealth() {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            // Check if shared directory exists and is accessible
            const sharedDirExists = await fs.access(this.config.sharedDirectory)
                .then(() => true)
                .catch(() => false);

            // Check if we can read the directory
            let canReadDirectory = false;
            if (sharedDirExists) {
                try {
                    await fs.readdir(this.config.sharedDirectory);
                    canReadDirectory = true;
                } catch (error) {
                    canReadDirectory = false;
                }
            }

            const result = {
                status: (sharedDirExists && canReadDirectory) ? 'healthy' : 'unhealthy',
                sharedDirectory: {
                    path: this.config.sharedDirectory,
                    exists: sharedDirExists,
                    readable: canReadDirectory
                },
                restPort: this.config.restPort,
                grpcPort: this.config.grpcPort,
                lastCheck: new Date().toISOString()
            };

            this.logger.debug('Self health check completed', result);
            return result;
        } catch (error) {
            this.logger.error('Self health check failed', { error: error.message });
            return {
                status: 'error',
                message: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Ping a specific peer
     * @param {string} peerUrl - Peer URL to ping
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
            this.logger.error('Peer ping failed', { peerUrl, error: error.message });
            return {
                success: false,
                error: error.message,
                duration: 0
            };
        }
    }

    /**
     * Start periodic health checks
     * @param {number} interval - Check interval in milliseconds
     */
    startPeriodicChecks(interval = 30000) { // 30 seconds default
        this.logger.info('Starting periodic health checks', { interval });
        
        this.checkInterval = setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                this.logger.error('Periodic health check failed', { error: error.message });
            }
        }, interval);
    }

    /**
     * Stop periodic health checks
     */
    stopPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            this.logger.info('Periodic health checks stopped');
        }
    }

    /**
     * Get current health status
     * @returns {Object} Current health status
     */
    getHealthStatus() {
        return {
            ...this.healthStatus,
            isPeriodicChecksRunning: this.checkInterval !== null
        };
    }

    /**
     * Get health summary
     * @returns {Object} Health summary
     */
    getHealthSummary() {
        const status = this.healthStatus;
        const healthyServices = [
            status.directoryServer.status === 'healthy',
            status.friendPrimary.status === 'online',
            status.friendBackup.status === 'online'
        ].filter(Boolean).length;

        return {
            overallHealth: status.isHealthy ? 'healthy' : 'unhealthy',
            healthyServices,
            totalServices: 3,
            lastCheck: status.lastCheck,
            peerId: this.config.peerId
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down health check service...');
            this.stopPeriodicChecks();
            this.logger.info('Health check service shutdown complete');
        } catch (error) {
            this.logger.error('Error during health check shutdown', { error: error.message });
        }
    }
}

module.exports = HealthCheckService;
