const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');
const ConfigLoader = require('../../utils/config-loader');
const Logger = require('../../utils/logger');

class DirectoryServer {
    constructor() {
        this.app = express();
        this.logger = new Logger('directory-service');
        this.directorio = {}; // { "archivo.txt": [{"rest": "http://ip:puerto", "grpc_port": 9002}, ...] }
        this.peersRegistry = {}; // Registro de peers activos con su información completa
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSwagger();
    }

    setupMiddleware() {
        this.app.use(express.json());
        
        // Manejador de errores global
        this.app.use((err, req, res, next) => {
            this.logger.error('Error en la aplicación', {
                error: err.message,
                stack: err.stack
            });
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            });
        });
    }

    setupSwagger() {
        const swaggerDefinition = {
            openapi: '3.0.0',
            info: {
                title: 'Servidor Maestro P2P',
                version: '1.0.0',
                description: 'API del servidor maestro para el sistema P2P',
            },
        /**
         * @swagger
         * /health:
         *   get:
         *     summary: Verificar estado del servidor de directorio
         *     responses:
         *       200:
         *         description: Estado actual del servidor de directorio
         */
            servers: [
                {
                    url: 'http://localhost:9000',
                    description: 'Servidor de desarrollo',
                },
            ],
        };

        const options = {
            swaggerDefinition,
            apis: ['./src/microservices/directory-service/directory-server.js'],
        };

        const swaggerSpec = swaggerJSDoc(options);
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }

    setupRoutes() {
        /**
         * @swagger
         * /:
         *   get:
         *     summary: Estado del servidor maestro
         *     responses:
         *       200:
         *         description: Estado actual del servidor
         */
        this.app.get('/', (req, res) => {
            res.send('Servidor maestro activo');
        });

        /**
         * @swagger
         * /health:
         *   get:
         *     summary: Verificar estado del servidor de directorio
         *     responses:
         *       200:
         *         description: Estado actual del servidor
         */
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                message: 'Directory server is healthy',
                timestamp: new Date().toISOString()
            });
        });

        /**
         * @swagger
         * /register:
         *   post:
         *     summary: Registrar un peer y sus archivos
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               peer:
         *                 type: string
         *               files:
         *                 type: array
         *                 items:
         *                   type: string
         *               grpc_port:
         *                 type: number
         *     responses:
         *       200:
         *         description: Peer registrado exitosamente
         */
        this.app.post('/register', (req, res) => {
            const { peer, files, grpc_port, rest_url } = req.body;
            // Validación: peer debe estar definido y ser string, files debe ser array y no vacío
            if (!peer || typeof peer !== 'string' || !files || !Array.isArray(files) || files.length === 0) {
                this.logger.error('Registro de peer inválido', { peer, files });
                return res.status(400).json({ success: false, message: 'Registro inválido: peer y files son requeridos y válidos.' });
            }
            // Si el peer no envía rest_url, asignar un valor por defecto seguro
            let restUrl = rest_url;
            if (!restUrl) {
                // Si peer es tipo 'P1', 'P2', etc. y no hay rest_url, asignar puerto por defecto
                if (typeof peer === 'string' && peer.startsWith('P')) {
                    const peerNumber = peer.substring(1);
                    const defaultPort = 9000 + Number(peerNumber) * 2 - 1;
                    restUrl = `http://localhost:${defaultPort}`;
                } else {
                    restUrl = `http://localhost:9001`;
                }
            }

            // Registrar el peer en el registro general
            this.peersRegistry[peer] = {
                rest: restUrl,
                grpc_port,
                files,
                lastSeen: new Date().toISOString()
            };

            // Actualizar el directorio de archivos
            files.forEach(file => {
                if (!this.directorio[file]) {
                    this.directorio[file] = [];
                }
                // Evitar duplicados
                const existingPeer = this.directorio[file].find(p => p.rest === restUrl);
                if (!existingPeer) {
                    this.directorio[file].push({ rest: restUrl, grpc_port });
                }
            });

            this.logger.info('Peer registered successfully', { peer, restUrl, fileCount: files.length });
            res.json({ success: true, message: 'Peer registered successfully' });
        });

        /**
         * @swagger
         * /search/{filename}:
         *   get:
         *     summary: Buscar un archivo en la red P2P
         *     parameters:
         *       - in: path
         *         name: filename
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Ubicaciones del archivo encontrado
         */
        this.app.get('/search/:filename', (req, res) => {
            const filename = req.params.filename;
            const peers = this.directorio[filename] || [];
            res.json({
                success: true,
                found: peers.length > 0,
                filename,
                locations: peers
            });
        });

        /**
         * @swagger
         * /peers:
         *   get:
         *     summary: Obtener lista de peers activos
         *     responses:
         *       200:
         *         description: Lista de peers registrados
         */
        this.app.get('/peers', (req, res) => {
            res.json({
                success: true,
                count: Object.keys(this.peersRegistry).length,
                peers: this.peersRegistry
            });
        });

        /**
         * @swagger
         * /stats:
         *   get:
         *     summary: Obtener estadísticas del sistema
         *     responses:
         *       200:
         *         description: Estadísticas actuales del sistema
         */
        this.app.get('/stats', (req, res) => {
            res.json({
                success: true,
                stats: {
                    peers: Object.keys(this.peersRegistry).length,
                    files: Object.keys(this.directorio).length,
                    timestamp: new Date().toISOString()
                }
            });
        });
    }

    async start(configPath) {
        try {
            const config = await ConfigLoader.loadConfig(configPath);
            const { port, ip } = config;

            return new Promise((resolve, reject) => {
                this.server = this.app.listen(port, ip, () => {
                    this.logger.info('Servicio de directorio iniciado', {
                        ip,
                        port,
                        url: `http://${ip === '0.0.0.0' ? 'localhost' : ip}:${port}`
                    });
                    resolve(true);
                });

                this.server.on('error', (error) => {
                    this.logger.error('Error al iniciar el servidor', {
                        error: error.message
                    });
                    reject(error);
                });
            });
        } catch (error) {
            this.logger.error('Error al iniciar el servicio de directorio', {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = DirectoryServer;