const express = require('express');
const router = express.Router();
const GmailService = require('../services/gmail-service');
const AttachmentService = require('../services/attachment-service');
const fs = require('fs');
const path = require('path');

const gmailService = new GmailService();
const attachmentService = new AttachmentService();

router.get('/:messageId/list', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { sessionId } = req.query;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'SessionId is required' });
        }

        const email = await gmailService.getEmailById(messageId, sessionId);
        const attachments = attachmentService.detectAttachments(email.payload);
        
        res.json({
            success: true,
            data: {
                messageId,
                attachments,
                totalCount: attachments.length,
                pdfCount: attachments.filter(a => a.isPdf).length,
                hasPdfAttachment: attachmentService.hasPdfAttachment(attachments)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/:messageId/download/:attachmentId', async (req, res) => {
    try {
        const { messageId, attachmentId } = req.params;
        const { filename, sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'SessionId is required' });
        }
        
        if (!filename) {
            return res.status(400).json({ success: false, error: 'Filename is required' });
        }
        
        const downloadDir = path.join(__dirname, '../downloads/attachments');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const filePath = await gmailService.downloadAttachment(
            messageId,
            attachmentId,
            filename,
            downloadDir,
            sessionId
        );
        
        res.json({
            success: true,
            data: {
                messageId,
                attachmentId,
                filename,
                filePath: path.basename(filePath),
                size: fs.statSync(filePath).size
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../downloads/attachments', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }
        
        const stats = fs.statSync(filePath);
        const mimeType = attachmentService.getMimeType(filename);
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/:messageId/download-all', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { pdfOnly = false, sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'SessionId is required' });
        }

        const email = await gmailService.getEmailById(messageId, sessionId);
        const attachments = attachmentService.detectAttachments(email.payload);
        const filteredAttachments = pdfOnly ? attachments.filter(a => a.isPdf) : attachments;
        
        if (filteredAttachments.length === 0) {
            return res.status(404).json({
                success: false,
                error: pdfOnly ? 'No PDF attachments found' : 'No attachments found'
            });
        }
        
        const downloadDir = path.join(__dirname, '../downloads/attachments');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        
        const downloadedFiles = [];
        
        for (const attachment of filteredAttachments) {
            try {
                const filePath = await gmailService.downloadAttachment(
                    messageId,
                    attachment.attachmentId,
                    attachment.filename,
                    downloadDir,
                    sessionId
                );
                
                downloadedFiles.push({
                    filename: attachment.filename,
                    filePath: path.basename(filePath),
                    size: fs.statSync(filePath).size,
                    isPdf: attachment.isPdf
                });
            } catch (error) {
                console.error(`Failed to download attachment ${attachment.filename}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            data: {
                messageId,
                downloadedFiles,
                totalCount: downloadedFiles.length,
                pdfCount: downloadedFiles.filter(f => f.isPdf).length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.delete('/cleanup/:messageId', (req, res) => {
    try {
        const { messageId } = req.params;
        const attachmentDir = path.join(__dirname, '../downloads/attachments');
        
        if (!fs.existsSync(attachmentDir)) {
            return res.json({
                success: true,
                message: 'No files to cleanup'
            });
        }
        
        const files = fs.readdirSync(attachmentDir);
        const deletedFiles = [];
        
        files.forEach(file => {
            if (file.includes(messageId.substring(0, 8))) {
                const filePath = path.join(attachmentDir, file);
                fs.unlinkSync(filePath);
                deletedFiles.push(file);
            }
        });
        
        res.json({
            success: true,
            data: {
                messageId,
                deletedFiles,
                deletedCount: deletedFiles.length
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