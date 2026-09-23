const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { formatMoney } = require('../utils/money');
const { LOGO_PATH, COLOR } = require('./pdfBrand');

const amountIndex = (table) => table.columns.findIndex((c) => c.key === 'amount');

async function renderXlsx(table) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(table.title);
  ws.addRow([table.title]).font = { bold: true, size: 14, color: { argb: 'FF5C1938' } };
  ws.addRow([table.subtitle]).font = { color: { argb: 'FF8A8492' } };
  ws.addRow([]);
  const headerRow = ws.addRow(table.columns.map((c) => c.header.replace('NGN', '₦')));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C1938' } };
  });
  table.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const money = (row, cells) => {
    table.columns.forEach((c, i) => { if (c.type === 'money') row.getCell(i + 1).numFmt = '#,##0.00'; });
    return cells;
  };
  table.rows.forEach((r, i) => {
    const cells = table.columns.map((c) => (c.type === 'money' ? (r[c.key] == null ? null : r[c.key] / 100) : r[c.key]));
    const row = ws.addRow(cells);
    money(row);
    if (r.voided) row.font = { color: { argb: 'FF999999' }, strike: true };
    else if (i % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF8FC' } }; });
  });
  if (table.totals) {
    const cells = table.columns.map(() => null);
    cells[0] = table.totals.label;
    cells[amountIndex(table)] = table.totals.amount / 100;
    const row = ws.addRow(cells);
    money(row);
    row.font = { bold: true };
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF6E4' } }; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function renderTablePdf(table) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: 30, bufferPages: true,
      info: { Title: table.title, Author: 'Solucio Clinic' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 30;
    const usable = doc.page.width - left * 2;
    const bottomLimit = doc.page.height - 46;
    const totalW = table.columns.reduce((s, c) => s + c.width, 0);
    const cols = table.columns.map((c) => ({ ...c, w: (c.width / totalW) * usable }));
    const headerCells = table.columns.map((c) => c.header);
    const hasLogo = fs.existsSync(LOGO_PATH);

    const rowHeight = (cells, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      return Math.max(...cells.map((t, i) => doc.heightOfString(String(t), { width: cols[i].w - 8 }))) + 8;
    };

    const drawTableHeaderRow = (y) => {
      const h = rowHeight(headerCells, true);
      doc.rect(left, y, usable, h).fill(COLOR.maroon);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      let x = left;
      headerCells.forEach((t, i) => {
        doc.text(String(t), x + 4, y + 5, { width: cols[i].w - 8, align: cols[i].type === 'money' ? 'right' : 'left' });
        x += cols[i].w;
      });
      doc.fillColor(COLOR.ink);
      return y + h;
    };

    const drawBrandHeader = () => {
      const top = 30;
      let textX = left;
      if (hasLogo) {
        doc.image(LOGO_PATH, left, top, { height: 28 });
        textX = left + 96;
      }
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.maroon).text(table.title, textX, top);
      doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(table.subtitle, textX, top + 20);
      doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted)
        .text(`Generated ${new Date().toLocaleDateString('en-GB')}`, left, top + 3, { width: usable, align: 'right' });
      const ruleY = top + 40;
      doc.rect(left, ruleY, usable, 2).fill(COLOR.maroon);
      doc.rect(left, ruleY + 2, usable, 1).fill(COLOR.green);
      doc.fillColor(COLOR.ink);
      return drawTableHeaderRow(ruleY + 12);
    };

    const newPage = () => {
      doc.addPage();
      doc.y = drawTableHeaderRow(30);
    };

    const drawDataRow = (cells, { bold = false, voided = false, striped = false, fill } = {}) => {
      const h = rowHeight(cells, bold);
      if (doc.y + h > bottomLimit) newPage();
      const y = doc.y;
      if (fill) doc.rect(left, y, usable, h).fill(fill);
      else if (striped) doc.rect(left, y, usable, h).fill(COLOR.stripe);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(voided ? COLOR.void : COLOR.ink);
      let x = left;
      cells.forEach((t, i) => {
        doc.text(String(t), x + 4, y + 5, { width: cols[i].w - 8, align: cols[i].type === 'money' ? 'right' : 'left', oblique: voided });
        x += cols[i].w;
      });
      doc.y = y + h;
      doc.x = left;
    };

    const drawTotalsRow = () => {
      const idx = amountIndex(table);
      const labelWidth = cols.slice(0, idx).reduce((s, c) => s + c.w, 0) - 8;
      const amount = formatMoney(table.totals.amount);
      const h = Math.max(doc.font('Helvetica-Bold').fontSize(9).heightOfString(table.totals.label, { width: labelWidth }), 12) + 10;
      if (doc.y + h > bottomLimit) newPage();
      const y = doc.y;
      doc.rect(left, y, usable, h).fill('#eef6e4');
      doc.rect(left, y, usable, 1.5).fill(COLOR.green);
      let x = left;
      cols.slice(0, idx).forEach((c) => { x += c.w; });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.maroonDark)
        .text(table.totals.label, left + 4, y + 6, { width: labelWidth })
        .text(amount, x + 4, y + 6, { width: cols[idx].w - 8, align: 'right' });
      doc.y = y + h;
      doc.x = left;
    };

    doc.y = drawBrandHeader();
    table.rows.forEach((r, i) => {
      const cells = table.columns.map((c) => (c.type === 'money' ? (r[c.key] == null ? '' : formatMoney(r[c.key])) : r[c.key] ?? ''));
      drawDataRow(cells, { voided: r.voided, striped: i % 2 === 1 });
    });
    if (table.totals) drawTotalsRow();

    // Footer with page numbers, added last so the total page count is known. The footer sits
    // below pdfkit's own bottom margin, which would otherwise silently start a fresh page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const savedBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const footerY = doc.page.height - 34;
      doc.rect(left, footerY, usable, 0.75).fill(COLOR.line);
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted)
        .text('Solucio Clinic - Payment & Receipt System', left, footerY + 6, { lineBreak: false })
        .text(`Page ${i - range.start + 1} of ${range.count}`, left, footerY + 6, { width: usable, align: 'right', lineBreak: false });
      doc.page.margins.bottom = savedBottomMargin;
    }

    doc.end();
  });
}

module.exports = { renderXlsx, renderTablePdf };
