const express = require('express');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// 生成授权URL
router.get('/auth', async (req, res) => {
    try {
        if (!fs.existsSync('outlook-config.json')) {
            return res.status(400).json({
                success: false,
                error: 'Outlook configuration file not found. Please create outlook-config.json'
            });
        }

        const config = JSON.parse(fs.readFileSync('outlook-config.json'));
        
        const clientApp = new ConfidentialClientApplication({
            auth: {
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                authority: config.authority || 'https://login.microsoftonline.com/common'
            }
        });

        const authCodeUrlParameters = {
            scopes: config.scopes,
            redirectUri: config.redirectUri,
            state: 'outlook_auth_' + Date.now()
        };

        const authUrl = await clientApp.getAuthCodeUrl(authCodeUrlParameters);
        
        res.json({
            success: true,
            data: {
                authUrl: authUrl,
                message: 'Please visit the authorization URL to complete authentication'
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate authorization URL: ' + error.message
        });
    }
});

// 处理OAuth回调
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        
        if (error) {
            return res.status(400).send(`
                <html>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #ff6b6b;">❌ Authorization Failed</h1>
                        <p>Error: ${error}</p>
                        <p>Error Description: ${req.query.error_description || 'Unknown error'}</p>
                        <button onclick="window.close()">Close Window</button>
                    </body>
                </html>
            `);
        }

        if (!code) {
            return res.status(400).send(`
                <html>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #ff6b6b;">❌ Authorization Failed</h1>
                        <p>Authorization code not found</p>
                        <button onclick="window.close()">Close Window</button>
                    </body>
                </html>
            `);
        }

        const config = JSON.parse(fs.readFileSync('outlook-config.json'));
        
        const clientApp = new ConfidentialClientApplication({
            auth: {
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                authority: config.authority || 'https://login.microsoftonline.com/common'
            }
        });

        const tokenRequest = {
            code: code,
            scopes: config.scopes,
            redirectUri: config.redirectUri,
        };

        const response = await clientApp.acquireTokenByCode(tokenRequest);
        
        // 保存令牌
        const tokenData = {
            access_token: response.accessToken,
            refresh_token: response.refreshToken,
            expires_at: response.expiresOn ? response.expiresOn.getTime() : Date.now() + 3600000,
            scope: response.scopes ? response.scopes.join(' ') : config.scopes.join(' '),
            token_type: 'Bearer',
            created_at: Date.now()
        };

        fs.writeFileSync('outlook-token.json', JSON.stringify(tokenData, null, 2));

        res.send(`
            <html>
                <head>
                    <title>Authorization Successful</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 50px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            margin: 0;
                        }
                        .container {
                            background: white;
                            color: #333;
                            padding: 40px;
                            border-radius: 15px;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                            max-width: 500px;
                            margin: 0 auto;
                        }
                        .success-icon {
                            font-size: 4rem;
                            color: #48bb78;
                            margin-bottom: 20px;
                        }
                        .btn {
                            background: linear-gradient(135deg, #48bb78 0%, #38b2ac 100%);
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                            font-weight: 600;
                            margin: 10px;
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 8px 20px rgba(72, 187, 120, 0.4);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✅</div>
                        <h1>Authorization Successful!</h1>
                        <p>Your Outlook account has been successfully connected to Gmail PDF Converter.</p>
                        <p>You can now close this window and return to the application.</p>
                        <button class="btn" onclick="window.close()">Close Window</button>
                        <button class="btn" onclick="window.opener.location.reload(); window.close();">Close & Refresh App</button>
                    </div>
                </body>
            </html>
        `);
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send(`
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #ff6b6b;">❌ Authorization Failed</h1>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.close()">Close Window</button>
                </body>
            </html>
        `);
    }
});

// 检查令牌状态
router.get('/token-status', (req, res) => {
    try {
        if (!fs.existsSync('outlook-token.json')) {
            return res.json({
                success: true,
                data: {
                    hasToken: false,
                    expired: true,
                    needsAuth: true
                }
            });
        }

        const tokenData = JSON.parse(fs.readFileSync('outlook-token.json'));
        const now = Date.now();
        const expiresAt = tokenData.expires_at || 0;
        const isExpired = now >= expiresAt;
        
        res.json({
            success: true,
            data: {
                hasToken: true,
                expired: isExpired,
                expiresAt: new Date(expiresAt).toISOString(),
                needsAuth: isExpired && !tokenData.refresh_token
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;