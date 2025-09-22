const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DownloadService {
    constructor(logger, sharedDirectory) {
        this.logger = logger;
        this.sharedDirectory = sharedDirectory;
        this.downloadCache = new Map();
        this.maxCacheSize = 100; // Maximum number of files in cache
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Download a file from the shared directory
     * @param {string} filename - Name of the file to download
     * @param {Object} options - Download options
     * @returns {Promise<Object>} Download result
     */
    async downloadFile(filename, options = {}) {
        try {
            const { 
                includeContent = true, 
                includeMetadata = true, 
                validateHash = false,
                range = null 
            } = options;

            this.logger.info('Starting file download', { filename });

            // Validate filename
            if (!filename || filename.trim() === '') {
                throw new Error('Filename is required');
            }

            // Check for path traversal
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                throw new Error('Invalid filename: path traversal not allowed');
            }

            const filePath = path.join(this.sharedDirectory, filename);

            // Check if file exists
            const fileExists = await this.fileExists(filePath);
            if (!fileExists) {
                throw new Error(`File ${filename} not found`);
            }

            // Get file stats
            const stats = await fs.stat(filePath);
            
            // Check if it's a file (not directory)
            if (!stats.isFile()) {
                throw new Error(`${filename} is not a file`);
            }

            const result = {
                success: true,
                filename,
                path: filePath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                created: stats.birthtime.toISOString(),
                extension: path.extname(filename).toLowerCase()
            };

            // Add content if requested
            if (includeContent) {
                if (range) {
                    result.content = await this.readFileRange(filePath, range);
                    result.range = range;
                    result.partial = true;
                } else {
                    result.content = await this.readFileContent(filePath);
                    result.partial = false;
                }
            }

            // Add metadata if requested
            if (includeMetadata) {
                result.metadata = await this.getFileMetadata(filePath);
            }

            // Validate hash if requested
            if (validateHash) {
                result.hash = await this.calculateFileHash(filePath);
            }

            // Cache the result
            this.cacheResult(filename, result);

            this.logger.info('File download completed', {
                filename,
                size: result.size,
                hasContent: !!result.content
            });

            return result;
        } catch (error) {
            this.logger.error('File download failed', { 
                filename, 
                error: error.message 
            });
            return {
                success: false,
                message: error.message,
                filename
            };
        }
    }

    /**
     * Download multiple files
     * @param {Array} filenames - Array of filenames to download
     * @param {Object} options - Download options
     * @returns {Promise<Object>} Download results
     */
    async downloadMultipleFiles(filenames, options = {}) {
        try {
            this.logger.info('Starting multiple file download', { fileCount: filenames.length });

            const results = [];
            const errors = [];

            for (const filename of filenames) {
                try {
                    const result = await this.downloadFile(filename, options);
                    results.push(result);
                } catch (error) {
                    errors.push({
                        filename,
                        error: error.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const errorCount = errors.length;

            this.logger.info('Multiple file download completed', {
                totalFiles: filenames.length,
                successCount,
                errorCount
            });

            return {
                success: errorCount === 0,
                totalFiles: filenames.length,
                successCount,
                errorCount,
                results,
                errors
            };
        } catch (error) {
            this.logger.error('Multiple file download failed', { error: error.message });
            return {
                success: false,
                message: error.message,
                results: [],
                errors: []
            };
        }
    }

    /**
     * Read file content
     * @param {string} filePath - Path to the file
     * @returns {Promise<Buffer>} File content
     */
    async readFileContent(filePath) {
        try {
            return await fs.readFile(filePath);
        } catch (error) {
            this.logger.error('Failed to read file content', { filePath, error: error.message });
            throw error;
        }
    }

    /**
     * Read file range (for partial downloads)
     * @param {string} filePath - Path to the file
     * @param {Object} range - Range object with start and end
     * @returns {Promise<Buffer>} File content range
     */
    async readFileRange(filePath, range) {
        try {
            const { start, end } = range;
            const length = end - start + 1;
            
            const buffer = Buffer.alloc(length);
            const fd = await fs.open(filePath, 'r');
            
            try {
                await fd.read(buffer, 0, length, start);
                return buffer;
            } finally {
                await fd.close();
            }
        } catch (error) {
            this.logger.error('Failed to read file range', { filePath, range, error: error.message });
            throw error;
        }
    }

    /**
     * Get file metadata
     * @param {string} filePath - Path to the file
     * @returns {Promise<Object>} File metadata
     */
    async getFileMetadata(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const filename = path.basename(filePath);
            
            return {
                filename,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                created: stats.birthtime.toISOString(),
                accessed: stats.atime.toISOString(),
                extension: path.extname(filename).toLowerCase(),
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                mode: stats.mode,
                uid: stats.uid,
                gid: stats.gid
            };
        } catch (error) {
            this.logger.error('Failed to get file metadata', { filePath, error: error.message });
            throw error;
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
     * Get file info without downloading content
     * @param {string} filename - Name of the file
     * @returns {Promise<Object>} File info
     */
    async getFileInfo(filename) {
        try {
            const filePath = path.join(this.sharedDirectory, filename);
            
            if (!await this.fileExists(filePath)) {
                throw new Error(`File ${filename} not found`);
            }

            const stats = await fs.stat(filePath);
            
            return {
                success: true,
                filename,
                path: filePath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                created: stats.birthtime.toISOString(),
                extension: path.extname(filename).toLowerCase(),
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory()
            };
        } catch (error) {
            this.logger.error('Failed to get file info', { filename, error: error.message });
            return {
                success: false,
                message: error.message,
                filename
            };
        }
    }

    /**
     * List available files for download
     * @param {Object} options - List options
     * @returns {Promise<Object>} List of available files
     */
    async listAvailableFiles(options = {}) {
        try {
            const { 
                includeMetadata = false, 
                filter = null,
                sortBy = 'name',
                sortOrder = 'asc'
            } = options;

            this.logger.info('Listing available files', { includeMetadata, filter });

            const files = await this.scanDirectory(this.sharedDirectory);
            
            let filteredFiles = files;
            if (filter) {
                filteredFiles = files.filter(file => {
                    if (typeof filter === 'string') {
                        return file.filename.toLowerCase().includes(filter.toLowerCase());
                    } else if (typeof filter === 'function') {
                        return filter(file);
                    }
                    return true;
                });
            }

            // Sort files
            filteredFiles.sort((a, b) => {
                let aValue = a[sortBy];
                let bValue = b[sortBy];
                
                if (sortBy === 'size') {
                    aValue = parseInt(aValue) || 0;
                    bValue = parseInt(bValue) || 0;
                } else if (sortBy === 'modified' || sortBy === 'created') {
                    aValue = new Date(aValue).getTime();
                    bValue = new Date(bValue).getTime();
                } else {
                    aValue = String(aValue).toLowerCase();
                    bValue = String(bValue).toLowerCase();
                }

                if (sortOrder === 'desc') {
                    return bValue > aValue ? 1 : -1;
                } else {
                    return aValue > bValue ? 1 : -1;
                }
            });

            this.logger.info('File list generated', { 
                totalFiles: files.length,
                filteredFiles: filteredFiles.length
            });

            return {
                success: true,
                files: filteredFiles,
                count: filteredFiles.length,
                totalCount: files.length
            };
        } catch (error) {
            this.logger.error('Failed to list files', { error: error.message });
            return {
                success: false,
                message: error.message,
                files: []
            };
        }
    }

    /**
     * Scan directory for files
     * @param {string} dirPath - Directory path to scan
     * @returns {Promise<Array>} List of files
     */
    async scanDirectory(dirPath) {
        try {
            const files = [];
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isFile()) {
                    const stats = await fs.stat(fullPath);
                    files.push({
                        filename: entry.name,
                        path: fullPath,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        created: stats.birthtime.toISOString(),
                        extension: path.extname(entry.name).toLowerCase()
                    });
                } else if (entry.isDirectory()) {
                    // Recursively scan subdirectories
                    const subFiles = await this.scanDirectory(fullPath);
                    files.push(...subFiles);
                }
            }
            
            return files;
        } catch (error) {
            this.logger.error('Failed to scan directory', { dirPath, error: error.message });
            return [];
        }
    }

    /**
     * Cache download result
     * @param {string} filename - Filename
     * @param {Object} result - Download result
     */
    cacheResult(filename, result) {
        // Clean up old cache entries
        if (this.downloadCache.size >= this.maxCacheSize) {
            const oldestKey = this.downloadCache.keys().next().value;
            this.downloadCache.delete(oldestKey);
        }

        this.downloadCache.set(filename, {
            result,
            timestamp: Date.now()
        });
    }

    /**
     * Get cached result
     * @param {string} filename - Filename
     * @returns {Object|null} Cached result or null
     */
    getCachedResult(filename) {
        const cached = this.downloadCache.get(filename);
        if (!cached) {
            return null;
        }

        // Check if cache is still valid
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.downloadCache.delete(filename);
            return null;
        }

        return cached.result;
    }

    /**
     * Clear download cache
     */
    clearCache() {
        this.downloadCache.clear();
        this.logger.info('Download cache cleared');
    }

    /**
     * Get download statistics
     * @returns {Object} Download statistics
     */
    getDownloadStats() {
        return {
            cacheSize: this.downloadCache.size,
            maxCacheSize: this.maxCacheSize,
            cacheTimeout: this.cacheTimeout,
            sharedDirectory: this.sharedDirectory
        };
    }
}

module.exports = DownloadService;
