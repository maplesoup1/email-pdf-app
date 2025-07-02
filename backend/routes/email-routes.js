const express = require('express');
const router = express.Router();
const EmailProcessor = require('../services/email-processor');
const AttachmentService = require('../services/attachment-service');
const GmailAuthService = require('../services/multi-user-gmail-auth');
const { generateDownloadPath, ensureDirectory, loadSettings } = require('./download-routes');
const fs = require('fs');
const path = require('path');
const attachmentService = new AttachmentService();

router.get('/list', async (req, res) => {
    try {
        const { maxResults = 20, sessionId } = req.query;
        res.json({
            success: true,
            data: {
                ...emailData,
                sessionId,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { provider, sessionId } = req.query;
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
        res.status(500).json({ success: false, error: error.message });
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
        const baseDownloadPath = settings.useCustomPath
            ? generateDownloadPath(settings, email.subject, messageId)
            : path.join(__dirname, '../downloads');

        const downloadDir = ensureDirectory(baseDownloadPath) ? baseDownloadPath : path.join(__dirname, '../downloads');
        const attachmentsDir = ensureDirectory(path.join(downloadDir, 'attachments')) ? path.join(downloadDir, 'attachments') : downloadDir;

        let result = {};

        const emailProcessor = new EmailProcessor(sessionId);

        switch (mode) {
            case 'email_only':
                result = await emailProcessor.generateEmailOnlyPdf(email, attachments, downloadDir);
                break;

            case 'attachments_only':
                result = await emailProcessor.downloadAttachmentsOnly(email, attachments, attachmentsDir, attachmentTypes, provider);
                break;

            case 'merged':
                if (!hasPdfAttachment) {
                    console.log('No PDF attachments, fallback to email only mode');
                    result = await emailProcessor.generateEmailOnlyPdf(email, attachments, downloadDir);
                    result.mode = 'merged_fallback';
                } else {
                    result = await emailProcessor.generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider);
                }
                break;

            case 'auto':
            default:
                if (hasPdfAttachment) {
                    result = await emailProcessor.generateMergedPdf(email, attachments, downloadDir, attachmentsDir, provider);
                } else {
                    result = await emailProcessor.generateEmailOnlyPdf(email, attachments, downloadDir);
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
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
