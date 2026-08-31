// ── Professional Exam Report Card & Annual Report PDFs ─────────────────────
// Uses the same stack as lib/pdf.ts (jsPDF + jspdf-autotable) but with a
// formal report-card layout: school letterhead, marks table, summary strip,
// performance analysis bars, teacher remarks, signature lines and seal.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY: [number, number, number] = [0, 0, 0];        // black (B&W)
const GOLD: [number, number, number] = [0, 0, 0];        // black (B&W)
const INDIGO: [number, number, number] = [0, 0, 0];      // black (B&W)
const LIGHT: [number, number, number] = [250, 250, 250]; // near-white
const BORDER: [number, number, number] = [210, 210, 210]; // neutral gray border
const INK: [number, number, number] = [30, 30, 30];      // near-black
const MUTED: [number, number, number] = [100, 100, 100]; // neutral gray

const barColorFor = (pct: number): [number, number, number] => [0, 0, 0];

const gradeFor = (pct: number): string =>
  pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 40 ? 'D' : 'F';

export interface ExamReportSubject {
  subject: string;
  marksObtained: number | null;
  maxMarks: number;
  percentage: number | null;
  grade: string | null;
  isAbsent?: boolean;
}

export interface ExamReportCardData {
  schoolName: string;
  examName: string;
  examDate?: string | null;
  studentName: string;
  className: string;
  rollNumber?: string | null;
  admissionNumber?: string | null;
  academicYear?: string;
  subjects: ExamReportSubject[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  classPosition?: number | null;
  classSize?: number | null;
  attendanceRate?: number | null;
  remarks?: string | null;
  board?: string;
  affiliationNo?: string;
}

// Draw the shared professional letterhead.
const drawLetterhead = (doc: jsPDF, schoolName: string, subtitle: string) => {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 40, 210, 1.6, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text((schoolName || 'KAUTIX SCHOOL').toUpperCase(), 105, 17, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(212, 212, 212);
  doc.text(subtitle.toUpperCase(), 105, 26, { align: 'center' });
  doc.setTextColor(...INK);
  return 52;
};

// Label/value student info block. Returns Y after the block.
const drawInfoBlock = (doc: jsPDF, startY: number, pairs: [string, string][]) => {
  const perRow = 2;
  const rowH = 12;
  const rows = Math.ceil(pairs.length / perRow);
  const boxH = rows * rowH + 6;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, startY, 182, boxH, 2, 2, 'F');
  doc.setDrawColor(...BORDER);
  doc.roundedRect(14, startY, 182, boxH, 2, 2, 'S');

  pairs.forEach((pair, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 20 + col * 90;
    const y = startY + 9 + row * rowH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(pair[0].toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(pair[1] || '—', x, y + 5);
  });
  return startY + boxH + 8;
};

// Summary stat boxes. Returns Y after the strip.
const drawSummaryStrip = (doc: jsPDF, startY: number, stats: { label: string; value: string }[]) => {
  const n = stats.length;
  const gap = 4;
  const w = (182 - gap * (n - 1)) / n;
  const h = 20;
  stats.forEach((s, i) => {
    const x = 14 + i * (w + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, startY, w, h, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(s.label.toUpperCase(), x + w / 2, startY + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...NAVY);
    doc.text(s.value, x + w / 2, startY + 15, { align: 'center' });
  });
  return startY + h + 10;
};

// Horizontal performance bars. Returns Y after the section.
const drawPerformanceBars = (doc: jsPDF, startY: number, rows: { label: string; pct: number; valueText: string }[]) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text('PERFORMANCE ANALYSIS', 14, startY);
  let y = startY + 7;
  const trackX = 58;
  const trackW = 100;
  rows.forEach((r) => {
    const pct = Math.max(0, Math.min(100, r.pct));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(r.label.slice(0, 24), 14, y + 4);
    doc.setFillColor(230, 230, 230);
    doc.roundedRect(trackX, y, trackW, 5, 2, 2, 'F');
    doc.setFillColor(...barColorFor(pct));
    doc.roundedRect(trackX, y, Math.max(2, (pct / 100) * trackW), 5, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(r.valueText, trackX + trackW + 6, y + 4);
    y += 10;
  });
  return y + 4;
};
// Teacher remarks box + signature lines + seal + footer
const drawRemarksAndSignatures = (doc: jsPDF, startY: number, remarks?: string | null, schoolName?: string) => {
  let y = Math.max(startY, 200);
  const remarksH = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text("TEACHER'S REMARKS", 14, y);
  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, y + 3, 182, remarksH, 2, 2, 'FD');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const text = remarks?.trim() ? remarks.trim() : 'No remarks recorded for this exam.';
  doc.text(doc.splitTextToSize(`"${text}"`, 172), 20, y + 11);
  y += remarksH + 18;

  // Signature lines
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(24, y, 74, y);
  doc.line(135, y, 185, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Class Teacher', 49, y + 5, { align: 'center' });
  doc.text('Principal', 160, y + 5, { align: 'center' });

  // School seal (dashed circle)
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.circle(105, y - 4, 11);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text('SCHOOL', 105, y - 5.5, { align: 'center' });
  doc.text('SEAL', 105, y - 1.5, { align: 'center' });

  // Footer
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(14, 283, 196, 283);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`${schoolName || ''} · Generated by Kautix on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 105, 288, { align: 'center' });
};
// ── Single-exam report card PDF ────────────────────────────────────────────
// Draw a bordered section banner (like the HTML "Student Details" boxes).
const drawSectionBanner = (doc: jsPDF, y: number, title: string) => {
  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.rect(14, y, 182, 11, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), 19, y + 7.5);
  return y + 11;
};

// Draw a 4-column bordered grid of label/value cells (student details block).
const drawDetailsGrid = (doc: jsPDF, y: number, cells: [string, string][]) => {
  const cols = 4;
  const rowH = 12;
  const rows = Math.ceil(cells.length / cols);
  const colW = 182 / cols;
  cells.forEach((cell, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = 14 + c * colW;
    const cy = y + r * rowH;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, cy, colW, rowH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(cell[0].toUpperCase(), x + 2, cy + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text((doc.splitTextToSize(cell[1] || '—', colW - 4)[0] as string), x + 2, cy + 9);
  });
  return y + rows * rowH;
};

// ── Single-exam report card PDF ────────────────────────────────────────────
export const generateExamReportCardPdf = (data: ExamReportCardData) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const academicYear = data.academicYear || `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`;

  // ── Header: school name + affiliation + report title (formal, theme band) ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 46, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 46, 210, 1.6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text((data.schoolName || 'KAUTIX SCHOOL').toUpperCase(), 105, 17, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(212, 212, 212);
  doc.text(`AFFILIATED TO ${data.board || 'CBSE'}, NEW DELHI`, 105, 25.5, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`AFFILIATION NO: ${data.affiliationNo || 'KTX-10293'}`, 105, 30.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(`REPORT CARD — ${academicYear}`, 105, 39.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(230, 230, 230);
  doc.text((data.examName || 'EXAM').toUpperCase(), 105, 45, { align: 'center' });

  let y = 54;

  // ── Student Details grid ──
  y = drawSectionBanner(doc, y, 'Student Details');
  y = drawDetailsGrid(doc, y, [
    ['Student Name', data.studentName],
    ['Admission No', data.admissionNumber || '—'],
    ['Class / Section', data.className || '—'],
    ['Roll No', String(data.rollNumber ?? '—')],
    ['Academic Session', academicYear],
    ['Exam Date', data.examDate ? new Date(data.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
    ['Attendance', data.attendanceRate != null ? `${data.attendanceRate}%` : '—'],
    ['Class Position', data.classPosition ? `#${data.classPosition}${data.classSize ? ` / ${data.classSize}` : ''}` : '—'],
  ]);
  y += 4;

  // ── Scholastic Areas (marks table) ──
  y = drawSectionBanner(doc, y, 'Scholastic Areas');
  autoTable(doc, {
    startY: y,
    head: [['S.No', 'Subject', 'Max Marks', 'Obtained', 'Percentage', 'Grade']],
    body: data.subjects.map((s, i) => [
      i + 1,
      s.subject,
      s.maxMarks,
      s.isAbsent ? 'Absent' : (s.marksObtained ?? '—'),
      s.percentage !== null ? `${s.percentage}%` : '—',
      s.grade || '—',
    ]),
    foot: [['', 'TOTAL', data.totalMax, data.totalObtained, `${data.percentage}%`, data.grade]],
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3.5 },
    alternateRowStyles: { fillColor: [246, 246, 246] },
    footStyles: { fillColor: [230, 230, 230], textColor: [25, 25, 25], fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;

  // ── Result Summary strip ──
  y = drawSectionBanner(doc, y, 'Result Summary');
  y = drawSummaryStrip(doc, y, [
    { label: 'Total Marks', value: `${data.totalObtained} / ${data.totalMax}` },
    { label: 'Percentage', value: `${data.percentage}%` },
    { label: 'Grade', value: data.grade || '—' },
    { label: 'Class Position', value: data.classPosition ? `#${data.classPosition}${data.classSize ? ` / ${data.classSize}` : ''}` : '—' },
  ]);
  y += 2;

  // ── Performance Analysis bars ──
  y = drawPerformanceBars(
    doc,
    y,
    data.subjects.map((s) => ({ label: s.subject, pct: s.percentage ?? 0, valueText: `${s.percentage ?? 0}%` }))
  );

  // ── Remarks + signatures + seal + footer ──
  drawRemarksAndSignatures(doc, y, data.remarks, data.schoolName);

  doc.save(`Report_Card_${data.examName.replace(/\\s+/g, '_')}_${data.studentName.replace(/\\s+/g, '_')}.pdf`);
};
// ── Fee receipt PDF ────────────────────────────────────────────────────────
export interface FeeReceiptData {
  schoolName: string;
  studentName: string;
  className?: string;
  rollNumber?: string | null;
  receiptNumber?: string;
  date: string;               // paid date
  description: string;
  amount: number;             // positive paid amount
  paymentMode?: string;
  runningBalance?: number;    // balance after this payment
  fatherName?: string | null;
  board?: string; // e.g. 'CBSE'
  affiliationNo?: string; // school affiliation number
}

export const generateFeeReceiptPdf = (data: FeeReceiptData) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // ── Header band (pure black & white) ──
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, 210, 48, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 48, 210, 1.6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text((data.schoolName || 'KAUTIX SCHOOL').toUpperCase(), 105, 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`AFFILIATED TO ${data.board || 'CBSE'}, NEW DELHI`, 105, 26, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`AFFILIATION NO: ${data.affiliationNo || 'XXXXXXX'}`, 105, 31, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('OFFICIAL FEE RECEIPT', 105, 36, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`RECEIPT NO: ${data.receiptNumber || '—'}`, 105, 41, { align: 'center' });

  // ── Details grid ──
  let y = drawDetailsGrid(doc, 54, [
    ['Student Name', data.studentName],
    ['Class / Section', data.className || '—'],
    ['Roll No', String(data.rollNumber ?? '—')],
    ['Receipt No', data.receiptNumber || '—'],
    ['Payment Date', new Date(data.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })],
    ['Payment Mode', data.paymentMode ? String(data.paymentMode).replace(/_/g, ' ').toUpperCase() : '—'],
  ]);
  y += 4;

  // ── Amount table ──
  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body: [
      [data.description || 'Fee Payment', `₹${Number(data.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ],
    foot: [['TOTAL PAID', `₹${Number(data.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 10, fontStyle: 'bold' },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;

  // ── Amount in words + balance ──
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.roundedRect(14, y, 182, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`Amount in Words: ${numberToWords(Math.round(Number(data.amount)))}`, 20, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(
    data.runningBalance != null
      ? `Balance Remaining After This Payment: ₹${Number(data.runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : 'This payment has been received in full.',
    20,
    y + 15
  );
  y += 30;

  // ── Thank-you + signature + footer ──
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Thank you for your payment. This is a computer-generated receipt and does not require a signature.', 105, y, { align: 'center' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(135, y + 34, 185, y + 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('Authorised Signatory', 160, y + 39, { align: 'center' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(14, 283, 196, 283);
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`${data.schoolName || ''} · Generated by Kautix on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 105, 288, { align: 'center' });

  doc.save(`Fee_Receipt_${(data.receiptNumber || 'receipt').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`);
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const numberToWords = (num: number): string => {
  if (num === 0) return 'Zero Rupees';
  const words = (n: number): string => {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + words(n % 100) : '');
    return '';
  };
  let out = '';
  if (num >= 100000) { out += words(Math.floor(num / 100000)) + ' Lakh '; num %= 100000; }
  if (num >= 1000) { out += words(Math.floor(num / 1000)) + ' Thousand '; num %= 1000; }
  out += words(num);
  return out.trim() + ' Rupees Only';
};
export interface AnnualReportData {
  schoolName: string;
  studentName: string;
  className: string;
  rollNumber?: string | null;
  admissionNumber?: string | null;
  academicYear?: string;
  attendanceRate?: number | null;
  exams: {
    examName: string;
    date?: string | null;
    subjects: ExamReportSubject[];
    totalObtained: number;
    totalMax: number;
    percentage: number;
    grade: string;
    classPosition?: number | null;
    classSize?: number | null;
    remarks?: string | null;
  }[];
  overall: {
    totalObtained: number;
    totalMax: number;
    avgPercentage: number;
    grade: string;
    bestExam?: { name: string; percentage: number } | null;
  };
  remarks?: string | null;
}

export const generateAnnualReportPdf = (data: AnnualReportData) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  drawLetterhead(doc, data.schoolName, 'Annual Academic Report');

  const academicYear = data.academicYear || `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`;

  let y = drawInfoBlock(doc, 52, [
    ['Student', data.studentName],
    ['Class & Section', data.className],
    ['Roll No', String(data.rollNumber ?? '—')],
    ['Session', academicYear],
  ]);

  y = drawSummaryStrip(doc, y, [
    { label: 'Exams Taken', value: String(data.exams.length) },
    { label: 'Overall Average', value: `${data.overall.avgPercentage}%` },
    { label: 'Overall Grade', value: data.overall.grade },
    { label: 'Best Exam', value: data.overall.bestExam ? data.overall.bestExam.name : '—' },
    { label: 'Attendance', value: data.attendanceRate != null ? `${data.attendanceRate}%` : '—' },
  ]);

  // 1. Exam-wise summary table
  autoTable(doc, {
    startY: y,
    head: [['Exam', 'Date', 'Max', 'Score', 'Percentage', 'Grade', 'Position']],
    body: data.exams.map((e) => [
      e.examName,
      e.date ? new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      e.totalMax,
      e.totalObtained,
      `${e.percentage}%`,
      e.grade,
      e.classPosition ? `#${e.classPosition}${e.classSize ? ` / ${e.classSize}` : ''}` : '—',
    ]),
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [246, 246, 246] },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center', fontStyle: 'bold' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // 2. Subject-wise yearly comparison (subjects as rows, exams as columns)
  const allSubjects = [...new Set(data.exams.flatMap((e) => e.subjects.map((s) => s.subject)))].sort();
  const comparisonHead = ['Subject', ...data.exams.map((_, i) => `Exam ${i + 1}`), 'Overall', 'Grade'];
  const comparisonBody = allSubjects.map((subj) => {
    const row: any[] = [subj];
    data.exams.forEach((e) => {
      const s = e.subjects.find((x) => x.subject === subj);
      row.push(s && s.marksObtained !== null ? `${s.marksObtained}/${s.maxMarks}` : (s?.isAbsent ? 'Abs' : '—'));
    });
    const obtained = data.exams.reduce((sum, e) => sum + (e.subjects.find((x) => x.subject === subj)?.marksObtained || 0), 0);
    const max = data.exams.reduce((sum, e) => sum + (e.subjects.find((x) => x.subject === subj)?.maxMarks || 0), 0);
    const pct = max > 0 ? Math.round((obtained / max) * 10000) / 100 : null;
    row.push(pct !== null ? `${pct}%` : '—');
    row.push(pct !== null ? gradeFor(pct) : '—');
    return row;
  });

  autoTable(doc, {
    startY: y,
    head: [comparisonHead],
    body: comparisonBody,
    theme: 'grid',
    headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    alternateRowStyles: { fillColor: [246, 246, 246] },
    columnStyles: Object.fromEntries(
      Array.from({ length: data.exams.length + 3 }, (_, i) => [i + 1, { halign: 'center' }])
    ),
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // 3. Overall band
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, y, 182, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(`ANNUAL TOTAL: ${data.overall.totalObtained} / ${data.overall.totalMax}`, 20, y + 7);
  doc.text(`OVERALL PERCENTAGE: ${data.overall.avgPercentage}%`, 20, y + 14);
  doc.text(`OVERALL GRADE: ${data.overall.grade}`, 120, y + 7);
  doc.text(`ATTENDANCE: ${data.attendanceRate != null ? `${data.attendanceRate}%` : '—'}`, 120, y + 14);
  y += 24;

  // 4. Aggregate remarks + signatures
  const allRemarks = data.exams.map((e) => e.remarks).filter(Boolean) as string[];
  drawRemarksAndSignatures(doc, y, allRemarks[allRemarks.length - 1] || data.remarks || null, data.schoolName);

  doc.save(`Annual_Report_${data.studentName.replace(/\s+/g, '_')}.pdf`);
};