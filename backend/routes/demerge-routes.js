const express = require('express');
const router = express.Router();
const PdfService = require('../services/pdf-service');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { loadSettings, generateDownloadPath, ensureDirectory } = require('./download-routes');

const pdfService = new PdfService();

router.get('/list', (req, res) => {
    try {
        const settings = loadSettings();

        let downloadsDir;
        if (settings.useCustomPath && settings.customPath) {
            if (settings.folderNaming === 'date') {
                const today = new Date().toISOString().split('T')[0];
                downloadsDir = path.join(settings.customPath, today);
            } else {
                downloadsDir = settings.customPath;
            }
        } else {
            downloadsDir = path.join(__dirname, '../downloads');
        }

        if (!fs.existsSync(downloadsDir)) {
            return res.json({ success: true, data: [] });
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

        res.json({ success: true, data: mergedFiles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/split/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const { emailPageCount = 1, attachmentInfo = [], fullPath } = req.body;
        let mergedFilePath = fullPath;
        if (!mergedFilePath) {
            const settings = loadSettings();
            let downloadsDir;

            if (settings.useCustomPath) {
                const customPath = generateDownloadPath(settings, filename.replace('.pdf', ''), filename);
                if (customPath && ensureDirectory(customPath)) {
                    downloadsDir = customPath;
                } else {
                    downloadsDir = path.join(__dirname, '../downloads');
                }
            } else {
                downloadsDir = path.join(__dirname, '../downloads');
            }

            mergedFilePath = path.join(downloadsDir, filename);
        }

        // 检查文件是否存在
        if (!fs.existsSync(mergedFilePath)) {
            return res.status(404).json({ success: false, error: '合并文件不存在' });
        }

        // 自动拆分判断
        let finalAttachmentInfo = attachmentInfo;
        if (attachmentInfo.length === 0) {
            finalAttachmentInfo = await autoDetectAttachments(mergedFilePath, emailPageCount);
        }

        // 输出目录默认为文件所在目录
        const outputDir = path.dirname(mergedFilePath);

        // 执行分离
        const results = await pdfService.demergePDF(mergedFilePath, emailPageCount, finalAttachmentInfo, outputDir);

        res.json({
            success: true,
            data: {
                originalFile: filename,
                separatedFiles: results,
                totalFiles: results.length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/analyze/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const downloadsDir = path.join(__dirname, '../downloads');
        const mergedFilePath = path.join(downloadsDir, filename);

        if (!fs.existsSync(mergedFilePath)) {
            return res.status(404).json({ success: false, error: '文件不存在' });
        }

        const pdfBuffer = fs.readFileSync(mergedFilePath);
        const pdf = await PDFDocument.load(pdfBuffer);
        const totalPages = pdf.getPageCount();

        const analysis = {
            totalPages,
            estimatedEmailPages: 1,
            estimatedAttachmentPages: Math.max(0, totalPages - 1),
            suggestedSplit: [
                { type: 'email', startPage: 1, endPage: 1, pageCount: 1 }
            ]
        };

        if (totalPages > 1) {
            analysis.suggestedSplit.push({
                type: 'attachment',
                startPage: 2,
                endPage: totalPages,
                pageCount: totalPages - 1,
                originalName: 'attachment.pdf'
            });
        }

        res.json({ success: true, data: analysis });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

async function autoDetectAttachments(mergedFilePath, emailPageCount) {
    try {
        const pdfBuffer = fs.readFileSync(mergedFilePath);
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
        console.error('自动检测附件失败:', error);
        return [];
    }
}

module.exports = router;