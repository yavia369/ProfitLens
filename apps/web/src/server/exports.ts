import "server-only";
import type { PnlReport, PnlRow, StoreComparisonReport } from "@profitlens/core";
import { dec } from "@profitlens/finance";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

/** A report as a plain table, shared by the XLSX and PDF exporters. */
export interface ExportTable {
  title: string;
  subtitle: string;
  notes: string[];
  currency: string;
  columns: string[];
  rows: { label: string; kind: PnlRow["kind"]; depth: number; cells: (string | null)[] }[];
}

const BASIS = "Management report (operational estimate) — not an accounting statement.";

function columnLabel(start: string, end: string, granularity: PnlReport["granularity"]): string {
  if (granularity === "month") return formatDate(start, { month: "short", year: "numeric" });
  if (granularity === "week") return `${formatDate(start)}–${formatDate(end)}`;
  return formatDate(start, { day: "numeric", month: "short" });
}

export function pnlTable(r: PnlReport): ExportTable {
  return {
    title: `Profit & loss — ${r.store.name}${r.store.isDemo ? " (DEMO DATA)" : ""}`,
    subtitle: `${formatDate(r.range.start, { day: "numeric", month: "short", year: "numeric" })} – ${formatDate(r.range.end, { day: "numeric", month: "short", year: "numeric" })} · ${r.store.currency} · ${r.store.timezone}`,
    notes: [BASIS, "Revenue is event-dated; taxes and gift-card sales are excluded from revenue."],
    currency: r.store.currency,
    columns: [...r.columns.map((c) => columnLabel(c.start, c.end, r.granularity)), "Total"],
    rows: r.rows.flatMap((row) => [
      { label: row.label, kind: row.kind, depth: 0, cells: [...row.values, row.total] },
      ...row.children.map((c) => ({ label: c.label, kind: c.kind, depth: 1, cells: [...c.values, c.total] })),
    ]),
  };
}

export function comparisonTable(r: StoreComparisonReport): ExportTable {
  const consolidated = r.consolidated.currency !== null;
  return {
    title: "Profit & loss — store comparison",
    subtitle: r.stores.map((s) => `${s.name}: ${s.range.start} – ${s.range.end} (${s.currency}, ${s.timezone})`).join(" · "),
    notes: [BASIS, ...(r.consolidated.currency === null ? [r.consolidated.reason] : ["Each store's days follow its own time zone."])],
    currency: r.consolidated.currency ?? r.stores[0]?.currency ?? "USD",
    columns: [...r.stores.map((s) => `${s.name} (${s.currency})`), ...(consolidated ? ["Consolidated"] : [])],
    rows: r.rows.map((row) => ({ label: row.label, kind: row.kind, depth: 0, cells: [...row.values, ...(consolidated ? [row.total] : [])] })),
  };
}

/** Presentation value of a cell: money rounded to cents (costs shown negative), ratios as fractions. */
function cellNumber(value: string | null, kind: PnlRow["kind"]): number | null {
  if (value === null) return null;
  const d = dec(value);
  // Spreadsheet cells are binary floating point; values are rounded to presentation precision first.
  return Number((kind === "ratio" ? d.toDecimalPlaces(6) : (kind === "cost" ? d.neg() : d).toDecimalPlaces(2)).toString());
}

export async function toXlsx(t: ExportTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ProfitLens";
  const ws = wb.addWorksheet("P&L", { views: [{ state: "frozen", xSplit: 1, ySplit: 5 }] });
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  ws.addRow([t.subtitle]);
  ws.addRow([t.notes.join(" ")]).font = { italic: true, size: 9 };
  ws.addRow([]);
  const header = ws.addRow(["", ...t.columns]);
  header.font = { bold: true };
  const moneyFmt = `#,##0.00;(#,##0.00)`;
  for (const r of t.rows) {
    const row = ws.addRow([`${"  ".repeat(r.depth)}${r.label}`, ...r.cells.map((c) => cellNumber(c, r.kind))]);
    if (r.kind === "subtotal") row.font = { bold: true };
    if (r.kind === "memo") row.font = { italic: true, color: { argb: "FF6B7280" } };
    row.eachCell((cell, col) => {
      if (col > 1) cell.numFmt = r.kind === "ratio" ? "0.0%" : moneyFmt;
    });
  }
  ws.getColumn(1).width = 34;
  for (let i = 2; i <= t.columns.length + 1; i++) ws.getColumn(i).width = 16;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Landscape A4 table. Wide reports (> 10 columns) keep only the total so the PDF stays legible. */
export async function toPdf(t: ExportTable): Promise<Buffer> {
  const wide = t.columns.length > 10;
  const columns = wide ? [t.columns[t.columns.length - 1]!] : t.columns;
  const cell = (r: ExportTable["rows"][number], i: number) => (wide ? r.cells[r.cells.length - 1]! : r.cells[i]!);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, info: { Title: t.title, Creator: "ProfitLens" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.font("Helvetica-Bold").fontSize(15).text(t.title);
  doc.font("Helvetica").fontSize(9).fillColor("#4b5563").text(t.subtitle).moveDown(0.3);
  for (const n of [...t.notes, ...(wide ? ["Showing totals only; export to Excel for every period."] : [])]) doc.text(n);
  doc.moveDown(0.8).fillColor("#111827");

  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const labelW = Math.min(220, usable * 0.32);
  const colW = (usable - labelW) / columns.length;
  const rowH = 15;
  const drawHeader = () => {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8);
    columns.forEach((c, i) => doc.text(c, left + labelW + i * colW, y, { width: colW - 4, align: "right" }));
    doc.moveTo(left, y + rowH - 3).lineTo(left + usable, y + rowH - 3).strokeColor("#d1d5db").stroke();
    doc.y = y + rowH;
  };
  drawHeader();
  for (const r of t.rows) {
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    doc.font(r.kind === "subtotal" ? "Helvetica-Bold" : r.kind === "memo" ? "Helvetica-Oblique" : "Helvetica").fontSize(8.5);
    doc.fillColor(r.kind === "memo" ? "#6b7280" : "#111827").text(r.label, left + r.depth * 10, y, { width: labelW - r.depth * 10, lineBreak: false, ellipsis: true });
    columns.forEach((_, i) => {
      const v = cell(r, i);
      const text = r.kind === "ratio" ? formatPercent(v) : formatMoney(v, t.currency, { asCost: r.kind === "cost" });
      doc.text(text, left + labelW + i * colW, y, { width: colW - 4, align: "right", lineBreak: false });
    });
    if (r.kind === "subtotal") doc.moveTo(left, y - 2).lineTo(left + usable, y - 2).strokeColor("#e5e7eb").stroke();
    doc.y = y + rowH;
  }
  doc.end();
  return done;
}
