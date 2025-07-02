const express = require('express');
const router = express.Router();
const GmailAuthService = require('../services/multi-user-gmail-auth');


router.get('/callback', async (req, res) => {
    const { code, state: sessionId } = req.query;
  
    try {
      await GmailAuthService.handleAuthCallback(code, sessionId);
  
      res.send(`
        <html>
          <body>
            <p>✅ Authentication successful. This window will close automatically.</p>
            <script>
              window.close();
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send(`❌ ${err.message}`);
    }
  });
  

router.get('/emails/:sessionId', async (req, res) => {
    try {
        const gmail = await GmailAuthService.getGmailClient(req.params.sessionId);
        const list = await gmail.users.messages.list({ userId: 'me', maxResults: 10 });

        const results = [];

        for (const msg of list.data.messages || []) {
            const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const headers = detail.data.payload.headers || [];

            const getHeader = (name) =>
                headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

            results.push({
                subject: getHeader('Subject'),
                from: getHeader('From'),
                date: getHeader('Date'),
                snippet: detail.data.snippet,
                messageId: detail.data.id
            });
        }

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/users', (req, res) => {
    res.json(GmailAuthService.listAuthorizedUsers());
});

router.delete('/users/:sessionId', (req, res) => {
    GmailAuthService.deleteUser(req.params.sessionId);
    res.json({ success: true });
});


module.exports = router;
