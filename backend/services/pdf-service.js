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

    async demergePDF(mergedPdfPath, emailPageCount, attachmentInfo) {
        console.log('正在分离PDF文件...');
        
        const mergedPdfBuffer = fs.readFileSync(mergedPdfPath);
        const mergedPdf = await PDFDocument.load(mergedPdfBuffer);
        const totalPages = mergedPdf.getPageCount();
        
        const results = [];
        
        // 分离邮件部分
        if (emailPageCount > 0) {
            const emailPdf = await PDFDocument.create();
            const emailPages = await emailPdf.copyPages(mergedPdf, Array.from({length: emailPageCount}, (_, i) => i));
            emailPages.forEach(page => emailPdf.addPage(page));
            
            const emailPdfBuffer = await emailPdf.save();
            const emailFilename = path.basename(mergedPdfPath).replace('_merged', '_email_only');
            const emailPath = path.join(path.dirname(mergedPdfPath), emailFilename);
            
            fs.writeFileSync(emailPath, emailPdfBuffer);
            
            results.push({
                type: 'email',
                filename: emailFilename,
                path: emailPath,
                pageCount: emailPageCount
            });
        }
        
        // 分离附件部分
        let currentPageIndex = emailPageCount;
        
        for (const attachment of attachmentInfo) {
            if (currentPageIndex >= totalPages) break;
            
            const attachmentPdf = await PDFDocument.create();
            const endPageIndex = Math.min(currentPageIndex + attachment.pageCount, totalPages);
            const pageIndices = Array.from({length: endPageIndex - currentPageIndex}, (_, i) => currentPageIndex + i);
            
            if (pageIndices.length > 0) {
                const attachmentPages = await attachmentPdf.copyPages(mergedPdf, pageIndices);
                attachmentPages.forEach(page => attachmentPdf.addPage(page));
                
                const attachmentPdfBuffer = await attachmentPdf.save();
                const attachmentFilename = `demerged_${attachment.originalName}`;
                const attachmentDir = path.join(__dirname, '../downloads/attachments');
                if (!fs.existsSync(attachmentDir)) {
                fs.mkdirSync(attachmentDir, { recursive: true });
                }
                const attachmentPath = path.join(attachmentDir, attachmentFilename);
                
                fs.writeFileSync(attachmentPath, attachmentPdfBuffer);
                
                results.push({
                    type: 'attachment',
                    filename: attachmentFilename,
                    path: attachmentPath,
                    originalName: attachment.originalName,
                    pageCount: pageIndices.length
                });
                
                currentPageIndex = endPageIndex;
            }
        }
        
        console.log('✅ PDF分离完成');
        return results;
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