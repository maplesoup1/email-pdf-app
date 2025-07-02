const express = require('express');
const router = express.Router();
const EmailProcessor = require('../services/email-processor');
const GmailService = require('../services/gmail-service');
const AttachmentService = require('../services/attachment-service');
const GmailAuthService = require('../services/multi-user-gmail-auth');
const fs = require('fs');
const path = require('path');

const gmailService = new GmailService();
const attachmentService = new AttachmentService();

router.get('/list', async (req, res) => {
    try {
        const { maxResults = 20, sessionId, pageToken } = req.query;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'SessionId is required' });
        }

        const emailData = await gmailService.getEmailList(maxResults, sessionId, pageToken);
        
        res.json({
            success: true,
            data: {
                ...emailData,
                sessionId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:messageId', async (req, res) => {
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
                ...email,
                attachments,
                hasPdfAttachment: attachmentService.hasPdfAttachment(attachments)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/convert/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { sessionId, outputDir } = req.body;

        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'SessionId is required' });
        }

        const gmail = await GmailAuthService.getGmailClient(sessionId);
        try {
            await gmail.users.messages.get({ userId: 'me', id: messageId });
        } catch {
            throw new Error('Invalid messageId for this session. Possibly from a different Gmail account.');
        }

        const emailProcessor = new EmailProcessor(sessionId);
        const result = await emailProcessor.processEmail(messageId, outputDir);

        res.json({
            success: true,
            data: {
                messageId: result.messageId,
                subject: result.subject,
                pdfPath: result.pdfPath,
                merged: result.merged,
                attachmentCount: result.attachments.length,
                pdfAttachmentCount: result.attachments.filter(a => a.isPdf).length,
                sessionId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:messageId/download/:attachmentId', async (req, res) => {
    try {
        const { messageId, attachmentId } = req.params;
        const { sessionId, filename } = req.query;

        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'SessionId is required' });
        }

        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filePath = await gmailService.downloadAttachment(
            messageId,
            attachmentId,
            filename,
            tempDir,
            sessionId
        );

        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Download failed' });
                }
            }
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;