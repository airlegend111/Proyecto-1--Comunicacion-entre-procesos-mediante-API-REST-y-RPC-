const grpc = require('@grpc/grpc-js');
const DirectoryClient = require('../clients/directory.grpc.client');
const PeerClient = require('../clients/peer.grpc.client');

class HealthGrpcService {
  constructor() {
    this.services = {
      directory: false,
      peer: false,
      rest_api: true // Asumimos que REST API está funcionando si este servicio está activo
    };
    
    this.startHealthChecks();
  }
  
  startHealthChecks() {
    // Verificar servicios cada 30 segundos
    setInterval(() => {
      this.performHealthChecks();
    }, 30000);
    
    // Verificación inicial
    setTimeout(() => {
      this.performHealthChecks();
    }, 5000);
  }
  
  async performHealthChecks() {
    // Verificar Directory Service
    try {
      await DirectoryClient.ping();
      this.services.directory = true;
    } catch (error) {
      this.services.directory = false;
      console.warn('Directory service health check failed:', error.message);
    }
    
    // Verificar Peer Service
    try {
      await PeerClient.ping();
      this.services.peer = true;
    } catch (error) {
      this.services.peer = false;
      console.warn('Peer service health check failed:', error.message);
    }
  }
  
  async checkHealth() {
    const allHealthy = Object.values(this.services).every(status => status);
    
    return {
      healthy: allHealthy,
      services: { ...this.services },
      timestamp: Date.now(),
      uptime: process.uptime()
    };
  }
  
  // gRPC Health Check Protocol
  async check(call, callback) {
    try {
      const { service } = call.request;
      const health = await this.checkHealth();
      
      let status = 'SERVING';
      
      if (service) {
        // Verificar servicio específico
        if (!this.services[service]) {
          status = 'NOT_SERVING';
        }
      } else {
        // Verificar salud general
        if (!health.healthy) {
          status = 'NOT_SERVING';
        }
      }
      
      callback(null, {
        status,
        timestamp: Date.now()
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
  
  async watch(call) {
    const { service } = call.request;
    
    // Enviar estado inicial
    const initialHealth = await this.checkHealth();
    let currentStatus = initialHealth.healthy ? 'SERVING' : 'NOT_SERVING';
    
    if (service && !this.services[service]) {
      currentStatus = 'NOT_SERVING';
    }
    
    call.write({
      status: currentStatus,
      timestamp: Date.now()
    });
    
    // Monitorear cambios de estado
    const checkInterval = setInterval(async () => {
      try {
        const health = await this.checkHealth();
        let newStatus = health.healthy ? 'SERVING' : 'NOT_SERVING';
        
        if (service && !this.services[service]) {
          newStatus = 'NOT_SERVING';
        }
        
        // Solo enviar si cambió el estado
        if (newStatus !== currentStatus) {
          currentStatus = newStatus;
          call.write({
            status: currentStatus,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        call.destroy({
          code: grpc.status.INTERNAL,
          details: error.message
        });
      }
    }, 10000);
    
    call.on('cancelled', () => {
      clearInterval(checkInterval);
    });
    
    call.on('error', () => {
      clearInterval(checkInterval);
    });
  }
}

module.exports = new HealthGrpcService();