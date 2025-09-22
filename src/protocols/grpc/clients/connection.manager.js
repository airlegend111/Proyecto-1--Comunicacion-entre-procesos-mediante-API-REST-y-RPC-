const grpc = require('@grpc/grpc-js');

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.connectionStates = new Map();
    this.healthCheckInterval = 30000; // 30 segundos
    
    this.startHealthChecks();
  }
  
  addConnection(name, client) {
    this.connections.set(name, client);
    this.connectionStates.set(name, {
      state: 'CONNECTING',
      lastCheck: Date.now(),
      failures: 0
    });
    
    // Monitorear estado de la conexión
    this.monitorConnection(name, client);
  }
  
  removeConnection(name) {
    const client = this.connections.get(name);
    if (client) {
      try {
        client.close();
      } catch (error) {
        console.warn(`Error closing connection ${name}:`, error);
      }
    }
    
    this.connections.delete(name);
    this.connectionStates.delete(name);
  }
  
  monitorConnection(name, client) {
    if (!client.getChannel) return;
    
    const channel = client.getChannel();
    
    // Monitorear cambios de estado
    const checkState = () => {
      try {
        const state = channel.getConnectivityState(false);
        const stateInfo = this.connectionStates.get(name);
        
        if (stateInfo && stateInfo.state !== state) {
          console.log(`Connection ${name} state changed: ${stateInfo.state} -> ${state}`);
          
          stateInfo.state = state;
          stateInfo.lastCheck = Date.now();
          
          if (state === grpc.connectivityState.READY) {
            stateInfo.failures = 0;
          } else if (state === grpc.connectivityState.TRANSIENT_FAILURE) {
            stateInfo.failures++;
          }
        }
      } catch (error) {
        console.warn(`Error checking connection state for ${name}:`, error);
      }
    };
    
    // Verificar estado inicial
    checkState();
    
    // Configurar callback para cambios de estado
    const watchConnectivity = () => {
      try {
        channel.watchConnectivityState(
          channel.getConnectivityState(false),
          Date.now() + this.healthCheckInterval,
          (error) => {
            if (!error) {
              checkState();
              // Continuar monitoreando
              setTimeout(watchConnectivity, 1000);
            }
          }
        );
      } catch (error) {
        console.warn(`Error setting up connectivity watch for ${name}:`, error);
      }
    };
    
    watchConnectivity();
  }
  
  startHealthChecks() {
    setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);
  }
  
  performHealthChecks() {
    for (const [name, client] of this.connections) {
      const stateInfo = this.connectionStates.get(name);
      
      if (!stateInfo) continue;
      
      // Si la conexión ha fallado múltiples veces, intentar reconectar
      if (stateInfo.failures > 3) {
        console.log(`Attempting to reconnect ${name} after ${stateInfo.failures} failures`);
        
        try {
          const channel = client.getChannel();
          if (channel) {
            // Forzar reconexión
            channel.getConnectivityState(true);
          }
        } catch (error) {
          console.warn(`Failed to trigger reconnection for ${name}:`, error);
        }
      }
    }
  }
  
  getConnectionState(name) {
    return this.connectionStates.get(name);
  }
  
  getAllConnectionStates() {
    const states = {};
    for (const [name, state] of this.connectionStates) {
      states[name] = { ...state };
    }
    return states;
  }
  
  isConnectionHealthy(name) {
    const state = this.connectionStates.get(name);
    return state && 
           (state.state === grpc.connectivityState.READY || 
            state.state === grpc.connectivityState.IDLE) &&
           state.failures < 3;
  }
  
  getHealthyConnections() {
    const healthy = [];
    for (const [name, state] of this.connectionStates) {
      if (this.isConnectionHealthy(name)) {
        healthy.push(name);
      }
    }
  }

}
