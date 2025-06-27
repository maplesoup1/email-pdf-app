const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const GmailService = require('../services/gmail-service');

const gmailService = new GmailService();

router.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version
        }
    });
});

router.get('/auth', async (req, res) => {
    try {
        const credentialsPath = path.join(__dirname, '../credentials.json');
        const tokenPath = path.join(__dirname, '../token.json');
        
        const hasCredentials = fs.existsSync(credentialsPath);
        const hasToken = fs.existsSync(tokenPath);
        
        let authStatus = 'not_configured';
        let errorMessage = null;
        
        if (!hasCredentials) {
            errorMessage = 'credentials.json 文件不存在';
        } else if (!hasToken) {
            errorMessage = 'token.json 文件不存在，需要完成OAuth授权';
            authStatus = 'credentials_only';
        } else {
            try {
                await gmailService.authenticate();
                authStatus = 'authenticated';
            } catch (error) {
                errorMessage = `认证失败: ${error.message}`;
                authStatus = 'auth_failed';
            }
        }
        
        res.json({
            success: true,
            data: {
                authStatus,
                hasCredentials,
                hasToken,
                errorMessage
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/downloads', (req, res) => {
    try {
        const downloadsDir = path.join(__dirname, '../downloads');
        const attachmentsDir = path.join(downloadsDir, 'attachments');
        
        const getPdfFiles = (dir) => {
            if (!fs.existsSync(dir)) return [];
            
            return fs.readdirSync(dir)
                .filter(file => path.extname(file).toLowerCase() === '.pdf')
                .map(file => {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);
        };
        
        const convertedEmails = getPdfFiles(downloadsDir);
        const attachmentFiles = getPdfFiles(attachmentsDir);
        
        const totalSize = [...convertedEmails, ...attachmentFiles]
            .reduce((sum, file) => sum + file.size, 0);
        
        res.json({
            success: true,
            data: {
                convertedEmails,
                attachmentFiles,
                totalFiles: convertedEmails.length + attachmentFiles.length,
                totalSize,
                convertedEmailsCount: convertedEmails.length,
                attachmentFilesCount: attachmentFiles.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/cleanup', (req, res) => {
    try {
        const { type = 'all', olderThan } = req.body;
        const downloadsDir = path.join(__dirname, '../downloads');
        const attachmentsDir = path.join(downloadsDir, 'attachments');
        
        const cleanupDir = (dir) => {
            if (!fs.existsSync(dir)) return [];
            
            const deletedFiles = [];
            const files = fs.readdirSync(dir);
            
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.isFile()) {
                    let shouldDelete = true;
                    
                    if (olderThan) {
                        const cutoffDate = new Date();
                        cutoffDate.setHours(cutoffDate.getHours() - olderThan);
                        shouldDelete = stats.mtime < cutoffDate;
                    }
                    
                    if (shouldDelete) {
                        fs.unlinkSync(filePath);
                        deletedFiles.push({
                            filename: file,
                            size: stats.size
                        });
                    }
                } else if (stats.isDirectory()) {
                    console.log(`跳过目录: ${file}`);
                }
            });
            
            return deletedFiles;
        };
        
        let deletedFiles = [];
        
        if (type === 'all' || type === 'emails') {
            deletedFiles = [...deletedFiles, ...cleanupDir(downloadsDir)];
        }
        
        if (type === 'all' || type === 'attachments') {
            deletedFiles = [...deletedFiles, ...cleanupDir(attachmentsDir)];
        }
        
        const totalSize = deletedFiles.reduce((sum, file) => sum + file.size, 0);
        
        res.json({
            success: true,
            data: {
                deletedFiles,
                deletedCount: deletedFiles.length,
                totalSize,
                type
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/system', (req, res) => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
        
        res.json({
            success: true,
            data: {
                name: packageJson.name,
                version: packageJson.version,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
                pid: process.pid,
                env: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;