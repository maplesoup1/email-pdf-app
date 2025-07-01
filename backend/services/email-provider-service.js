const GmailService = require('./gmail-service');
const OutlookService = require('./outlook-service');

class EmailProviderService {
    constructor() {
        this.providers = {
            'gmail': new GmailService(),
            'outlook': new OutlookService()
        };
        this.currentProvider = 'gmail'; // 默认Gmail
    }

    setProvider(providerName) {
        if (this.providers[providerName]) {
            this.currentProvider = providerName;
            return true;
        }
        return false;
    }

    getCurrentProvider() {
        return this.currentProvider;
    }

    getProvider(providerName = null) {
        const provider = providerName || this.currentProvider;
        return this.providers[provider];
    }

    async getLatestEmail(providerName = null) {
        const provider = this.getProvider(providerName);
        const email = await provider.getLatestEmail();
        
        // 为Outlook邮件获取附件信息
        if ((providerName || this.currentProvider) === 'outlook') {
            const attachments = await provider.getAttachments(email.messageId);
            email.payload = { attachments };
        }
        
        return email;
    }

    async getEmailList(maxResults = 10, providerName = null, sessionId = null) {
        const provider = this.getProvider(providerName);
        return await provider.getEmailList(maxResults, sessionId);
    }

    async getEmailById(messageId, providerName = null, sessionId = null) {
        const provider = this.getProvider(providerName);
        const email = await provider.getEmailById(messageId, sessionId);
        
        // 为Outlook邮件获取附件信息
        if ((providerName || this.currentProvider) === 'outlook') {
            const attachments = await provider.getAttachments(email.messageId);
            email.payload = { attachments };
        }
        
        return email;
    }

    async getAttachments(messageId, providerName = null, sessionId = null) {
        const provider = this.getProvider(providerName);
        const email = await provider.getEmailById(messageId, sessionId);
        if (!email?.payload) {
            throw new Error('No payload found in email');
        }
        const AttachmentService = require('./attachment-service');
        const attachmentService = new AttachmentService();
        return attachmentService.detectAttachments(email.payload);
    }

    async downloadAttachment(messageId, attachmentId, filename, downloadDir, providerName = null, sessionId = null) {
        const provider = this.getProvider(providerName);
        return await provider.downloadAttachment(messageId, attachmentId, filename, downloadDir, sessionId);
    }

    async checkAuthentication(providerName = null) {
        try {
            const provider = this.getProvider(providerName);
            await provider.authenticate();
            return {
                status: 'authenticated',
                provider: providerName || this.currentProvider
            };
        } catch (error) {
            return {
                status: 'failed',
                provider: providerName || this.currentProvider,
                error: error.message
            };
        }
    }

    getAvailableProviders() {
        return Object.keys(this.providers);
    }
}

module.exports = EmailProviderService;