const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

class PdfService {
    
    async addBasicFooter(pdfDoc) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();
        const now = new Date();
        const currentDateTime = now.toLocaleString();

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const { width, height } = page.getSize();

            // Simple footer: "Page X of Y | Generated: DATE"
            const pageText = `Page ${i + 1} of ${pages.length} | Generated: ${currentDateTime}`;
            const textWidth = font.widthOfTextAtSize(pageText, 9);
            const x = (width - textWidth) / 2; // Center the text

            page.drawText(pageText, {
                x: x,
                y: 20, // 30 points from bottom
                size: 9,
                font: font,
                color: rgb(0.5, 0.5, 0.5), // Gray color
            });
        }
    }

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

        // Add basic footer to all pages
        await this.addBasicFooter(mergedPdf);
        
        const mergedPdfBuffer = await mergedPdf.save();
        console.log('✅ PDF合并完成');
        
        return mergedPdfBuffer;
    }

    async createEmailOnlyPDF(emailPdfBuffer) {
        console.log('正在处理邮件PDF...');
        
        const emailPdf = await PDFDocument.load(emailPdfBuffer);
        
        // Add basic footer
        await this.addBasicFooter(emailPdf);
        
        const processedPdfBuffer = await emailPdf.save();
        console.log('✅ 邮件PDF处理完成');
        
        return processedPdfBuffer;
    }

    async demergePDF(mergedPdfPath, emailPageCount, attachmentInfo, outputDir = path.dirname(mergedPdfPath)) {
        console.log('正在分离PDF文件...');
        
        const mergedPdfBuffer = fs.readFileSync(mergedPdfPath);
        const mergedPdf = await PDFDocument.load(mergedPdfBuffer);
        const totalPages = mergedPdf.getPageCount();
        
        const results = [];

        // 确保输出目录存在
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 分离邮件部分
        if (emailPageCount > 0) {
            const emailPdf = await PDFDocument.create();
            const emailPages = await emailPdf.copyPages(mergedPdf, Array.from({ length: emailPageCount }, (_, i) => i));
            emailPages.forEach(page => emailPdf.addPage(page));
            
            // Add basic footer to email-only PDF
            await this.addBasicFooter(emailPdf);
            
            const emailPdfBuffer = await emailPdf.save();
            const emailFilename = path.basename(mergedPdfPath).replace('_merged', '_email_only');
            const emailPath = path.join(outputDir, emailFilename);
            
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
            const pageIndices = Array.from({ length: endPageIndex - currentPageIndex }, (_, i) => currentPageIndex + i);

            if (pageIndices.length > 0) {
                const attachmentPages = await attachmentPdf.copyPages(mergedPdf, pageIndices);
                attachmentPages.forEach(page => attachmentPdf.addPage(page));

                // Add basic footer to attachment PDF
                await this.addBasicFooter(attachmentPdf);

                const attachmentPdfBuffer = await attachmentPdf.save();
                const attachmentFilename = `demerged_${attachment.originalName}`;
                const attachmentPath = path.join(outputDir, attachmentFilename);

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

    generateSafeFileName(subject, messageId, isMerged = false) {
        const safeSubject = subject
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const suffix = isMerged ? '_merged' : '';
        
        return `${safeSubject}_${timestamp}_${messageId.substring(0, 8)}${suffix}.pdf`;
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