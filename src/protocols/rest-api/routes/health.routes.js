const express = require('express');
const router = express.Router();
const HealthService = require('../../grpc/services/health.grpc.service');

// GET /health - Health check detallado
router.get('/health', async (req, res, next) => {
  try {
    const health = await HealthService.checkHealth();
    
    const status = health.healthy ? 200 : 503;
    
    res.status(status).json({
      success: health.healthy,
      timestamp: new Date().toISOString(),
      data: {
        status: health.healthy ? 'healthy' : 'unhealthy',
        services: health.services,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /ping - Ping simple
router.get('/ping', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

// =============================================================================
// 2. REST API MIDDLEWARE
// =============================================================================

// /src/protocols/rest-api/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');

class AuthMiddleware {
  static validatePeer(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const peerId = req.headers['x-peer-id'];
      
      if (!peerId) {
        return res.status(401).json({
          success: false,
          message: 'Peer ID required'
        });
      }
      
      // Validar formato del peer ID
      if (!/^[a-zA-Z0-9\-_]{8,64}$/.test(peerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid peer ID format'
        });
      }
      
      req.peerId = peerId;
      
      // Si hay token, validarlo (opcional para algunos endpoints)
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'p2p-secret');
          req.peerData = decoded;
        } catch (jwtError) {
          // Token inválido, pero continuamos con peer ID válido
          console.warn('Invalid JWT token:', jwtError.message);
        }
      }
      
      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }
  }
  
  static requireToken(req, res, next) {
    if (!req.peerData) {
      return res.status(401).json({
        success: false,
        message: 'Valid token required'
      });
    }
    next();
  }
}

module.exports = AuthMiddleware;