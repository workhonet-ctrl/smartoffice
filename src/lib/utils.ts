// ============================================================
// utils.ts — shared helpers ใช้ร่วมกันทั่วโปรเจกต์
// ============================================================

// ── จำนวนชิ้นจากชื่อโปร ─────────────────────────────────────
// "1 แถม 1"  → 2   |  "3 กระป๋อง" → 3   |  "ครีม" → 1
export function extractQty(promoName: string): number {
  const tamMatch = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (tamMatch) return parseInt(tamMatch[1]) + parseInt(tamMatch[2]);

  const unitMatch = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (unitMatch) return parseInt(unitMatch[1]);

  const firstNum = promoName.match(/(\d+)/);
  if (firstNum) return parseInt(firstNum[1]);

  return 1;
}

// ── แยกชื่อสินค้าและจำนวนจาก raw_prod ──────────────────────
// "ซุปใสรากบัว(1 กระป๋อง)" → { name: "ซุปใสรากบัว", qty: 1 }
// "ครีม Secret Rose(2 แถม 2)" → { name: "ครีม Secret Rose", qty: 4 }
export function parseProduct(raw: string): { name: string; qty: number } {
  const qty = extractQty(raw);
  let name = raw
    .replace(/\(\s*\d+\s*(?:แถม\s*\d+|กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)[^)]*\)/gi, '')
    .replace(/\s*\d+\s*(?:แถม\s*\d+)/gi, '')
    .trim();
  if (!name) name = raw;
  return { name, qty };
}

// ── Format ตัวเลขเงิน (บาท) ─────────────────────────────────
// fmtTHB(1234.5)   → "1,234.50"
export function fmtTHB(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// fmtInt(1234)     → "1,234"
export function fmtInt(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// fmtPercent(12.3) → "12.3%"
export function fmtPercent(n: number, decimals = 1): string {
  return n.toFixed(decimals) + '%';
}

// ── Format วันที่ไทย ─────────────────────────────────────────
// fmtDateTH("2024-03-15") → "15-03-2024"
export function fmtDateTH(d: string): string {
  return d.split('-').reverse().join('-');
}

// fmtDateLong("2024-03-15") → "ศ. 15 มี.ค. 67"
export function fmtDateLong(d: string): string {
  return new Date(d).toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short', year: '2-digit',
  });
}

// today เป็น YYYY-MM-DD ─────────────────────────────────────
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
