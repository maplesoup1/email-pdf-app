const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const PdfService = require('./pdf-service');

class DemergeService {
    constructor() {
        this.pdfService = new PdfService();
    }

    getMergedFiles(downloadsDir) {
        if (!fs.existsSync(downloadsDir)) {
            return [];
        }

        const files = fs.readdirSync(downloadsDir);
        const mergedFiles = files.filter(file =>
            file.endsWith('.pdf') && file.includes('_merged')
        ).map(file => {
            const filePath = path.join(downloadsDir, file);
            const stats = fs.statSync(filePath);
            return {
                filename: file,
                path: filePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        });

        return mergedFiles;
    }

    async analyzePDF(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error('PDF file not found');
        }

        const pdfBuffer = fs.readFileSync(filePath);
        const pdf = await PDFDocument.load(pdfBuffer);
        const totalPages = pdf.getPageCount();

        const analysis = {
            totalPages,
            estimatedEmailPages: 1,
            estimatedAttachmentPages: Math.max(0, totalPages - 1),
            suggestedSplit: []
        };

        analysis.suggestedSplit.push({
            type: 'email',
            startPage: 1,
            endPage: 1,
            pageCount: 1
        });

        if (totalPages > 1) {
            analysis.suggestedSplit.push({
                type: 'attachment',
                startPage: 2,
                endPage: totalPages,
                pageCount: totalPages - 1,
                originalName: 'attachment.pdf'
            });
        }

        return analysis;
    }

    async autoDetectAttachments(filePath, emailPageCount) {
        try {
            const pdfBuffer = fs.readFileSync(filePath);
            const pdf = await PDFDocument.load(pdfBuffer);
            const totalPages = pdf.getPageCount();

            const attachmentPages = totalPages - emailPageCount;

            if (attachmentPages <= 0) {
                return [];
            }

            return [{
                originalName: 'attachment.pdf',
                pageCount: attachmentPages
            }];
        } catch (error) {
            console.error('Auto-detect attachments failed:', error);
            return [];
        }
    }

    async splitPDF(filePath, emailPageCount, attachmentInfo, outputDir) {
        if (!fs.existsSync(filePath)) {
            throw new Error('PDF file not found');
        }

        let finalAttachmentInfo = attachmentInfo;
        if (!attachmentInfo || attachmentInfo.length === 0) {
            finalAttachmentInfo = await this.autoDetectAttachments(filePath, emailPageCount);
        }

        // 创建以原文件名命名的文件夹
        const originalFilename = path.basename(filePath, '.pdf');
        const demergeFolder = path.join(outputDir, `demerge-${originalFilename}`);
        
        if (!this.ensureDirectory(demergeFolder)) {
            throw new Error('Failed to create demerge folder');
        }

        const results = await this.pdfService.demergePDF(
            filePath,
            emailPageCount,
            finalAttachmentInfo,
            demergeFolder
        );

        return {
            separatedFiles: results,
            totalFiles: results.length,
            emailPageCount,
            attachmentInfo: finalAttachmentInfo,
            demergeFolder
        };
    }

    deleteFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found');
        }

        fs.unlinkSync(filePath);
        return true;
    }

    ensureDirectory(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            return true;
        } catch (error) {
            console.error('Failed to create directory:', error);
            return false;
        }
    }

    validateFilename(filename) {
        if (!filename || typeof filename !== 'string') {
            throw new Error('Invalid filename');
        }

        if (!filename.endsWith('.pdf')) {
            throw new Error('File must be a PDF');
        }

        const invalidChars = /[<>:"|?*]/;
        if (invalidChars.test(filename)) {
            throw new Error('Filename contains invalid characters');
        }

        return true;
    }

    validatePageCount(pageCount) {
        const count = parseInt(pageCount);
        if (isNaN(count) || count < 1) {
            throw new Error('Page count must be a positive integer');
        }
        return count;
    }

    validateAttachmentInfo(attachmentInfo) {
        if (!Array.isArray(attachmentInfo)) {
            return [];
        }

        return attachmentInfo.map(att => ({
            originalName: att.originalName || 'attachment.pdf',
            pageCount: this.validatePageCount(att.pageCount || 1)
        }));
    }
}

module.exports = DemergeService;