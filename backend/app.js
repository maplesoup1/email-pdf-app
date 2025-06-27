const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const emailRoutes = require('./routes/email-routes');
const attachmentRoutes = require('./routes/attachment-routes');
const statusRoutes = require('./routes/status-routes');

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

app.use('/api/emails', emailRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/status', statusRoutes);

app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Gmail PDF Converter API',
        version: '1.0.0',
        endpoints: {
            emails: {
                'GET /api/emails/latest': '获取最新邮件',
                'GET /api/emails/list': '获取邮件列表',
                'GET /api/emails/:messageId': '获取指定邮件',
                'POST /api/emails/convert-latest': '转换最新邮件为PDF',
                'POST /api/emails/convert/:messageId': '转换指定邮件为PDF',
                'GET /api/emails/download/:filename': '下载PDF文件',
                'DELETE /api/emails/downloads/:filename': '删除PDF文件'
            },
            attachments: {
                'GET /api/attachments/:messageId/list': '获取邮件附件列表',
                'POST /api/attachments/:messageId/download/:attachmentId': '下载指定附件',
                'GET /api/attachments/download/:filename': '下载附件文件',
                'POST /api/attachments/:messageId/download-all': '下载所有附件',
                'DELETE /api/attachments/cleanup/:messageId': '清理附件文件'
            },
            status: {
                'GET /api/status/health': '健康检查',
                'GET /api/status/auth': '认证状态',
                'GET /api/status/downloads': '下载文件状态',
                'POST /api/status/cleanup': '清理文件',
                'GET /api/status/system': '系统信息'
            }
        }
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: '接口不存在',
        path: req.path
    });
});

app.use((error, req, res, next) => {
    console.error('服务器错误:', error);
    
    res.status(500).json({
        success: false,
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? error.message : '请联系管理员'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📚 API文档: http://localhost:${PORT}/api`);
    console.log(`🏥 健康检查: http://localhost:${PORT}/api/status/health`);
});

module.exports = app;