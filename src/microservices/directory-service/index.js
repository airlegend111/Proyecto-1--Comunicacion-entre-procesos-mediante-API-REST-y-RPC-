const express = require('express');
const DirectoryServer = require('./directory-server');

if (require.main === module) {
    const configPath = process.argv[2];
    if (!configPath) {
        console.error('Error: Debe proporcionar la ruta al archivo de configuración');
        process.exit(1);
    }

    const server = new DirectoryServer();
    server.start(configPath)
        .then(() => {
            console.log('Servidor iniciado correctamente en http://localhost:9000');
        })
        .catch(error => {
            console.error('Error al iniciar el servidor:', error);
            process.exit(1);
        });
}

module.exports = DirectoryServer;