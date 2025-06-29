Gmail & Email to PDF Converter
A powerful full-stack application that converts emails from multiple email providers (Gmail, Outlook) into PDF documents with support for attachment merging and splitting.

🌟 Features
📧 Multi-Email Provider Support
Gmail - Full integration with Google Gmail API
Outlook/Microsoft 365 - Complete support via Microsoft Graph API
Yahoo Mail - Ready for integration (interface prepared)
iCloud Mail - Ready for integration (interface prepared)
🔄 Flexible Conversion Modes
Merged Mode - Combine email content with PDF attachments into single PDF
Email Only - Convert email content to PDF without attachments
Attachments Only - Download attachments with type filtering (PDF, Images, Documents, Others)
Auto Mode - Intelligently choose best conversion method
✂️ PDF Management
PDF Merging - Combine email content with PDF attachments
PDF Splitting - Separate merged PDFs back into original components
Smart Analysis - Automatic PDF structure detection
Custom Settings - Manual page count and attachment configuration
🎨 Modern UI/UX
Responsive Design - Works on desktop and mobile devices
Real-time Status - Live system monitoring and authentication status
Interactive Interface - Drag-and-drop style email selection
Multi-language Support - English interface with localization ready
🏗️ Architecture
├── backend/                    # Node.js Express Server
│   ├── routes/                # API route handlers
│   │   ├── email-routes.js    # Email conversion endpoints
│   │   ├── attachment-routes.js # Attachment management
│   │   ├── provider-routes.js # Email provider switching
│   │   ├── status-routes.js   # System status & health
│   │   └── demerge-routes.js  # PDF splitting functionality
│   ├── services/              # Business logic services
│   │   ├── gmail-service.js   # Gmail API integration
│   │   ├── outlook-service.js # Outlook/Graph API integration
│   │   ├── email-provider-service.js # Provider abstraction
│   │   ├── attachment-service.js # Attachment processing
│   │   ├── pdf-service.js     # PDF manipulation
│   │   ├── html-service.js    # Email-to-HTML conversion
│   │   ├── puppeteer-service.js # HTML-to-PDF conversion
│   │   └── email-processor.js # Main processing orchestrator
│   ├── downloads/             # Generated files storage
│   ├── app.js                 # Express server setup
│   ├── credentials.json       # Gmail OAuth credentials
│   ├── token.json            # Gmail access tokens
│   ├── outlook-config.json   # Outlook app configuration
│   └── outlook-token.json    # Outlook access tokens
└── frontend/                  # React Application
    ├── src/
    │   ├── App.js            # Main React component
    │   ├── App.css           # Styling and responsive design
    │   └── index.js          # React entry point
    ├── public/
    │   ├── index.html        # HTML template
    │   └── manifest.json     # PWA configuration
    └── package.json          # Frontend dependencies
🚀 Quick Start
Prerequisites
Node.js 16+
npm or yarn
Google Cloud Project (for Gmail)
Azure App Registration (for Outlook)
1. Backend Setup
bash
# Clone and navigate to backend
cd backend

# Install dependencies
npm install

# Configure Gmail (Google Cloud Console)
# 1. Create project at https://console.cloud.google.com
# 2. Enable Gmail API
# 3. Create OAuth 2.0 credentials
# 4. Download credentials.json to backend root

# Configure Outlook (Azure Portal)
# 1. Register app at https://portal.azure.com
# 2. Add Mail.Read permissions
# 3. Create outlook-config.json:
json
{
  "clientId": "your-outlook-client-id",
  "clientSecret": "your-outlook-client-secret", 
  "redirectUri": "http://localhost:3000/api/providers/outlook/callback",
  "scopes": [
    "https://graph.microsoft.com/Mail.Read",
    "https://graph.microsoft.com/Mail.ReadWrite"
  ]
}
bash
# Start backend server
npm start
# Server runs on http://localhost:3000
2. Frontend Setup
bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm start
# Frontend runs on http://localhost:3001
3. Authentication Setup
Gmail Authentication
Run backend server
Access http://localhost:3001
Application will guide you through OAuth flow
Grant necessary permissions
token.json will be created automatically
Outlook Authentication
Switch to Outlook provider in UI
Click "Authenticate Outlook" button
Complete Microsoft OAuth flow
outlook-token.json will be created automatically
📖 API Documentation
Base URL: http://localhost:3000/api
Email Endpoints
Get Email List
http
GET /emails/list?maxResults=20&provider=gmail
Convert Latest Email
http
POST /emails/convert-latest
Content-Type: application/json

{
  "mode": "merged",
  "attachmentTypes": ["pdf", "images"],
  "provider": "outlook"
}
Convert Specific Email
http
POST /emails/convert/{messageId}
Content-Type: application/json

{
  "mode": "email_only",
  "provider": "gmail"
}
Provider Management
List Available Providers
http
GET /providers/list
Switch Email Provider
http
POST /providers/switch
Content-Type: application/json

{
  "provider": "outlook"
}
PDF Operations
List Merged PDFs
http
GET /demerge/list
Split Merged PDF
http
POST /demerge/split/{filename}
Content-Type: application/json

{
  "emailPageCount": 2,
  "attachmentInfo": [
    {
      "originalName": "document.pdf", 
      "pageCount": 5
    }
  ]
}
🛠️ Configuration
Environment Variables
bash
# Backend (.env)
PORT=3000
NODE_ENV=development

# Gmail Configuration
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret

# Outlook Configuration  
OUTLOOK_CLIENT_ID=your_outlook_client_id
OUTLOOK_CLIENT_SECRET=your_outlook_client_secret
Conversion Modes
Mode	Description	Use Case
merged	Email + PDF attachments combined	Complete document archival
email_only	Just email content as PDF	Text-only preservation
attachments_only	Download attachments only	File extraction
auto	Smart mode selection	General purpose
Attachment Type Filters
PDF - PDF documents only
Images - JPG, PNG, GIF image files
Documents - Word, Excel, PowerPoint files
Others - All other attachment types
🔧 Development
Adding New Email Providers
Create new service in services/ (e.g., yahoo-service.js)
Implement required methods:
authenticate()
getLatestEmail()
getEmailList(maxResults)
getEmailById(messageId)
getAttachments(messageId)
downloadAttachment(...)
Register in EmailProviderService:
javascript
this.providers = {
  'gmail': new GmailService(),
  'outlook': new OutlookService(),
  'yahoo': new YahooService()  // Add here
};
Add authentication routes in routes/
Update frontend provider list
Custom PDF Processing
javascript
// Example: Custom PDF watermarking
const customPdfProcessor = async (pdfBuffer) => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  // Add watermark logic
  return await pdfDoc.save();
};
📱 Usage Examples
Basic Email Conversion
Open application
Select email provider (Gmail/Outlook)
Click "Refresh" to load emails
Select email from list
Choose conversion mode
Click "Convert this email"
PDF downloads automatically
Batch Processing
Use "Convert newest email" for latest email
Choose "Attachments only" mode
Select attachment types (PDF, Images, etc.)
All matching attachments download
PDF Management
Access "PDF demerge" panel
Select merged PDF file
Click "Analyze" for automatic detection
Adjust page counts manually if needed
Click "Split" to separate components
🧪 Testing
bash
# Backend tests
cd backend
npm test

# Frontend tests  
cd frontend
npm test

# API testing with curl
curl -X GET http://localhost:3000/api/status/health
curl -X GET http://localhost:3000/api/providers/list
🐛 Troubleshooting
Common Issues
Gmail Authentication Failed
Verify credentials.json is valid
Check OAuth redirect URIs match
Ensure Gmail API is enabled in Google Cloud Console
Outlook Authentication Failed
Confirm Azure app registration
Verify redirect URI: http://localhost:3000/api/providers/outlook/callback
Check Mail.Read permissions granted
PDF Generation Errors
Install Puppeteer dependencies: npm install puppeteer
For Linux: sudo apt-get install -y libxss1 libgconf-2-4 libasound2
File Permission Errors
Ensure write permissions to downloads/ directory
Check disk space availability
Debug Mode
bash
# Enable debug logging
DEBUG=app:* npm start