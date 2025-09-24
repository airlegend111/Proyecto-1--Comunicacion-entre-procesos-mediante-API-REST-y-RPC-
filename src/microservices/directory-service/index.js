const express = require('express');
const DirectoryServer = require('./directory-server');

// Agregar para lanzar procesos hijos
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

            // Lanzar los peers automáticamente
            const configDir = path.resolve(__dirname, '../../../config');
            fs.readdirSync(configDir)
                .filter(f => f.startsWith('peer') && f.endsWith('.json'))
                .forEach(peerConfig => {
                    const peerConfigPath = path.join(configDir, peerConfig);
                    // Lanzar el peer
                    const peerProcess = spawn(
                        process.execPath,
                        [path.resolve(__dirname, '../../server/p-servidor.js'), '--config', peerConfigPath],
                        { stdio: 'inherit', detached: true }
                    );
                    console.log(`Peer lanzado: ${peerConfig}`);

                    // Leer configuración del peer
                    try {
                        const peerData = JSON.parse(fs.readFileSync(peerConfigPath, 'utf8'));
                        const peerId = peerData.peerId;
                        const grpcPort = peerData.grpcPort;
                        const sharedDir = path.resolve(process.cwd(), peerData.sharedDirectory);
                        // Buscar el archivo de prueba (el primero que encuentre)
                        let files = [];
                        if (fs.existsSync(sharedDir)) {
                            files = fs.readdirSync(sharedDir).filter(f => f.endsWith('.txt'));
                        }
                        // Registrar el peer en el servidor maestro
                        if (peerId && grpcPort && files.length > 0) {
                            // Obtener el puerto REST del peer
                            const restPort = peerData.restPort || peerData.rest_port;
                            const restUrl = restPort ? `http://localhost:${restPort}` : undefined;
                            const body = JSON.stringify({ peer: peerId, files, grpc_port: grpcPort, rest_url: restUrl });
                            const http = require('http');
                            const req = http.request({
                                hostname: 'localhost',
                                port: 9000,
                                path: '/register',
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': Buffer.byteLength(body)
                                }
                            }, res => {
                                let data = '';
                                res.on('data', chunk => { data += chunk; });
                                res.on('end', () => {
                                    console.log(`Peer ${peerId} registrado:`, data);
                                });
                            });
                            req.on('error', err => {
                                console.error(`Error registrando peer ${peerId}:`, err.message);
                            });
                            req.write(body);
                            req.end();
                        }
                    } catch (err) {
                        console.error(`Error leyendo configuración de ${peerConfig}:`, err.message);
                    }
                });
        })
        .catch(error => {
            console.error('Error al iniciar el servidor:', error);
            process.exit(1);
        });
}

module.exports = DirectoryServer;