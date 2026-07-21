/**
 * Client-side delimited-text parser for the AI Import Hub. No network calls,
 * no external AI — everything is parsed in the browser so a demo import never
 * leaves the device. Handles CSV/TSV with quoted fields and a header row.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Detect delimiter from the header line (comma vs tab vs semicolon). */
function detectDelimiter(sample: string): string {
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  for (const ch of sample) if (ch in counts) counts[ch]++;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || ",";
}

/** Split one line respecting double-quoted fields. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseDelimited(text: string): ParsedTable | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim() !== "");
  if (lines.length < 1) return null;
  const delim = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delim);
  if (headers.length === 0) return null;
  const rows = lines.slice(1).map(l => {
    const cells = splitLine(l, delim);
    // pad/truncate to header length
    while (cells.length < headers.length) cells.push("");
    return cells.slice(0, headers.length);
  });
  return { headers, rows };
}

/** Import target kinds and the canonical fields they map to. */
export interface ImportTarget {
  kind: string;
  label: string;
  fields: string[];
  /** header keywords → canonical field (lowercased contains match) */
  hints: Record<string, string>;
}

export const IMPORT_TARGETS: ImportTarget[] = [
  {
    kind: "menu", label: "Menu items", fields: ["name", "category", "price", "unit"],
    hints: { item: "name", name: "name", product: "name", category: "category", section: "category", price: "price", cost: "price", unit: "unit", size: "unit" },
  },
  {
    kind: "contacts", label: "CRM contacts", fields: ["name", "email", "phone", "company"],
    hints: { name: "name", contact: "name", email: "email", "e-mail": "email", phone: "phone", mobile: "phone", cell: "phone", company: "company", org: "company", business: "company" },
  },
  {
    kind: "order_guide", label: "Order guide", fields: ["item", "vendor", "unit", "par"],
    hints: { item: "item", product: "item", vendor: "vendor", supplier: "vendor", unit: "unit", pack: "unit", par: "par", parlevel: "par", "par level": "par" },
  },
  {
    kind: "staff", label: "Staff roster", fields: ["name", "role", "phone", "email"],
    hints: { name: "name", staff: "name", role: "role", title: "role", position: "role", phone: "phone", email: "email" },
  },
];

/** Auto-map source headers to a target's canonical fields via hint keywords. */
export function autoMap(headers: string[], target: ImportTarget): Record<string, string> {
  const map: Record<string, string> = {}; // canonicalField -> sourceHeader
  for (const field of target.fields) map[field] = "";
  headers.forEach(h => {
    const low = h.toLowerCase().trim();
    for (const [kw, field] of Object.entries(target.hints)) {
      if (low.includes(kw) && !map[field]) { map[field] = h; break; }
    }
  });
  return map;
}
