const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GmailService {
    constructor() {
        this.auth = null;
        this.gmail = null;
    }

    async authenticate() {
        const credentials = JSON.parse(fs.readFileSync('credentials.json'));
        const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
        this.auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        const token = JSON.parse(fs.readFileSync('token.json'));
        this.auth.setCredentials(token);
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
    }

    async getLatestEmail() {
        if (!this.gmail) {
            await this.authenticate();
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

    async getEmailList(maxResults = 10, pageToken = null) {
        if (!this.gmail) {
            await this.authenticate();
        }

        const listResponse = await this.gmail.users.messages.list({
            userId: 'me',
            maxResults: parseInt(maxResults),
            pageToken
        });
        
        const emails = [];
        if (listResponse.data.messages) {
            for (const message of listResponse.data.messages) {
                const messageResponse = await this.gmail.users.messages.get({
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
                    snippet: messageResponse.data.snippet
                });
            }
        }
        
        return {
            emails,
            nextPageToken: listResponse.data.nextPageToken
        };
    }

    async getEmailById(messageId) {
        if (!this.gmail) {
            await this.authenticate();
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
        
        let body = '';
        let isHtml = false;
        
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
        
        return {
            messageId: message.id,
            subject,
            from,
            to,
            date,
            body: body || message.snippet,
            isHtml,
            payload: message.payload
        };
    }

    async downloadAttachment(messageId, attachmentId, filename, downloadDir) {
        if (!this.gmail) {
            await this.authenticate();
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