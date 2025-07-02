const express = require('express');
const router = express.Router();
const DownloadService = require('../services/download-service');

const downloadService = new DownloadService();

router.get('/', (req, res) => {
    try {
        const settings = downloadService.loadSettings();
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

router.post('/', (req, res) => {
    try {
        const { useCustomPath, customPath } = req.body;
        
        if (useCustomPath && customPath) {
            const validation = downloadService.validatePath(customPath);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: validation.message
                });
            }
            
            if (!downloadService.ensureDirectory(customPath)) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot create directory'
                });
            }
        }
        
        const result = downloadService.saveSettings({ useCustomPath, customPath });
        
        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
        res.json({
            success: true,
            data: result.settings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = { router, downloadService };