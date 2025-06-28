const { Client } = require('@azure/msal-node');
const { GraphRequest } = require('@microsoft/microsoft-graph-client');
const fs = require('fs');
const path = require('path');
require('isomorphic-fetch');

class OutlookService {
    constructor() {
        this.client = null;
        this.accessToken = null;
    }

    async authenticate() {
        try {
            const config = JSON.parse(fs.readFileSync('outlook-config.json'));
            
            this.client = new Client({
                auth: {
                    clientId: config.clientId,
                    clientSecret: config.clientSecret,
                    authority: 'https://login.microsoftonline.com/common'
                }
            });

            // 从保存的token文件中读取
            if (fs.existsSync('outlook-token.json')) {
                const tokenData = JSON.parse(fs.readFileSync('outlook-token.json'));
                this.accessToken = tokenData.access_token;
            } else {
                throw new Error('需要完成Outlook OAuth授权');
            }
        } catch (error) {
            throw new Error(`Outlook认证失败: ${error.message}`);
        }
    }

    async getLatestEmail() {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=1&$orderby=receivedDateTime desc', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            if (!data.value || data.value.length === 0) {
                throw new Error('没有找到邮件');
            }

            return this.parseOutlookMessage(data.value[0]);
        } catch (error) {
            throw new Error(`获取Outlook邮件失败: ${error.message}`);
        }
    }

    async getEmailList(maxResults = 10) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            return {
                emails: data.value.map(msg => this.parseOutlookMessage(msg, true)),
                nextPageToken: data['@odata.nextLink']
            };
        } catch (error) {
            throw new Error(`获取Outlook邮件列表失败: ${error.message}`);
        }
    }

    async getEmailById(messageId) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            return this.parseOutlookMessage(data);
        } catch (error) {
            throw new Error(`获取Outlook邮件失败: ${error.message}`);
        }
    }

    parseOutlookMessage(message, isListView = false) {
        const result = {
            messageId: message.id,
            subject: message.subject || '',
            from: message.from?.emailAddress?.address || '',
            to: message.toRecipients?.map(r => r.emailAddress.address).join(', ') || '',
            date: message.receivedDateTime,
            body: isListView ? '' : (message.body?.content || ''),
            isHtml: message.body?.contentType === 'html',
            snippet: message.bodyPreview || ''
        };

        if (!isListView) {
            result.payload = {
                attachments: message.hasAttachments ? [] : undefined // 需要单独获取附件
            };
        }

        return result;
    }

    async getAttachments(messageId) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            return data.value.map(att => ({
                attachmentId: att.id,
                filename: att.name,
                mimeType: att.contentType || 'application/octet-stream',
                size: att.size || 0,
                isPdf: this.isPdfFile(att.name, att.contentType)
            }));
        } catch (error) {
            throw new Error(`获取Outlook附件失败: ${error.message}`);
        }
    }

    async downloadAttachment(messageId, attachmentId, filename, downloadDir) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            if (data.contentBytes) {
                const buffer = Buffer.from(data.contentBytes, 'base64');
                const filePath = path.join(downloadDir, filename);
                
                fs.writeFileSync(filePath, buffer);
                console.log(`Outlook附件已下载: ${filePath}`);
                
                return filePath;
            } else {
                throw new Error('附件内容为空');
            }
        } catch (error) {
            throw new Error(`下载Outlook附件失败: ${error.message}`);
        }
    }

    isPdfFile(filename, mimeType) {
        const fileExtension = path.extname(filename).toLowerCase();
        return fileExtension === '.pdf' || mimeType === 'application/pdf';
    }
}

module.exports = OutlookService;