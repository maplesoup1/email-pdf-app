const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const GmailAuthService = require('./multi-user-gmail-auth');

class GmailService {
    constructor() {
        this.auth = null;
        this.gmail = null;
        this.sessionId = null;
    }

    // 新增：设置 sessionId
    setSessionId(sessionId) {
        this.sessionId = sessionId;
        this.auth = null;
        this.gmail = null;
    }

    // 修改：使用多用户认证
    async authenticate(sessionId = null) {
        if (sessionId) {
            this.sessionId = sessionId;
        }
        
        if (!this.sessionId) {
            throw new Error('SessionId is required for authentication');
        }

        // 使用 GmailAuthService 获取认证的 Gmail 客户端
        this.gmail = await GmailAuthService.getGmailClient(this.sessionId);
    }

    async getLatestEmail(sessionId = null) {
        if (sessionId) {
            this.sessionId = sessionId;
        }
        
        if (!this.gmail) {
            await this.authenticate(sessionId);
        }

        const listResponse = await this.gmail.users.messages.list({
            userId: 'me',
            maxResults: 1
        });
        
        if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
            throw new Error('没有找到邮件');
        }
        
        const messageId = listResponse.data.messages[0].id;
        const messageResponse = await this.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        return this.parseEmailMessage(messageResponse.data);
    }

    // 修改：使用 sessionId 参数
    async getEmailList(maxResults = 10, sessionId, pageToken = null) {
        const gmail = await GmailAuthService.getGmailClient(sessionId);
    
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            maxResults: parseInt(maxResults),
            pageToken
        });
    
        const emails = [];
    
        if (listResponse.data.messages) {
            for (const message of listResponse.data.messages) {
                const messageResponse = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'metadata',
                    metadataHeaders: ['Subject', 'From', 'Date']
                });
    
                const headers = messageResponse.data.payload.headers;
                emails.push({
                    messageId: message.id,
                    subject: headers.find(h => h.name === 'Subject')?.value || '',
                    from: headers.find(h => h.name === 'From')?.value || '',
                    date: headers.find(h => h.name === 'Date')?.value || '',
                    receiveDate: messageResponse.data.internalDate ?
                        new Date(parseInt(messageResponse.data.internalDate)).toISOString() : '',
                    snippet: messageResponse.data.snippet
                });
            }
        }
    
        return {
            emails,
            nextPageToken: listResponse.data.nextPageToken
        };
    }

    // 修改：添加 sessionId 参数
    async getEmailById(messageId, sessionId = null) {
        if (sessionId) {
            this.sessionId = sessionId;
        }
        
        if (!this.gmail) {
            await this.authenticate(sessionId);
        }

        const messageResponse = await this.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        return this.parseEmailMessage(messageResponse.data);
    }

    parseEmailMessage(message) {
        const headers = message.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
    
        const findPartRecursively = (part, mimeType) => {
            if (part.mimeType === mimeType && part.body && part.body.data) {
                return part;
            }
            if (part.parts) {
                for (const subPart of part.parts) {
                    const result = findPartRecursively(subPart, mimeType);
                    if (result) return result;
                }
            }
            return null;
        };
    
        let body = '';
        let isHtml = false;
    
        const htmlPart = findPartRecursively(message.payload, 'text/html');
        if (htmlPart) {
            body = Buffer.from(htmlPart.body.data, 'base64').toString('utf8');
            isHtml = true;
        } else {
            const textPart = findPartRecursively(message.payload, 'text/plain');
            if (textPart) {
                body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
                isHtml = false;
            } else if (message.payload.body?.data) {
                body = Buffer.from(message.payload.body.data, 'base64').toString('utf8');
                isHtml = message.payload.mimeType === 'text/html';
            } else {
                body = message.snippet || '';
            }
        }
    
        return {
            messageId: message.id,
            subject,
            from,
            to,
            date,
            body,
            isHtml,
            payload: message.payload
        };
    }

    // 修改：添加 sessionId 参数
    async downloadAttachment(messageId, attachmentId, filename, downloadDir, sessionId = null) {
        if (sessionId) {
            this.sessionId = sessionId;
        }
        
        if (!this.gmail || sessionId !== this.sessionId) {
            await this.authenticate(sessionId);
        }

        const attachment = await this.gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: attachmentId
        });
        
        const data = Buffer.from(attachment.data.data, 'base64');
        const filePath = path.join(downloadDir, filename);
        
        fs.writeFileSync(filePath, data);
        console.log(`附件已下载: ${filePath}`);
        
        return filePath;
    }
}

module.exports = GmailService;