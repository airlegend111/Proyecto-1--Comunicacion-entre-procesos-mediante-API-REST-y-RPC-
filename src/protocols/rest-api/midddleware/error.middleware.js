class ErrorMiddleware {
  static handleError(error, req, res, next) {
    console.error('Error occurred:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      peerId: req.peerId,
      timestamp: new Date().toISOString()
    });
    
    // Error de validación
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details || error.message
      });
    }
    
    // Error de gRPC
    if (error.code && error.details) {
      const statusMap = {
        1: 500,  // CANCELLED
        2: 500,  // UNKNOWN
        3: 400,  // INVALID_ARGUMENT
        4: 504,  // DEADLINE_EXCEEDED
        5: 404,  // NOT_FOUND
        6: 409,  // ALREADY_EXISTS
        7: 403,  // PERMISSION_DENIED
        8: 429,  // RESOURCE_EXHAUSTED
        9: 400,  // FAILED_PRECONDITION
        10: 409, // ABORTED
        11: 400, // OUT_OF_RANGE
        12: 501, // UNIMPLEMENTED
        13: 500, // INTERNAL
        14: 503, // UNAVAILABLE
        15: 500, // DATA_LOSS
        16: 401  // UNAUTHENTICATED
      };
      
      return res.status(statusMap[error.code] || 500).json({
        success: false,
        message: 'gRPC service error',
        error: error.details
      });
    }
    
    // Error de archivo no encontrado
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Error genérico del servidor
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    });
  }
  
  static handle404(req, res) {
    res.status(404).json({
      success: false,
      message: 'Endpoint not found',
      path: req.path,
      method: req.method
    });
  }
}

module.exports = ErrorMiddleware;