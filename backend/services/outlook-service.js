const { Client } = require('@microsoft/microsoft-graph-client');
const { refreshOutlookTokenIfNeeded } = require('./outlook-token-service');
require('isomorphic-fetch');
const fs = require('fs');
const path = require('path');

class OutlookService {
    constructor() {
        this.client = null;
        this.accessToken = null;
    }

    async authenticate() {
        try {
            const tokenData = await refreshOutlookTokenIfNeeded();
            this.accessToken = tokenData.access_token;
    
            this.client = Client.init({
                authProvider: (done) => {
                    done(null, this.accessToken);
                }
            });
        } catch (error) {
            throw new Error(`Outlook认证失败: ${error.message}`);
        }
    }

    async getLatestEmail() {
        if (!this.client) await this.authenticate();

        try {
            const response = await this.client
                .api('/me/messages')
                .top(1)
                .orderby('receivedDateTime desc')
                .get();

            if (!response.value || response.value.length === 0) {
                throw new Error('没有找到邮件');
            }

            return this.parseOutlookMessage(response.value[0]);
        } catch (error) {
            throw new Error(`获取Outlook邮件失败: ${error.message}`);
        }
    }

    async getEmailList(maxResults = 10) {
        if (!this.client) await this.authenticate();

        try {
            const response = await this.client
                .api('/me/messages')
                .top(maxResults)
                .orderby('receivedDateTime desc')
                .get();

            return {
                emails: response.value.map(msg => this.parseOutlookMessage(msg, true)),
                nextPageToken: response['@odata.nextLink']
            };
        } catch (error) {
            throw new Error(`获取Outlook邮件列表失败: ${error.message || JSON.stringify(error)}`);

        }
    }

    async getEmailById(messageId) {
        if (!this.client) await this.authenticate();

        try {
            const response = await this.client
                .api(`/me/messages/${messageId}`)
                .get();

            return this.parseOutlookMessage(response);
        } catch (error) {
            throw new Error(`获取Outlook邮件失败: ${error.message}`);
        }
    }

    async getAttachments(messageId) {
        if (!this.client) await this.authenticate();

        try {
            const response = await this.client
                .api(`/me/messages/${messageId}/attachments`)
                .get();

            return response.value.map(att => ({
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
        if (!this.client) await this.authenticate();

        try {
            const response = await this.client
                .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
                .get();

            if (!response.contentBytes) throw new Error('附件内容为空');

            const buffer = Buffer.from(response.contentBytes, 'base64');
            const filePath = path.join(downloadDir, filename);
            fs.writeFileSync(filePath, buffer);
            console.log(`Outlook附件已下载: ${filePath}`);
            return filePath;
        } catch (error) {
            throw new Error(`下载Outlook附件失败: ${error.message}`);
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
                attachments: message.hasAttachments ? [] : undefined
            };
        }

        return result;
    }

    isPdfFile(filename, mimeType) {
        const ext = path.extname(filename).toLowerCase();
        return ext === '.pdf' || mimeType === 'application/pdf';
    }
}

module.exports = OutlookService;