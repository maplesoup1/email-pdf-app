// services/GmailAuthService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class GmailAuthService {
    constructor() {
        this.credentials = this.loadCredentials();
        //we need a new credentials.json file for our company account
        // store into Environment variables or Secret Manager (cloud) for example AWS Secrets Manager
        this.tokensDir = path.join(__dirname, '../user_tokens');
        //when integrating into corina we show consider the token strore into our database or a secure storage
        if (!fs.existsSync(this.tokensDir)) {
            fs.mkdirSync(this.tokensDir, { recursive: true });
        }
    }

    loadCredentials() {
        const content = fs.readFileSync('credentials.json');
        // in production environment, we should use environment variables or a secure vault to store sensitive data
        return JSON.parse(content).web || JSON.parse(content).installed;
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
        // This generates a random session ID, which can be used to track user sessions
        // Don't need to edit in production, but we can also use a more secure method to generate session ID
    }

    createOAuthClient() {
        const { client_id, client_secret, redirect_uris } = this.credentials;
        return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        // This creates a new OAuth2 client using the credentials loaded from the credentials.json file
        // In a production environment, we should use loaded credentials from environment variables or a secure vault
        // And aslo don't need to edit this in production.
    }

    getUserTokenPath(sessionId) {
        return path.join(this.tokensDir, `${sessionId}.json`);
        // This will find the token path, in our real application, we need to rewrite this to find token in our datebase or secure storage
    }

    generateAuthUrl(sessionId) {
        const client = this.createOAuthClient();
        return client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/gmail.readonly'], 
            state: sessionId,
            prompt: 'consent',
        });
        // This generates the authorization URL for the user to authenticate with Gmail，using the OAuth2 client created from the credentials.
    }

    async handleAuthCallback(code, sessionId) {
        const client = this.createOAuthClient();
        const { tokens } = await client.getToken(code);
        fs.writeFileSync(this.getUserTokenPath(sessionId), JSON.stringify(tokens, null, 2));
        // This handles the OAuth callback, exchanging the authorization code for tokens and saving them to a file.
        // In a production environment, we should write the tokens in the database secure storage
        return true;
    }

    async getGmailClient(sessionId) {
        const tokenPath = this.getUserTokenPath(sessionId);
        if (!fs.existsSync(tokenPath)) {
            throw new Error('Token not found for sessionId');
        }
        // In production environment, we should check the token in our database or secure storage, replace fs.existsSync method
        let tokens;
        try {
            tokens = JSON.parse(fs.readFileSync(tokenPath));
            // In production environment, we should read the tokens from a secure storage or database, replace fs. methods
        } catch (err) {
            this.deleteUser(sessionId);
            throw new Error('Invalid token file, deleted. Please re-authenticate.');
        }
    
        const client = this.createOAuthClient();
        client.setCredentials(tokens);
        //Get the OAuth2 client with the user's tokens, to verifly if gmail API can access the user's Gmail account.
        // In a production environment, we should use the OAuth2 client with the tokens stored in
        client.on('tokens', (newTokens) => {
            const merged = { ...tokens, ...newTokens };
            fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
        });
        // Auto refresh the tokens and save them back to the file， in production environment, replace fs. methods
        try {
            const gmail = google.gmail({ version: 'v1', auth: client });
            await gmail.users.getProfile({ userId: 'me' });
            return gmail;
        } catch (err) {
            this.deleteUser(sessionId);
            throw new Error('Token invalid or expired, deleted. Please re-authenticate.');
        }
        // Error handling: if the token is invalid or expired, delete the token file and throw an error.
    }
    

    listAuthorizedUsers() {
        return fs.readdirSync(this.tokensDir)
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    }
    // This lists all authorized users by reading the token files in the tokens directory.
    // But we did't use this right now.

    deleteUser(sessionId) {
        const tokenPath = this.getUserTokenPath(sessionId);
        if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    }
    // This deletes the user's token file based on the sessionId.
    // And we did't use this right now.
}

module.exports = new GmailAuthService();
