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

    async getEmailList(maxResults = 10, providerName = null) {
        const provider = this.getProvider(providerName);
        return await provider.getEmailList(maxResults);
    }

    async getEmailById(messageId, providerName = null) {
        const provider = this.getProvider(providerName);
        const email = await provider.getEmailById(messageId);
        
        // 为Outlook邮件获取附件信息
        if ((providerName || this.currentProvider) === 'outlook') {
            const attachments = await provider.getAttachments(email.messageId);
            email.payload = { attachments };
        }
        
        return email;
    }

    async getAttachments(messageId, providerName = null) {
        const currentProviderName = providerName || this.currentProvider;
        const provider = this.getProvider(providerName);
        
        if (currentProviderName === 'outlook') {
            return await provider.getAttachments(messageId);
        } else {
            // Gmail使用现有的AttachmentService
            const AttachmentService = require('./attachment-service');
            const attachmentService = new AttachmentService();
            const email = await provider.getEmailById(messageId);
            return attachmentService.detectAttachments(email.payload);
        }
    }

    async downloadAttachment(messageId, attachmentId, filename, downloadDir, providerName = null) {
        const provider = this.getProvider(providerName);
        return await provider.downloadAttachment(messageId, attachmentId, filename, downloadDir);
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