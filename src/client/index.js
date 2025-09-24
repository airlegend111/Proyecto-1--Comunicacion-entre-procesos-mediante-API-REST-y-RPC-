const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger.config');
const P2PClient = require('./p-cliente');
const configLoader = require('../utils/config-loader');

class P2PClientServer {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupSwagger();
        this.setupRoutes();
        this.client = new P2PClient();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(cors());
    }

    setupSwagger() {
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        this.app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }

    setupRoutes() {
        /**
         * @swagger
         * /files:
         *   get:
         *     summary: Obtiene la lista de archivos compartidos
         *     tags: [Files]
         *     responses:
         *       200:
         *         description: Lista de archivos
         */
        this.app.get('/files', async (req, res) => {
            const files = await this.client.getCurrentFiles();
            res.json({ success: true, files });
        });

        /**
         * @swagger
         * /download/{filename}:
         *   get:
         *     summary: Descarga un archivo
         *     tags: [Files]
         *     parameters:
         *       - in: path
         *         name: filename
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Archivo descargado
         *         content:
         *           application/octet-stream:
         *             schema:
         *               type: string
         *               format: binary
         */
        this.app.get('/download/:filename', async (req, res) => {
            const filename = req.params.filename;
            // Implementar lógica de descarga
            res.download(`${this.client.config.sharedDirectory}/${filename}`);
        });

        /**
         * @swagger
         * /upload:
         *   post:
         *     summary: Sube un archivo
         *     tags: [Files]
         *     requestBody:
         *       required: true
         *       content:
         *         multipart/form-data:
         *           schema:
         *             type: object
         *             properties:
         *               file:
         *                 type: string
         *                 format: binary
         *     responses:
         *       200:
         *         description: Archivo subido exitosamente
         */
        this.app.post('/upload', async (req, res) => {
            // Implementar lógica de subida
            res.json({ success: true, message: 'File uploaded successfully' });
        });

        /**
         * @swagger
         * /status:
         *   get:
         *     summary: Obtiene el estado del peer
         *     tags: [System]
         *     responses:
         *       200:
         *         description: Estado actual del peer
         */
        this.app.get('/status', (req, res) => {
            const status = this.client.getStatus();
            res.json(status);
        });
    }

    async start(configPath) {
        try {
            await this.client.initialize(configPath);
            const { restPort, ip } = this.client.config;
            
            this.app.listen(restPort, ip, () => {
                console.log(`P2P Client REST API running at http://${ip}:${restPort}`);
                console.log(`Swagger documentation available at http://${ip}:${restPort}/api-docs`);
                this.client.startCLI();
            });
        } catch (error) {
            console.error('Failed to start P2P client server:', error);
            process.exit(1);
        }
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const configPath = process.argv[2];
    if (!configPath) {
        console.error('Configuration file path is required');
        process.exit(1);
    }

    const server = new P2PClientServer();
    server.start(configPath);
}

module.exports = P2PClientServer;