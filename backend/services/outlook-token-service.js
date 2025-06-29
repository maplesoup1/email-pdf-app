const fs = require('fs');
const { ConfidentialClientApplication } = require('@azure/msal-node');

const configPath = 'outlook-config.json';
const tokenPath = 'outlook-token.json';

async function refreshOutlookTokenIfNeeded() {
    if (!fs.existsSync(configPath)) throw new Error('缺少 outlook-config.json');
    if (!fs.existsSync(tokenPath)) throw new Error('缺少 outlook-token.json');

    const config = JSON.parse(fs.readFileSync(configPath));
    const tokenData = JSON.parse(fs.readFileSync(tokenPath));

    const now = Date.now();
    if (now < tokenData.expires_at - 60 * 1000) {
        return tokenData;
    }

    if (!tokenData.refresh_token) {
        throw new Error('没有 refresh_token，必须重新授权');
    }

    const clientApp = new ConfidentialClientApplication({
        auth: {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            authority: config.authority || 'https://login.microsoftonline.com/common'
        }
    });

    const refreshResult = await clientApp.acquireTokenByRefreshToken({
        refreshToken: tokenData.refresh_token,
        scopes: config.scopes
    });

    const updatedToken = {
        access_token: refreshResult.accessToken,
        refresh_token: refreshResult.refreshToken || tokenData.refresh_token,
        expires_at: refreshResult.expiresOn ? refreshResult.expiresOn.getTime() : now + 3600000,
        scope: refreshResult.scopes.join(' '),
        token_type: 'Bearer',
        created_at: now
    };

    fs.writeFileSync(tokenPath, JSON.stringify(updatedToken, null, 2));
    return updatedToken;
}

module.exports = {
    refreshOutlookTokenIfNeeded
};
