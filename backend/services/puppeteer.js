const puppeteer = require('puppeteer');

// Third-party service to convert HTML to PDF using Puppeteer
// Puppeteer is a Node library which provides a high-level API to control headless Chrome or
// Chromium over the DevTools Protocol. It is primarily used for web scraping, testing, and generating PDFs from HTML content.
// In prodction, this service we don't need to edit.
class PuppeteerService {
    async convertHtmlToPdf(htmlContent, outputPath = null, returnBuffer = false) {
        const browser = await puppeteer.launch({
            headless: 'new'
        });
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, {
                waitUntil: 'networkidle0'
            });
            const pdfBuffer = await page.pdf({
                // If returnBuffer is true, we don't set the path, so it returns a buffer instead of saving to a file
                // For api usage, we can return a buffer directly
                // If outputPath is provided, it will save the PDF to that path
                path: returnBuffer ? undefined : outputPath,
                // pdf format
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });
            return pdfBuffer;
        } finally {
            await browser.close();
        }
    }
}

module.exports = PuppeteerService;