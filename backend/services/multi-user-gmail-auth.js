// services/GmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class GmailAuthService {
    constructor() {
        this.credentials = this.loadCredentials();
        this.tokensDir = path.join(__dirname, '../user_tokens');

        if (!fs.existsSync(this.tokensDir)) {
            fs.mkdirSync(this.tokensDir, { recursive: true });
        }
    }

    loadCredentials() {
        const content = fs.readFileSync('credentials.json');
        return JSON.parse(content).web || JSON.parse(content).installed;
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    createOAuthClient() {
        const { client_id, client_secret, redirect_uris } = this.credentials;
        return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    }

    getUserTokenPath(sessionId) {
        return path.join(this.tokensDir, `${sessionId}.json`);
    }

    generateAuthUrl(sessionId) {
        const client = this.createOAuthClient();
        return client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/gmail.readonly'], 
            state: sessionId,
            prompt: 'consent',
        });
    }

    async handleAuthCallback(code, sessionId) {
        const client = this.createOAuthClient();
        const { tokens } = await client.getToken(code);
        fs.writeFileSync(this.getUserTokenPath(sessionId), JSON.stringify(tokens, null, 2));
        return true;
    }

    async getGmailClient(sessionId) {
        const tokenPath = this.getUserTokenPath(sessionId);
        if (!fs.existsSync(tokenPath)) {
            throw new Error('Token not found for sessionId');
        }
    
        let tokens;
        try {
            tokens = JSON.parse(fs.readFileSync(tokenPath));
        } catch (err) {
            // 无法解析 token 文件，直接删掉
            this.deleteUser(sessionId);
            throw new Error('Invalid token file, deleted. Please re-authenticate.');
        }
    
        const client = this.createOAuthClient();
        client.setCredentials(tokens);
    
        client.on('tokens', (newTokens) => {
            const merged = { ...tokens, ...newTokens };
            fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
        });
    
        // 测试 token 是否有效
        try {
            const gmail = google.gmail({ version: 'v1', auth: client });
            await gmail.users.getProfile({ userId: 'me' }); // 简单请求测试
            return gmail;
        } catch (err) {
            // Token 已失效或非法，删除文件并报错
            this.deleteUser(sessionId);
            throw new Error('Token invalid or expired, deleted. Please re-authenticate.');
        }
    }
    

    listAuthorizedUsers() {
        return fs.readdirSync(this.tokensDir)
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    }

    deleteUser(sessionId) {
        const tokenPath = this.getUserTokenPath(sessionId);
        if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    }
}

module.exports = new GmailAuthService();
