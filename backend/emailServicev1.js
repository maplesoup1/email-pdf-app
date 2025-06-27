const { google } = require('googleapis');
const fs = require('fs');

async function getLatestEmail() {
    try {
        const credentials = JSON.parse(fs.readFileSync('credentials.json'));
        const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
        const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        const token = JSON.parse(fs.readFileSync('token.json'));
        auth.setCredentials(token);
        const gmail = google.gmail({ version: 'v1', auth });
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 1
        });
        if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
            throw new Error('没有找到邮件');
        }
        const messageId = listResponse.data.messages[0].id;
        const messageResponse = await gmail.users.messages.get({
            userId: 'me',
            id: messageId
        });
        const message = messageResponse.data;
        const headers = message.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        let body = '';
        if (message.payload.body.data) {
            body = Buffer.from(message.payload.body.data, 'base64').toString();
        } else if (message.payload.parts) {
            const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
            if (textPart && textPart.body.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString();
            }
        }
        return {
            subject,
            from,
            to,
            date,
            body: body || message.snippet
        };

    } catch (error) {
        console.error('获取邮件失败:', error.message);
        throw error;
    }
}

async function main() {
    try {
        const email = await getLatestEmail();
        console.log('=== 最新邮件 ===');
        console.log('主题:', email.subject);
        console.log('发件人:', email.from);
        console.log('日期:', email.date);
        console.log('内容:', email.body);
    } catch (error) {
        console.error('错误:', error.message);
    }
}

module.exports = { getLatestEmail };
if (require.main === module) {
    main();
}