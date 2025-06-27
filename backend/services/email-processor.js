const fs = require('fs');
const path = require('path');
const GmailService = require('./gmail-service');
const AttachmentService = require('./attachment-service');
const PdfService = require('./pdf-service');
const HtmlService = require('./html-service');
const PuppeteerService = require('./puppeteer');

class EmailProcessor {
    constructor() {
        this.gmailService = new GmailService();
        this.attachmentService = new AttachmentService();
        this.pdfService = new PdfService();
        this.htmlService = new HtmlService();
        this.puppeteerService = new PuppeteerService();
    }

    async processLatestEmail() {
        const email = await this.gmailService.getLatestEmail();
        const attachments = this.attachmentService.detectAttachments(email.payload);
        const hasPdfAttachment = this.attachmentService.hasPdfAttachment(attachments);

        console.log('=== 邮件信息 ===');
        console.log('主题:', email.subject);
        console.log('发件人:', email.from);
        console.log('日期:', email.date);
        console.log('内容预览:', email.body.substring(0, 100) + '...');

        if (attachments.length > 0) {
            console.log('\n=== 附件信息 ===');
            attachments.forEach((att, index) => {
                console.log(`${index + 1}. ${att.filename}`);
                console.log(`   类型: ${att.mimeType}`);
                console.log(`   大小: ${(att.size / 1024).toFixed(2)} KB`);
                console.log(`   是否PDF: ${att.isPdf ? '是' : '否'}`);
            });

            if (hasPdfAttachment) {
                console.log('\n✅ 发现PDF附件，将进行合并导出!');
            } else {
                console.log('\n⚠️  未发现PDF附件，仅导出邮件内容');
            }
        } else {
            console.log('\n📎 无附件，仅导出邮件内容');
        }

        const fileName = this.pdfService.generateSafeFileName(email.subject, email.messageId);
        const outputPath = path.join(__dirname, 'downloads', fileName);
        const downloadDir = path.dirname(outputPath);

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
        console.log('\n正在处理PDF附件合并...');

        console.log('生成邮件PDF...');
        const htmlContent = this.htmlService.createEmailHTML(email, attachments);
        const emailPdfBuffer = await this.puppeteerService.convertHtmlToPdf(htmlContent, null, true);

        const pdfAttachmentPaths = [];
        for (const attachment of attachments) {
            if (attachment.isPdf) {
                console.log(`下载PDF附件: ${attachment.filename}`);
                const attachmentPath = await this.gmailService.downloadAttachment(
                    email.messageId,
                    attachment.attachmentId,
                    attachment.filename,
                    downloadDir
                );
                pdfAttachmentPaths.push(attachmentPath);
            }
        }

        const mergedPdfBuffer = await this.pdfService.mergePDFs(emailPdfBuffer, pdfAttachmentPaths);

        fs.writeFileSync(outputPath, mergedPdfBuffer);

        this.pdfService.cleanupTempFiles(pdfAttachmentPaths);

        console.log('\n✅ PDF合并完成!');
        console.log(`📁 合并文件保存位置: ${outputPath}`);
        console.log(`📄 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

        return { merged: true };
    }

    async generateEmailOnlyPdf(email, attachments, outputPath) {
        console.log('\n正在转换邮件为PDF...');
        const htmlContent = this.htmlService.createEmailHTML(email, attachments);
        await this.puppeteerService.convertHtmlToPdf(htmlContent, outputPath);

        console.log('\n✅ 邮件转换完成!');
        console.log(`📁 文件保存位置: ${outputPath}`);
        console.log(`📄 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

        return { merged: false };
    }
}

module.exports = EmailProcessor;