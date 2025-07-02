const express = require('express');
const router = express.Router();
const EmailProcessor = require('../services/email-processor');
const EmailProviderService = require('../services/email-provider-service');
const AttachmentService = require('../services/attachment-service');
const GmailAuthService = require('../services/multi-user-gmail-auth');
const { generateDownloadPath, ensureDirectory, loadSettings } = require('./download-settings');
const fs = require('fs');
const path = require('path');

const emailProviderService = new EmailProviderService();
const attachmentService = new AttachmentService();

// Basic footer configuration - just page numbers and date
const BASIC_FOOTER_CONFIG = {
    footer: {
        enabled: true,
        showPageNumbers: true,
        text: 'Generated on {datetime}',
        fontSize: 9,
        color: { r: 0.5, g: 0.5, b: 0.5 },
        margin: 20,
        alignment: 'center'
    }
};

router.get('/latest', async (req, res) => {
    try {
        const { provider, sessionId } = req.query;
        const email = await emailProviderService.getLatestEmail(provider, sessionId);
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
        const { maxResults = 20, sessionId, provider } = req.query;
        const emailData = await emailProviderService.getEmailList(parseInt(maxResults), provider, sessionId);

        res.json({
            success: true,
            data: {
                ...emailData,
                sessionId,
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
        const { sessionId } = req.query;
        
        const email = await emailProviderService.getEmailById(messageId, provider, sessionId);
        const attachments = await emailProviderService.getAttachments(messageId, provider,sessionId);
        
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
        const { mode = 'merged', attachmentTypes = [], provider, downloadSettings, sessionId } = req.body;
        
        const email = await emailProviderService.getLatestEmail(provider, sessionId);
        const attachments = await emailProviderService.getAttachments(email.messageId, provider, sessionId);
        const hasPdfAttachment = attachmentService.hasPdfAttachment(attachments);
        
        const settings = downloadSettings || loadSettings();
        let downloadDir, attachmentsDir;
        
        if (settings.useCustomPath) {
            const customPath = generateDownloadPath(settings, email.subject, email.messageId);
            if (customPath && ensureDirectory(customPath)) {
                downloadDir = customPath;
                attachmentsDir = customPath;
            } else {
                downloadDir = path.join(__dirname, '../downloads');
                attachmentsDir = path.join(downloadDir, 'attachments');
            }
        } else {
            downloadDir = path.join(__dirname, '../downloads');
            attachmentsDir = path.join(downloadDir, 'attachments');
        }
        
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
                result = await downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes, provider, sessionId);
                break;
                
            case 'merged':
                if (!hasPdfAttachment) {
                    console.log('Latest email has no PDF attachments, fallback to email only mode');
                    result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                    result.mode = 'merged_fallback';
                } else {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider,sessionId);
                }
                break;
                
            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider,sessionId);
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
                downloadPath: settings.useCustomPath ? downloadDir : null,
                useCustomPath: settings.useCustomPath,
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
        const { mode = 'merged', attachmentTypes = [], provider, downloadSettings, sessionId } = req.body;
        const gmail = await GmailAuthService.getGmailClient(sessionId);
        try {
            await gmail.users.messages.get({ userId: 'me', id: messageId });
          } catch {
            throw new Error('Invalid messageId for this session. Possibly from a different Gmail account.');
          }
        const email = await emailProviderService.getEmailById(messageId, provider, sessionId);
        const attachments = await emailProviderService.getAttachments(messageId, provider, sessionId);
        const hasPdfAttachment = attachmentService.hasPdfAttachment(attachments);
        
        const settings = downloadSettings || loadSettings();
        let downloadDir, attachmentsDir;
        
        if (settings.useCustomPath) {
            const customPath = generateDownloadPath(settings, email.subject, messageId);
            if (customPath && ensureDirectory(customPath)) {
                downloadDir = customPath;
                attachmentsDir = customPath;
            } else {
                downloadDir = path.join(__dirname, '../downloads');
                attachmentsDir = path.join(downloadDir, 'attachments');
            }
        } else {
            downloadDir = path.join(__dirname, '../downloads');
            attachmentsDir = path.join(downloadDir, 'attachments');
        }
        
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
                    console.log('No PDF attachments, fallback to email only mode');
                    result = await generateEmailOnlyPdf(email, attachments, downloadDir);
                    result.mode = 'merged_fallback';
                } else {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider,sessionId);
                }
                break;
                
            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider),sessionId;
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
                downloadPath: settings.useCustomPath ? downloadDir : null,
                useCustomPath: settings.useCustomPath,
                attachmentCount: attachments.length,
                pdfAttachmentCount: attachments.filter(a => a.isPdf).length,
                provider: provider || emailProviderService.getCurrentProvider(),
                sessionId
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

async function addBasicFooterToPdf(pdfPath) {
    const emailProcessor = new EmailProcessor();
    
    if (fs.existsSync(pdfPath)) {
        try {
            const pdfBuffer = fs.readFileSync(pdfPath);
            const enhancedPdfBuffer = await emailProcessor.pdfService.createEmailOnlyPDF(pdfBuffer, BASIC_FOOTER_CONFIG);
            fs.writeFileSync(pdfPath, enhancedPdfBuffer);
            console.log(`✅ Added basic footer to: ${path.basename(pdfPath)}`);
        } catch (error) {
            console.error(`Failed to add footer to ${path.basename(pdfPath)}:`, error.message);
        }
    }
}

async function generateEmailOnlyPdf(email, attachments, downloadDir, sessionId) {
    const emailProcessor = new EmailProcessor(sessionId);
    const fileName = emailProcessor.pdfService.generateSafeFileName(email.subject, email.messageId);
    const outputPath = path.join(downloadDir, fileName);
    
    // Generate the PDF
    await emailProcessor.generateEmailOnlyPdf(email, attachments, outputPath);
    
    // Add basic footer with page information
    await addBasicFooterToPdf(outputPath);
    
    return {
        mode: 'email_only',
        files: [{
            type: 'email_pdf',
            filename: fileName,
            path: outputPath,
            size: fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0
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
            console.error(`Download attachment failed ${attachment.filename}:`, error.message);
        }
    }
    
    return {
        mode: 'attachments_only',
        files: downloadedFiles
    };
}

async function generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider,sessionId) {
    const emailProcessor = new EmailProcessor(sessionId);
    const fileName = emailProcessor.pdfService.generateSafeFileName(email.subject, email.messageId, true);
    const outputPath = path.join(downloadDir, fileName);
    
    // Generate the merged PDF
    await emailProcessor.generateMergedPdf(email, attachments, outputPath, attachmentsDir, provider);
    
    // Add basic footer with page information
    await addBasicFooterToPdf(outputPath);
    
    return {
        mode: 'merged',
        files: [{
            type: 'merged_pdf',
            filename: fileName,
            path: outputPath,
            size: fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0,
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
                error: 'File not found'
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
                error: 'File not found'
            });
        }
        
        fs.unlinkSync(filePath);
        
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;