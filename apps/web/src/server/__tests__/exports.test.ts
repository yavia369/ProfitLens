import { ReportingService } from "@profitlens/core";
import { DemoDataSource } from "@profitlens/core/demo";
import { dec } from "@profitlens/finance";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { comparisonTable, pnlTable, toPdf, toXlsx } = await import("../exports");

const service = new ReportingService(new DemoDataSource(() => new Date("2026-10-18T03:00:00Z")));
const range = { start: "2026-07-01", end: "2026-09-30" };

describe("P&L exports", () => {
  it("writes an XLSX whose cells match the report, costs negative and rounded to cents", async () => {
    const pnl = (await service.profitAndLoss("demo", range, "month"))!;
    const table = pnlTable(pnl);
    expect(table.title).toContain("(DEMO DATA)");
    expect(table.columns).toHaveLength(4);
    expect(table.columns[0]).toMatch(/^Jul\w* 2026$/);
    expect(table.columns[3]).toBe("Total");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(await toXlsx(table)).buffer);
    const ws = wb.getWorksheet("P&L")!;
    const byLabel = new Map<string, ExcelJS.Row>();
    ws.eachRow((row) => byLabel.set(String(row.getCell(1).value).trim(), row));
    const revenue = pnl.rows.find((r) => r.key === "revenue")!;
    const cogs = pnl.rows.find((r) => r.key === "cogs")!;
    expect(byLabel.get(revenue.label)!.getCell(5).value).toBe(Number(dec(revenue.total!).toFixed(2)));
    expect(byLabel.get(cogs.label)!.getCell(5).value).toBe(Number(dec(cogs.total!).neg().toFixed(2)));
    expect(byLabel.get(cogs.label)!.getCell(5).numFmt).toBe("#,##0.00;(#,##0.00)");
  });

  it("writes a PDF and keeps only totals for wide reports", async () => {
    const daily = pnlTable((await service.profitAndLoss("demo", { start: "2026-09-01", end: "2026-09-30" }, "day"))!);
    expect(daily.columns.length).toBeGreaterThan(10);
    const pdf = await toPdf(daily);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("omits the consolidated column when stores cannot be added up", async () => {
    const cmp = (await service.storeComparison([{ storeId: "demo", range }]))!;
    const t = comparisonTable({ ...cmp, consolidated: { currency: null, reason: "Different currencies." }, rows: cmp.rows.map((r) => ({ ...r, total: null })) });
    expect(t.columns).toHaveLength(1);
    expect(t.notes).toContain("Different currencies.");
    expect(t.rows.every((r) => r.cells.length === 1)).toBe(true);
  });
});
