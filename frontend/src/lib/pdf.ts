import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageBreak } from 'docx';

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

// Helper to convert snake_case/slug payment methods to human-readable
export const formatPaymentMethod = (method: string): string => {
  if (!method) return 'N/A';
  const map: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    upi: 'UPI',
    cheque: 'Cheque',
    online: 'Online',
    card: 'Card / Debit Card',
    neft: 'NEFT',
    rtgs: 'RTGS',
    imps: 'IMPS',
    dd: 'Demand Draft',
  };
  return map[method.toLowerCase()] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export const generateDueSlipHtml = (data: {
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  studentName: string;
  admissionNumber: string;
  rollNumber?: string;
  className: string;
  sectionName: string;
  parentName?: string;
  address?: string;
  dueMonth?: string;
  totalDue: number;
  dueDate: string;
  feeItems: { title: string; amount: number }[];
  language?: 'hindi' | 'english' | 'bilingual';
}): string => {
  const lang = data.language || 'english';

  // Format items
  const feeItemsHtml = data.feeItems.map(item => `
    <tr>
      <td style="border: 1px solid #000; padding: 10px; font-size: 15px;">${item.title}</td>
      <td style="border: 1px solid #000; padding: 10px; font-size: 15px; text-align: right;">${Number(item.amount).toFixed(2)}</td>
    </tr>
  `).join('');

  if (lang === 'hindi') {
    return `
      <div class="due-slip-print">
      <style>
      .due-slip-print, .due-slip-print *{ margin:0; padding:0; box-sizing:border-box; font-family:'Noto Sans Devanagari',sans-serif; }
      .sheet{ width:200mm; min-height:287mm; background:#fff; margin:5mm auto; border:1px solid #334155; padding:14mm; }
      .header{ display:flex; align-items:center; border-bottom:1px solid #334155; padding:0 0 10px; }
      .school{ flex:1; text-align:center; }
      .school h1{ font-size:26px; font-weight:700; letter-spacing:1px; color:#111827; }
      .school p{ font-size:13px; margin-top:4px; color:#475569; }
      .title{ margin:18px 0; text-align:center; }
      .title h2{ font-size:24px; border:2px solid #000; display:inline-flex; align-items:center; justify-content:center; padding:14px 34px; line-height:1.2; }
      .info{ width:100%; border-collapse:collapse; margin-top:20px; }
      .info td{ padding:9px; border:1px solid #000; font-size:16px; }
      .info td:first-child{ width:28%; font-weight:600; }
      .fees{ width:100%; border-collapse:collapse; margin-top:25px; }
      .fees th{ border:1px solid #000; padding:10px; font-size:17px; background:#f9f9f9;}
      .fees td{ border:1px solid #000; padding:10px; font-size:16px; }
      .fees td:last-child{ text-align:right; }
      .total{ font-weight:bold; font-size:18px; }
      .notice{ margin-top:35px; }
      .notice h3{ font-size:19px; margin-bottom:10px; text-decoration:underline; }
      .notice ul{ padding-left:22px; }
      .notice li{ margin-bottom:10px; line-height:1.6; }
      .footer{ margin-top:50px; border-top:1px solid #000; padding-top:10px; display:flex; justify-content:space-between; font-size:14px; }
      </style>
      <div class="sheet">
        <div class="header">
          <div class="school">
            <h1>${data.schoolName}</h1>
            <p>${data.schoolAddress || ''}</p>
            ${(data.schoolPhone || data.schoolEmail) ? `<p>फोन : ${data.schoolPhone || 'N/A'} | ईमेल : ${data.schoolEmail || 'N/A'}</p>` : ''}
          </div>
        </div>
        <div class="title">
          <h2>शुल्क माँग पत्र</h2>
          <p style="margin-top:10px; font-size:15px; font-weight:600;">माह : ${data.dueMonth || ''}</p>
        </div>
        <table class="info">
          <tr><td>नाम</td><td>${data.studentName}</td></tr>
          <tr><td>प्रवेश संख्या</td><td>${data.admissionNumber}</td></tr>
          <tr><td>रोल संख्या</td><td>${data.rollNumber || '—'}</td></tr>
          <tr><td>कक्षा</td><td>${data.className}</td></tr>
          <tr><td>खंड</td><td>${data.sectionName}</td></tr>
          <tr><td>पिता का नाम</td><td>${data.parentName || '—'}</td></tr>
          <tr><td>पता</td><td>${data.address || '—'}</td></tr>
        </table>
        <table class="fees">
          <tr><th>शुल्क विवरण</th><th style="text-align:right;">राशि (₹)</th></tr>
          ${data.feeItems.map(item => `
          <tr>
            <td>${item.title}</td>
            <td>${Number(item.amount).toFixed(2)}</td>
          </tr>
          `).join('')}
          <tr class="total">
            <td>कुल देय राशि</td>
            <td>₹ ${Number(data.totalDue).toFixed(2)}</td>
          </tr>
        </table>
        <div class="notice">
          <h3>कृपया ध्यान दें</h3>
          <ul>
            <li>कृपया शुल्क का भुगतान प्रत्येक माह की <strong>09</strong> तारीख से पूर्व करें।</li>
            <li>दो माह से अधिक शुल्क बकाया रहने पर वाहन सुविधा अस्थायी रूप से बंद की जा सकती है।</li>
            <li>यदि शुल्क का भुगतान पहले ही किया जा चुका है तो कृपया इस पत्र को अनदेखा करें।</li>
            <li>यह कम्प्यूटर द्वारा निर्मित शुल्क माँग पत्र है, अतः हस्ताक्षर की आवश्यकता नहीं है।</li>
          </ul>
        </div>
        <div class="footer">
          <div>दिनांक : ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}</div>
          <div><strong>Kautix</strong> | School Management OS</div>
        </div>
      </div>
      </div>
    `;
  } else if (lang === 'bilingual') {
    return `
      <div class="due-slip-print">
      <style>
      .due-slip-print, .due-slip-print *{ margin:0; padding:0; box-sizing:border-box; font-family:'Times New Roman', 'Noto Sans Devanagari', serif; }
      .sheet{ width:200mm; min-height:287mm; background:#fff; margin:5mm auto; border:1px solid #334155; padding:14mm; }
      .header{ display:flex; align-items:center; border-bottom:1px solid #334155; padding:0 0 10px; }
      .school{ flex:1; text-align:center; }
      .school h1{ font-size:26px; font-weight:700; letter-spacing:1px; color:#111827; }
      .school p{ font-size:13px; margin-top:4px; color:#475569; }
      .title{ margin:18px 0; text-align:center; }
      .title h2{ font-size:24px; border:2px solid #000; display:inline-flex; align-items:center; justify-content:center; padding:14px 34px; line-height:1.2; }
      .info{ width:100%; border-collapse:collapse; margin-top:20px; }
      .info td{ padding:9px; border:1px solid #000; font-size:16px; }
      .info td:first-child{ width:28%; font-weight:600; }
      .fees{ width:100%; border-collapse:collapse; margin-top:25px; }
      .fees th{ border:1px solid #000; padding:10px; font-size:17px; background:#f9f9f9;}
      .fees td{ border:1px solid #000; padding:10px; font-size:16px; }
      .fees td:last-child{ text-align:right; }
      .total{ font-weight:bold; font-size:18px; }
      .notice{ margin-top:35px; }
      .notice h3{ font-size:19px; margin-bottom:10px; text-decoration:underline; }
      .notice ul{ padding-left:22px; }
      .notice li{ margin-bottom:10px; line-height:1.6; }
      .footer{ margin-top:50px; border-top:1px solid #000; padding-top:10px; display:flex; justify-content:space-between; font-size:14px; }
      .sign{ margin-top:60px; display:flex; justify-content:space-between; text-align:center; }
      .line{ width:220px; border-top:1px solid #000; padding-top:5px; font-size:12px; font-weight:bold; }
      </style>
      <div class="sheet">
        <div class="header">
          <div class="school">
            <h1 style="font-size: 26px; font-weight: 700; margin: 0; color: #000;">${data.schoolName}</h1>
            <p style="font-size: 13px; margin: 5px 0 0 0; color: #333;">${data.schoolAddress || ''}</p>
            ${(data.schoolPhone || data.schoolEmail) ? `<p style="font-size: 13px; margin: 3px 0 0 0; color: #333;">Phone : ${data.schoolPhone || 'N/A'} | Email : ${data.schoolEmail || 'N/A'}</p>` : ''}
          </div>
        </div>
        <div class="title">
          <h2>विवरण पत्र / FEE DEMAND SLIP</h2>
          <p style="margin-top:10px; font-size:15px; font-weight:600;">माह / Month : ${data.dueMonth || ''}</p>
        </div>
        <table class="info">
          <tr><td>नाम / Student Name</td><td>${data.studentName}</td></tr>
          <tr><td>प्रवेश संख्या / Admission No.</td><td>${data.admissionNumber}</td></tr>
          <tr><td>अनु. क्रमांक / Roll No.</td><td>${data.rollNumber || '—'}</td></tr>
          <tr><td>कक्षा / Class</td><td>${data.className}</td></tr>
          <tr><td>खंड / Section</td><td>${data.sectionName}</td></tr>
          <tr><td>पिता का नाम / Father's Name</td><td>${data.parentName || '—'}</td></tr>
          <tr><td>पता / Address</td><td>${data.address || '—'}</td></tr>
        </table>
        <table class="fees">
          <tr><th>विवरण / Fee Particular</th><th style="text-align:right;">राशि / Amount (₹)</th></tr>
          ${data.feeItems.map(item => `
          <tr>
            <td>${item.title}</td>
            <td>${Number(item.amount).toFixed(2)}</td>
          </tr>
          `).join('')}
          <tr class="total">
            <td>कुल देय राशि / TOTAL DUE AMOUNT</td>
            <td>₹ ${Number(data.totalDue).toFixed(2)}</td>
          </tr>
        </table>
        <div class="notice">
          <h3>महत्वपूर्ण निर्देश / Important Instructions</h3>
          <ul>
            <li>कृपया शुल्क का भुगतान देय तिथि से पूर्व करें। / Please pay the fee on or before the due date.</li>
            <li>देरी से भुगतान करने पर नियमानुसार विलंब शुल्क देय होगा। / Late payment may attract additional charges.</li>
            <li>यदि भुगतान पहले ही किया जा चुका है तो अनदेखा करें। / If payment has been made, kindly ignore this slip.</li>
            <li>यह कम्प्यूटर जनित दस्तावेज़ है, हस्ताक्षर आवश्यक नहीं है। / Computer-generated document. No signature required.</li>
          </ul>
        </div>
        <div class="sign">
          <div>
            <div class="line"></div>
            Parent's Signature
          </div>
          <div>
            <div class="line"></div>
            Accounts Department
          </div>
        </div>
        <div class="footer">
          <div>दिनांक / Date : ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}</div>
          <div><strong>kautix.in</strong> | School Management OS</div>
        </div>
      </div>
      </div>
    `;
  } else {
    return `
      <div class="due-slip-print">
      <style>
      .due-slip-print, .due-slip-print *{ margin:0; padding:0; box-sizing:border-box; font-family:'Times New Roman', serif; }
      .sheet{ width:200mm; min-height:287mm; background:#fff; margin:5mm auto; border:1px solid #334155; padding:14mm; }
      .header{ display:flex; align-items:center; border-bottom:1px solid #334155; padding:0 0 10px; }
      .school{ flex:1; text-align:center; }
      .school h1{ font-size:26px; font-weight:700; letter-spacing:1px; color:#111827; }
      .school p{ font-size:13px; margin-top:4px; color:#475569; }
      .title{ margin:18px 0; text-align:center; }
      .title h2{ font-size:24px; border:2px solid #000; display:inline-flex; align-items:center; justify-content:center; padding:14px 34px; line-height:1.2; }
      .info{ width:100%; border-collapse:collapse; margin-top:20px; }
      .info td{ padding:9px; border:1px solid #000; font-size:16px; }
      .info td:first-child{ width:28%; font-weight:600; }
      .fees{ width:100%; border-collapse:collapse; margin-top:25px; }
      .fees th{ border:1px solid #000; padding:10px; font-size:17px; background:#f9f9f9;}
      .fees td{ border:1px solid #000; padding:10px; font-size:16px; }
      .fees td:last-child{ text-align:right; }
      .total{ font-weight:bold; font-size:18px; }
      .notice{ margin-top:35px; }
      .notice h3{ font-size:19px; margin-bottom:10px; text-decoration:underline; }
      .notice ul{ padding-left:22px; }
      .notice li{ margin-bottom:10px; line-height:1.6; }
      .footer{ margin-top:50px; border-top:1px solid #000; padding-top:10px; display:flex; justify-content:space-between; font-size:14px; }
      .sign{ margin-top:60px; display:flex; justify-content:space-between; text-align:center; }
      .line{ width:220px; border-top:1px solid #000; padding-top:5px; font-size:12px; font-weight:bold; }
      </style>
      <div class="sheet">
        <div class="header">
          <div class="school">
            <h1>${data.schoolName}</h1>
            <p>${data.schoolAddress || ''}</p>
            ${(data.schoolPhone || data.schoolEmail) ? `<p>Phone : ${data.schoolPhone || 'N/A'} | Email : ${data.schoolEmail || 'N/A'}</p>` : ''}
            ${data.schoolWebsite ? `<p>Website : ${data.schoolWebsite}</p>` : ''}
          </div>
        </div>
        <div class="title">
          <h2>FEE DEMAND SLIP</h2>
          <p style="margin-top:10px; font-size:15px; font-weight:600;">Month : ${data.dueMonth || ''}</p>
        </div>
        <table class="info">
          <tr><td>Student Name</td><td>${data.studentName}</td></tr>
          <tr><td>Admission No.</td><td>${data.admissionNumber}</td></tr>
          <tr><td>Roll No.</td><td>${data.rollNumber || '—'}</td></tr>
          <tr><td>Class</td><td>${data.className}</td></tr>
          <tr><td>Section</td><td>${data.sectionName}</td></tr>
          <tr><td>Father's Name</td><td>${data.parentName || '—'}</td></tr>
          <tr><td>Address</td><td>${data.address || '—'}</td></tr>
        </table>
        <table class="fees">
          <tr><th>Fee Particular</th><th style="text-align:right;">Amount (₹)</th></tr>
          ${data.feeItems.map(item => `
          <tr>
            <td>${item.title}</td>
            <td>${Number(item.amount).toFixed(2)}</td>
          </tr>
          `).join('')}
          <tr class="total">
            <td>TOTAL DUE AMOUNT</td>
            <td>₹ ${Number(data.totalDue).toFixed(2)}</td>
          </tr>
        </table>
        <div class="notice">
          <h3>Important Instructions</h3>
          <ul>
            <li>Please pay the fee on or before the due date.</li>
            <li>Late payment may attract additional charges as per school rules.</li>
            <li>If payment has already been made, kindly ignore this demand slip.</li>
            <li>Please preserve this slip until the payment is verified.</li>
            <li>This is a computer-generated document and does not require a signature.</li>
          </ul>
        </div>
        <div class="sign">
          <div>
            <div class="line"></div>
          Parents/Guardian

          </div>
          <div>
            <div class="line"></div>
            Accounts Department
          </div>
        </div>
        <div class="footer">
          <div>Generated On : ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div><strong>Kautix</strong> | School Management OS</div>
        </div>
      </div>
      </div>
    `;
  }
};

// Type shared by all due-slip generators
export type DueSlipData = {
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  studentName: string;
  admissionNumber: string;
  rollNumber?: string;
  className: string;
  sectionName: string;
  parentName?: string;
  address?: string;
  dueMonth?: string;
  totalDue: number;
  dueDate: string;
  feeItems: { title: string; amount: number }[];
  language?: 'hindi' | 'english' | 'bilingual';
};

// Render a single due slip to a JPEG data-URL at A4 size.
// Non-throwing: returns null if rendering fails so callers can
// skip a bad student and continue instead of aborting the whole batch.
const renderDueSlipToDataUrl = async (data: DueSlipData): Promise<string | null> => {
  // Use a separate document so the application's Tailwind styles never enter the print renderer.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;pointer-events:none;';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"></head><body style="margin:0;background:#ffffff">${generateDueSlipHtml(data)}</body></html>`;
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('Unable to prepare the due-slip template'));
    });
    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) throw new Error('Unable to prepare the due-slip template');
    await printDocument.fonts?.ready;

    // Wait an extra moment to ensure the logo image has loaded before capturing
    await new Promise(r => setTimeout(r, 500));

    const target = printDocument.querySelector('.due-slip-print') as HTMLElement | null;
    if (!target) throw new Error('Unable to prepare the due-slip template');
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: printWindow.innerWidth,
      windowHeight: printWindow.innerHeight,
    });
    return canvas.toDataURL('image/jpeg', 0.96);
  } finally {
    frame.remove();
  }
};

// Place one slip image onto the current page of a jsPDF document, centered.
const placeSlipImageOnPdfPage = (doc: jsPDF, image: string) => {
  const pageWidth = 210;
  const pageHeight = 297;
  const printableWidth = 190;
  const printableHeight = 277;
  const img = new Image();
  // We always produce from a 794x1123 canvas ratio, but compute defensively.
  img.src = image;
  const naturalW = img.width || 794;
  const naturalH = img.height || 1123;
  const scale = Math.min(printableWidth / naturalW, printableHeight / naturalH);
  const imageWidth = naturalW * scale;
  const imageHeight = naturalH * scale;
  doc.addImage(image, 'JPEG', (pageWidth - imageWidth) / 2, (pageHeight - imageHeight) / 2, imageWidth, imageHeight);
};

export const generateDueSlipBlob = async (data: DueSlipData): Promise<Blob> => {
  const image = await renderDueSlipToDataUrl(data);
  if (!image) throw new Error('Unable to prepare the due-slip template');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  placeSlipImageOnPdfPage(doc, image);
  return doc.output('blob') as Blob;
};

// Convert any Blob into a base64 data URI (used to embed PDFs inside .doc).
const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read generated document'));
    reader.readAsDataURL(blob);
  });

// ── Merged due slips ─────────────────────────────────────────────
// "Merge" = ONE file where every student gets their OWN full page.
// 50 students → 50 pages. Failures are skipped, not fatal.
export const generateMergedDueSlipsPdf = async (data: Array<DueSlipData>, onProgress?: (done: number, total: number, name: string) => void): Promise<Blob> => {
  if (!data || data.length === 0) throw new Error('No due slips to merge');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let first = true;
  let failures = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    onProgress?.(i, data.length, item.studentName || `student_${i + 1}`);
    try {
      const image = await renderDueSlipToDataUrl(item);
      if (!image) { failures++; continue; }
      if (!first) doc.addPage();
      first = false;
      placeSlipImageOnPdfPage(doc, image);
    } catch (e) {
      console.error(`[MERGE-PDF] Skipping failed slip for ${item.studentName}`, e);
      failures++;
    }
  }

  if (first) throw new Error('All due slips failed to render');
  const blob = doc.output('blob') as Blob;
  return Object.assign(blob, { _kautixSkipped: failures }) as Blob & { _kautixSkipped?: number };
};

// Generate a single merged .docx containing full-page slips for every student.
// Uses the `docx` library so Word and Google Docs both open it reliably.
// Non-throwing row-wise rendering: failed slips are skipped, not fatal.
export const generateMergedDueSlipsDoc = async (data: Array<DueSlipData>): Promise<Blob> => {
  if (!data || data.length === 0) throw new Error('No due slips to merge');

  const trim = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  const children: any[] = [];

  data.forEach((item, index) => {
    const schoolLine2 = [trim(item.schoolAddress), trim(item.schoolPhone), trim(item.schoolEmail), trim(item.schoolWebsite)].filter(Boolean).join(' | ');
    const feeRows = item.feeItems.map((f) =>
      new TableRow({
        children: [
          docxCell(f.title, { width: 8500 }),
          docxCell(`₹${Number(f.amount || 0).toLocaleString('en-IN')}`, { width: 2000 }),
        ],
      })
    );

    children.push(
      docxText(trim(item.schoolName), { bold: true, size: 16, align: 'center' }),
      ...(schoolLine2 ? [docxText(schoolLine2, { size: 10, align: 'center' })] : []),
      docxText('FEE DEMAND SLIP', { bold: true, size: 14, align: 'center' }),
      docxText(`Month : ${trim(item.dueMonth)}`, { bold: true, size: 11, align: 'center' }),
      docxText(`Student Name: ${trim(item.studentName)}`, { size: 11 }),
      docxText(`Admission No.: ${trim(item.admissionNumber)}`, { size: 11 }),
      docxText(`Roll No.: ${trim(item.rollNumber) || '—'}`, { size: 11 }),
      docxText(`Class: ${trim(item.className)}`, { size: 11 }),
      docxText(`Section: ${trim(item.sectionName)}`, { size: 11 }),
      docxText(`Father's Name: ${trim(item.parentName) || '—'}`, { size: 11 }),
      docxText(`Address: ${trim(item.address) || '—'}`, { size: 11 }),
      docxText('Fee Particulars:', { bold: true, size: 11 }),
      new Table({
        width: { size: 10500, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              docxCell('Fee Particular', { bold: true, width: 8500 }),
              docxCell('Amount (₹)', { bold: true, width: 2000 }),
            ],
          }),
          ...feeRows,
          new TableRow({
            children: [
              docxCell('TOTAL DUE AMOUNT', { bold: true, width: 8500 }),
              docxCell(`₹${Number(item.totalDue || 0).toLocaleString('en-IN')}`, { bold: true, width: 2000 }),
            ],
          }),
        ],
      }),
      docxText('Important Instructions:', { bold: true, size: 11 }),
      docxText('Please pay the fee on or before the due date.', { size: 10 }),
      docxText('Late payment may attract additional charges as per school rules.', { size: 10 }),
      docxText('If payment has already been made, kindly ignore this demand slip.', { size: 10 }),
      docxText('This is a computer-generated document and does not require a signature.', { size: 10 }),
      docxText(`Generated On : ${today}`, { size: 10, align: 'right' }),
      ...(index < data.length - 1 ? [new Paragraph({ children: [new PageBreak()] })] : []),
    );
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
};

// ── DOCX generation using the `docx` library ─────────────────────
// The `docx` library produces spec-compliant OOXML packages that Word,
// LibreOffice, and Google Docs all open reliably. No hand-built XML.

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const cellBorders = { top: border, bottom: border, left: border, right: border };

const docxText = (text: string, opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right' } = {}) =>
  new Paragraph({
    alignment: opts.align === 'center' ? AlignmentType.CENTER : opts.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
    children: [new TextRun({ text, bold: opts.bold, size: (opts.size || 11) * 2 })],
  });

const docxCell = (text: string, opts: { bold?: boolean; width?: number } = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: cellBorders,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })],
  });

// Build a real .docx due slip that opens in Word and Google Docs.
export const generateDueSlipDocBlob = async (data: {
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  studentName: string;
  admissionNumber: string;
  rollNumber?: string;
  className: string;
  sectionName: string;
  parentName?: string;
  address?: string;
  dueMonth?: string;
  totalDue: number;
  dueDate: string;
  feeItems: { title: string; amount: number }[];
  language?: 'hindi' | 'english' | 'bilingual';
}): Promise<Blob> => {
  const schoolLine2 = [data.schoolAddress, data.schoolPhone, data.schoolEmail, data.schoolWebsite].filter(Boolean).join(' | ');
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  const feeRows = data.feeItems.map((item) =>
    new TableRow({
      children: [
        docxCell(item.title, { width: 8500 }),
        docxCell(`₹${Number(item.amount || 0).toLocaleString('en-IN')}`, { width: 2000 }),
      ],
    })
  );

  const children: any[] = [
    docxText(data.schoolName || 'School', { bold: true, size: 16, align: 'center' }),
    ...(schoolLine2 ? [docxText(schoolLine2, { size: 10, align: 'center' })] : []),
    docxText('FEE DEMAND SLIP', { bold: true, size: 14, align: 'center' }),
    docxText(`Month : ${data.dueMonth || ''}`, { bold: true, size: 11, align: 'center' }),
    docxText(`Student Name: ${data.studentName}`, { size: 11 }),
    docxText(`Admission No.: ${data.admissionNumber}`, { size: 11 }),
    docxText(`Roll No.: ${data.rollNumber || '—'}`, { size: 11 }),
    docxText(`Class: ${data.className}`, { size: 11 }),
    docxText(`Section: ${data.sectionName}`, { size: 11 }),
    docxText(`Father's Name: ${data.parentName || '—'}`, { size: 11 }),
    docxText(`Address: ${data.address || '—'}`, { size: 11 }),
    docxText('Fee Particulars:', { bold: true, size: 11 }),
    new Table({
      width: { size: 10500, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            docxCell('Fee Particular', { bold: true, width: 8500 }),
            docxCell('Amount (₹)', { bold: true, width: 2000 }),
          ],
        }),
        ...feeRows,
        new TableRow({
          children: [
            docxCell('TOTAL DUE AMOUNT', { bold: true, width: 8500 }),
            docxCell(`₹${Number(data.totalDue || 0).toLocaleString('en-IN')}`, { bold: true, width: 2000 }),
          ],
        }),
      ],
    }),
    docxText('Important Instructions:', { bold: true, size: 11 }),
    docxText('Please pay the fee on or before the due date.', { size: 10 }),
    docxText('Late payment may attract additional charges as per school rules.', { size: 10 }),
    docxText('If payment has already been made, kindly ignore this demand slip.', { size: 10 }),
    docxText('This is a computer-generated document and does not require a signature.', { size: 10 }),
    docxText(`Generated On : ${today}`, { size: 10, align: 'right' }),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[char] as string));

export const generateCombinedFeeReportPdf = async (data: {
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  title: string;
  items: Array<{
    studentName: string;
    admissionNumber?: string;
    className?: string;
    sectionName?: string;
    parentName?: string;
    address?: string;
    totalDue: number;
    feeItems: Array<{ title: string; amount: number }>;
  }>;
}): Promise<Blob> => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(data.schoolName, margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const addressLine = [data.schoolAddress, data.schoolPhone, data.schoolEmail, data.schoolWebsite].filter(Boolean).join(' | ');
  if (addressLine) {
    const wrapped = doc.splitTextToSize(addressLine, pageWidth - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(data.title, margin, y);
  y += 18;

  data.items.forEach((item, index) => {
    if (y > pageHeight - 140) {
      doc.addPage();
      y = 50;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${item.studentName}`, margin, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const meta = [`Admission: ${item.admissionNumber || 'N/A'}`, `Class: ${item.className || 'N/A'}`, `Section: ${item.sectionName || 'N/A'}`, `Father: ${item.parentName || 'N/A'}`].join(' | ');
    const wrappedMeta = doc.splitTextToSize(meta, pageWidth - margin * 2);
    doc.text(wrappedMeta, margin, y);
    y += wrappedMeta.length * 12;

    if (item.feeItems.length > 0) {
      let total = 0;
      item.feeItems.forEach((fee) => {
        total += Number(fee.amount) || 0;
        if (y > pageHeight - 100) {
          doc.addPage();
          y = 50;
        }
        const line = `${fee.title} — ₹${Number(fee.amount || 0).toLocaleString('en-IN')}`;
        doc.text(line, margin + 10, y);
        y += 12;
      });
      if (y > pageHeight - 80) {
        doc.addPage();
        y = 50;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Due: ₹${Number(item.totalDue || total).toLocaleString('en-IN')}`, margin + 10, y);
      y += 18;
    } else {
      y += 10;
    }

    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  });

  return doc.output('blob') as Blob;
};

// Build a proper .docx combined fee report using the `docx` library.
// This produces a real DOCX (OOXML) that Word, LibreOffice, and Google Docs
// all open reliably — unlike the previous version which emitted HTML.
export const generateCombinedFeeReportDoc = async (data: {
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  title: string;
  items: Array<{
    studentName: string;
    admissionNumber?: string;
    className?: string;
    sectionName?: string;
    parentName?: string;
    address?: string;
    totalDue: number;
    feeItems: Array<{ title: string; amount: number }>;
  }>;
  language?: 'hindi' | 'english' | 'bilingual';
}): Promise<Blob> => {
  const lang = data.language || 'english';
  const labels = lang === 'hindi'
    ? {
      heading: 'शुल्क माँग पत्र',
      studentName: 'नाम',
      admission: 'प्रवेश संख्या',
      classLabel: 'कक्षा',
      sectionLabel: 'खंड',
      father: 'पिता का नाम',
      address: 'पता',
      feeParticular: 'शुल्क विवरण',
      amount: 'राशि (₹)',
      total: 'कुल देय राशि',
      instructions: 'कृपया ध्यान दें',
      note1: 'कृपया शुल्क का भुगतान प्रत्येक माह की 09 तारीख से पूर्व करें।',
      note2: 'दो माह से अधिक शुल्क बकाया रहने पर वाहन सुविधा अस्थायी रूप से बंद की जा सकती है।',
      note3: 'यदि शुल्क का भुगतान पहले ही किया जा चुका है तो कृपया इस पत्र को अनदेखा करें।',
      note4: 'यह कम्प्यूटर द्वारा निर्मित शुल्क माँग पत्र है, अतः हस्ताक्षर की आवश्यकता नहीं है।',
      footer: 'दिनांक',
    }
    : lang === 'bilingual'
      ? {
        heading: 'विवरण पत्र / FEE DEMAND SLIP',
        studentName: 'नाम / Student Name',
        admission: 'प्रवेश संख्या / Admission No.',
        classLabel: 'कक्षा / Class',
        sectionLabel: 'खंड / Section',
        father: 'पिता का नाम / Father\'s Name',
        address: 'पता / Address',
        feeParticular: 'विवरण / Fee Particular',
        amount: 'राशि / Amount (₹)',
        total: 'कुल देय राशि / TOTAL DUE AMOUNT',
        instructions: 'महत्वपूर्ण निर्देश / Important Instructions',
        note1: 'कृपया शुल्क का भुगतान देय तिथि से पूर्व करें। / Please pay the fee on or before the due date.',
        note2: 'देरी से भुगतान करने पर नियमानुसार विलंब शुल्क देय होगा। / Late payment may attract additional charges.',
        note3: 'यदि भुगतान पहले ही किया जा चुका है तो अनदेखा करें। / If payment has been made, kindly ignore this slip.',
        note4: 'यह कम्प्यूटर जनित दस्तावेज़ है, हस्ताक्षर आवश्यक नहीं है। / Computer-generated document. No signature required.',
        footer: 'दिनांक / Date',
      }
      : {
        heading: 'FEE DEMAND SLIP',
        studentName: 'Student Name',
        admission: 'Admission No.',
        classLabel: 'Class',
        sectionLabel: 'Section',
        father: 'Father\'s Name',
        address: 'Address',
        feeParticular: 'Fee Particular',
        amount: 'Amount (₹)',
        total: 'TOTAL DUE AMOUNT',
        instructions: 'Important Instructions',
        note1: 'Please pay the fee on or before the due date.',
        note2: 'Late payment may attract additional charges as per school rules.',
        note3: 'If payment has already been made, kindly ignore this demand slip.',
        note4: 'This is a computer-generated document and does not require a signature.',
        footer: 'Generated On',
      };

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const trim = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const children: any[] = [];

  data.items.forEach((item, index) => {
    const feeRows = item.feeItems.map((f) =>
      new TableRow({
        children: [
          docxCell(trim(f.title), { width: 8500 }),
          docxCell(`₹${Number(f.amount || 0).toLocaleString('en-IN')}`, { width: 2000 }),
        ],
      })
    );

    const schoolLine2 = [data.schoolAddress, data.schoolPhone, data.schoolEmail, data.schoolWebsite].filter(Boolean).join(' | ');

    children.push(
      docxText(trim(data.schoolName), { bold: true, size: 16, align: 'center' }),
      ...(schoolLine2 ? [docxText(schoolLine2, { size: 10, align: 'center' })] : []),
      docxText(trim(labels.heading), { bold: true, size: 14, align: 'center' }),
      (index === 0 ? docxText(trim(data.title), { bold: true, size: 11, align: 'center' }) : docxText('', { size: 2 })),
      docxText(`${trim(labels.studentName)}: ${trim(item.studentName)}`, { size: 11 }),
      docxText(`${trim(labels.admission)}: ${trim(item.admissionNumber) || 'N/A'}`, { size: 11 }),
      docxText(`${trim(labels.classLabel)}: ${trim(item.className) || 'N/A'}`, { size: 11 }),
      docxText(`${trim(labels.sectionLabel)}: ${trim(item.sectionName) || 'N/A'}`, { size: 11 }),
      docxText(`${trim(labels.father)}: ${trim(item.parentName) || '—'}`, { size: 11 }),
      docxText(`${trim(labels.address)}: ${trim(item.address) || '—'}`, { size: 11 }),
      docxText(`${trim(labels.feeParticular)}:`, { bold: true, size: 11 }),
      new Table({
        width: { size: 10500, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              docxCell(trim(labels.feeParticular), { bold: true, width: 8500 }),
              docxCell(trim(labels.amount), { bold: true, width: 2000 }),
            ],
          }),
          ...feeRows,
          new TableRow({
            children: [
              docxCell(trim(labels.total), { bold: true, width: 8500 }),
              docxCell(`₹${Number(item.totalDue || 0).toLocaleString('en-IN')}`, { bold: true, width: 2000 }),
            ],
          }),
        ],
      }),
      docxText(`${trim(labels.instructions)}:`, { bold: true, size: 11 }),
      docxText(trim(labels.note1), { size: 10 }),
      docxText(trim(labels.note2), { size: 10 }),
      docxText(trim(labels.note3), { size: 10 }),
      docxText(trim(labels.note4), { size: 10 }),
      docxText(`${trim(labels.footer)} : ${today}`, { size: 10, align: 'right' }),
      ...(index < data.items.length - 1 ? [new Paragraph({ children: [new PageBreak()] })] : []),
    );
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
};

export const generateProfessionalReceipt = async (data: {
  schoolName: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  receiptNumber: string;
  date: string;
  studentName: string;
  parentName?: string;
  admissionNumber: string;
  rollNumber?: string;
  classSection: string;
  feeTitle?: string;
  amount?: number;
  balanceRemaining?: number;
  grandTotalDue?: number;
  grandTotalPaid?: number;
  grandBalance?: number;
  items?: { title: string; dueAmount: number; paidAmount: number; balance: number; status?: string }[];
  globalBalance?: number;
  paymentMethod: string;
  transactionId: string;
}) => {
  try {
    const pMethod = formatPaymentMethod(data.paymentMethod);
    const amount = Number(data.amount) || 0;
    const text = (value: unknown, fallback = 'N/A') => String(value || fallback).replace(/[\r\n]+/g, ' ').trim();

    // Compute totals from items if available (used only for the breakdown table rows)
    const hasItems = data.items && data.items.length > 0;
    // Summary box: prefer explicitly passed grand totals (all fees), else fall back to item totals
    const totalDue    = data.grandTotalDue  ?? (hasItems ? data.items!.reduce((s, i) => s + Number(i.dueAmount), 0)  : (amount + (Number(data.balanceRemaining) || 0)));
    const totalPaid   = data.grandTotalPaid ?? (hasItems ? data.items!.reduce((s, i) => s + Number(i.paidAmount), 0) : amount);
    const totalBalance = data.grandBalance  ?? (hasItems ? data.items!.reduce((s, i) => s + Number(i.balance), 0)   : (Number(data.balanceRemaining) || 0));

    const fmt = (n: number) => '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const html = `
      <div>
      <style>
      *{ margin:0; padding:0; box-sizing:border-box; font-family:'Times New Roman', serif; }
      .sheet{ width:210mm; min-height:297mm; background:#fff; margin:auto; border:2px solid #000; padding:14mm 16mm; position:relative; overflow:hidden;}
      /* header */
      .hdr{ text-align:center; border-bottom:3px double #000; padding-bottom:10px; margin-bottom:10px; }
      .hdr h1{ font-size:22px; font-weight:700; margin:0; }
      .hdr p{ font-size:11px; color:#333; margin-top:3px; }
      /* title row */
      .title-row{ display:flex; justify-content:space-between; align-items:center; margin:10px 0; }
      .title-row h2{ font-size:20px; border:2px solid #000; padding:8px 32px; margin:0; line-height:1.2; text-align:center; text-transform:uppercase; letter-spacing:1px; display:inline-block; }
      .title-row .meta{ font-size:12px; text-align:right; line-height:1.7; }
      /* student info */
      .info{ width:100%; border-collapse:collapse; margin:10px 0; }
      .info td{ padding:6px 9px; border:1px solid #000; font-size:13px; }
      .info td:first-child{ width:30%; font-weight:600; background:#f5f5f5; }
      /* summary box */
      .summary-box{ border:2px solid #000; border-radius:4px; padding:12px 16px; margin:14px 0 10px; display:flex; justify-content:space-around; align-items:center; background:#f9f9f9; text-align:center; }
      .summary-box > div{ display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; }
      .summary-box .lbl{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#555; margin-bottom:4px; }
      .summary-box .val{ font-size:20px; font-weight:900; color:#000; }
      /* fee breakdown table */
      .section-title{ font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#333; margin:14px 0 4px; border-bottom:1px solid #ccc; padding-bottom:3px; }
      .fees{ width:100%; border-collapse:collapse; }
      .fees th{ border:1px solid #000; padding:8px 10px; font-size:12px; background:#f0f0f0; text-align:center; }
      .fees th:first-child{ text-align:left; }
      .fees td{ border:1px solid #ddd; padding:7px 10px; font-size:12px; }
      .fees td.num{ text-align:right; }
      .fees tr.paid-row td{ background:#fff; }
      .fees tr.unpaid-row td{ background:#fff; }
      .fees tr.partial-row td{ background:#fff; }
      .fees .status-badge{ display:inline-block; font-size:9px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:3px; border:1px solid #000; }
      .fees .s-paid{ background:#fff; color:#000; }
      .fees .s-partial{ background:#fff; color:#000; }
      .fees .s-unpaid{ background:#fff; color:#000; }
      /* totals footer */
      .totals{ width:100%; border-collapse:collapse; margin-top:4px; }
      .totals td{ border:1px solid #000; padding:8px 10px; font-size:13px; font-weight:700; }
      .totals td.lbl{ background:#f0f0f0; width:60%; }
      .totals td.val{ text-align:right; }
      .totals tr.grand td{ background:#000; color:#fff; font-size:14px; }
      /* watermark */
      .watermark{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg);
        font-size:90px; font-weight:900; color:rgba(0,0,0,.06); pointer-events:none; z-index:0; white-space:nowrap; }
      /* sign */
      .sign{ margin-top:30px; display:flex; justify-content:space-between; text-align:center; }
      .line{ width:200px; border-top:1px solid #000; padding-top:4px; font-size:11px; font-weight:700; }
      /* footer */
      .footer{ margin-top:18px; border-top:1px solid #ccc; padding-top:8px; display:flex; justify-content:space-between; font-size:11px; color:#666; }
      </style>
      <div class="sheet due-slip-print">
        <div class="watermark">RECEIPT</div>

        <!-- SCHOOL HEADER -->
        <div class="hdr">
          <h1>${text(data.schoolName)}</h1>
          <p>${text(data.schoolAddress)}</p>
          ${(data.schoolPhone || data.schoolEmail) ? `<p>Ph: ${data.schoolPhone || ''} &nbsp;|&nbsp; ${data.schoolEmail || ''}</p>` : ''}
        </div>

        <!-- TITLE + RECEIPT META -->
        <div class="title-row">
          <h2>FEE RECEIPT</h2>
          <div class="meta">
            <strong>Receipt No.:</strong> ${text(data.receiptNumber)}<br>
            <strong>Date:</strong> ${text(data.date)}<br>
            <strong>Mode:</strong> ${text(pMethod)}
          </div>
        </div>

        <!-- STUDENT INFO -->
        <table class="info">
          <tr><td>Student Name</td><td>${text(data.studentName)}</td><td>Admission No.</td><td>${text(data.admissionNumber)}</td></tr>
          <tr><td>Parent / Guardian</td><td>${text(data.parentName || 'N/A')}</td><td>Roll No.</td><td>${text(data.rollNumber)}</td></tr>
          <tr><td>Class / Section</td><td>${text(data.classSection)}</td><td>Transaction ID</td><td>${text(data.transactionId)}</td></tr>
        </table>

        <!-- TOTAL FEE DUE SUMMARY BOX -->
        <div class="summary-box">
          <div>
            <div class="lbl">Total Fee Due (All Fees)</div>
            <div class="val">${fmt(totalDue)}</div>
          </div>
          <div>
            <div class="lbl">Amount Paid (This Receipt)</div>
            <div class="val">${fmt(amount)}</div>
          </div>
          <div>
            <div class="lbl">Total Outstanding</div>
            <div class="val">${fmt(totalBalance)}</div>
          </div>
        </div>

        <!-- FEE BREAKDOWN TABLE -->
        <div class="section-title">Fee Breakdown — All Fees</div>
        <table class="fees">
          <tr>
            <th>Description</th>
            <th style="text-align:right;">Total Due (₹)</th>
            <th style="text-align:right;">Prev. Paid (₹)</th>
            <th style="text-align:right;">Paid (This Receipt) (₹)</th>
            <th style="text-align:right;">Balance (₹)</th>
            <th style="text-align:center;">Status</th>
          </tr>
          ${hasItems ? data.items!.map(item => {
            const due = Number(item.dueAmount); 
            const paidThis = Number(item.paidAmount);
            const bal = Number(item.balance);
            const prevPaid = Math.max(0, due - paidThis - bal);
            const isPaid = bal <= 0;
            const isPartial = paidThis > 0 && bal > 0;
            const rowClass = isPaid ? 'paid-row' : (isPartial ? 'partial-row' : 'unpaid-row');
            const badgeClass = isPaid ? 's-paid' : (isPartial ? 's-partial' : 's-unpaid');
            const statusLabel = isPaid ? 'Paid' : (isPartial ? 'Partial' : 'Unpaid');
            return `<tr class="${rowClass}">
              <td>${text(item.title)}</td>
              <td class="num">${due.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              <td class="num">${prevPaid.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              <td class="num">${paidThis.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              <td class="num">${bal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              <td style="text-align:center;"><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
            </tr>`;
          }).join('') : (() => {
            const prevPaid = Math.max(0, totalDue - amount - totalBalance);
            return `<tr><td>${text(data.feeTitle)}</td>
              <td class="num">${fmt(totalDue)}</td>
              <td class="num">${fmt(prevPaid)}</td>
              <td class="num">${fmt(amount)}</td>
              <td class="num">${fmt(totalBalance)}</td>
              <td style="text-align:center;"><span class="status-badge ${totalBalance <= 0 ? 's-paid' : (amount > 0 ? 's-partial' : 's-unpaid')}">${totalBalance <= 0 ? 'Paid' : (amount > 0 ? 'Partial' : 'Unpaid')}</span></td>
            </tr>`;
          })()}

        </table>

        <!-- GRAND TOTALS -->
        <div class="section-title" style="margin-top:10px;">Summary</div>
        <table class="totals">
          <tr><td class="lbl">Total Dues (Before Payment)</td><td class="val">${fmt(totalBalance + amount)}</td></tr>
          <tr><td class="lbl">Amount Paid (This Receipt)</td><td class="val">${fmt(amount)}</td></tr>
          <tr class="grand"><td class="lbl">Total Outstanding Balance</td><td class="val">${fmt(totalBalance)}</td></tr>
        </table>

        <!-- SIGNATURES -->
        <div class="sign">
          <div><div class="line">Parent / Guardian Signature</div></div>
          <div><div class="line">Authorized Signatory</div></div>
        </div>

        <!-- FOOTER -->
        <div class="footer">
          <div>Generated: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g,'-')}</div>
          <div><strong>Kautix</strong> | School Management OS</div>
        </div>
      </div>
      </div>
    `;

    // Same logic as generateDueSlipBlob

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;pointer-events:none;';
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"></head><body style="margin:0;background:#ffffff">${html}</body></html>`;
    document.body.appendChild(frame);

    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('Unable to prepare the receipt template'));
    });

    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) throw new Error('Unable to prepare the receipt template');
    await printDocument.fonts?.ready;

    // Wait an extra moment to ensure rendering
    await new Promise(r => setTimeout(r, 500));

    const target = printDocument.querySelector('.due-slip-print') as HTMLElement | null;
    if (!target) throw new Error('Unable to prepare the receipt template');

    // Using html2canvas directly as in generateDueSlipBlob
    const html2canvasLib = (window as any).html2canvas || (await import('html2canvas')).default;

    const canvas = await html2canvasLib(target, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: printWindow.innerWidth,
      windowHeight: printWindow.innerHeight,
    });

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = 210;
    const pageHeight = 297;
    const printableWidth = 190;
    const printableHeight = 277;
    const scale = Math.min(printableWidth / canvas.width, printableHeight / canvas.height);
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;
    const image = canvas.toDataURL('image/jpeg', 0.96);
    doc.addImage(image, 'JPEG', (pageWidth - imageWidth) / 2, (pageHeight - imageHeight) / 2, imageWidth, imageHeight);

    frame.remove();
    saveOrOpenPDF(doc, `Receipt_${text(data.receiptNumber, 'payment')}.pdf`);
  } catch (error: any) {
    console.error("PDF Error:", error);
    alert(`Failed to generate PDF: ${error.message}`);
  }
};

const saveOrOpenPDF = (doc: any, fileName: string) => {
  downloadBlob(doc.output('blob') as Blob, fileName);
};

export const generateAdmitCard = (data: {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  rollNumber: string;
  classSection: string;
  examName: string;
  exams: { subject: string; date: string; time: string; room: string }[];
}) => {
  const doc = new jsPDF() as any;

  // Header Box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, 190, 45);

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(data.schoolName.toUpperCase(), 105, 25, { align: 'center' });

  doc.setFontSize(14);
  doc.text(`ADMIT CARD: ${data.examName.toUpperCase()}`, 105, 35, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('ACADEMIC SESSION 2026-27', 105, 42, { align: 'center' });

  // Student Photo Placeholder
  doc.rect(165, 65, 30, 35);
  doc.setFontSize(8);
  doc.text('Affix Photo', 180, 82.5, { align: 'center' });

  // Student Details
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT DETAILS', 15, 65);

  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${data.studentName}`, 15, 75);
  doc.text(`Roll No: ${data.rollNumber}`, 15, 82);
  doc.text(`Admission No: ${data.admissionNumber}`, 15, 89);
  doc.text(`Class: ${data.classSection}`, 15, 96);

  // Exam Schedule Table
  const tableData = data.exams.map(e => [e.subject, e.date, e.time, e.room]);

  autoTable(doc, {
    startY: 110,
    head: [['Subject', 'Date', 'Time', 'Room No']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
  });

  const finalY = (doc as any).lastAutoTable.finalY;

  // Instructions
  doc.setFont('helvetica', 'bold');
  doc.text('INSTRUCTIONS FOR CANDIDATE:', 15, finalY + 20);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('1. Candidates must carry this admit card to the examination hall.', 15, finalY + 30);
  doc.text('2. Candidates should reach the venue at least 30 minutes before the start time.', 15, finalY + 35);
  doc.text('3. Use of electronic gadgets/mobile phones is strictly prohibited.', 15, finalY + 40);

  // Signatures
  doc.line(15, finalY + 70, 65, finalY + 70);
  doc.text('Parents/Guardian', 40, finalY + 75, { align: 'center' });

  doc.line(145, finalY + 70, 195, finalY + 70);
  doc.text('Principal / Controller', 170, finalY + 75, { align: 'center' });

  saveOrOpenPDF(doc, `AdmitCard_${data.studentName.replace(/\s+/g, '_')}.pdf`);
};

export const generateReportCardPDF = (data: {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  classSection: string;
  examName?: string;
  academicSession?: string;
  affiliationNo?: string;
  board?: string;
  rollNumber?: string | null;
  subjects: {
    subject: string;
    marks: number;
    total: number;
    grade: string;
    periodicMarks?: number;
    examMarks?: number;
  }[];
  overall: { percentage: number; grade: string };
  classPosition?: number | null;
  classSize?: number | null;
  coScholasticAreas?: { area: string; grade: string }[];
  attendance?: { workingDays: number; presentDays: number };
  remarks?: string | null;
}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as any;

  const session = data.academicSession || '2026-27';
  const board = data.board || 'CBSE';
  const affil = data.affiliationNo || 'XXXXXXX';

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  let y = 14;

  // ── School header ── (pure black & white)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text((data.schoolName || 'SCHOOL NAME').toUpperCase(), 105, y, { align: 'center' });
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`AFFILIATED TO ${board}, NEW DELHI`, 105, y, { align: 'center' });
  y += 5;
  doc.setFontSize(8);
  doc.text(`AFFILIATION NO: ${affil}`, 105, y, { align: 'center' });
  y += 4;
  doc.line(12, y, 198, y);
  y += 7;

  // ── Report title ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`REPORT CARD — ${session}`, 105, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.text(data.examName || 'PERIODIC EXAMINATION', 105, y, { align: 'center' });
  y += 4;
  doc.line(12, y, 198, y);
  y += 8;

  // ── STUDENT DETAILS ──
  const details: [string, string][] = [
    ['Student Name', data.studentName || '—'],
    ['Admission No.', data.admissionNumber || '—'],
    ['Class / Section', data.classSection || '—'],
    ['Roll No.', data.rollNumber != null ? String(data.rollNumber) : '—'],
    ['Academic Session', session],
  ];
  const drawRule = () => { doc.setLineWidth(0.2); doc.line(16, y, 196, y); y += 1; };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('STUDENT DETAILS', 16, y);
  y += 3;
  drawRule();
  y += 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (let i = 0; i < details.length; i += 2) {
    doc.text(`${details[i][0]} : ${details[i][1]}`, 18, y);
    if (i + 1 < details.length) doc.text(`${details[i + 1][0]} : ${details[i + 1][1]}`, 110, y);
    y += 5.5;
  }
  y += 2;
  drawRule();
  y += 6;

  // ── SCHOLASTIC AREAS ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SCHOLASTIC AREAS', 16, y);
  y += 3;
  drawRule();
  y += 2;

  const hasBreakdown = data.subjects.every(s => typeof s.periodicMarks === 'number' && typeof s.examMarks === 'number');
  const head: string[][] = hasBreakdown
    ? [['S.No', 'Subject', 'Periodic', 'Exam', 'Total', 'Grade']]
    : [['S.No', 'Subject', 'Marks Obtained', 'Max Marks', 'Grade']];
  const body: any[][] = data.subjects.map((s, i) => {
    if (hasBreakdown) {
      return [i + 1, s.subject || '—', s.periodicMarks, s.examMarks, Number(s.periodicMarks) + Number(s.examMarks), s.grade || '—'];
    }
    return [i + 1, s.subject || '—', s.marks, s.total, s.grade || '—'];
  });
  const totalObtained = hasBreakdown
    ? data.subjects.reduce((acc, s) => acc + (Number(s.periodicMarks) + Number(s.examMarks)), 0)
    : data.subjects.reduce((acc, s) => acc + Number(s.marks || 0), 0);
  const totalMax = data.subjects.reduce((acc, s) => acc + Number(s.total || 0), 0);

  autoTable(doc, {
    startY: y,
    head,
    body,
    foot: hasBreakdown ? [['', 'TOTAL', '', '', totalObtained, '']] : [['', '', 'TOTAL', totalObtained, '']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    footStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4, textColor: 0 },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { halign: 'center' },
      ...(hasBreakdown
        ? { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } }
        : { 3: { halign: 'center' }, 4: { halign: 'center' } }),
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  doc.setLineWidth(0.2);
  doc.line(14, y, 196, y);
  y += 8;

  // ── Totals / Summary ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`TOTAL MARKS   : ${totalObtained} / ${totalMax}`, 20, y);
  y += 5.5;
  doc.text(`PERCENTAGE    : ${data.overall.percentage}%`, 20, y);
  y += 5.5;
  doc.text(`GRADE         : ${data.overall.grade || '—'}`, 20, y);
  y += 5.5;
  const pos = data.classPosition != null
    ? `${data.classPosition}${data.classSize ? ` / ${data.classSize}` : ''}`
    : '—';
  doc.text(`CLASS POSITION : ${pos}`, 20, y);
  y += 5.5;
  doc.setLineWidth(0.2);
  doc.line(14, y, 196, y);
  y += 8;

    // ── CO-SCHOLASTIC AREAS (only when provided) ──
  if (data.coScholasticAreas && data.coScholasticAreas.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CO-SCHOLASTIC AREAS', 16, y);
    y += 3;
    drawRule();
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['S.No', 'Area', 'Grade']],
      body: data.coScholasticAreas.map((a, i) => [i + 1, a.area || '—', a.grade || '—']),
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, textColor: 0 },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    doc.setLineWidth(0.2);
    doc.line(14, y, 196, y);
    y += 8;
  }

  // ── ATTENDANCE (only when provided) ──
  if (data.attendance) {
    const wp = Number(data.attendance.workingDays) || 0;
    const pd = Number(data.attendance.presentDays) || 0;
    const pct = wp > 0 ? ((pd / wp) * 100).toFixed(2) : '0.00';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ATTENDANCE', 16, y);
    y += 3;
    drawRule();
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Total Working Days', 'Days Present', 'Attendance %']],
      body: [[wp, pd, `${pct}%`]],
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4, textColor: 0, halign: 'center' },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    doc.setLineWidth(0.2);
    doc.line(14, y, 196, y);
    y += 8;
  }

  // ── CLASS TEACHER'S REMARKS ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text("CLASS TEACHER'S REMARKS", 16, y);
  y += 3;
  drawRule();
  y += 2;
  const remarkText = data.remarks?.trim() || 'Good academic performance. Consistent effort and good conceptual understanding demonstrated throughout the term.';
  const remarkLines = doc.splitTextToSize(remarkText, 176);
  const boxH = Math.max(28, remarkLines.length * 4.5 + 12);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, y, 182, boxH, 1, 1, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(remarkLines, 17, y + 5);
  y += boxH + 6;
  doc.setLineWidth(0.2);
  doc.line(14, y, 196, y);
  y += 9;

  // ── Signatures ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const sigY = y;
  doc.setLineWidth(0.3);
  doc.line(46, sigY, 102, sigY);
  doc.line(128, sigY, 182, sigY);
  doc.setFontSize(9);
  doc.text('CLASS TEACHER', 74, sigY + 4, { align: 'center' });
  doc.text('PRINCIPAL', 155, sigY + 4, { align: 'center' });
  y = sigY + 10;

  // ── School Seal ──
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.circle(105, y + 8, 16, 'S');
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SCHOOL SEAL', 105, y + 8, { align: 'center' });
  y += 25;

  // ── Footer ──
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated by Kautix · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 105, 282, { align: 'center' });

  saveOrOpenPDF(doc, `ReportCard_${data.studentName.replace(/\s+/g, '_')}.pdf`);
};

export const generateExamRegistryPDF = (data: {
  schoolName: string;
  examName: string;
  className: string;
  students: { name: string; rollNo: string; marks: number; rank: number | null; percentage: number }[];
}) => {
  const doc = new jsPDF() as any;

  // Header
  doc.setFillColor(30, 64, 175); // Blue-800
  doc.rect(0, 0, 210, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(data.schoolName.toUpperCase(), 105, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.text(`EXAM REGISTRY: ${data.examName.toUpperCase()}`, 105, 32, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(`Class/Section: ${data.className}`, 20, 58);
  doc.text(`Date Generated: ${new Date().toLocaleDateString('en-IN')}`, 130, 58);

  const tableData = data.students.map((s, index) => [
    index + 1,
    s.rollNo || '-',
    s.name,
    s.marks.toString(),
    `${s.percentage.toFixed(1)}%`,
    s.rank ? `#${s.rank}` : '-'
  ]);

  autoTable(doc, {
    startY: 65,
    head: [['S.No', 'Roll No', 'Student Name', 'Marks', 'Percentage', 'Rank']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
  });

  saveOrOpenPDF(doc, `Registry_${data.examName.replace(/\s+/g, '_')}.pdf`);
};

export const generateToppersPDF = (data: {
  schoolName: string;
  filterLabel: string;
  subjectToppers: { name: string; class: string; score: number; subject: string }[];
  overallToppers: { name: string; class: string; score: number; subject: string }[];
}) => {
  const doc = new jsPDF() as any;

  // Header
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(0, 0, 210, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(data.schoolName.toUpperCase(), 105, 22, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`TOP PERFORMERS REPORT (${data.filterLabel.toUpperCase()})`, 105, 34, { align: 'center' });

  let currentY = 55;

  if (data.overallToppers && data.overallToppers.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('Overall Toppers', 20, currentY);
    currentY += 5;

    const overallData = data.overallToppers.map((s, index) => [
      index + 1, s.name, s.class, `${s.score.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Rank', 'Student Name', 'Class & Section', 'Overall Score']],
      body: overallData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 10 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  if (data.subjectToppers && data.subjectToppers.length > 0) {
    if (currentY > 250) { doc.addPage(); currentY = 20; }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('Subject-Wise Toppers', 20, currentY);
    currentY += 5;

    const subjectData = data.subjectToppers.map((s, index) => [
      s.subject, s.name, s.class, `${s.score.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Subject', 'Student Name', 'Class & Section', 'Score']],
      body: subjectData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 10 }
    });
  }

  saveOrOpenPDF(doc, `Toppers_Report.pdf`);
};

export const generateExamProtocolPDF = (data: {
  schoolName: string;
  filterLabel?: string;
  upcoming: Array<{ name: string; subject: string; class: string; date: string; time?: string; room?: string; totalMarks?: number }>;
  results: Array<{ name: string; subject: string; class: string; date: string; avgScore: number; totalStudents: number }>;
}) => {
  const doc = new jsPDF() as any;
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(data.schoolName.toUpperCase(), 14, 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('EXAM SCHEDULE & RESULTS PROTOCOL', 14, 30);

  const filterLabel = data.filterLabel || 'All Classes';
  doc.text(`Filter: ${filterLabel}   |   Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 37);

  let currentY = 55;

  // ── Upcoming Exams ─────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Upcoming Examinations', 14, currentY);
  currentY += 4;

  if (data.upcoming && data.upcoming.length > 0) {
    const upcomingRows = data.upcoming.map(e => [
      e.name,
      e.subject,
      e.class,
      e.date,
      e.time || 'TBA',
      e.room || 'Main Hall',
      e.totalMarks ? `${e.totalMarks}` : '—'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Exam Name', 'Subject', 'Class', 'Date', 'Time', 'Room', 'Max Marks']],
      body: upcomingRows,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 40 },
        3: { cellWidth: 28 },
        4: { cellWidth: 24 },
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 14;
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('No upcoming exams scheduled.', 14, currentY + 8);
    currentY += 18;
  }

  // ── Past Results ───────────────────────────────────────
  if (currentY > 230) { doc.addPage(); currentY = 20; }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Past Results Summary', 14, currentY);
  currentY += 4;

  if (data.results && data.results.length > 0) {
    const resultsRows = data.results.map(r => [
      r.name,
      r.subject,
      r.class,
      r.date,
      `${r.totalStudents}`,
      `${r.avgScore.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Exam Name', 'Subject', 'Class', 'Date', 'Students', 'Avg Score']],
      body: resultsRows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 45 },
        3: { cellWidth: 30 },
      }
    });
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('No completed exam results yet.', 14, currentY + 8);
  }

  // ── Footer ─────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}  |  ${data.schoolName}  |  Kautix School Management System`, 14, doc.internal.pageSize.getHeight() - 10);
  }

  saveOrOpenPDF(doc, `Exam_Protocol_${new Date().toISOString().split('T')[0]}.pdf`);
};