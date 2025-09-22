const ConfigLoader = require('../utils/config-loader');
const Logger = require('../utils/logger');
const NetworkUtils = require('../utils/network');

class DirectoryClient {
    constructor() {
        this.config = null;
        this.logger = null;
        this.networkUtils = null;
    }

    /**
     * Initialize the directory client
     * @param {string} configPath - Path to configuration file
     */
    async initialize(configPath) {
        try {
            // Load configuration
            const configLoader = new ConfigLoader();
            this.config = await configLoader.loadConfig(configPath);
            
            // Initialize logger
            this.logger = new Logger(`directory-client-${this.config.serverId}`);
            
            // Initialize network utils
            this.networkUtils = new NetworkUtils(this.logger);
            
            // Validate configuration
            if (!configLoader.validateConfig(this.config, 'directory')) {
                throw new Error('Invalid directory server configuration');
            }

            this.logger.info('Directory client initialized', {
                serverId: this.config.serverId,
                port: this.config.port
            });
        } catch (error) {
            console.error('Failed to initialize directory client:', error.message);
            throw error;
        }
    }

    /**
     * Start the directory service
     * @returns {Promise<void>}
     */
    async start() {
        try {
            this.logger.info('Starting directory service...');
            
            // Import and start the directory service
            const DirectoryService = require('../microservices/directory-service');
            const directoryService = new DirectoryService();
            
            await directoryService.start();
        } catch (error) {
            this.logger.error('Failed to start directory service', { error: error.message });
            throw error;
        }
    }

    /**
     * Test directory service endpoints
     * @returns {Promise<Object>} Test results
     */
    async testEndpoints() {
        try {
            const baseUrl = `http://${this.config.ip}:${this.config.port}`;
            const results = {};

            this.logger.info('Testing directory service endpoints...');

            // Test health endpoint
            try {
                const healthResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/health`);
                results.health = healthResult;
            } catch (error) {
                results.health = { success: false, error: error.message };
            }

            // Test ping endpoint
            try {
                const pingResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/ping`);
                results.ping = pingResult;
            } catch (error) {
                results.ping = { success: false, error: error.message };
            }

            // Test peers endpoint
            try {
                const peersResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/peers`);
                results.peers = peersResult;
            } catch (error) {
                results.peers = { success: false, error: error.message };
            }

            // Test files endpoint
            try {
                const filesResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/files`);
                results.files = filesResult;
            } catch (error) {
                results.files = { success: false, error: error.message };
            }

            // Test stats endpoint
            try {
                const statsResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/stats`);
                results.stats = statsResult;
            } catch (error) {
                results.stats = { success: false, error: error.message };
            }

            this.logger.info('Directory service endpoint tests completed', {
                totalTests: Object.keys(results).length,
                successfulTests: Object.values(results).filter(r => r.success).length
            });

            return {
                success: true,
                results,
                summary: {
                    totalTests: Object.keys(results).length,
                    successfulTests: Object.values(results).filter(r => r.success).length,
                    failedTests: Object.values(results).filter(r => !r.success).length
                }
            };
        } catch (error) {
            this.logger.error('Directory service test failed', { error: error.message });
            return {
                success: false,
                message: error.message,
                results: {}
            };
        }
    }

    /**
     * Interactive command line interface
     */
    async startCLI() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `Directory-Client[${this.config.serverId}]> `
        });

        console.log('\n=== Cliente del Servicio de Directorio ===');
        console.log('Comandos disponibles:');
        console.log('  start       - Iniciar el servicio de directorio');
        console.log('  test        - Probar endpoints del servicio de directorio');
        console.log('  health      - Verificar salud del servicio de directorio');
        console.log('  peers       - Listar todos los peers registrados');
        console.log('  files       - Listar todos los archivos del sistema');
        console.log('  search <archivo> - Buscar archivos');
        console.log('  stats       - Obtener estadísticas del servicio de directorio');
        console.log('  cleanup     - Limpiar archivos huérfanos');
        console.log('  help        - Mostrar esta ayuda');
        console.log('  exit        - Salir del cliente\n');

        rl.prompt();

        rl.on('line', async (line) => {
            const [command, ...args] = line.trim().split(' ');

            try {
                switch (command.toLowerCase()) {
                    case 'start':
                        console.log('Iniciando servicio de directorio...');
                        await this.start();
                        break;

                    case 'test':
                        const testResult = await this.testEndpoints();
                        console.log(JSON.stringify(testResult, null, 2));
                        break;

                    case 'health':
                        const baseUrl = `http://${this.config.ip}:${this.config.port}`;
                        const healthResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/health`);
                        console.log(JSON.stringify(healthResult, null, 2));
                        break;

                    case 'peers':
                        const peersResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/peers`);
                        console.log(JSON.stringify(peersResult, null, 2));
                        break;

                    case 'files':
                        const filesResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/files`);
                        console.log(JSON.stringify(filesResult, null, 2));
                        break;

                    case 'search':
                        if (args.length === 0) {
                            console.log('Uso: search <archivo>');
                            break;
                        }
                        const searchResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/search/${args[0]}`);
                        console.log(JSON.stringify(searchResult, null, 2));
                        break;

                    case 'stats':
                        const statsResult = await this.networkUtils.makeRequest('GET', `${baseUrl}/stats`);
                        console.log(JSON.stringify(statsResult, null, 2));
                        break;

                    case 'cleanup':
                        const cleanupResult = await this.networkUtils.makeRequest('POST', `${baseUrl}/cleanup`);
                        console.log(JSON.stringify(cleanupResult, null, 2));
                        break;

                    case 'help':
                        console.log('Comandos disponibles: start, test, health, peers, files, search, stats, cleanup, help, exit');
                        break;

                    case 'exit':
                        console.log('¡Hasta luego!');
                        rl.close();
                        process.exit(0);
                        break;

                    default:
                        console.log('Comando desconocido. Escribe "help" para ver los comandos disponibles.');
                }
            } catch (error) {
                console.error('Error en comando:', error.message);
            }

            rl.prompt();
        });

        rl.on('close', () => {
            process.exit(0);
        });
    }
}

// Start the client if this file is run directly
if (require.main === module) {
    const configPath = process.argv[2] || './config/directory-server.json';
    const directoryClient = new DirectoryClient();
    
    directoryClient.initialize(configPath)
        .then(() => directoryClient.startCLI())
        .catch(error => {
            console.error('Error al iniciar el cliente de directorio:', error);
            process.exit(1);
        });
}

module.exports = DirectoryClient;
