const express = require('express');
const router = express.Router();
const EmailProcessor = require('../services/email-processor');
const GmailService = require('../services/gmail-service');
const AttachmentService = require('../services/attachment-service');
const fs = require('fs');
const path = require('path');

const emailProcessor = new EmailProcessor();
const gmailService = new GmailService();
const attachmentService = new AttachmentService();

router.get('/latest', async (req, res) => {
    try {
        const email = await gmailService.getLatestEmail();
        const attachments = attachmentService.detectAttachments(email.payload);
        
        res.json({
            success: true,
            data: {
                ...email,
                attachments,
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

router.get('/list', async (req, res) => {
    try {
        const { maxResults = 10, pageToken } = req.query;
        await gmailService.authenticate();
        
        const listResponse = await gmailService.gmail.users.messages.list({
            userId: 'me',
            maxResults: parseInt(maxResults),
            pageToken
        });
        
        const emails = [];
        if (listResponse.data.messages) {
            for (const message of listResponse.data.messages) {
                const messageResponse = await gmailService.gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'metadata',
                    metadataHeaders: ['Subject', 'From', 'Date']
                });
                
                const headers = messageResponse.data.payload.headers;
                emails.push({
                    messageId: message.id,
                    subject: headers.find(h => h.name === 'Subject')?.value || '',
                    from: headers.find(h => h.name === 'From')?.value || '',
                    date: headers.find(h => h.name === 'Date')?.value || '',
                    snippet: messageResponse.data.snippet
                });
            }
        }
        
        res.json({
            success: true,
            data: {
                emails,
                nextPageToken: listResponse.data.nextPageToken
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
        await gmailService.authenticate();
        
        const messageResponse = await gmailService.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        const email = gmailService.parseEmailMessage(messageResponse.data);
        const attachments = attachmentService.detectAttachments(email.payload);
        
        res.json({
            success: true,
            data: {
                ...email,
                attachments,
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

router.post('/convert-latest', async (req, res) => {
    try {
        const { mode = 'merged', attachmentTypes = [] } = req.body;
        
        const email = await gmailService.getLatestEmail();
        const attachments = attachmentService.detectAttachments(email.payload);
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
                result = await downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes);
                break;
                
            case 'merged':
                if (!hasPdfAttachment) {
                    return res.status(400).json({
                        success: false,
                        error: '最新邮件没有PDF附件，无法进行合并'
                    });
                }
                result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir);
                break;
                
            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir);
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
                pdfAttachmentCount: attachments.filter(a => a.isPdf).length
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
        const { mode = 'merged', attachmentTypes = [] } = req.body;
        
        await gmailService.authenticate();
        
        const messageResponse = await gmailService.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        const email = gmailService.parseEmailMessage(messageResponse.data);
        const attachments = attachmentService.detectAttachments(email.payload);
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
                result = await downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes);
                break;
                
            case 'merged':
                if (!hasPdfAttachment) {
                    return res.status(400).json({
                        success: false,
                        error: '此邮件没有PDF附件，无法进行合并'
                    });
                }
                result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir);
                break;
                
            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir);
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
                pdfAttachmentCount: attachments.filter(a => a.isPdf).length
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

async function downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes) {
    const gmail = new GmailService();
    await gmail.authenticate();
    
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
            const filePath = await gmail.downloadAttachment(
                email.messageId,
                attachment.attachmentId,
                attachment.filename,
                attachmentsDir
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

async function generateMergedPdf(email, attachments, downloadDir, attachmentsDir) {
    const emailProcessor = new EmailProcessor();
    const fileName = emailProcessor.pdfService.generateSafeFileName(email.subject + '_merged', email.messageId);
    const outputPath = path.join(downloadDir, fileName);
    
    const result = await emailProcessor.generateMergedPdf(email, attachments, outputPath, attachmentsDir);
    
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