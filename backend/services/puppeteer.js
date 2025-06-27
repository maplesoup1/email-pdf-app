const puppeteer = require('puppeteer');

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
                path: returnBuffer ? undefined : outputPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });
            
            if (!returnBuffer && outputPath) {
                console.log(`PDF已生成: ${outputPath}`);
            }
            
            return pdfBuffer;
            
        } finally {
            await browser.close();
        }
    }
}

module.exports = PuppeteerService;