const swaggerJSDoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Directory Service API',
            version: '1.0.0',
            description: 'API documentation for the P2P Directory Service',
        },
        servers: [
            {
                url: 'http://localhost:4000',
                description: 'Directory Service Server',
            },
        ],
    },
    apis: [
        './src/microservices/directory-service/index.js',
        './src/microservices/directory-service/*.js'
    ],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;