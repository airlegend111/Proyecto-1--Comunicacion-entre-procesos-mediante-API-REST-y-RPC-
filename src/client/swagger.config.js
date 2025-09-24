const swaggerJSDoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'P2P Client API',
            version: '1.0.0',
            description: 'API documentation for the P2P Client Service',
        },
        servers: [
            {
                url: '{protocol}://{host}:{port}',
                description: 'P2P Client Server',
                variables: {
                    protocol: {
                        default: 'http',
                        enum: ['http']
                    },
                    host: {
                        default: 'localhost'
                    },
                    port: {
                        default: '3000'
                    }
                }
            }
        ],
        components: {
            schemas: {
                FileMetadata: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        size: { type: 'number' },
                        lastModified: { type: 'string', format: 'date-time' }
                    }
                },
                UploadResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        file: { $ref: '#/components/schemas/FileMetadata' }
                    }
                },
                DownloadResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        data: { type: 'string', format: 'binary' }
                    }
                }
            }
        }
    },
    apis: ['./src/client/*.js']
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;