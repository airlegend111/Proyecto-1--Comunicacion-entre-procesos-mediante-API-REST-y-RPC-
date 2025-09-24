const swaggerJSDoc = require('swagger-jsdoc');

function getSwaggerSpec({ port = '9001', peerName = 'Peer' } = {}) {
    const options = {
        definition: {
            openapi: '3.0.0',
            info: {
                title: `${peerName} Transfer Service API`,
                version: '1.0.0',
                description: `API documentation for the P2P Transfer Service of ${peerName}`,
            },
            servers: [
                {
                    url: `http://localhost:${port}`,
                    description: `${peerName} Transfer Service Server`,
                },
            ],
        },
        apis: [
            './src/microservices/transfer-service/index.js',
            './src/microservices/transfer-service/*.js'
        ],
    };
    return swaggerJSDoc(options);
}

module.exports = getSwaggerSpec;