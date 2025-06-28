const express = require('express');
const router = express.Router();
const EmailProviderService = require('../services/email-provider-service');

const emailProviderService = new EmailProviderService();

router.get('/list', (req, res) => {
    try {
        const providers = emailProviderService.getAvailableProviders();
        const currentProvider = emailProviderService.getCurrentProvider();
        
        res.json({
            success: true,
            data: {
                providers: providers.map(p => ({
                    name: p,
                    displayName: getProviderDisplayName(p),
                    active: p === currentProvider
                })),
                currentProvider
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/switch', async (req, res) => {
    try {
        const { provider } = req.body;
        
        if (!provider) {
            return res.status(400).json({
                success: false,
                error: '请指定邮件提供商'
            });
        }
        
        const success = emailProviderService.setProvider(provider);
        
        if (!success) {
            return res.status(400).json({
                success: false,
                error: '不支持的邮件提供商'
            });
        }
        
        // 检查新提供商的认证状态
        const authStatus = await emailProviderService.checkAuthentication();
        
        res.json({
            success: true,
            data: {
                currentProvider: provider,
                authStatus: authStatus.status,
                error: authStatus.error
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/status', async (req, res) => {
    try {
        const currentProvider = emailProviderService.getCurrentProvider();
        const authStatus = await emailProviderService.checkAuthentication();
        
        res.json({
            success: true,
            data: {
                currentProvider,
                authStatus: authStatus.status,
                error: authStatus.error
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/auth/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const authStatus = await emailProviderService.checkAuthentication(provider);
        
        res.json({
            success: true,
            data: authStatus
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

function getProviderDisplayName(provider) {
    const displayNames = {
        'gmail': 'Gmail',
        'outlook': 'Outlook / Microsoft 365',
        'yahoo': 'Yahoo Mail',
        'icloud': 'iCloud Mail'
    };
    return displayNames[provider] || provider;
}

module.exports = router;