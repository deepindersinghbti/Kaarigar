/**
 * Small, dependency-free PDF writer for the hackathon income statement.
 *
 * Keeping this server-side avoids adding a large PDF library to the browser
 * bundle. The document is intentionally a clear summary of the append-only
 * ledger, not a bank-certified statement or a fabricated financial product.
 */

export interface IncomeStatementPdfInput {
  workerName: string;
  periodMonths: 6 | 12;
  from: string;
  to: string;
  earned: number;
  owed: number;
  net: number;
  outstanding: number;
  entryCount: number;
  generatedAt: string;
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]/g, ' ');
}

function rupees(value: number): string {
  return `Rs ${Math.round(value).toLocaleString('en-IN')}`;
}

/** Build a single-page A4 PDF using the standard Type1 Helvetica font. */
export function buildIncomeStatementPdf(input: IncomeStatementPdfInput): Buffer {
  const lines: Array<{ text: string; x: number; y: number; size: number }> = [
    { text: 'Kaarigar Income Statement', x: 72, y: 775, size: 22 },
    { text: 'Worker-owned earnings record', x: 72, y: 748, size: 11 },
    { text: `Worker: ${input.workerName}`, x: 72, y: 705, size: 12 },
    { text: `Period: ${input.periodMonths} months (${input.from} to ${input.to})`, x: 72, y: 682, size: 12 },
    { text: `Generated: ${input.generatedAt}`, x: 72, y: 659, size: 10 },
    { text: `Money received: ${rupees(input.earned)}`, x: 90, y: 600, size: 14 },
    { text: `Money out / owed: ${rupees(input.owed)}`, x: 90, y: 570, size: 14 },
    { text: `Net recorded amount: ${rupees(input.net)}`, x: 90, y: 540, size: 14 },
    { text: `Outstanding amount: ${rupees(input.outstanding)}`, x: 90, y: 510, size: 14 },
    { text: `Ledger records included: ${input.entryCount}`, x: 72, y: 455, size: 11 },
    { text: 'This statement is generated from append-only Kaarigar ledger records.', x: 72, y: 400, size: 10 },
    { text: 'It is a record for review and sharing, not a bank-certified statement.', x: 72, y: 382, size: 10 },
  ];

  const commands = [
    'q',
    '0.96 0.97 1 rg',
    '60 720 475 75 re f',
    '0.96 0.97 1 rg',
    '60 480 475 145 re f',
    '0 0 0 rg',
    'BT',
    // Set an absolute text matrix for every line. Using `Td` here would make
    // each position relative to the previous one, pushing the later lines
    // off-page even though text extraction still sees them.
    ...lines.map((line) => `/F1 ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escapePdfText(line.text)}) Tj`),
    'ET',
    'Q',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'ascii');
}
