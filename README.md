Gmail & Outlook to PDF Converter

A powerful full-stack automation tool designed to reduce manual processing errors by converting emails from multiple providers (Gmail, Outlook, etc.) into high-quality PDF documents. Supports advanced features like attachment merging, PDF splitting, and flexible conversion modes.

✨ Features

📧 Multi-Email Provider Support

Gmail: Full integration with Gmail API

Outlook / Microsoft 365: Powered by Microsoft Graph API

🔄 Flexible Conversion Modes

Merged Mode: Combine email content with PDF attachments

Email Only: Export just the email content as PDF

Attachments Only: Extract specific types of attachments (PDFs, images, documents, others)

Auto Mode: Smart selection based on email content and attachments

✂️ PDF Management

PDF Merging: Combine emails with PDF attachments

PDF Splitting: Separate merged PDFs back into original components

Smart Analysis: Detect structure and suggest splits

Manual Configuration: Customize page counts and filenames

🎨 Modern UI/UX

Responsive design for desktop & mobile

Live status and auth indicators

Interactive drag-and-select interface

Multi-language ready (default: English)

🏗️ Architecture Overview

project-root/
├── backend/                    # Node.js Express API
│   ├── routes/                # API route handlers
│   ├── services/              # Business logic modules
│   ├── downloads/             # PDF and attachment storage
│   ├── app.js                 # Entry point
│   ├── credentials.json       # Gmail OAuth
│   ├── token.json             # Gmail token
│   ├── outlook-config.json    # Outlook OAuth config
│   └── outlook-token.json     # Outlook token
└── frontend/                  # React.js application
    ├── src/
    ├── public/
    └── package.json

🚀 Quick Start

Prerequisites

Node.js 16+

Gmail API credentials

Microsoft Azure App registration (for Outlook)

Backend Setup

cd backend
npm install
npm start

Configure:

credentials.json for Gmail

outlook-config.json for Outlook (with required scopes)

Frontend Setup

cd frontend
npm install
npm start

Runs at: http://localhost:3001

📖 API Overview

Base URL: http://localhost:3000/api

Email Operations

GET /emails/list?maxResults=20&provider=gmail

POST /emails/convert-latest

POST /emails/convert/{messageId}

Provider Management

GET /providers/list

POST /providers/switch

PDF Operations

GET /demerge/list

POST /demerge/split/{filename}

GET /attachments/download/{filename}

🔧 Configuration

.env (Backend)

PORT=3000
NODE_ENV=development
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...

Conversion Modes

Mode

Description

merged

Email + attachments

email_only

Email content only

attachments_only

Attachments only with filtering

auto

Smart mode

Attachment Filters

PDF: application/pdf

Images: JPG, PNG, GIF

Documents: DOCX, XLSX, PPTX

Others: zip, txt, etc.

📱 Usage Examples

Convert Specific Email

Select email provider (Gmail or Outlook)

Click Refresh to load emails

Select desired email

Choose conversion mode

Click Convert this email

Batch Convert Latest Email

Click Convert newest email

Select attachment filters if needed

Result downloads automatically

PDF Splitting

Go to PDF Demerge Panel

Select a merged PDF

Click Analyze (auto split suggestion)

Adjust settings manually if needed

Click Split to generate files

💡 Development Notes

Add New Email Provider

Create service (e.g., yahoo-service.js)

Implement: authenticate(), getEmailList(), getEmailById(), etc.

Register in email-provider-service.js

Add UI button and label in frontend

Custom PDF Processing

You can hook into PDF generation to apply custom logic:

const customPdfProcessor = async (pdfBuffer) => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  // Add watermark, modify metadata, etc.
  return await pdfDoc.save();
};

🚫 Troubleshooting

Gmail Auth Fails

Check credentials.json

Ensure redirect URI matches your project

Gmail API must be enabled in Google Cloud Console

Outlook Auth Fails

Verify Azure app registration

Ensure Mail.Read permission is granted

Check outlook-config.json format

PDF Generation Error

Make sure Puppeteer dependencies installed:

npm install puppeteer
sudo apt install libxss1 libgconf-2-4 libasound2

Download Fails / Missing Files

Ensure files are saved in correct folder (downloads/attachments)

Check read/write permissions

🔮 Testing

# Backend
cd backend && npm test

# Frontend
cd frontend && npm test

# Health Check
curl http://localhost:3000/api/status/health

✨ Goal

This application aims to automate email-to-PDF processing, reduce human error, streamline documentation, and improve the reliability of manual workflows across multiple email platforms.

MIT License | Built with Node.js + React + pdf-lib