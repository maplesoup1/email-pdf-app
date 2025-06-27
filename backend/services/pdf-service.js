const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

class PdfService {
    async mergePDFs(emailPdfBuffer, attachmentPdfPaths) {
        console.log('正在合并PDF文件...');
        
        const mergedPdf = await PDFDocument.create();
        
        const emailPdf = await PDFDocument.load(emailPdfBuffer);
        const emailPages = await mergedPdf.copyPages(emailPdf, emailPdf.getPageIndices());
        emailPages.forEach((page) => mergedPdf.addPage(page));
        
        for (const pdfPath of attachmentPdfPaths) {
            if (fs.existsSync(pdfPath)) {
                console.log(`正在合并: ${path.basename(pdfPath)}`);
                const pdfBuffer = fs.readFileSync(pdfPath);
                const pdf = await PDFDocument.load(pdfBuffer);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach((page) => mergedPdf.addPage(page));
            }
        }
        
        const mergedPdfBuffer = await mergedPdf.save();
        console.log('✅ PDF合并完成');
        
        return mergedPdfBuffer;
    }

    generateSafeFileName(subject, messageId) {
        const safeSubject = subject
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `${safeSubject}_${timestamp}_${messageId.substring(0, 8)}.pdf`;
    }

    cleanupTempFiles(filePaths) {
        console.log('清理临时文件...');
        filePaths.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    fs.unlinkSync(filePath);
                    console.log(`已删除临时文件: ${path.basename(filePath)}`);
                } else if (stats.isDirectory()) {
                    console.log(`跳过目录: ${path.basename(filePath)}`);
                }
            }
        });
    }
}

module.exports = PdfService;