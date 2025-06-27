const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

async function authorize() {
    try {
        const credentials = JSON.parse(fs.readFileSync('credentials.json'));
        const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
        
        const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        
        const authUrl = auth.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/gmail.readonly']
        });
        
        console.log('=== Gmail授权 ===');
        console.log('1. 复制以下URL到浏览器打开:');
        console.log(authUrl);
        console.log('\n2. 登录Gmail并授权');
        console.log('3. 授权后，从浏览器地址栏复制 code= 后面的授权码');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve, reject) => {
            rl.question('\n请粘贴授权码: ', async (code) => {
                try {
                    const { tokens } = await auth.getToken(code);
                    fs.writeFileSync('token.json', JSON.stringify(tokens));
                    console.log('✅ 授权成功！token已保存到 token.json');
                    rl.close();
                    resolve();
                } catch (error) {
                    console.error('❌ 授权失败:', error.message);
                    rl.close();
                    reject(error);
                }
            });
        });
        
    } catch (error) {
        console.error('❌ 读取凭证文件失败:', error.message);
        console.log('请确保 credentials.json 文件存在');
        throw error;
    }
}

// 检查是否需要授权
function needsAuthorization() {
    return !fs.existsSync('token.json');
}
if (require.main === module) {
    if (needsAuthorization()) {
        console.log('开始Gmail授权流程...');
        authorize().then(() => {
            console.log('授权完成！现在可以使用Gmail服务了。');
        }).catch(error => {
            console.error('授权失败:', error.message);
        });
    } else {
        console.log('✅ 已经授权过了，token.json 文件存在');
        console.log('如需重新授权，请删除 token.json 文件后重新运行');
    }
}

module.exports = { authorize, needsAuthorization };