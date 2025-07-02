const fs = require('fs');
const path = require('path');
const GmailService = require('./gmail-service');
const AttachmentService = require('./attachment-service');
const PdfService = require('./pdf-service');
const HtmlService = require('./html-service');
const PuppeteerService = require('./puppeteer');

class EmailProcessor {
    constructor(sessionId = null) {
        this.gmailService = new GmailService();
        this.attachmentService = new AttachmentService();
        this.pdfService = new PdfService();
        this.htmlService = new HtmlService();
        this.puppeteerService = new PuppeteerService();
        this.sessionId = sessionId;
    }

    async processEmail(messageId, outputDir = null) {
        const email = await this.gmailService.getEmailById(messageId, this.sessionId);
        const attachments = this.attachmentService.detectAttachments(email.payload);
        const hasPdfAttachment = this.attachmentService.hasPdfAttachment(attachments);

        const fileName = this.pdfService.generateSafeFileName(
            email.subject, 
            email.messageId, 
            hasPdfAttachment
        );
        
        const downloadDir = outputDir || path.join(__dirname, 'downloads');
        const outputPath = path.join(downloadDir, fileName);

        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const result = await this.generatePdf(email, attachments, hasPdfAttachment, outputPath, downloadDir);

        return {
            ...email,
            attachments,
            pdfPath: outputPath,
            merged: hasPdfAttachment,
            ...result
        };
    }

    async generatePdf(email, attachments, hasPdfAttachment, outputPath, downloadDir) {
        if (hasPdfAttachment) {
            return await this.generateMergedPdf(email, attachments, outputPath, downloadDir);
        } else {
            return await this.generateEmailOnlyPdf(email, attachments, outputPath);
        }
    }

    async generateMergedPdf(email, attachments, outputPath, downloadDir) {
        const htmlContent = this.htmlService.createEmailHTML(email, attachments);
        const emailPdfBuffer = await this.puppeteerService.convertHtmlToPdf(htmlContent, null, true);
        
        const pdfAttachmentPaths = [];
        for (const attachment of attachments) {
            if (attachment.isPdf) {
                const attachmentPath = await this.gmailService.downloadAttachment(
                    email.messageId,
                    attachment.attachmentId,
                    attachment.filename,
                    downloadDir,
                    this.sessionId
                );
                pdfAttachmentPaths.push(attachmentPath);
            }
        }
        const attachmentPageInfo = await this.analyzeAttachmentPages(email, attachments, pdfAttachmentPaths);
        const mergedPdfBuffer = await this.pdfService.mergePDFs(emailPdfBuffer, pdfAttachmentPaths);
        fs.writeFileSync(outputPath, mergedPdfBuffer);

        this.pdfService.cleanupTempFiles(pdfAttachmentPaths);

        return { merged: true };
    }



    async generateEmailOnlyPdf(email, attachments, outputPath) {
        const htmlContent = this.htmlService.createEmailHTML(email, attachments);
        const emailPdfBuffer = await this.puppeteerService.convertHtmlToPdf(htmlContent, null, true);
        const processedPdfBuffer = await this.pdfService.createEmailOnlyPDF(emailPdfBuffer);
        
        fs.writeFileSync(outputPath, processedPdfBuffer);
        
        return { merged: false };
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
        this.gmailService.setSessionId(sessionId);
    }
    

    async analyzeAttachmentPages(attachments, pdfAttachmentPaths) {
        const attachmentPageInfo = [];
        
        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];
            
            if (attachment.isPdf && pdfAttachmentPaths[i]) {
                try {
                    const pdfBuffer = fs.readFileSync(pdfAttachmentPaths[i]);
                    const pdf = await PDFDocument.load(pdfBuffer);
                    const pageCount = pdf.getPageCount();
                    
                    attachmentPageInfo.push({
                        originalName: attachment.filename,
                        pageCount: pageCount,
                        attachmentId: attachment.attachmentId,
                        mimeType: attachment.mimeType,
                        size: attachment.size
                    });
                } catch (error) {
                    console.error(`Failed to analyze PDF ${attachment.filename}:`, error);
                    attachmentPageInfo.push({
                        originalName: attachment.filename,
                        pageCount: 1,
                        attachmentId: attachment.attachmentId,
                        mimeType: attachment.mimeType,
                        size: attachment.size
                    });
                }
            }
        }
        
        return attachmentPageInfo;
    }
}

module.exports = EmailProcessor;