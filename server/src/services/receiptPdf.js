const fs = require('fs');
const PDFDocument = require('pdfkit');
const { formatLagosDate } = require('../utils/dates');
const { amountInWords, formatNgn } = require('../utils/money');

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };

function accountLabel(a) {
  if (!a) return '';
  return a.type === 'bank' ? `${a.name} - ${a.bankName} ****${String(a.accountNumber).slice(-4)}` : a.name;
}

function renderReceipt(income) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receipt ${income.receiptNumber}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 72;
    const logo = process.env.HOSPITAL_LOGO_PATH;
    if (logo && fs.existsSync(logo)) {
      doc.image(logo, doc.page.width / 2 - 20, 30, { height: 40 });
      doc.moveDown(3.5);
    }
    doc.font('Helvetica-Bold').fontSize(16).text(process.env.HOSPITAL_NAME || 'Hospital', { align: 'center' });
    doc.moveDown(0.3).fontSize(11).text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(1.2);

    const row = (label, value) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).text(label, 36, y, { width: 110 });
      doc.font('Helvetica').text(String(value), 150, y, { width: width - 114 });
      doc.moveDown(0.6);
    };
    row('Receipt No.', income.receiptNumber);
    row('Date', formatLagosDate(income.date));
    row('Amount', formatNgn(income.amount));
    row('In words', amountInWords(income.amount));
    row('Method', METHOD[income.method] || income.method);
    row('Paid into', accountLabel(income.account));
    row('Recorded by', income.recordedBy ? income.recordedBy.name : '');

    if (income.voided) {
      doc.moveDown(0.5);
      row('Status', `VOID - ${income.voidReason || ''}`);
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font('Helvetica-Bold').fontSize(90).fillColor('#cc0000').opacity(0.25)
        .text('VOID', 0, doc.page.height / 2 - 50, { align: 'center', width: doc.page.width });
      doc.restore();
    }
    doc.end();
  });
}

module.exports = { renderReceipt };
