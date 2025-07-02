const express = require('express');
const router = express.Router();
const GmailAuthService = require('../services/multi-user-gmail-auth');
const GmailService = require('../services/gmail-service');


router.get('/start', async (req, res) => {
  try {
    const sessionId = GmailAuthService.generateSessionId();
    const authUrl = GmailAuthService.generateAuthUrl(sessionId);

    res.json({ authUrl, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
        const gmailService = new GmailService();
        const { maxResults = 10, pageToken } = req.query;
        const result = await gmailService.getEmailList(maxResults, req.params.sessionId, pageToken);
        res.json(result);
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
