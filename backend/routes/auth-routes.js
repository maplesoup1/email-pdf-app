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
    // This route handles the OAuth callback from Google after the user has authenticated.
    // return a html page with a message and close the window automatically.
    // If the authentication is successful, it will show a success message and close the window.
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
// This route retrieves the latest 10 emails for a user, identified by their session ID.
// Return a JSON array of email objects, each containing subject, from, date, snippet, and messageId.

router.delete('/users/:sessionId', (req, res) => {
    GmailAuthService.deleteUser(req.params.sessionId);
    res.json({ success: true });
});
// This route deletes a user's session and associated tokens, identified by their session ID, did't use this method yet.


module.exports = router;
