const express = require('express');
const router = express.Router();
const PdfService = require('../services/pdf-service');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const pdfService = new PdfService();

router.get('/list', (req, res) => {
    try {
        const downloadsDir = path.join(__dirname, '../downloads');
        
        if (!fs.existsSync(downloadsDir)) {
            return res.json({
                success: true,
                data: []
            });
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
        
        res.json({
            success: true,
            data: mergedFiles
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/split/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const { emailPageCount = 1, attachmentInfo = [] } = req.body;
        
        const downloadsDir = path.join(__dirname, '../downloads');
        const mergedFilePath = path.join(downloadsDir, filename);
        
        if (!fs.existsSync(mergedFilePath)) {
            return res.status(404).json({
                success: false,
                error: '合并文件不存在'
            });
        }
        
        // 如果没有提供附件信息，尝试自动检测
        let finalAttachmentInfo = attachmentInfo;
        if (attachmentInfo.length === 0) {
            finalAttachmentInfo = await autoDetectAttachments(mergedFilePath, emailPageCount);
        }
        
        const results = await pdfService.demergePDF(mergedFilePath, emailPageCount, finalAttachmentInfo);
        
        res.json({
            success: true,
            data: {
                originalFile: filename,
                separatedFiles: results,
                totalFiles: results.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/analyze/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const downloadsDir = path.join(__dirname, '../downloads');
        const mergedFilePath = path.join(downloadsDir, filename);
        
        if (!fs.existsSync(mergedFilePath)) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            });
        }
        
        const pdfBuffer = fs.readFileSync(mergedFilePath);
        const pdf = await PDFDocument.load(pdfBuffer);
        const totalPages = pdf.getPageCount();
        
        // 简单的页面分析 - 可以根据需要扩展
        const analysis = {
            totalPages,
            estimatedEmailPages: 1, // 默认估算邮件占1页
            estimatedAttachmentPages: Math.max(0, totalPages - 1),
            suggestedSplit: [
                {
                    type: 'email',
                    startPage: 1,
                    endPage: 1,
                    pageCount: 1
                }
            ]
        };
        
        // 如果有多页，假设剩余页面都是附件
        if (totalPages > 1) {
            analysis.suggestedSplit.push({
                type: 'attachment',
                startPage: 2,
                endPage: totalPages,
                pageCount: totalPages - 1,
                originalName: 'attachment.pdf'
            });
        }
        
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
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
        
        // 简单的自动检测 - 假设所有剩余页面为一个附件
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