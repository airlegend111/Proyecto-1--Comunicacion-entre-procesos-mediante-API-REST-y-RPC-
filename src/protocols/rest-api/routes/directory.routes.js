
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validationMiddleware = require('../middleware/validation.middleware');
const DirectoryService = require('../../grpc/services/directory.grpc.service');

// POST / Registrar peer
router.post('/register', 
  authMiddleware.validatePeer,
  validationMiddleware.validateRegisterPeer,
  async (req, res, next) => {
    try {
      const { peerId, address, port, files } = req.body;
      const result = await DirectoryService.registerPeer({
        peerId,
        address,
        port,
        files: files || []
      });
      
      res.status(201).json({
        success: true,
        message: 'Peer registered successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /peers - Obtener lista de peers
router.get('/peers',
  authMiddleware.validatePeer,
  async (req, res, next) => {
    try {
      const peers = await DirectoryService.getPeers();
      
      res.status(200).json({
        success: true,
        data: {
          peers,
          count: peers.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET Buscar archivo
router.get('/search/:filename',
  authMiddleware.validatePeer,
  validationMiddleware.validateFilename,
  async (req, res, next) => {
    try {
      const { filename } = req.params;
      const results = await DirectoryService.searchFiles({ filename });
      
      res.status(200).json({
        success: true,
        data: {
          filename,
          results,
          found: results.length > 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Desregistrar peer
router.delete('/unregister/:peerId',
  authMiddleware.validatePeer,
  validationMiddleware.validatePeerId,
  async (req, res, next) => {
    try {
      const { peerId } = req.params;
      await DirectoryService.unregisterPeer({ peerId });
      
      res.status(200).json({
        success: true,
        message: 'Peer unregistered successfully',
        data: { peerId }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;