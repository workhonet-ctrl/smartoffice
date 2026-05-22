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

// ── คำนวณ Margin / ROAS ต่อโปรโมชัน ────────────────────────
// ใช้ร่วมกันใน ProductKPI และ Marketing (AdsProductList)
// p = ข้อมูลโปร, shipAvg = ค่าส่งจริงเฉลี่ย (จาก usePromoShipAvg), vat = VAT ที่กรอกเอง
export interface PromoMarginInput {
  name:       string;   // ชื่อโปร (สำหรับ extractQty)
  price_thb:  number;   // ราคาขาย
  cost_thb:   number;   // ต้นทุนสินค้าต่อชิ้น
  box_thb:    number;   // ราคากล่อง
  bub_thb:    number;   // ราคาบั้บเบิ้ล (0 ถ้าไม่ใช้)
  ship_thb:   number;   // ค่าส่งประมาณ (fallback)
}

export interface PromoMarginResult {
  qty:       number;
  cost:      number;   // ต้นทุนสินค้ารวม (cost_thb × qty)
  com:       number;   // ค่า COM 1.5%
  free2:     number;   // ค่า FREE 2%
  shipUsed:  number;   // ค่าส่งที่ใช้จริง
  totalCost: number;
  profit:    number;
  margin:    number;   // profit - 20
  roas:      number;   // price / margin
}

export function calcPromoMargin(
  p: PromoMarginInput,
  shipActual?: number,   // ค่าส่งจริงเฉลี่ยจาก usePromoShipAvg (ถ้ามี ใช้แทน ship_thb)
  vat = 0,               // VAT (กรอกเองได้ใน ProductKPI)
): PromoMarginResult {
  const qty      = extractQty(p.name);
  const cost     = p.cost_thb * qty;
  const shipUsed = (shipActual !== undefined && shipActual !== null) ? shipActual : p.ship_thb;
  const com      = p.price_thb * 0.015;
  const free2    = p.price_thb * 0.02;
  const totalCost = cost + p.box_thb + p.bub_thb + shipUsed + vat + com + free2;
  const profit   = p.price_thb - totalCost;
  const margin   = profit - 20;
  const roas     = margin !== 0 ? p.price_thb / margin : 0;
  return { qty, cost, com, free2, shipUsed, totalCost, profit, margin, roas };
}

// ── Tailwind input class constants ─────────────────────────
// ใช้แทนการ copy Tailwind string ซ้ำในฟอร์มต่างๆ
export const CLS_INPUT   = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300' as const;
export const CLS_SELECT  = 'w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300' as const;
export const CLS_INPUT_SM = 'w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-purple-300' as const;
