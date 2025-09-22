const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class UploadService {
    constructor(logger, sharedDirectory) {
        this.logger = logger;
        this.sharedDirectory = sharedDirectory;
        this.uploadQueue = new Map();
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.allowedExtensions = ['.txt', '.js', '.json', '.md', '.log', '.csv', '.xml', '.html', '.css'];
    }

    /**
     * Upload a file to the shared directory
     * @param {Object} fileData - File data object
     * @param {string} fileData.filename - Name of the file
     * @param {Buffer|string} fileData.content - File content
     * @param {string} fileData.mimeType - MIME type of the file
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload result
     */
    async uploadFile(fileData, options = {}) {
        try {
            const { filename, content, mimeType } = fileData;
            const { overwrite = false, validate = true } = options;

            this.logger.info('Starting file upload', { 
                filename, 
                mimeType,
                contentSize: content.length 
            });

            // Validate file
            if (validate) {
                const validation = await this.validateFile(fileData);
                if (!validation.valid) {
                    throw new Error(validation.message);
                }
            }

            // Generate file path
            const filePath = path.join(this.sharedDirectory, filename);
            const fileDir = path.dirname(filePath);

            // Ensure directory exists
            await fs.mkdir(fileDir, { recursive: true });

            // Check if file exists
            const fileExists = await this.fileExists(filePath);
            if (fileExists && !overwrite) {
                throw new Error(`File ${filename} already exists. Use overwrite option to replace.`);
            }

            // Write file content
            const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
            await fs.writeFile(filePath, buffer);

            // Generate file metadata
            const stats = await fs.stat(filePath);
            const fileHash = await this.calculateFileHash(filePath);

            const result = {
                success: true,
                filename,
                path: filePath,
                size: stats.size,
                hash: fileHash,
                mimeType,
                uploadedAt: new Date().toISOString(),
                message: 'File uploaded successfully'
            };

            this.logger.info('File upload completed', {
                filename,
                size: result.size,
                hash: fileHash
            });

            return result;
        } catch (error) {
            this.logger.error('File upload failed', { 
                filename: fileData.filename, 
                error: error.message 
            });
            return {
                success: false,
                message: error.message,
                filename: fileData.filename
            };
        }
    }

    /**
     * Upload multiple files
     * @param {Array} filesData - Array of file data objects
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload results
     */
    async uploadMultipleFiles(filesData, options = {}) {
        try {
            this.logger.info('Starting multiple file upload', { fileCount: filesData.length });

            const results = [];
            const errors = [];

            for (const fileData of filesData) {
                try {
                    const result = await this.uploadFile(fileData, options);
                    results.push(result);
                } catch (error) {
                    errors.push({
                        filename: fileData.filename,
                        error: error.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const errorCount = errors.length;

            this.logger.info('Multiple file upload completed', {
                totalFiles: filesData.length,
                successCount,
                errorCount
            });

            return {
                success: errorCount === 0,
                totalFiles: filesData.length,
                successCount,
                errorCount,
                results,
                errors
            };
        } catch (error) {
            this.logger.error('Multiple file upload failed', { error: error.message });
            return {
                success: false,
                message: error.message,
                results: [],
                errors: []
            };
        }
    }

    /**
     * Validate file before upload
     * @param {Object} fileData - File data object
     * @returns {Promise<Object>} Validation result
     */
    async validateFile(fileData) {
        try {
            const { filename, content, mimeType } = fileData;

            // Check filename
            if (!filename || filename.trim() === '') {
                return { valid: false, message: 'Filename is required' };
            }

            // Check for path traversal
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return { valid: false, message: 'Invalid filename: path traversal not allowed' };
            }

            // Check file extension
            const ext = path.extname(filename).toLowerCase();
            if (this.allowedExtensions.length > 0 && !this.allowedExtensions.includes(ext)) {
                return { 
                    valid: false, 
                    message: `File extension ${ext} not allowed. Allowed: ${this.allowedExtensions.join(', ')}` 
                };
            }

            // Check file size
            const contentSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
            if (contentSize > this.maxFileSize) {
                return { 
                    valid: false, 
                    message: `File too large. Maximum size: ${this.maxFileSize} bytes` 
                };
            }

            // Check if content is empty
            if (contentSize === 0) {
                return { valid: false, message: 'File content cannot be empty' };
            }

            return { valid: true, message: 'File validation passed' };
        } catch (error) {
            this.logger.error('File validation failed', { error: error.message });
            return { valid: false, message: error.message };
        }
    }

    /**
     * Check if file exists
     * @param {string} filePath - Path to the file
     * @returns {Promise<boolean>} True if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Calculate file hash
     * @param {string} filePath - Path to the file
     * @returns {Promise<string>} File hash
     */
    async calculateFileHash(filePath) {
        try {
            const content = await fs.readFile(filePath);
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch (error) {
            this.logger.error('Failed to calculate file hash', { filePath, error: error.message });
            return '';
        }
    }

    /**
     * Create a backup of existing file
     * @param {string} filePath - Path to the file
     * @returns {Promise<string>} Backup file path
     */
    async createBackup(filePath) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${filePath}.backup.${timestamp}`;
            
            await fs.copyFile(filePath, backupPath);
            
            this.logger.info('File backup created', { 
                original: filePath, 
                backup: backupPath 
            });
            
            return backupPath;
        } catch (error) {
            this.logger.error('Failed to create backup', { filePath, error: error.message });
            throw error;
        }
    }

    /**
     * Get upload statistics
     * @returns {Object} Upload statistics
     */
    getUploadStats() {
        return {
            queueSize: this.uploadQueue.size,
            maxFileSize: this.maxFileSize,
            allowedExtensions: this.allowedExtensions,
            sharedDirectory: this.sharedDirectory
        };
    }

    /**
     * Set upload options
     * @param {Object} options - Upload options
     */
    setUploadOptions(options) {
        if (options.maxFileSize) {
            this.maxFileSize = options.maxFileSize;
        }
        if (options.allowedExtensions) {
            this.allowedExtensions = options.allowedExtensions;
        }
        
        this.logger.info('Upload options updated', {
            maxFileSize: this.maxFileSize,
            allowedExtensions: this.allowedExtensions
        });
    }

    /**
     * Clean up old backup files
     * @param {number} maxAge - Maximum age in milliseconds
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupOldBackups(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        try {
            const files = await fs.readdir(this.sharedDirectory);
            const backupFiles = files.filter(file => file.includes('.backup.'));
            const now = Date.now();
            let cleanedCount = 0;

            for (const file of backupFiles) {
                const filePath = path.join(this.sharedDirectory, file);
                const stats = await fs.stat(filePath);
                const age = now - stats.mtime.getTime();

                if (age > maxAge) {
                    await fs.unlink(filePath);
                    cleanedCount++;
                }
            }

            this.logger.info('Old backups cleaned up', { cleanedCount });

            return {
                success: true,
                cleanedCount,
                message: `Cleaned up ${cleanedCount} old backup files`
            };
        } catch (error) {
            this.logger.error('Backup cleanup failed', { error: error.message });
            return {
                success: false,
                message: error.message,
                cleanedCount: 0
            };
        }
    }

    /**
     * Get file info before upload
     * @param {Object} fileData - File data object
     * @returns {Object} File info
     */
    getFileInfo(fileData) {
        const { filename, content, mimeType } = fileData;
        const contentSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
        const ext = path.extname(filename).toLowerCase();

        return {
            filename,
            size: contentSize,
            extension: ext,
            mimeType,
            isValidExtension: this.allowedExtensions.length === 0 || this.allowedExtensions.includes(ext),
            isWithinSizeLimit: contentSize <= this.maxFileSize,
            isEmpty: contentSize === 0
        };
    }
}

module.exports = UploadService;
