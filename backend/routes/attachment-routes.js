const express = require('express');
const router = express.Router();
const EmailProviderService = require('../services/email-provider-service');
const AttachmentService = require('../services/attachment-service');
const fs = require('fs');
const path = require('path');

const emailProviderService = new EmailProviderService();
const attachmentService = new AttachmentService();

router.get('/:messageId/list', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { provider } = req.query;
        
        const attachments = await emailProviderService.getAttachments(messageId, provider);
        
        res.json({
            success: true,
            data: {
                messageId,
                attachments,
                totalCount: attachments.length,
                pdfCount: attachments.filter(a => a.isPdf).length,
                hasPdfAttachment: attachmentService.hasPdfAttachment(attachments),
                provider: provider || emailProviderService.getCurrentProvider()
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
        const { filename } = req.body;
        const { provider } = req.query;
        
        if (!filename) {
            return res.status(400).json({
                success: false,
                error: '缺少文件名参数'
            });
        }
        
        const downloadDir = path.join(__dirname, '../downloads/attachments');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        
        const filePath = await emailProviderService.downloadAttachment(messageId, attachmentId, filename, downloadDir, provider);
        
        res.json({
            success: true,
            data: {
                messageId,
                attachmentId,
                filename,
                filePath: path.basename(filePath),
                size: fs.statSync(filePath).size,
                provider: provider || emailProviderService.getCurrentProvider()
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
                error: '附件不存在'
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
        const { pdfOnly = false } = req.body;
        
        await gmailService.authenticate();
        
        const messageResponse = await gmailService.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        const attachments = attachmentService.detectAttachments(messageResponse.data.payload);
        const filteredAttachments = pdfOnly ? attachments.filter(a => a.isPdf) : attachments;
        
        if (filteredAttachments.length === 0) {
            return res.status(404).json({
                success: false,
                error: pdfOnly ? '没有找到PDF附件' : '没有找到附件'
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
                    downloadDir
                );
                
                downloadedFiles.push({
                    filename: attachment.filename,
                    filePath: path.basename(filePath),
                    size: fs.statSync(filePath).size,
                    isPdf: attachment.isPdf
                });
            } catch (error) {
                console.error(`下载附件失败 ${attachment.filename}:`, error.message);
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
                message: '没有需要清理的文件'
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