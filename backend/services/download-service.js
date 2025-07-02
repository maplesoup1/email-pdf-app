const fs = require('fs');
const path = require('path');

class DownloadService {
    constructor() {
        this.SETTINGS_FILE = path.join(__dirname, '../config/download-settings.json');
        this.defaultSettings = {
            useCustomPath: false,
            customPath: ''
        };
        
        this.initializeConfig();
    }

    initializeConfig() {
        const configDir = path.dirname(this.SETTINGS_FILE);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.SETTINGS_FILE)) {
                const data = fs.readFileSync(this.SETTINGS_FILE, 'utf8');
                return { ...this.defaultSettings, ...JSON.parse(data) };
            }
        } catch (error) {
            console.error('Failed to load download settings:', error);
        }
        return this.defaultSettings;
    }

    saveSettings(settings) {
        try {
            const mergedSettings = { ...this.defaultSettings, ...settings };
            fs.writeFileSync(this.SETTINGS_FILE, JSON.stringify(mergedSettings, null, 2));
            return { success: true, settings: mergedSettings };
        } catch (error) {
            console.error('Failed to save download settings:', error);
            return { success: false, error: error.message };
        }
    }

    getDownloadPath() {
        const settings = this.loadSettings();
        if (settings.useCustomPath && settings.customPath) {
            return settings.customPath;
        }
        return path.join(__dirname, '../downloads');
    }

    ensureDirectory(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            return true;
        } catch (error) {
            console.error('Failed to create directory:', error);
            return false;
        }
    }

    validatePath(inputPath) {
        try {
            if (!inputPath) {
                return { valid: false, message: 'Path is required' };
            }
            
            if (!path.isAbsolute(inputPath)) {
                return { valid: false, message: 'Please provide absolute path' };
            }
        
            const normalizedPath = path.normalize(inputPath);
            
            try {
                fs.accessSync(path.dirname(normalizedPath), fs.constants.W_OK);
            } catch (error) {
                return { valid: false, message: 'Directory is not writable' };
            }
            
            return { 
                valid: true, 
                normalizedPath: normalizedPath 
            };
        } catch (error) {
            return { valid: false, message: 'Invalid path format' };
        }
    }
}

module.exports = DownloadService;