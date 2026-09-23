const fs = require('fs');
const PDFDocument = require('pdfkit');
const { formatLagosDate } = require('../utils/dates');
const { amountInWords, formatNgn } = require('../utils/money');
const { LOGO_PATH, COLOR } = require('./pdfBrand');

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };

function accountLabel(a) {
  if (!a) return '';
  return a.type === 'bank' ? `${a.name} - ${a.bankName} ****${String(a.accountNumber).slice(-4)}` : a.name;
}

// A custom logo set via env wins; otherwise fall back to the bundled Solucio Clinic mark.
const logoPath = () => {
  const custom = process.env.HOSPITAL_LOGO_PATH;
  if (custom && fs.existsSync(custom)) return custom;
  return fs.existsSync(LOGO_PATH) ? LOGO_PATH : null;
};

function renderReceipt(income) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receipt ${income.receiptNumber}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 36;
    const width = doc.page.width - left * 2;
    const logo = logoPath();

    if (logo) {
      doc.image(logo, doc.page.width / 2 - 42, 30, { height: 36 });
      doc.y = 74;
    } else {
      doc.y = 30;
    }
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR.maroon).text(process.env.HOSPITAL_NAME || 'Hospital', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text('PAYMENT RECEIPT', { align: 'center', characterSpacing: 1.5 });
    doc.moveDown(0.7);

    const ruleY = doc.y;
    doc.rect(left, ruleY, width, 1.5).fill(COLOR.maroon);
    doc.rect(left, ruleY + 1.5, width, 1).fill(COLOR.green);
    doc.y = ruleY + 14;
    doc.fillColor(COLOR.ink);

    // The amount gets its own highlighted panel so it's the first thing a reader's eye lands on.
    const amountBoxH = 40;
    doc.rect(left, doc.y, width, amountBoxH).fill('#faf5f8');
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.muted).text('AMOUNT PAID', left + 12, doc.y + 8);
    doc.font('Helvetica-Bold').fontSize(19).fillColor(COLOR.maroon).text(formatNgn(income.amount), left + 12, doc.y - 1, { width: width - 24, align: 'right' });
    doc.y += amountBoxH + 14;
    doc.fillColor(COLOR.ink);

    const row = (label, value, { last = false } = {}) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.muted).text(label, left, y, { width: 108 });
      doc.font('Helvetica').fontSize(10).fillColor(COLOR.ink).text(String(value), left + 112, y, { width: width - 112 });
      doc.moveDown(0.55);
      if (!last) doc.rect(left, doc.y, width, 0.75).fill(COLOR.line);
      doc.moveDown(0.45);
      doc.fillColor(COLOR.ink);
    };
    row('Receipt No.', income.receiptNumber);
    row('Date', formatLagosDate(income.date));
    row('In words', amountInWords(income.amount));
    row('Method', METHOD[income.method] || income.method);
    row('Paid into', accountLabel(income.account));
    row('Recorded by', income.recordedBy ? income.recordedBy.name : '', { last: true });

    if (income.voided) {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#cc0000').text(`VOID - ${income.voidReason || ''}`, left, doc.y, { width });
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font('Helvetica-Bold').fontSize(90).fillColor('#cc0000').opacity(0.25)
        .text('VOID', 0, doc.page.height / 2 - 50, { align: 'center', width: doc.page.width });
      doc.restore();
    }

    // Sits below pdfkit's own bottom margin, which would otherwise silently start a fresh page.
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted)
      .text('Solucio Clinic - Payment & Receipt System', left, doc.page.height - 26, { width, align: 'center', lineBreak: false });
    doc.page.margins.bottom = savedBottomMargin;
    doc.end();
  });
}

module.exports = { renderReceipt };
