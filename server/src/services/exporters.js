const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { formatMoney } = require('../utils/money');

const amountIndex = (table) => table.columns.findIndex((c) => c.key === 'amount');

async function renderXlsx(table) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(table.title);
  ws.addRow([table.title]).font = { bold: true, size: 14 };
  ws.addRow([table.subtitle]);
  ws.addRow([]);
  ws.addRow(table.columns.map((c) => c.header)).font = { bold: true };
  table.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const money = (row, cells) => {
    table.columns.forEach((c, i) => { if (c.type === 'money') row.getCell(i + 1).numFmt = '#,##0.00'; });
    return cells;
  };
  for (const r of table.rows) {
    const cells = table.columns.map((c) => (c.type === 'money' ? (r[c.key] == null ? null : r[c.key] / 100) : r[c.key]));
    const row = ws.addRow(cells);
    money(row);
    if (r.voided) row.font = { color: { argb: 'FF999999' }, strike: true };
  }
  if (table.totals) {
    const cells = table.columns.map(() => null);
    cells[0] = table.totals.label;
    cells[amountIndex(table)] = table.totals.amount / 100;
    const row = ws.addRow(cells);
    money(row);
    row.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function renderTablePdf(table) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usable = doc.page.width - 60;
    const totalW = table.columns.reduce((s, c) => s + c.width, 0);
    const cols = table.columns.map((c) => ({ ...c, w: (c.width / totalW) * usable }));
    const headerCells = table.columns.map((c) => c.header);

    const drawRow = (cells, { bold = false, grey = false } = {}) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(grey ? '#888888' : '#000000');
      const heights = cells.map((t, i) => doc.heightOfString(String(t), { width: cols[i].w - 4 }));
      const h = Math.max(...heights);
      if (doc.y + h > doc.page.height - 40) {
        doc.addPage();
        drawRow(headerCells, { bold: true });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(grey ? '#888888' : '#000000');
      }
      const y = doc.y;
      let x = 30;
      cells.forEach((t, i) => {
        doc.text(String(t), x, y, { width: cols[i].w - 4, align: cols[i].type === 'money' ? 'right' : 'left' });
        x += cols[i].w;
      });
      doc.x = 30;
      doc.y = y + h + 4;
    };

    doc.font('Helvetica-Bold').fontSize(14).text(table.title, 30, 30);
    doc.font('Helvetica').fontSize(9).text(table.subtitle, 30);
    doc.moveDown();
    drawRow(headerCells, { bold: true });
    for (const r of table.rows) {
      drawRow(table.columns.map((c) => (c.type === 'money' ? (r[c.key] == null ? '' : formatMoney(r[c.key])) : r[c.key] ?? '')), { grey: r.voided });
    }
    if (table.totals) {
      const cells = table.columns.map(() => '');
      cells[0] = table.totals.label;
      cells[amountIndex(table)] = formatMoney(table.totals.amount);
      drawRow(cells, { bold: true });
    }
    doc.end();
  });
}

module.exports = { renderXlsx, renderTablePdf };
