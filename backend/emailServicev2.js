const { google } = require('googleapis');
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function getLatestEmail() {
    try {
        const credentials = JSON.parse(fs.readFileSync('credentials.json'));
        const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
        const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        const token = JSON.parse(fs.readFileSync('token.json'));
        auth.setCredentials(token);
        const gmail = google.gmail({ version: 'v1', auth });
        
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 1
        });
        
        if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
            throw new Error('没有找到邮件');
        }
        
        const messageId = listResponse.data.messages[0].id;
        const messageResponse = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        const message = messageResponse.data;
        const headers = message.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        
        let body = '';
        let isHtml = false;
        
        // 处理邮件正文
        if (message.payload.body.data) {
            body = Buffer.from(message.payload.body.data, 'base64').toString();
            isHtml = message.payload.mimeType === 'text/html';
        } else if (message.payload.parts) {
            const htmlPart = message.payload.parts.find(part => part.mimeType === 'text/html');
            if (htmlPart && htmlPart.body.data) {
                body = Buffer.from(htmlPart.body.data, 'base64').toString();
                isHtml = true;
            } else {
                const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
                if (textPart && textPart.body.data) {
                    body = Buffer.from(textPart.body.data, 'base64').toString();
                    isHtml = false;
                }
            }
        }
        
        // 检测附件
        const attachments = await detectAttachments(message.payload);
        
        return {
            messageId,
            subject,
            from,
            to,
            date,
            body: body || message.snippet,
            isHtml,
            attachments,
            hasPdfAttachment: attachments.some(att => att.isPdf)
        };

    } catch (error) {
        console.error('获取邮件失败:', error.message);
        throw error;
    }
}

// 新增：检测附件的函数
function detectAttachments(payload) {
    const attachments = [];
    
    function extractAttachments(parts) {
        if (!parts) return;
        
        for (const part of parts) {
            // 检查是否有附件
            if (part.filename && part.filename.length > 0) {
                const attachment = {
                    filename: part.filename,
                    mimeType: part.mimeType,
                    size: part.body.size || 0,
                    attachmentId: part.body.attachmentId,
                    isPdf: isPdfFile(part.filename, part.mimeType)
                };
                attachments.push(attachment);
            }
            
            // 递归处理嵌套的parts
            if (part.parts) {
                extractAttachments(part.parts);
            }
        }
    }
    
    // 检查顶级payload
    if (payload.filename && payload.filename.length > 0) {
        attachments.push({
            filename: payload.filename,
            mimeType: payload.mimeType,
            size: payload.body.size || 0,
            attachmentId: payload.body.attachmentId,
            isPdf: isPdfFile(payload.filename, payload.mimeType)
        });
    }
    
    // 检查parts中的附件
    if (payload.parts) {
        extractAttachments(payload.parts);
    }
    
    return attachments;
}

// 新增：判断是否为PDF文件
function isPdfFile(filename, mimeType) {
    // 通过文件扩展名判断
    const fileExtension = path.extname(filename).toLowerCase();
    if (fileExtension === '.pdf') {
        return true;
    }
    
    // 通过MIME类型判断
    if (mimeType === 'application/pdf') {
        return true;
    }
    
    return false;
}

// 新增：下载附件的函数
async function downloadAttachment(gmail, messageId, attachmentId, filename, downloadDir) {
    try {
        const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: attachmentId
        });
        
        const data = Buffer.from(attachment.data.data, 'base64');
        const filePath = path.join(downloadDir, filename);
        
        fs.writeFileSync(filePath, data);
        console.log(`附件已下载: ${filePath}`);
        
        return filePath;
    } catch (error) {
        console.error(`下载附件失败 ${filename}:`, error.message);
        throw error;
    }
}

async function mergePDFs(emailPdfBuffer, attachmentPdfPaths) {
    try {
        console.log('正在合并PDF文件...');
        
        // 创建新的PDF文档
        const mergedPdf = await PDFDocument.create();
        
        // 添加邮件PDF页面
        const emailPdf = await PDFDocument.load(emailPdfBuffer);
        const emailPages = await mergedPdf.copyPages(emailPdf, emailPdf.getPageIndices());
        emailPages.forEach((page) => mergedPdf.addPage(page));
        
        // 添加每个PDF附件的页面
        for (const pdfPath of attachmentPdfPaths) {
            if (fs.existsSync(pdfPath)) {
                console.log(`正在合并: ${path.basename(pdfPath)}`);
                const pdfBuffer = fs.readFileSync(pdfPath);
                const pdf = await PDFDocument.load(pdfBuffer);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach((page) => mergedPdf.addPage(page));
            }
        }
        
        // 保存合并后的PDF
        const mergedPdfBuffer = await mergedPdf.save();
        console.log('✅ PDF合并完成');
        
        return mergedPdfBuffer;
        
    } catch (error) {
        console.error('PDF合并失败:', error.message);
        throw error;
    }
}

function createEmailHTML(emailData) {
    const { subject, from, to, date, body, isHtml, attachments } = emailData;
    
    const emailBody = isHtml ? body : `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    
    // 创建附件信息HTML
    let attachmentHTML = '';
    if (attachments && attachments.length > 0) {
        attachmentHTML = `
        <div class="attachments-section">
            <h3>附件信息:</h3>
            <ul>
                ${attachments.map(att => `
                    <li>
                        <strong>${att.filename}</strong> 
                        (${att.mimeType}, ${(att.size / 1024).toFixed(2)} KB)
                        ${att.isPdf ? '<span class="pdf-badge">PDF文件</span>' : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
        `;
    }
    
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
            body {
                font-family: 'Microsoft YaHei', Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                line-height: 1.6;
                color: #333;
            }
            .email-header {
                background-color: #f5f5f5;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                border-left: 4px solid #4285f4;
            }
            .email-meta {
                margin: 8px 0;
                font-size: 14px;
            }
            .email-meta strong {
                color: #1a73e8;
                min-width: 60px;
                display: inline-block;
            }
            .email-subject {
                font-size: 24px;
                font-weight: bold;
                color: #202124;
                margin-bottom: 15px;
            }
            .attachments-section {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin: 15px 0;
                border: 1px solid #e0e0e0;
            }
            .attachments-section h3 {
                margin-top: 0;
                color: #1a73e8;
            }
            .pdf-badge {
                background-color: #dc3545;
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
                margin-left: 10px;
            }
            .email-body {
                background-color: #fff;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e0e0e0;
                min-height: 200px;
            }
            .generated-info {
                margin-top: 30px;
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 4px;
                font-size: 12px;
                color: #666;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="email-header">
            <div class="email-subject">${subject}</div>
            <div class="email-meta"><strong>发件人:</strong> ${from}</div>
            <div class="email-meta"><strong>收件人:</strong> ${to}</div>
            <div class="email-meta"><strong>日期:</strong> ${date}</div>
            ${attachmentHTML}
        </div>
        
        <div class="email-body">
            ${emailBody}
        </div>
        
        <div class="generated-info">
            此PDF由Gmail邮件转换工具生成 - ${new Date().toLocaleString('zh-CN')}
        </div>
    </body>
    </html>
    `;
}

async function convertEmailToPDF(emailData, outputPath, returnBuffer = false) {
    const browser = await puppeteer.launch({
        headless: 'new'
    });
    
    try {
        const page = await browser.newPage();
        const htmlContent = createEmailHTML(emailData);
        
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0'
        });
        
        const pdfBuffer = await page.pdf({
            path: returnBuffer ? undefined : outputPath, // 如果要返回buffer，不设置path
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm'
            }
        });
        
        if (!returnBuffer && outputPath) {
            console.log(`PDF已生成: ${outputPath}`);
        }
        
        return pdfBuffer;
        
    } finally {
        await browser.close();
    }
}

function generateSafeFileName(subject, messageId) {
    const safeSubject = subject
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    return `${safeSubject}_${timestamp}_${messageId.substring(0, 8)}.pdf`;
}

async function main() {
    try {
        console.log('正在获取最新邮件...');
        const email = await getLatestEmail();
        
        console.log('=== 邮件信息 ===');
        console.log('主题:', email.subject);
        console.log('发件人:', email.from);
        console.log('日期:', email.date);
        console.log('内容预览:', email.body.substring(0, 100) + '...');
        
        // 显示附件信息
        if (email.attachments.length > 0) {
            console.log('\n=== 附件信息 ===');
            email.attachments.forEach((att, index) => {
                console.log(`${index + 1}. ${att.filename}`);
                console.log(`   类型: ${att.mimeType}`);
                console.log(`   大小: ${(att.size / 1024).toFixed(2)} KB`);
                console.log(`   是否PDF: ${att.isPdf ? '是' : '否'}`);
            });
            
            if (email.hasPdfAttachment) {
                console.log('\n✅ 发现PDF附件，将进行合并导出!');
            } else {
                console.log('\n⚠️  未发现PDF附件，仅导出邮件内容');
            }
        } else {
            console.log('\n📎 无附件，仅导出邮件内容');
        }
        
        const fileName = generateSafeFileName(email.subject, email.messageId);
        const outputPath = path.join(__dirname, 'downloads', fileName);
        
        const downloadDir = path.dirname(outputPath);
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        
        // 根据是否有PDF附件决定处理方式
        if (email.hasPdfAttachment) {
            console.log('\n正在处理PDF附件合并...');
            
            // 1. 先生成邮件PDF（但不保存到磁盘）
            console.log('生成邮件PDF...');
            const emailPdfBuffer = await convertEmailToPDF(email, null, true); // 返回buffer
            
            // 2. 下载所有PDF附件
            const credentials = JSON.parse(fs.readFileSync('credentials.json'));
            const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
            const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            const token = JSON.parse(fs.readFileSync('token.json'));
            auth.setCredentials(token);
            const gmail = google.gmail({ version: 'v1', auth });
            
            const pdfAttachmentPaths = [];
            for (const attachment of email.attachments) {
                if (attachment.isPdf) {
                    console.log(`下载PDF附件: ${attachment.filename}`);
                    const attachmentPath = await downloadAttachment(
                        gmail, 
                        email.messageId, 
                        attachment.attachmentId, 
                        attachment.filename, 
                        downloadDir
                    );
                    pdfAttachmentPaths.push(attachmentPath);
                }
            }
            
            // 3. 合并所有PDF
            const mergedPdfBuffer = await mergePDFs(emailPdfBuffer, pdfAttachmentPaths);
            
            // 4. 保存合并后的PDF
            fs.writeFileSync(outputPath, mergedPdfBuffer);
            
            // 5. 清理临时的附件文件
            console.log('清理临时文件...');
            pdfAttachmentPaths.forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`已删除临时文件: ${path.basename(filePath)}`);
                }
            });
            
            console.log('\n✅ PDF合并完成!');
            console.log(`📁 合并文件保存位置: ${outputPath}`);
            console.log(`📄 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
            
        } else {
            // 没有PDF附件，只导出邮件内容
            console.log('\n正在转换邮件为PDF...');
            await convertEmailToPDF(email, outputPath);
            
            console.log('\n✅ 邮件转换完成!');
            console.log(`📁 文件保存位置: ${outputPath}`);
            console.log(`📄 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
        }
        
        // 返回完整信息
        return {
            ...email,
            pdfPath: outputPath,
            merged: email.hasPdfAttachment
        };
        
    } catch (error) {
        console.error('❌ 错误:', error.message);
        
        if (error.message.includes('credentials.json')) {
            console.log('\n💡 建议: 请确保 credentials.json 文件存在且格式正确');
        } else if (error.message.includes('token.json')) {
            console.log('\n💡 建议: 请确保已完成OAuth授权，token.json文件存在');
        } else if (error.message.includes('puppeteer')) {
            console.log('\n💡 建议: 请运行 "npm install puppeteer" 安装依赖');
        } else if (error.message.includes('pdf-lib')) {
            console.log('\n💡 建议: 请运行 "npm install pdf-lib" 安装PDF处理依赖');
        }
    }
}

module.exports = { 
    getLatestEmail, 
    convertEmailToPDF, 
    createEmailHTML,
    generateSafeFileName,
    detectAttachments,
    isPdfFile,
    downloadAttachment,
    mergePDFs
};

if (require.main === module) {
    main();
}