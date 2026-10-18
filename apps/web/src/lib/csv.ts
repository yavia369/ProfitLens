/** Builds RFC 4180 CSV. Values are written exactly as provided (decimal strings, no rounding). */
export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  const esc = (v: string | number | null) => {
    if (v === null) return "";
    const s = String(v);
    // Neutralise spreadsheet formula injection for text cells.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
