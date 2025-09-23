const Logger = require('../../utils/logger');

class DirectoryService {
    constructor() {
        this.logger = new Logger('directory-service');
        this.directorio = {}; // { "archivo.txt": [{"rest": "http://ip:puerto", "grpc_port": 9002}, ...] }
        this.peersRegistry = {}; // Registro de peers activos con su información completa
    }

    /**
     * Registrar un peer y sus archivos en el directorio
     * @param {Object} data - Datos del peer
     * @param {string} data.peer - URL base del peer (REST)
     * @param {string[]} data.files - Lista de archivos del peer
     * @param {number} data.grpc_port - Puerto gRPC del peer
     */
    registerPeer(data) {
        const { peer, files, grpc_port } = data;
        
        // Registrar el peer en el registro general
        this.peersRegistry[peer] = {
            rest: peer,
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
            const existingPeer = this.directorio[file].find(p => p.rest === peer);
            if (!existingPeer) {
                this.directorio[file].push({ rest: peer, grpc_port });
            }
        });

        this.logger.info('Peer registered successfully', { peer, fileCount: files.length });
        return { success: true, message: 'Peer registered successfully' };
    }

    /**
     * Buscar archivos en el directorio
     * @param {string} filename - Nombre del archivo a buscar
     */
    searchFile(filename) {
        const peers = this.directorio[filename] || [];
        return {
            success: true,
            found: peers.length > 0,
            filename,
            locations: peers
        };
    }

    /**
     * Obtener lista de peers activos
     */
    getPeers() {
        return {
            success: true,
            count: Object.keys(this.peersRegistry).length,
            peers: this.peersRegistry
        };
    }

    /**
     * Obtener estadísticas del sistema
     */
    getStats() {
        return {
            success: true,
            stats: {
                peers: Object.keys(this.peersRegistry).length,
                files: Object.keys(this.directorio).length,
                timestamp: new Date().toISOString()
            }
        };
    }
}

module.exports = DirectoryService;