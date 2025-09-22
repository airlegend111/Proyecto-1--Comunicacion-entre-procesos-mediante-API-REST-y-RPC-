const fs = require('fs').promises;
const path = require('path');

class LoggingMiddleware {
  constructor(options = {}) {
    this.logToFile = options.logToFile || false;
    this.logPath = options.logPath || path.join(process.cwd(), 'logs');
    this.logLevel = options.logLevel || 'info';
  }
  
  async ensureLogDirectory() {
    if (this.logToFile) {
      try {
        await fs.mkdir(this.logPath, { recursive: true });
      } catch (error) {
        console.error('Failed to create log directory:', error);
      }
    }
  }
  
  async writeLog(logData) {
    if (!this.logToFile) return;
    
    try {
      const logFile = path.join(
        this.logPath, 
        `api-${new Date().toISOString().split('T')[0]}.log`
      );
      
      const logLine = JSON.stringify(logData) + '\n';
      await fs.appendFile(logFile, logLine);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }
  
  middleware() {
    return async (req, res, next) => {
      const start = Date.now();
      
      // Capturar response data
      const originalSend = res.send;
      let responseData = null;
      
      res.send = function(data) {
        responseData = data;
        originalSend.call(this, data);
      };
      
      res.on('finish', async () => {
        const duration = Date.now() - start;
        
        const logData = {
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          peerId: req.peerId,
          userAgent: req.get('User-Agent'),
          ip: req.ip || req.connection.remoteAddress,
          contentLength: res.get('Content-Length') || 0
        };
        
        // Log a consola
        console.log(
          `${logData.timestamp} ${logData.method} ${logData.url} ` +
          `${logData.statusCode} ${logData.duration}ms - ${logData.peerId || 'anonymous'}`
        );
        
        // Log a archivo si está habilitado
        await this.writeLog(logData);
      });
      
      next();
    };
  }
}

// Instancia singleton
const logger = new LoggingMiddleware({ 
  logToFile: process.env.LOG_TO_FILE === 'true',
  logLevel: process.env.LOG_LEVEL || 'info'
});

logger.ensureLogDirectory();

module.exports = logger.middleware();