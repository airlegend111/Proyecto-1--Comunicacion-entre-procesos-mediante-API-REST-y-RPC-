const fs = require('fs').promises;
const path = require('path');

class Logger {
    constructor(serviceName = 'service', logDir = './logs') {
        this.serviceName = serviceName;
        this.logDir = logDir;
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDirectory() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }

    /**
     * Get current timestamp
     * @returns {string} Formatted timestamp
     */
    getTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format log message
     * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     * @returns {string} Formatted log message
     */
    formatMessage(level, message, metadata = {}) {
        const timestamp = this.getTimestamp();
        const metadataStr = Object.keys(metadata).length > 0 ? 
            ` | ${JSON.stringify(metadata)}` : '';
        return `[${timestamp}] [${this.serviceName}] [${level}] ${message}${metadataStr}`;
    }

    /**
     * Write log to file
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    async writeToFile(level, message, metadata = {}) {
        try {
            const logMessage = this.formatMessage(level, message, metadata);
            const logFile = path.join(this.logDir, `${this.serviceName}.log`);
            await fs.appendFile(logFile, logMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    info(message, metadata = {}) {
        const logMessage = this.formatMessage('INFO', message, metadata);
        console.log(logMessage);
        this.writeToFile('INFO', message, metadata);
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    warn(message, metadata = {}) {
        const logMessage = this.formatMessage('WARN', message, metadata);
        console.warn(logMessage);
        this.writeToFile('WARN', message, metadata);
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    error(message, metadata = {}) {
        const logMessage = this.formatMessage('ERROR', message, metadata);
        console.error(logMessage);
        this.writeToFile('ERROR', message, metadata);
    }

    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    debug(message, metadata = {}) {
        const logMessage = this.formatMessage('DEBUG', message, metadata);
        console.log(logMessage);
        this.writeToFile('DEBUG', message, metadata);
    }

    /**
     * Log HTTP request
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {number} duration - Request duration in ms
     */
    logRequest(req, res, duration) {
        const metadata = {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent') || 'Unknown'
        };
        
        this.info(`${req.method} ${req.url} - ${res.statusCode}`, metadata);
    }
}

module.exports = Logger;
