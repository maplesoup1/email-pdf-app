const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');


const SETTINGS_FILE = path.join(__dirname, '../config/download-settings.json');

const configDir = path.dirname(SETTINGS_FILE);
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

const defaultSettings = {
    useCustomPath: false,
    customPath: '',
    autoCreateFolder: true,
    folderNaming: 'date'
};

const loadSettings = () => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            return { ...defaultSettings, ...JSON.parse(data) };
        }
    } catch (error) {
        console.error('Failed to load download settings:', error);
    }
    return defaultSettings;
};

// 保存设置
const saveSettings = (settings) => {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save download settings:', error);
        return false;
    }
};

// Generate download path based on settings 
const generateDownloadPath = (settings, emailSubject = '', messageId = '') => {
    if (!settings.useCustomPath || !settings.customPath) {
        return null;
    }

    let basePath = settings.customPath;
    
    if (settings.folderNaming === 'date') {
        const today = new Date().toISOString().split('T')[0];
        basePath = path.join(basePath, today);
    } else if (settings.folderNaming === 'email' && emailSubject) {
        const cleanSubject = emailSubject
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 50);
        basePath = path.join(basePath, cleanSubject || `email_${messageId.substring(0, 8)}`);
    }
    
    return basePath;
};

// 创建目录
const ensureDirectory = (dirPath) => {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error('Failed to create directory:', error);
        return false;
    }
};

// 验证路径
const validatePath = (inputPath) => {
    try {
        if (!inputPath) {
            return { valid: false, message: 'Path is required' };
        }
        
        if (!path.isAbsolute(inputPath)) {
            return { valid: false, message: 'Please provide absolute path' };
        }
    
        const normalizedPath = path.normalize(inputPath);
        const invalidChars = /[<>"|?*]/;
        if (invalidChars.test(inputPath)) {
            return { valid: false, message: 'Path contains invalid characters' };
        }
        const parentDir = path.dirname(normalizedPath);
        if (!fs.existsSync(parentDir)) {
            return { valid: false, message: 'Parent directory does not exist' };
        }
        
        return { 
            valid: true, 
            message: 'Path is valid',
            normalizedPath: normalizedPath 
        };
    } catch (error) {
        return { valid: false, message: 'Invalid path format' };
    }
};

router.get('/download-path', (req, res) => {
    try {
        const settings = loadSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 保存下载设置
router.post('/download-path', (req, res) => {
    try {
        const settings = req.body;
        
        if (settings.useCustomPath && settings.customPath) {
            const validation = validatePath(settings.customPath);
            
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.message
                });
            }
            
            // 使用标准化的路径
            settings.customPath = validation.normalizedPath;
            
            if (settings.autoCreateFolder) {
                if (!ensureDirectory(settings.customPath)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Cannot create specified directory'
                    });
                }
            } else {
                if (!fs.existsSync(settings.customPath)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Specified path does not exist'
                    });
                }
            }
        }
        
        if (!saveSettings(settings)) {
            return res.status(500).json({
                success: false,
                error: 'Failed to save settings'
            });
        }
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 验证路径端点
router.post('/validate-path', (req, res) => {
    try {
        const { path: inputPath } = req.body;
        
        if (!inputPath) {
            return res.status(400).json({
                success: false,
                error: 'Path is required'
            });
        }
        
        const validation = validatePath(inputPath);
        
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.message
            });
        }
        
        const pathInfo = {
            path: validation.normalizedPath,
            exists: fs.existsSync(validation.normalizedPath),
            isDirectory: false,
            writable: false,
            canCreate: false
        };
        
        if (pathInfo.exists) {
            const stats = fs.statSync(validation.normalizedPath);
            pathInfo.isDirectory = stats.isDirectory();
            
            if (pathInfo.isDirectory) {
                try {
                    fs.accessSync(validation.normalizedPath, fs.constants.W_OK);
                    pathInfo.writable = true;
                } catch (error) {
                    pathInfo.writable = false;
                }
            }
        } else {
            // 检查是否可以在父目录中创建
            const parentDir = path.dirname(validation.normalizedPath);
            if (fs.existsSync(parentDir)) {
                try {
                    fs.accessSync(parentDir, fs.constants.W_OK);
                    pathInfo.canCreate = true;
                } catch (error) {
                    pathInfo.canCreate = false;
                }
            }
        }
        
        res.json({
            success: true,
            data: pathInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/suggested-paths', (req, res) => {
    try {
        const homeDir = os.homedir();
        const platform = os.platform();
        
        let suggestions = [];
        
        if (platform === 'win32') {
            suggestions = [
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Desktop'),
                path.join(homeDir, 'Documents'),
                'C:\\EmailPDFs',
                'D:\\EmailPDFs'
            ];
        } else if (platform === 'darwin') {
            suggestions = [
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Desktop'),
                path.join(homeDir, 'Documents'),
                path.join(homeDir, 'EmailPDFs')
            ];
        } else {
            suggestions = [
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Desktop'),
                path.join(homeDir, 'Documents'),
                path.join(homeDir, 'EmailPDFs')
            ];
        }
        
        // 检查哪些路径存在
        const pathsWithStatus = suggestions.map(suggestedPath => ({
            path: suggestedPath,
            exists: fs.existsSync(suggestedPath),
            label: path.basename(suggestedPath) === suggestedPath.split(path.sep).pop() 
                ? suggestedPath.split(path.sep).slice(-2).join(path.sep)
                : path.basename(suggestedPath)
        }));
        
        res.json({
            success: true,
            data: {
                suggestions: pathsWithStatus,
                platform: platform,
                homeDir: homeDir
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = { router, generateDownloadPath, ensureDirectory, loadSettings };