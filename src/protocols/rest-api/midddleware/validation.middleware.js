const Joi = require('joi');

class ValidationMiddleware {
  static validateRegisterPeer(req, res, next) {
    const schema = Joi.object({
      peerId: Joi.string().alphanum().min(8).max(64).required(),
      address: Joi.string().ip().required(),
      port: Joi.number().port().required(),
      files: Joi.array().items(
        Joi.object({
          filename: Joi.string().required(),
          size: Joi.number().positive().required(),
          checksum: Joi.string().optional()
        })
      ).optional().default([])
    });
    
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req.body = value;
    next();
  }
  
  static validateFilename(req, res, next) {
    const schema = Joi.object({
      filename: Joi.string()
        .pattern(/^[a-zA-Z0-9._-]+$/)
        .min(1)
        .max(255)
        .required()
    });
    
    const { error } = schema.validate(req.params);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename',
        error: error.details[0].message
      });
    }
    
    next();
  }
  
  static validatePeerId(req, res, next) {
    const schema = Joi.object({
      peerId: Joi.string().alphanum().min(8).max(64).required()
    });
    
    const { error } = schema.validate(req.params);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid peer ID',
        error: error.details[0].message
      });
    }
    
    next();
  }
  
  static validateQuery(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.query);
      
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Query validation error',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        });
      }
      
      req.query = value;
      next();
    };
  }
}

module.exports = ValidationMiddleware;