const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const emailRoutes = require('./routes/email-routes');
const attachmentRoutes = require('./routes/attachment-routes');
const statusRoutes = require('./routes/status-routes');
const demergeRoutes = require('./routes/demerge-routes');
const providerRoutes = require('./routes/provider-routes');
const outlookAuthRoutes = require('./routes/outlook-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined'));

const downloadsDir = path.join(__dirname, 'downloads');
const attachmentsDir = path.join(downloadsDir, 'attachments');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}
if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
}

// 重要：outlook认证路由必须在通用providers路由之前注册
app.use('/api/providers/outlook', outlookAuthRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/demerge', demergeRoutes);

app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Gmail PDF Converter API',
        version: '1.0.0',
        endpoints: {
            emails: {
                'GET /api/emails/latest': 'Get latest email',
                'GET /api/emails/list': 'Get email list',
                'GET /api/emails/:messageId': 'Get specific email',
                'POST /api/emails/convert-latest': 'Convert latest email to PDF',
                'POST /api/emails/convert/:messageId': 'Convert specific email to PDF',
                'GET /api/emails/download/:filename': 'Download PDF file',
                'DELETE /api/emails/downloads/:filename': 'Delete PDF file'
            },
            attachments: {
                'GET /api/attachments/:messageId/list': 'Get email attachment list',
                'POST /api/attachments/:messageId/download/:attachmentId': 'Download specific attachment',
                'GET /api/attachments/download/:filename': 'Download attachment file',
                'POST /api/attachments/:messageId/download-all': 'Download all attachments',
                'DELETE /api/attachments/cleanup/:messageId': 'Clean attachment files'
            },
            providers: {
                'GET /api/providers/list': 'Get available email providers',
                'POST /api/providers/switch': 'Switch email provider',
                'GET /api/providers/status': 'Get current provider status',
                'GET /api/providers/auth/:provider': 'Check provider authentication'
            },
            outlook: {
                'GET /api/providers/outlook/auth': 'Get Outlook authorization URL',
                'GET /api/providers/outlook/callback': 'Outlook OAuth callback',
                'GET /api/providers/outlook/token-status': 'Check Outlook token status'
            },
            status: {
                'GET /api/status/health': 'Health check',
                'GET /api/status/auth': 'Authentication status',
                'GET /api/status/downloads': 'Download files status',
                'POST /api/status/cleanup': 'Clean files',
                'GET /api/status/system': 'System information'
            },
            demerge: {
                'GET /api/demerge/list': 'Get merged PDF files',
                'POST /api/demerge/split/:filename': 'Split merged PDF',
                'GET /api/demerge/analyze/:filename': 'Analyze PDF structure'
            }
        }
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'API not found',
        path: req.path
    });
});

app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Please contact administrator'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:3000`);
    console.log(`📚 API Documentation: http://localhost:3000/api`);
    console.log(`🏥 Health Check: http://localhost:3000/api/status/health`);
    console.log(`🔐 Outlook Auth: http://localhost:3000/api/providers/outlook/auth`);
});

module.exports = app;