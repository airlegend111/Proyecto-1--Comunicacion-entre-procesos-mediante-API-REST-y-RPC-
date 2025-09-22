// /src/protocols/rest-api/routes/peer.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const authMiddleware = require('../middleware/auth.middleware');
const validationMiddleware = require('../middleware/validation.middleware');
const PeerService = require('../../grpc/services/peer.grpc.service');

// Configuración multer para uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'shared-files'));
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// GET /files - Obtener lista de archivos del peer
router.get('/files',
  authMiddleware.validatePeer,
  async (req, res, next) => {
    try {
      const files = await PeerService.getFiles();
      
      res.status(200).json({
        success: true,
        data: {
          files,
          count: files.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /refresh - Refrescar lista de archivos
router.post('/refresh',
  authMiddleware.validatePeer,
  async (req, res, next) => {
    try {
      const files = await PeerService.refreshFileList();
      
      res.status(200).json({
        success: true,
        message: 'File list refreshed successfully',
        data: {
          files,
          count: files.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /download/:filename - Descargar archivo
router.get('/download/:filename',
  authMiddleware.validatePeer,
  validationMiddleware.validateFilename,
  async (req, res, next) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(process.cwd(), 'shared-files', filename);
      
      // Verificar si el archivo existe
      await fs.access(filePath);
      
      res.download(filePath, filename, (err) => {
        if (err) {
          next(err);
        }
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({
          success: false,
          message: 'File not found'
        });
      } else {
        next(error);
      }
    }
  }
);

// POST /upload - Subir archivo
router.post('/upload',
  authMiddleware.validatePeer,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      const fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      };
      
      // Actualizar lista de archivos en el servicio
      await PeerService.refreshFileList();
      
      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: fileInfo
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;