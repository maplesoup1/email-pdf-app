const express = require('express');
const router = express.Router();
const EmailProcessor = require('../services/email-processor');
const EmailProviderService = require('../services/email-provider-service');
const AttachmentService = require('../services/attachment-service');
const fs = require('fs');
const path = require('path');

const emailProviderService = new EmailProviderService();
const attachmentService = new AttachmentService();

router.get('/latest', async (req, res) => {
    try {
        const { provider } = req.query;
        const email = await emailProviderService.getLatestEmail(provider);
        const attachments = await emailProviderService.getAttachments(email.messageId, provider);
        
        res.json({
            success: true,
            data: {
                ...email,
                attachments,
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

router.get('/list', async (req, res) => {
    try {
        const { maxResults = 10, pageToken, provider } = req.query;
        const emailData = await emailProviderService.getEmailList(parseInt(maxResults), provider);
        
        res.json({
            success: true,
            data: {
                ...emailData,
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

router.get('/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { provider } = req.query;
        
        const email = await emailProviderService.getEmailById(messageId, provider);
        const attachments = await emailProviderService.getAttachments(messageId, provider);
        
        res.json({
            success: true,
            data: {
                ...email,
                attachments,
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

router.post('/convert-latest', async (req, res) => {
    try {
        const { mode = 'merged', attachmentTypes = [], provider } = req.body;
        
        const email = await emailProviderService.getLatestEmail(provider);
        const attachments = await emailProviderService.getAttachments(email.messageId, provider);
        const hasPdfAttachment = attachmentService.hasPdfAttachment(attachments);
        
        const downloadDir = path.join(__dirname, '../downloads');
        const attachmentsDir = path.join(downloadDir, 'attachments');
        
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        if (!fs.existsSync(attachmentsDir)) {
            fs.mkdirSync(attachmentsDir, { recursive: true });
        }
        
        let result = {};
        
        switch (mode) {
            case 'email_only':
                result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                break;
                
            case 'attachments_only':
                result = await downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes, provider);
                break;
                
            case 'merged':
                if (!hasPdfAttachment) {
                    console.log('最新邮件没有PDF附件，自动降级为仅邮件模式');
                    result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                    result.mode = 'merged_fallback';
                } else {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider);
                }
                break;
                
            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider);
                } else {
                    result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                }
                break;
        }
        
        res.json({
            success: true,
            data: {
                messageId: email.messageId,
                subject: email.subject,
                mode: result.mode,
                files: result.files,
                attachmentCount: attachments.length,
                pdfAttachmentCount: attachments.filter(a => a.isPdf).length,
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

router.post('/convert/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { mode = 'merged', attachmentTypes = [], provider } = req.body;
        
        const email = await emailProviderService.getEmailById(messageId, provider);
        const attachments = await emailProviderService.getAttachments(messageId, provider);
        const hasPdfAttachment = attachmentService.hasPdfAttachment(attachments);
        
        const downloadDir = path.join(__dirname, '../downloads');
        const attachmentsDir = path.join(downloadDir, 'attachments');
        
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        if (!fs.existsSync(attachmentsDir)) {
            fs.mkdirSync(attachmentsDir, { recursive: true });
        }
        
        let result = {};
        
        switch (mode) {
            case 'email_only':
                result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                break;
                
            case 'attachments_only':
                result = await downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes, provider);
                break;
                
            case 'merged':
                if (!hasPdfAttachment) {
                    console.log('没有PDF附件，自动降级为仅邮件模式');
                    result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                    result.mode = 'merged_fallback';
                } else {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider);
                }
                break;
                
            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider);
                } else {
                    result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                }
                break;
        }
        
        res.json({
            success: true,
            data: {
                messageId: email.messageId,
                subject: email.subject,
                mode: result.mode,
                files: result.files,
                attachmentCount: attachments.length,
                pdfAttachmentCount: attachments.filter(a => a.isPdf).length,
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

async function generateEmailOnlyPdf(email, attachments, downloadDir) {
    const emailProcessor = new EmailProcessor();
    const fileName = emailProcessor.pdfService.generateSafeFileName(email.subject, email.messageId);
    const outputPath = path.join(downloadDir, fileName);
    
    await emailProcessor.generateEmailOnlyPdf(email, attachments, outputPath);
    
    return {
        mode: 'email_only',
        files: [{
            type: 'email_pdf',
            filename: fileName,
            path: outputPath,
            size: fs.statSync(outputPath).size
        }]
    };
}

async function downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes, provider) {
    let filteredAttachments = attachments;
    
    if (attachmentTypes.length > 0) {
        filteredAttachments = attachments.filter(att => {
            if (attachmentTypes.includes('pdf') && att.isPdf) return true;
            if (attachmentTypes.includes('images') && att.mimeType.startsWith('image/')) return true;
            if (attachmentTypes.includes('documents') && 
                (att.mimeType.includes('document') || att.mimeType.includes('text') || 
                 att.mimeType.includes('spreadsheet') || att.mimeType.includes('presentation'))) return true;
            if (attachmentTypes.includes('others') && 
                !att.isPdf && !att.mimeType.startsWith('image/') && 
                !att.mimeType.includes('document') && !att.mimeType.includes('text') &&
                !att.mimeType.includes('spreadsheet') && !att.mimeType.includes('presentation')) return true;
            return false;
        });
    }
    
    const downloadedFiles = [];
    
    for (const attachment of filteredAttachments) {
        try {
            const filePath = await emailProviderService.downloadAttachment(
                email.messageId,
                attachment.attachmentId,
                attachment.filename,
                attachmentsDir,
                provider
            );
            
            downloadedFiles.push({
                type: 'attachment',
                filename: attachment.filename,
                path: filePath,
                size: attachment.size,
                mimeType: attachment.mimeType,
                isPdf: attachment.isPdf
            });
        } catch (error) {
            console.error(`下载附件失败 ${attachment.filename}:`, error.message);
        }
    }
    
    return {
        mode: 'attachments_only',
        files: downloadedFiles
    };
}

async function generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider) {
    const emailProcessor = new EmailProcessor();
    const fileName = emailProcessor.pdfService.generateSafeFileName(email.subject + '_merged', email.messageId);
    const outputPath = path.join(downloadDir, fileName);
    
    const result = await emailProcessor.generateMergedPdf(email, attachments, outputPath, attachmentsDir, provider);
    
    return {
        mode: 'merged',
        files: [{
            type: 'merged_pdf',
            filename: fileName,
            path: outputPath,
            size: fs.statSync(outputPath).size,
            merged: true
        }]
    };
}

router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../downloads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }
        
        res.setHeader('Content-Type', 'application/pdf');
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

router.delete('/downloads/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../downloads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }
        
        fs.unlinkSync(filePath);
        
        res.json({
            success: true,
            message: '文件删除成功'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;