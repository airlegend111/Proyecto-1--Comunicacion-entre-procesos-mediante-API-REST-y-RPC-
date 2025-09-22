const fs = require('fs').promises;
const path = require('path');

class FileScanner {
    constructor(logger, sharedDirectory) {
        this.logger = logger;
        this.sharedDirectory = sharedDirectory;
        this.files = new Map();
        this.lastScanTime = null;
    }

    /**
     * Scan the shared directory for files
     * @returns {Promise<Array>} List of files found
     */
    async scanDirectory() {
        try {
            this.logger.info('Starting directory scan', { directory: this.sharedDirectory });
            
            const files = await this.scanRecursive(this.sharedDirectory);
            this.files = new Map(files.map(file => [file.name, file]));
            this.lastScanTime = new Date().toISOString();
            
            this.logger.info('Directory scan completed', { 
                fileCount: files.length,
                lastScanTime: this.lastScanTime
            });
            
            return files;
        } catch (error) {
            this.logger.error('Directory scan failed', { 
                error: error.message, 
                directory: this.sharedDirectory 
            });
            throw error;
        }
    }

    /**
     * Recursively scan directory for files
     * @param {string} dirPath - Directory path to scan
     * @param {string} relativePath - Relative path from shared directory
     * @returns {Promise<Array>} List of files found
     */
    async scanRecursive(dirPath, relativePath = '') {
        try {
            const files = [];
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativeFilePath = path.join(relativePath, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively scan subdirectories
                    const subFiles = await this.scanRecursive(fullPath, relativeFilePath);
                    files.push(...subFiles);
                } else if (entry.isFile()) {
                    // Get file stats
                    const stats = await fs.stat(fullPath);
                    
                    files.push({
                        name: entry.name,
                        path: relativeFilePath,
                        fullPath: fullPath,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        created: stats.birthtime.toISOString(),
                        extension: path.extname(entry.name).toLowerCase(),
                        isDirectory: false
                    });
                }
            }
            
            return files;
        } catch (error) {
            this.logger.warn('Failed to scan directory', { 
                error: error.message, 
                directory: dirPath 
            });
            return [];
        }
    }

    /**
     * Get all files
     * @returns {Array} List of all files
     */
    getFiles() {
        return Array.from(this.files.values());
    }

    /**
     * Get files by extension
     * @param {string} extension - File extension (with or without dot)
     * @returns {Array} List of files with the specified extension
     */
    getFilesByExtension(extension) {
        const ext = extension.startsWith('.') ? extension : `.${extension}`;
        return Array.from(this.files.values()).filter(file => 
            file.extension === ext.toLowerCase()
        );
    }

    /**
     * Search files by name pattern
     * @param {string} pattern - Search pattern
     * @returns {Array} List of matching files
     */
    searchFiles(pattern) {
        const regex = new RegExp(pattern, 'i');
        return Array.from(this.files.values()).filter(file => 
            regex.test(file.name) || regex.test(file.path)
        );
    }

    /**
     * Get file by name
     * @param {string} filename - File name
     * @returns {Object|null} File object or null if not found
     */
    getFile(filename) {
        return this.files.get(filename) || null;
    }

    /**
     * Check if file exists
     * @param {string} filename - File name
     * @returns {boolean} True if file exists
     */
    hasFile(filename) {
        return this.files.has(filename);
    }

    /**
     * Get file statistics
     * @returns {Object} File statistics
     */
    getStats() {
        const files = Array.from(this.files.values());
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const extensions = {};
        
        files.forEach(file => {
            const ext = file.extension || 'no-extension';
            extensions[ext] = (extensions[ext] || 0) + 1;
        });

        return {
            totalFiles: files.length,
            totalSize,
            averageSize: files.length > 0 ? Math.round(totalSize / files.length) : 0,
            lastScanTime: this.lastScanTime,
            extensions,
            largestFile: files.reduce((largest, file) => 
                file.size > largest.size ? file : largest, 
                { size: 0, name: 'none' }
            ),
            smallestFile: files.reduce((smallest, file) => 
                file.size < smallest.size ? file : smallest, 
                { size: Infinity, name: 'none' }
            )
        };
    }

    /**
     * Watch directory for changes
     * @param {Function} callback - Callback function when changes are detected
     */
    async watchDirectory(callback) {
        try {
            const watcher = fs.watch(this.sharedDirectory, { recursive: true });
            
            watcher.on('change', async (eventType, filename) => {
                this.logger.debug('Directory change detected', { eventType, filename });
                
                // Debounce rapid changes
                clearTimeout(this.watchTimeout);
                this.watchTimeout = setTimeout(async () => {
                    try {
                        await this.scanDirectory();
                        if (callback) {
                            callback(this.getFiles());
                        }
                    } catch (error) {
                        this.logger.error('Error during watch callback', { error: error.message });
                    }
                }, 1000); // 1 second debounce
            });

            watcher.on('error', (error) => {
                this.logger.error('Directory watcher error', { error: error.message });
            });

            this.logger.info('Directory watcher started', { directory: this.sharedDirectory });
            return watcher;
        } catch (error) {
            this.logger.error('Failed to start directory watcher', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop watching directory
     * @param {Object} watcher - Watcher object
     */
    stopWatching(watcher) {
        if (watcher) {
            watcher.close();
            this.logger.info('Directory watcher stopped');
        }
    }

    /**
     * Validate file access
     * @param {string} filename - File name
     * @returns {Promise<boolean>} True if file is accessible
     */
    async validateFileAccess(filename) {
        try {
            const file = this.files.get(filename);
            if (!file) {
                return false;
            }

            await fs.access(file.fullPath, fs.constants.R_OK);
            return true;
        } catch (error) {
            this.logger.warn('File access validation failed', { 
                filename, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Get file content info (first few bytes for type detection)
     * @param {string} filename - File name
     * @returns {Promise<Object>} File content info
     */
    async getFileContentInfo(filename) {
        try {
            const file = this.files.get(filename);
            if (!file) {
                throw new Error('File not found');
            }

            const buffer = Buffer.alloc(512); // Read first 512 bytes
            const fd = await fs.open(file.fullPath, 'r');
            const { bytesRead } = await fd.read(buffer, 0, 512, 0);
            await fd.close();

            return {
                filename: file.name,
                size: file.size,
                firstBytes: buffer.slice(0, bytesRead),
                mimeType: this.detectMimeType(buffer.slice(0, bytesRead), file.extension),
                isText: this.isTextFile(buffer.slice(0, bytesRead))
            };
        } catch (error) {
            this.logger.error('Failed to get file content info', { 
                filename, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Detect MIME type from file content
     * @param {Buffer} buffer - File buffer
     * @param {string} extension - File extension
     * @returns {string} MIME type
     */
    detectMimeType(buffer, extension) {
        // Simple MIME type detection based on file signatures
        const signatures = {
            'image/jpeg': [0xFF, 0xD8, 0xFF],
            'image/png': [0x89, 0x50, 0x4E, 0x47],
            'image/gif': [0x47, 0x49, 0x46],
            'application/pdf': [0x25, 0x50, 0x44, 0x46],
            'application/zip': [0x50, 0x4B, 0x03, 0x04],
            'text/plain': null // Will be detected by isTextFile
        };

        for (const [mimeType, signature] of Object.entries(signatures)) {
            if (signature && buffer.length >= signature.length) {
                const matches = signature.every((byte, index) => buffer[index] === byte);
                if (matches) {
                    return mimeType;
                }
            }
        }

        // Fallback to extension-based detection
        const extensionMap = {
            '.txt': 'text/plain',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.html': 'text/html',
            '.css': 'text/css',
            '.xml': 'application/xml'
        };

        return extensionMap[extension] || 'application/octet-stream';
    }

    /**
     * Check if file is text-based
     * @param {Buffer} buffer - File buffer
     * @returns {boolean} True if file appears to be text
     */
    isTextFile(buffer) {
        // Check for null bytes or high ASCII values
        for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
            if (buffer[i] === 0) {
                return false; // Null byte found
            }
            if (buffer[i] > 127) {
                // Check if it's a valid UTF-8 sequence
                if (buffer[i] < 194 || buffer[i] > 244) {
                    return false; // Invalid UTF-8
                }
            }
        }
        return true;
    }
}

module.exports = FileScanner;
