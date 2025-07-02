const express = require('express');
const router = express.Router();
const DemergeService = require('../services/demerge-service');
const { downloadService } = require('./download-routes');
const path = require('path');

const demergeService = new DemergeService();

router.get('/list', (req, res) => {
    try {
        const downloadsDir = downloadService.getDownloadPath();
        const mergedFiles = demergeService.getMergedFiles(downloadsDir);

        res.json({ 
            success: true, 
            data: mergedFiles 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

router.get('/analyze/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        demergeService.validateFilename(filename);
        
        const downloadsDir = downloadService.getDownloadPath();
        const filePath = path.join(downloadsDir, filename);
        
        const analysis = await demergeService.analyzePDF(filePath);

        res.json({ 
            success: true, 
            data: {
                filename,
                ...analysis
            }
        });
    } catch (error) {
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({ 
            success: false, 
            error: error.message 
        });
    }
});

router.post('/split/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const { emailPageCount = 1, attachmentInfo = [], outputDir } = req.body;

        demergeService.validateFilename(filename);
        
        const validatedEmailPageCount = demergeService.validatePageCount(emailPageCount);
        const validatedAttachmentInfo = demergeService.validateAttachmentInfo(attachmentInfo);

        const downloadsDir = downloadService.getDownloadPath();
        const filePath = path.join(downloadsDir, filename);
        
        const targetOutputDir = outputDir || downloadsDir;
        demergeService.ensureDirectory(targetOutputDir);

        const result = await demergeService.splitPDF(
            filePath,
            validatedEmailPageCount,
            validatedAttachmentInfo,
            targetOutputDir
        );

        res.json({
            success: true,
            data: {
                originalFile: filename,
                outputDir: targetOutputDir,
                demergeFolder: result.demergeFolder,
                separatedFiles: result.separatedFiles,
                totalFiles: result.totalFiles,
                emailPageCount: result.emailPageCount,
                attachmentInfo: result.attachmentInfo
            }
        });
    } catch (error) {
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({ 
            success: false, 
            error: error.message 
        });
    }
});

router.delete('/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        
        demergeService.validateFilename(filename);
        
        const downloadsDir = downloadService.getDownloadPath();
        const filePath = path.join(downloadsDir, filename);

        demergeService.deleteFile(filePath);

        res.json({
            success: true,
            message: 'File deleted successfully',
            filename
        });
    } catch (error) {
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({ 
            success: false, 
            error: error.message 
        });
    }
});

router.post('/cleanup', (req, res) => {
    try {
        const downloadsDir = downloadService.getDownloadPath();
        const mergedFiles = demergeService.getMergedFiles(downloadsDir);
        
        let deletedCount = 0;
        const errors = [];

        mergedFiles.forEach(file => {
            try {
                demergeService.deleteFile(file.path);
                deletedCount++;
            } catch (error) {
                errors.push({
                    filename: file.filename,
                    error: error.message
                });
            }
        });

        res.json({
            success: true,
            data: {
                deletedCount,
                totalFiles: mergedFiles.length,
                errors: errors.length > 0 ? errors : undefined
            },
            message: `Cleaned up ${deletedCount} merged PDF files`
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;