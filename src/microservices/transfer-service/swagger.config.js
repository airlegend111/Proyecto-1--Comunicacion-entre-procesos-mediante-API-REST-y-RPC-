const swaggerJSDoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Transfer Service API',
            version: '1.0.0',
            description: 'API documentation for the P2P Transfer Service',
        },
        servers: [
            {
                url: 'http://localhost:{port}',
                description: 'Transfer Service Server',
                variables: {
                    port: {
                        default: '3001',
                        description: 'The port number for the peer'
                    }
                }
            },
        ],
    },
    apis: [
        './src/microservices/transfer-service/index.js',
        './src/microservices/transfer-service/*.js'
    ],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;