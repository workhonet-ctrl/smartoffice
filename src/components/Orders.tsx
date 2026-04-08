import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Order, TOURIST_ZIPS } from '../lib/types';
import { Upload, Search, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

type PromoOption = { id: string; name: string; short_name: string | null; price_thb: number };

// ── Searchable Dropdown ──
function SearchableSelect({ options, value, onChange, placeholder = 'ค้นหา...' }: {
  options: PromoOption[]; value: string;
  onChange: (val: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o => `${o.id} ${o.name} ${o.short_name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(v => !v); setQuery(''); }}
        className={`w-full text-left border rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2 ${selected ? 'bg-white border-cyan-400 text-slate-800' : 'bg-white border-slate-300 text-slate-400'}`}>
        <span className="truncate">
          {selected ? <><span className="font-mono text-cyan-700 font-bold">{selected.id}</span> — {selected.name}{selected.short_name && <span className="text-slate-400 text-xs ml-1">({selected.short_name})</span>} <span className="text-slate-400">฿{Number(selected.price_thb).toLocaleString()}</span></> : placeholder}
        </span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 bg-slate-50 rounded px-2 py-1">
              <Search size={14} className="text-slate-400" />
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="พิมพ์รหัส หรือชื่อสินค้า..." className="flex-1 bg-transparent text-sm outline-none" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="p-3 text-sm text-slate-400 text-center">ไม่พบสินค้า</div>}
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 flex items-center gap-2 ${value === o.id ? 'bg-cyan-50 font-semibold' : ''}`}>
                <span className="font-mono text-cyan-700 font-bold w-20 shrink-0">{o.id}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-slate-700">{o.name}</span>
                  {o.short_name && <span className="block truncate text-xs text-slate-400">{o.short_name}</span>}
                </span>
                <span className="text-slate-400 text-xs shrink-0">฿{Number(o.price_thb).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── helper: คำนวณสถานะออเดอร์อัตโนมัติ ──
function extractQty(promoName: string): number {
  const tamMatch = promoName.match(/(\d+)\s*แถม\s*(\d+)/);
  if (tamMatch) return parseInt(tamMatch[1]) + parseInt(tamMatch[2]);
  const unitMatch = promoName.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (unitMatch) return parseInt(unitMatch[1]);
  const firstNum = promoName.match(/(\d+)/);
  if (firstNum) return parseInt(firstNum[1]);
  return 1;
}

function getAutoStatus(order: Order): { label: string; color: string } {
  const s = order.order_status;
  if (s === 'รอคีย์ออเดอร์') return { label: 'รอคีย์ออเดอร์', color: 'bg-blue-100 text-blue-700' };
  if (s === 'กำลังคีย์')     return { label: 'กำลังคีย์',     color: 'bg-indigo-100 text-indigo-700' };
  if (s === 'รอแพ็ค')        return { label: 'รอแพ็ค',        color: 'bg-yellow-100 text-yellow-700' };
  if (s === 'กำลังแพ็ค')     return { label: 'กำลังแพ็ค',     color: 'bg-orange-100 text-orange-700' };
  if (s === 'แพ็คสินค้า')    return { label: 'แพ็คสินค้า',    color: 'bg-teal-100 text-teal-700' };
  if (s === 'ส่งแฟลช')       return { label: 'ส่งแฟลช',       color: 'bg-green-100 text-green-700' };
  if (s === 'ส่งไปรษณีย์')   return { label: 'ส่งไปรษณีย์',   color: 'bg-purple-100 text-purple-800' };
  if (s === 'ส่งสินค้าแล้ว') return { label: 'ส่งสินค้าแล้ว', color: 'bg-green-100 text-green-800' };
  if (s === 'ปริ้นแล้ว')     return { label: 'ปริ้นแล้ว',     color: 'bg-sky-100 text-sky-700' };
  return { label: s || 'รอแพ็ค', color: 'bg-slate-100 text-slate-600' };
}

// ── helper: ขนส่ง label ──
function getCarrierLabel(route: string | null) {
  if (route === 'B') return { label: 'FLASH',    color: 'bg-yellow-100 text-yellow-800' };
  if (route === 'C') return { label: 'ไปรษณีย์', color: 'bg-purple-100 text-purple-800' };
  if (route === 'A') return { label: 'มี Track',  color: 'bg-green-100 text-green-700' };
  return { label: '-', color: 'bg-slate-100 text-slate-500' };
}

export default function Orders({ onImportDone }: { onImportDone?: (ids: string[]) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const today = new Date().toISOString().split('T')[0];
  // ข้อ 2: เริ่มต้นเห็นทั้งหมด (ไม่ filter วันที่)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  // ข้อ 1: filter เพิ่มเติม
  const [filterRoute,  setFilterRoute]  = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPay,    setFilterPay]    = useState('');
  const [importedOrders, setImportedOrders] = useState<Array<Record<string, unknown>>>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [promoOptions, setPromoOptions] = useState<PromoOption[]>([]);
  const [autoMatched, setAutoMatched] = useState<Set<string>>(new Set());
  const [promoMap, setPromoMap] = useState<Record<string, { short_name: string | null; name: string }>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  // ข้อ 3: ref map สำหรับ scroll-to row
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── ประเด็นที่ 1: ออเดอร์ซ้ำ (วันที่ + ลูกค้า) ──
  type DupOrder = { idx: number; order_no: string; order_date: string; customer_name: string; raw_prod: string; confirmed: boolean };
  // ── ประเด็นที่ 2: ลูกค้าซ้ำ (ชื่อซ้ำ หรือ เบอร์ซ้ำ) ──
  type DupCustomer = { idx: number; customer_name: string; tel: string; order_date: string; raw_prod: string; existing_date: string; existing_prod: string };
  // ── ประเด็นที่ 3: Tracking ซ้ำ ──
  type DupTracking = { idx: number; tracking_no: string; customer_name: string; existing_customer: string; existing_order_no: string };

  const [dupOrders,    setDupOrders]    = useState<DupOrder[]>([]);
  const [dupCustomers, setDupCustomers] = useState<DupCustomer[]>([]);
  const [dupTrackings, setDupTrackings] = useState<DupTracking[]>([]);
  const [checkingDups, setCheckingDups] = useState(false);

  useEffect(() => { loadOrders(); loadPromoOptions(); }, []);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders').select('*, customers(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setOrders(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadPromoOptions = async () => {
    const { data } = await supabase.from('products_promo').select('id, name, short_name, price_thb').eq('active', true).order('id', { ascending: true });
    if (data) {
      setPromoOptions(data as PromoOption[]);
      // สร้าง map สำหรับ lookup เร็ว
      const m: Record<string, { short_name: string | null; name: string }> = {};
      (data as PromoOption[]).forEach(p => { m[p.id] = { short_name: p.short_name, name: p.name }; });
      setPromoMap(m);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as Array<Array<string | number>>;
      const rows: Array<Record<string, unknown>> = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i]; if (!row[1]) continue;
        rows.push({
          order_no: String(row[1] || ''), channel: String(row[2] || ''),
          order_date: row[3] ? new Date(String(row[3])).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          order_time: row[3] ? (() => {
            // extract เวลา HH:MM จาก string เช่น "2026-03-28 14:22" หรือ Excel serial number
            const raw = String(row[3]);
            const timeMatch = raw.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) return `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;
            // ถ้าเป็น Excel serial number → แปลงผ่าน Date object
            const d = new Date(raw);
            if (!isNaN(d.getTime())) {
              return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            }
            return '';
          })() : '',
          customer_name: String(row[4] || ''), facebook_name: String(row[5] || ''), tel: String(row[6] || ''),
          address: String(row[7] || ''), subdistrict: String(row[8] || ''),
          district: String(row[9] || ''), province: String(row[10] || ''),
          postal_code: String(row[11] || ''), raw_prod: String(row[14] || ''),
          quantities: String(row[15] || '1'),
          quantity: String(row[15] || '1').split('|').reduce((s, n) => s + (Number(n.trim()) || 1), 0),
          weight_kg: (Number(row[16]) || 0) / 1000,
          // parse tracking "WA112826198TH (THAI_POST)" → tracking + courier
          tracking_no: (() => {
            const raw = String(row[17] || '');
            const m = raw.match(/^([^\s(]+)/);
            return m ? m[1] : (raw || '');
          })(),
          courier: (() => {
            const raw = String(row[17] || '');
            const m = raw.match(/\(([^)]+)\)/);
            if (!m) return '';
            const c = m[1].toUpperCase();
            if (c.includes('THAI_POST') || c.includes('THAILAND_POST') || c.includes('EMS')) return 'ไปรษณีย์';
            if (c.includes('FLASH')) return 'FLASH';
            if (c.includes('KERRY')) return 'Kerry';
            if (c.includes('J&T') || c.includes('JT')) return 'J&T';
            if (c.includes('LAZADA')) return 'Lazada';
            if (c.includes('SHOPEE')) return 'Shopee';
            return m[1];
          })(),
          total_thb: Number(row[21]) || 0,
          payment_method: String(row[22] || 'COD'), payment_status: String(row[24] || 'รอชำระเงิน'),
        });
      }
      setImportedOrders(rows);
      // split ด้วย | (pipe) เป็นตัวคั่นระหว่างสินค้า
      const rawProds = [...new Set(rows.flatMap(o =>
        String(o.raw_prod).split('|').map((s: string) => s.trim()).filter(Boolean)
      ))];
      const autoMap: Record<string, string> = {};
      const matched = new Set<string>();
      for (const rp of rawProds) {
        const { data: ex } = await supabase.from('product_mappings').select('promo_id').eq('raw_name', rp).maybeSingle();
        if (ex?.promo_id) { autoMap[rp] = ex.promo_id; matched.add(rp); }
      }
      setMappings(autoMap); setAutoMatched(matched); setShowMapping(true);
    } catch (err) { console.error(err); showToast('เกิดข้อผิดพลาดในการนำเข้าข้อมูล', 'error'); }
  };

  // ── ตรวจสอบความซ้ำ 3 ประเด็น ──────────────────────────────────────────
  const checkDuplicates = async (rows: Array<Record<string, unknown>>) => {
    setCheckingDups(true);
    const d1: typeof dupOrders    = [];
    const d2: typeof dupCustomers = [];
    const d3: typeof dupTrackings = [];

    // โหลดข้อมูลจาก DB ครั้งเดียว
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('order_no, order_date, tracking_no, customers(name, tel), raw_prod');

    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      const oDate = String(o.order_date || '');
      const oName = String(o.customer_name || '').trim();
      const oTel  = String(o.tel || '').replace(/\D/g, '');
      const oTrack = String(o.tracking_no || '').trim();

      // ── ประเด็นที่ 1: วันที่ + ชื่อลูกค้าซ้ำกับใน DB ──
      const matchOrder = (existingOrders || []).find((ex: any) => {
        const exDate = String(ex.order_date || '').split('T')[0];
        const exName = String(ex.customers?.name || '').trim();
        return exDate === oDate && exName === oName;
      });
      if (matchOrder) {
        d1.push({
          idx: i,
          order_no:      String(o.order_no || ''),
          order_date:    oDate,
          customer_name: oName,
          raw_prod:      String(o.raw_prod || ''),
          confirmed:     false,
        });
      }

      // ── ประเด็นที่ 2: ชื่อหรือเบอร์ซ้ำ → มีออเดอร์ก่อนหน้า ──
      const matchCust = (existingOrders || []).find((ex: any) => {
        const exName = String(ex.customers?.name || '').trim();
        const exTel  = String(ex.customers?.tel  || '').replace(/\D/g, '');
        return (oName && exName === oName) || (oTel && exTel === oTel);
      });
      // เช็คว่าไม่ใช่ตัวเดียวกับ ประเด็นที่ 1 (ไม่ซ้ำ warning)
      if (matchCust && !matchOrder) {
        d2.push({
          idx:             i,
          customer_name:   oName,
          tel:             oTel,
          order_date:      oDate,
          raw_prod:        String(o.raw_prod || ''),
          existing_date:   String((matchCust as any).order_date || '').split('T')[0],
          existing_prod:   String((matchCust as any).raw_prod   || ''),
        });
      }

      // ── ประเด็นที่ 3: Tracking ซ้ำ (ใน DB หรือในไฟล์เดียวกัน) ──
      if (oTrack && oTrack.length > 3) {
        // เช็คกับ DB
        const matchTrack = (existingOrders || []).find((ex: any) =>
          String(ex.tracking_no || '').trim() === oTrack
        );
        if (matchTrack) {
          d3.push({
            idx:               i,
            tracking_no:       oTrack,
            customer_name:     oName,
            existing_customer: String((matchTrack as any).customers?.name || ''),
            existing_order_no: String((matchTrack as any).order_no || ''),
          });
        }
        // เช็คซ้ำภายในไฟล์เดียวกัน
        const sameInFile = rows.findIndex((r, j) =>
          j !== i && String(r.tracking_no || '').trim() === oTrack
        );
        if (sameInFile >= 0 && !matchTrack) {
          d3.push({
            idx:               i,
            tracking_no:       oTrack,
            customer_name:     oName,
            existing_customer: String(rows[sameInFile].customer_name || ''),
            existing_order_no: `(ในไฟล์ row ${sameInFile + 2})`,
          });
        }
      }
    }

    setDupOrders(d1);
    setDupCustomers(d2);
    setDupTrackings(d3);
    setCheckingDups(false);
  };

  // ── pre-check: ลูกค้าที่ไม่พบใน DB ──────────────────────────────────────
  const [missingCustomers, setMissingCustomers] = useState<{idx: number; name: string; tel: string}[]>([]);

  const checkMissingCustomers = async (rows: Array<Record<string, unknown>>) => {
    const missing: typeof missingCustomers = [];
    for (let i = 0; i < rows.length; i++) {
      const tel = String(rows[i].tel || '').trim();
      if (!tel) continue;
      const { data } = await supabase.from('customers').select('id').eq('tel', tel).maybeSingle();
      if (!data?.id) {
        missing.push({ idx: i, name: String(rows[i].customer_name || ''), tel });
      }
    }
    setMissingCustomers(missing);
  };

  const handleMappingComplete = async () => {
    for (const rawName in mappings) {
      if (!mappings[rawName]) continue;
      const { data: ex } = await supabase.from('product_mappings').select('id').eq('raw_name', rawName).maybeSingle();
      if (!ex) await supabase.from('product_mappings').insert([{ raw_name: rawName, promo_id: mappings[rawName] }]);
      else await supabase.from('product_mappings').update({ promo_id: mappings[rawName] }).eq('raw_name', rawName);
    }
    // ตรวจสอบลูกค้าที่ไม่พบ + dup ก่อนเปิด verify
    await Promise.all([checkDuplicates(importedOrders), checkMissingCustomers(importedOrders)]);
    setShowMapping(false); setShowVerify(true);
  };

  const handleVerifyComplete = async () => {
    let ok = 0, skip = 0, fail = 0;
    const errors: string[] = [];
    const newOrderIds: string[] = [];

    for (let idx = 0; idx < importedOrders.length; idx++) {
      const order = importedOrders[idx];
      try {
        // ── ประเด็นที่ 1: ถ้าซ้ำ (วันที่+ลูกค้า) และยังไม่ confirm → ข้าม ──
        const isDupOrder = dupOrders.find(d => d.idx === idx);
        if (isDupOrder && !isDupOrder.confirmed) { skip++; continue; }

        // หาลูกค้าจากเบอร์โทร — ต้องมีในระบบแล้ว (Step 1)
        let customerId: string | undefined;
        const { data: cust } = await supabase
          .from('customers').select('id').eq('tel', String(order.tel)).maybeSingle();

        if (cust?.id) {
          // มีลูกค้าอยู่แล้ว — อัพเดตที่อยู่
          customerId = cust.id;
          await supabase.from('customers').update({
            name: order.customer_name,
            facebook_name: order.facebook_name || undefined,
            address: order.address,
            subdistrict: order.subdistrict, district: order.district,
            province: order.province, postal_code: order.postal_code,
            channel: order.channel || undefined,
          }).eq('id', cust.id);
        } else {
          // ไม่พบลูกค้า → ข้ามและแจ้งเตือน (ต้องนำเข้าลูกค้าก่อน Step 1)
          errors.push(`ไม่พบลูกค้า "${order.customer_name}" (${order.tel}) — กรุณานำเข้ารายชื่อที่หน้าลูกค้าก่อน`);
          skip++;
          continue;
        }

        // จับคู่สินค้า
        const rawProds = String(order.raw_prod).split('|').map((s: string) => s.trim()).filter(Boolean);
        const promoIds: string[] = [];
        for (const rp of rawProds) {
          const { data: mp } = await supabase.from('product_mappings').select('promo_id').eq('raw_name', rp).maybeSingle();
          if (mp?.promo_id) promoIds.push(mp.promo_id);
        }

        const hasTrack   = order.tracking_no && String(order.tracking_no).length > 3;
        const isTourist  = TOURIST_ZIPS.has(String(order.postal_code));
        const route      = hasTrack ? 'A' : isTourist ? 'C' : 'B';
        // มี tracking → รอแพ็ค, ไม่มี tracking → รอคีย์ออเดอร์ (ต้อง export Flash ก่อน)
        const orderStatus = hasTrack ? 'รอแพ็ค' : 'รอคีย์ออเดอร์';

        const { error: oe } = await supabase.from('orders').insert([{
          order_no: String(order.order_no), customer_id: customerId, channel: order.channel,
          order_date: order.order_date, order_time: order.order_time || null,
          raw_prod: order.raw_prod, promo_ids: promoIds,
          quantity: order.quantity,
          quantities: String(order.quantities || order.quantity || '1'),
          weight_kg: order.weight_kg,
          tracking_no: hasTrack ? String(order.tracking_no).trim() : null,
          courier: order.courier || null,
          total_thb: order.total_thb, payment_method: order.payment_method,
          payment_status: order.payment_status, order_status: orderStatus, route,
        }]);

        if (oe) {
          if (oe.code === '23505') { skip++; }
          else { errors.push(`order ${order.order_no}: ${oe.message}`); fail++; }
        } else {
          ok++;
          // เก็บ id ออเดอร์ใหม่ (ต้อง query กลับมา)
          const { data: newO } = await supabase.from('orders').select('id').eq('order_no', String(order.order_no)).maybeSingle();
          if (newO?.id) newOrderIds.push(newO.id);
        }

      } catch (err: any) {
        errors.push(`catch: ${err?.message || err}`);
        fail++;
      }
    }

    console.log('Import errors:', errors);
    const msg = ok > 0
      ? `✓ นำเข้าสำเร็จ ${ok} ออเดอร์${skip > 0 ? ` · ข้าม ${skip} ซ้ำ` : ''}${fail > 0 ? ` · ล้มเหลว ${fail}` : ''}`
      : `นำเข้าไม่สำเร็จ — ออเดอร์ซ้ำ ${skip} รายการ${fail > 0 ? ` · error ${fail}` : ''}`;
    showToast(msg, ok > 0 ? 'success' : skip > 0 ? 'success' : 'error');
    setShowVerify(false); setImportedOrders([]); setMappings({}); setAutoMatched(new Set());

    // ถ้า import สำเร็จ → ไปหน้าแพ็คสินค้าอัตโนมัติ
    if (ok > 0 && onImportDone && newOrderIds.length > 0) {
      setTimeout(() => onImportDone(newOrderIds), 1200);
    } else {
      loadOrders();
    }
  };

  // อัพเดต tracking → อัพเดต order_status อัตโนมัติ
  const updateTracking = async (orderId: string, tracking: string) => {
    const newStatus = tracking.trim().length > 3 ? 'รอแพ็ค' : 'รอคีย์ออเดอร์';
    await supabase.from('orders').update({ tracking_no: tracking.trim() || null, order_status: newStatus }).eq('id', orderId);
    loadOrders();
  };

  const updatePaymentStatus = async (orderId: string, val: string) => {
    await supabase.from('orders').update({ payment_status: val }).eq('id', orderId);
    loadOrders();
  };

  const uniqueRawProds = [...new Set(importedOrders.flatMap(o =>
    String(o.raw_prod).split('|').map((s: string) => s.trim()).filter(Boolean)
  ))];
  const allMapped = uniqueRawProds.every(rp => !!mappings[rp]);

  // filter ด้วย search + วันที่ + route + status + pay
  const filtered = orders.filter(o => {
    if (search) {
      const q = search.toLowerCase();
      const matchSearch = o.order_no?.toLowerCase().includes(q) ||
        o.customers?.name?.toLowerCase().includes(q) ||
        o.customers?.tel?.includes(q) ||
        o.raw_prod?.toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    const orderDay = o.order_date || o.created_at?.split('T')[0];
    if (dateFrom && orderDay && orderDay < dateFrom) return false;
    if (dateTo   && orderDay && orderDay > dateTo)   return false;
    if (filterRoute  && o.route         !== filterRoute)  return false;
    if (filterStatus && o.order_status  !== filterStatus) return false;
    if (filterPay    && o.payment_status !== filterPay)   return false;
    return true;
  });

  // ── หา tracking ที่ซ้ำในตารางปัจจุบัน ──────────────────────────────────
  const dupTrackingSet = (() => {
    const seen: Record<string, number> = {};
    const dup = new Set<string>();
    orders.forEach(o => {
      const t = (o.tracking_no || '').trim();
      if (!t || t.length <= 3) return;
      seen[t] = (seen[t] || 0) + 1;
      if (seen[t] > 1) dup.add(t);
    });
    return dup;
  })();

  // ── แสดงจำนวนลูกค้าที่พร้อม (Step 1) ──────────────────────────────────
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  useEffect(() => {
    supabase.from('customers').select('id', { count: 'exact', head: true })
      .then(({ count }) => setCustomerCount(count ?? 0));
  }, []);

  if (loading) return <div className="p-6 flex items-center gap-2 text-slate-500"><RefreshCw size={16} className="animate-spin"/>กำลังโหลด...</div>;

  // unique values สำหรับ dropdown filter
  const allStatuses = [...new Set(orders.map(o => o.order_status).filter(Boolean))].sort();
  const dupCount = dupTrackingSet.size > 0
    ? orders.filter(o => dupTrackingSet.has((o.tracking_no||'').trim())).length
    : 0;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-800">จัดการออเดอร์</h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Step 2</span>
              {customerCount !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${customerCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-600'}`}>
                  {customerCount > 0 ? `✓ ลูกค้าพร้อม ${customerCount} คน` : '⚠ ยังไม่มีลูกค้า'}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              แสดง {filtered.length} / {orders.length} รายการ
              {dupCount > 0 && (
                <span className="ml-2 text-red-600 font-bold">· ⚠ Track ซ้ำ {dupCount} รายการ</span>
              )}
            </p>
          </div>
          <label className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap self-start">
            <Upload size={17}/> นำเข้า Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden"/>
          </label>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border px-4 py-3 space-y-2">
          {/* Row 1: Search + Date */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหา ออเดอร์ / ลูกค้า / เบอร์ / สินค้า..."
                className="pl-8 pr-4 py-1.5 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-500 whitespace-nowrap">วันที่</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              <span className="text-slate-400">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
            </div>
            {/* Date shortcuts */}
            <div className="flex gap-1">
              {[
                { label: 'วันนี้', from: today, to: today },
                { label: '7 วัน', from: new Date(Date.now()-6*86400000).toISOString().split('T')[0], to: today },
                { label: '30 วัน', from: new Date(Date.now()-29*86400000).toISOString().split('T')[0], to: today },
                { label: 'ทั้งหมด', from: '', to: '' },
              ].map(btn => (
                <button key={btn.label} onClick={() => { setDateFrom(btn.from); setDateTo(btn.to); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    dateFrom === btn.from && dateTo === btn.to ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Dropdown filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Route */}
            <select value={filterRoute} onChange={e => setFilterRoute(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
              <option value="">ขนส่ง: ทั้งหมด</option>
              <option value="A">A — มี Tracking</option>
              <option value="B">B — Flash</option>
              <option value="C">C — ไปรษณีย์</option>
            </select>
            {/* Order status */}
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
              <option value="">สถานะออเดอร์: ทั้งหมด</option>
              {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* Payment status */}
            <select value={filterPay} onChange={e => setFilterPay(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
              <option value="">สถานะชำระ: ทั้งหมด</option>
              <option value="รอชำระเงิน">รอชำระเงิน</option>
              <option value="ชำระแล้ว">ชำระแล้ว</option>
            </select>
            {/* ข้อ 3: ปุ่ม scroll ไปยัง tracking ซ้ำ */}
            {dupCount > 0 && (
              <button
                onClick={() => {
                  const firstDup = filtered.find(o => dupTrackingSet.has((o.tracking_no||'').trim()));
                  if (firstDup && rowRefs.current[firstDup.id]) {
                    rowRefs.current[firstDup.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 flex items-center gap-1.5">
                ⚠ ไปที่ Track ซ้ำ ({dupCount})
              </button>
            )}
            {/* Clear filters */}
            {(filterRoute || filterStatus || filterPay || dateFrom || dateTo || search) && (
              <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setFilterRoute(''); setFilterStatus(''); setFilterPay(''); }}
                className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs hover:bg-slate-200">
                ล้างตัวกรอง ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table — ข้อ 4: flex-1 + overflow scroll ทั้ง X และ Y, sticky header */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm" style={{ minWidth: '1100px', width: '100%' }}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">วันที่สั่งซื้อ</th>
              <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
              <th className="p-3 text-left whitespace-nowrap">ลูกค้า</th>
              <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
              <th className="p-3 text-left whitespace-nowrap">ที่อยู่</th>
              <th className="p-3 text-center whitespace-nowrap">ไปรษณีย์</th>
              <th className="p-3 text-left whitespace-nowrap">สินค้า</th>
              <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
              <th className="p-3 text-center whitespace-nowrap">ขนส่ง</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะชำระ</th>
              <th className="p-3 text-left whitespace-nowrap">Tracking</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะออเดอร์</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="p-0">
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    {customerCount === 0 ? (
                      // ยังไม่ได้ทำ Step 1
                      <div className="text-center max-w-sm">
                        <div className="text-4xl mb-3">👥</div>
                        <p className="font-bold text-slate-700 text-lg mb-1">ยังไม่มีลูกค้าในระบบ</p>
                        <p className="text-sm text-slate-400 mb-4">ต้องนำเข้ารายชื่อลูกค้าก่อน แล้วค่อยนำเข้าออเดอร์</p>
                        <div className="flex items-center gap-3 justify-center text-sm">
                          <span className="px-3 py-2 bg-cyan-100 text-cyan-700 rounded-lg font-bold">Step 1 → หน้าลูกค้า</span>
                          <span className="text-slate-400">→</span>
                          <span className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg font-bold">Step 2 → นำเข้า Excel ที่นี่</span>
                        </div>
                      </div>
                    ) : (
                      // Step 1 เสร็จแล้ว รอ Step 2
                      <div className="text-center max-w-sm">
                        <div className="text-4xl mb-3">📋</div>
                        <p className="font-bold text-slate-700 text-lg mb-1">ลูกค้าพร้อมแล้ว {customerCount} คน</p>
                        <p className="text-sm text-slate-400 mb-4">ออเดอร์จะถูกบันทึกอัตโนมัติเมื่อนำเข้า Excel ที่หน้าลูกค้า</p>
                        <div className="flex items-center gap-2 justify-center text-sm">
                          <span className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg font-bold">✓ ลูกค้าพร้อมแล้ว</span>
                          <span className="text-slate-400">→</span>
                          <span className="px-3 py-2 bg-cyan-100 text-cyan-700 rounded-lg font-bold">นำเข้า Excel ที่หน้าลูกค้า</span>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {filtered.length === 0 && orders.length > 0 && (
              <tr><td colSpan={12} className="p-8 text-center text-slate-400">ไม่พบออเดอร์ที่ตรงกับตัวกรอง</td></tr>
            )}
              {filtered.map(o => {
                const carrier    = getCarrierLabel(o.route);
                const status     = getAutoStatus(o);
                const trackVal   = (o.tracking_no || '').trim();
                const isDupTrack = trackVal.length > 3 && dupTrackingSet.has(trackVal);
                return (
                  // ข้อ 3: ref สำหรับ scroll-to
                  <tr key={o.id}
                    ref={el => { rowRefs.current[o.id] = el; }}
                    className={`border-b hover:bg-slate-50 ${isDupTrack ? 'bg-red-50' : ''}`}>
                    {/* วันที่สั่งซื้อ + เวลา */}
                    <td className="p-3 whitespace-nowrap">
                      {o.order_date ? (
                        <div>
                          <div className="text-xs font-medium text-slate-700">
                            {/* แปลง 2026-03-28 → 28-03-2026 */}
                            {o.order_date.split('-').reverse().join('-')}
                          </div>
                          {(o as any).order_time && (
                            <div className="text-xs text-slate-400">{(o as any).order_time}</div>
                          )}
                        </div>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    {/* เลขออเดอร์ */}
                    <td className="p-3 font-mono text-xs text-blue-600 whitespace-nowrap">{o.order_no}</td>
                    {/* ลูกค้า */}
                    <td className="p-3 whitespace-nowrap">{o.customers?.name || '-'}</td>
                    {/* เบอร์โทร */}
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{o.customers?.tel || '-'}</td>
                    {/* ที่อยู่ — scrollable แทน truncate */}
                    <td className="p-3 text-xs text-slate-500 max-w-[200px]">
                      <div className="overflow-x-auto whitespace-nowrap scrollbar-thin" style={{maxWidth:'200px'}}>
                        {[o.customers?.address, o.customers?.subdistrict && `ต.${o.customers.subdistrict}`, o.customers?.district && `อ.${o.customers.district}`, o.customers?.province && `จ.${o.customers.province}`].filter(Boolean).join(' ')}
                      </div>
                    </td>
                    {/* ไปรษณีย์ */}
                    <td className="p-3 text-center font-mono text-xs">{o.customers?.postal_code || '-'}</td>
                    {/* สินค้า — แถวย่อยแต่ละรายการ */}
                    <td className="p-3 text-xs max-w-[200px]">
                      {(() => {
                        const prods = (o.raw_prod || '').split('|').map((s: string) => s.trim()).filter(Boolean);
                        const qtys  = String((o as any).quantities || o.quantity || '1').split('|');
                        if (prods.length === 0) return <span className="text-slate-300">-</span>;
                        return (
                          <div className="space-y-1">
                            {prods.map((rp: string, idx: number) => {
                              const promoId = o.promo_ids?.[idx];
                              const promo   = promoId ? promoMap[promoId] : null;
                              const name    = promo ? (promo.short_name || promo.name) : rp;
                              // ถ้ามีโปรในระบบ ใช้ extractQty จากชื่อโปร (เช่น "1 แถม 1" = 2)
                              // ถ้าไม่มี ใช้จำนวนจากไฟล์ต้นฉบับ
                              const qty = promo
                                ? extractQty(promo.name)
                                : (Number(qtys[idx]?.trim()) || 1);
                              return (
                                <div key={idx} className="flex items-start gap-1.5">
                                  {/* ลำดับ */}
                                  <span className="shrink-0 w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
                                    {idx + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-slate-800 font-medium block truncate">{name}</span>
                                    <span className="text-slate-400 text-[10px]">จำนวน {qty} {qty > 1 ? 'ชิ้น' : 'ชิ้น'}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    {/* จำนวน — รวมทุก item */}
                    <td className="p-3 text-center">
                      {(() => {
                        const prods = (o.raw_prod || '').split('|').map((s: string) => s.trim()).filter(Boolean);
                        const qtys  = String((o as any).quantities || o.quantity || '1').split('|');
                        const total = prods.reduce((s: number, _: string, idx: number) => {
                          const promoId = o.promo_ids?.[idx];
                          const promo   = promoId ? promoMap[promoId] : null;
                          const qty     = promo ? extractQty(promo.name) : (Number(qtys[idx]?.trim()) || 1);
                          return s + qty;
                        }, 0);
                        const items = prods.length;
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-bold text-slate-700">{total}</span>
                            {items > 1 && <span className="text-[10px] text-slate-400">{items} รายการ</span>}
                          </div>
                        );
                      })()}
                    </td>
                    {/* ขนส่ง */}
                    <td className="p-3 text-center">
                      {(() => {
                        // ถ้ามี courier จากไฟล์ให้แสดงตรงๆ
                        const c = (o as any).courier;
                        if (c) return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c === 'ไปรษณีย์' ? 'bg-purple-100 text-purple-800' : c === 'FLASH' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'}`}>{c}</span>;
                        const carrier = getCarrierLabel(o.route);
                        return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${carrier.color}`}>{carrier.label}</span>;
                      })()}
                    </td>
                    {/* สถานะชำระ */}
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <select value={o.payment_status} onChange={e => updatePaymentStatus(o.id, e.target.value)}
                          className={`px-2 py-0.5 rounded text-xs border-0 font-medium ${o.payment_status === 'ชำระแล้ว' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          <option>รอชำระเงิน</option>
                          <option>ชำระแล้ว</option>
                        </select>
                        {o.payment_method && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${o.payment_method === 'COD' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'}`}>
                            {o.payment_method}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Tracking */}
                    <td className="p-3">
                      <input
                        type="text"
                        defaultValue={o.tracking_no || ''}
                        onBlur={e => { if (e.target.value !== (o.tracking_no || '')) updateTracking(o.id, e.target.value); }}
                        placeholder="กรอก Tracking..."
                        className={`font-mono text-xs border rounded px-2 py-1 w-36 focus:outline-none focus:ring-1 ${isDupTrack ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-300' : 'focus:ring-cyan-300'}`}
                      />
                      {isDupTrack && (
                        <div className="text-[10px] text-red-600 font-bold mt-0.5 flex items-center gap-0.5">
                          ⚠ Track ซ้ำ!
                        </div>
                      )}
                    </td>
                    {/* สถานะออเดอร์ */}
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${status.color}`}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      {/* Modal: จับคู่สินค้า */}
      {showMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-slate-800">จับคู่สินค้า</h3>
              <p className="text-sm text-slate-500 mt-1">
                พบสินค้า <span className="font-semibold text-slate-700">{uniqueRawProds.length}</span> รายการ
                {autoMatched.size > 0 && <span className="ml-2 text-green-600">✓ จับคู่อัตโนมัติ {autoMatched.size} รายการ</span>}
              </p>
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                💡 สินค้าที่มี <code className="bg-blue-100 px-1 rounded">|</code> คือออเดอร์ที่สั่งหลายรายการพร้อมกัน — จับคู่ทีละรายการได้เลย
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {uniqueRawProds.map(rawProd => {
                // นับว่า rawProd นี้พบในกี่ออเดอร์
                const orderCount = importedOrders.filter(o =>
                  String(o.raw_prod).split('|').map((s: string) => s.trim()).includes(rawProd)
                ).length;
                return (
                  <div key={rawProd} className={`rounded-lg border p-3 ${autoMatched.has(rawProd) ? 'border-green-200 bg-green-50' : mappings[rawProd] ? 'border-cyan-200 bg-cyan-50' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {mappings[rawProd] ? <CheckCircle size={15} className="text-green-500 shrink-0"/> : <AlertCircle size={15} className="text-orange-400 shrink-0"/>}
                      <span className="text-sm font-medium text-slate-700 flex-1 min-w-0 truncate">{rawProd}</span>
                      <span className="text-xs text-slate-400 shrink-0">{orderCount} ออเดอร์</span>
                      {autoMatched.has(rawProd) && <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full shrink-0">อัตโนมัติ</span>}
                    </div>
                    <SearchableSelect options={promoOptions} value={mappings[rawProd] || ''} onChange={val => setMappings(prev => ({ ...prev, [rawProd]: val }))} placeholder="ค้นหารหัส หรือชื่อสินค้า..."/>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex gap-3 pt-4 border-t">
              <button onClick={handleMappingComplete} disabled={!allMapped}
                className="flex-1 bg-green-500 text-white py-2.5 rounded-lg hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
                {allMapped ? `ยืนยัน →` : `ยังจับคู่ไม่ครบ (${uniqueRawProds.filter(rp => !mappings[rp]).length} รายการ)`}
              </button>
              <button onClick={() => setShowMapping(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ตรวจสอบ */}
      {showVerify && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <h3 className="text-xl font-bold mb-1">ตรวจสอบข้อมูล ({importedOrders.length} รายการ)</h3>

            {checkingDups && (
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                <RefreshCw size={14} className="animate-spin"/> กำลังตรวจสอบข้อมูลซ้ำ...
              </div>
            )}

            {/* ── ไม่พบลูกค้าในระบบ — ต้องทำ Step 1 ก่อน ── */}
            {missingCustomers.length > 0 && (
              <div className="mb-3 bg-orange-50 border border-orange-400 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-orange-600 shrink-0"/>
                    <span className="font-bold text-orange-700 text-sm">
                      ⚠ ไม่พบลูกค้าในระบบ {missingCustomers.length} รายการ — จะถูกข้ามอัตโนมัติ
                    </span>
                  </div>
                  <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-lg font-medium">
                    กรุณาไปนำเข้าที่ <strong>หน้าลูกค้า (Step 1)</strong> ก่อน
                  </span>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {missingCustomers.map((d, i) => (
                    <div key={i} className="bg-orange-100 rounded-lg px-3 py-2 text-xs text-orange-800 flex items-center gap-3">
                      <span className="font-bold">{d.name}</span>
                      <span className="font-mono text-orange-600">{d.tel}</span>
                      <span className="text-orange-400 text-[10px]">row {d.idx + 2}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ประเด็นที่ 3: Tracking ซ้ำ — แดงเลย ── */}
            {dupTrackings.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-300 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={16} className="text-red-600 shrink-0"/>
                  <span className="font-bold text-red-700 text-sm">⚠ Tracking ซ้ำ {dupTrackings.length} รายการ — จะถูกข้ามอัตโนมัติ</span>
                </div>
                <div className="space-y-1.5">
                  {dupTrackings.map((d, i) => (
                    <div key={i} className="bg-red-100 rounded-lg px-3 py-2 text-xs text-red-800 flex items-start gap-2">
                      <span className="font-mono font-bold shrink-0">{d.tracking_no}</span>
                      <span>ลูกค้า <strong>{d.customer_name}</strong> ซ้ำกับ <strong>{d.existing_customer}</strong> ({d.existing_order_no})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ประเด็นที่ 1: วันที่+ลูกค้าซ้ำ — ถามก่อน ── */}
            {dupOrders.length > 0 && (
              <div className="mb-3 bg-amber-50 border border-amber-300 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0"/>
                  <span className="font-bold text-amber-700 text-sm">ออเดอร์ซ้ำ {dupOrders.length} รายการ (วันที่ + ลูกค้าตรงกับในระบบ)</span>
                </div>
                <div className="space-y-2">
                  {dupOrders.map((d, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-3 ${d.confirmed ? 'bg-green-100 border border-green-300' : 'bg-amber-100 border border-amber-200'}`}>
                      <div className="flex-1">
                        <span className="font-bold text-slate-700">{d.order_date}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span className="font-bold text-slate-700">{d.customer_name}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span className="text-slate-500 truncate">{d.raw_prod}</span>
                      </div>
                      <button
                        onClick={() => setDupOrders(prev => prev.map((x, j) => j === i ? { ...x, confirmed: !x.confirmed } : x))}
                        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition ${d.confirmed ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                        {d.confirmed ? '✓ เพิ่มซ้ำ' : 'ตกลงเพิ่มซ้ำ?'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ประเด็นที่ 2: ลูกค้าเคยสั่งมาก่อน (แจ้งเตือนเฉยๆ) ── */}
            {dupCustomers.length > 0 && (
              <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={16} className="text-blue-500 shrink-0"/>
                  <span className="font-bold text-blue-700 text-sm">ลูกค้าเคยสั่งซื้อมาก่อน {dupCustomers.length} รายการ</span>
                </div>
                <div className="space-y-1.5">
                  {dupCustomers.map((d, i) => (
                    <div key={i} className="bg-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
                      <span className="font-bold">{d.customer_name}</span>
                      <span className="font-mono ml-1">({d.tel || '-'})</span>
                      <span className="text-blue-500 ml-2">เคยสั่ง {d.existing_date} · {d.existing_prod}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ตารางออเดอร์ */}
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">เลขออเดอร์</th>
                    <th className="p-2 text-left">ลูกค้า</th>
                    <th className="p-2 text-left">เบอร์โทร</th>
                    <th className="p-2 text-left">สินค้า</th>
                    <th className="p-2 text-right">ยอด</th>
                    <th className="p-2 text-center">ขนส่ง</th>
                    <th className="p-2 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {importedOrders.slice(0, 100).map((o, i) => {
                    const hasTrack  = o.tracking_no && String(o.tracking_no).length > 3;
                    const isTourist = TOURIST_ZIPS.has(String(o.postal_code));
                    const route     = hasTrack ? 'A' : isTourist ? 'C' : 'B';
                    const isDupOrd  = dupOrders.find(d => d.idx === i);
                    const isDupTrk  = dupTrackings.find(d => d.idx === i);
                    const isDupCust = dupCustomers.find(d => d.idx === i);
                    const isMissing = missingCustomers.find(d => d.idx === i);
                    const rowClass  = isDupTrk
                      ? 'border-b bg-red-50'
                      : isMissing
                        ? 'border-b bg-orange-50'
                        : isDupOrd && !isDupOrd.confirmed
                          ? 'border-b bg-amber-50'
                          : isDupCust
                            ? 'border-b bg-blue-50'
                            : 'border-b';
                    return (
                      <tr key={i} className={rowClass}>
                        <td className="p-2 font-mono text-xs">{String(o.order_no ?? '')}</td>
                        <td className="p-2">
                          <div>{String(o.customer_name ?? '')}</div>
                          {isDupCust && <div className="text-xs text-blue-500">ลูกค้าเก่า</div>}
                        </td>
                        <td className="p-2 font-mono text-xs">{String(o.tel ?? '')}</td>
                        <td className="p-2 max-w-xs truncate text-xs">{String(o.raw_prod ?? '')}</td>
                        <td className="p-2 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${route === 'A' ? 'bg-green-100 text-green-800' : route === 'C' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {route === 'B' ? 'FLASH' : route === 'C' ? 'ไปรษณีย์' : 'มี Track'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          {isDupTrk && <span className="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-bold">Track ซ้ำ!</span>}
                          {isMissing && !isDupTrk && <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold">ไม่พบลูกค้า!</span>}
                          {isDupOrd && !isDupTrk && !isMissing && (
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isDupOrd.confirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isDupOrd.confirmed ? 'จะเพิ่ม' : 'ออเดอร์ซ้ำ'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-3 border-t flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-400">
                {missingCustomers.length > 0 && <span className="text-orange-500 font-bold mr-3">⚠ ไม่พบลูกค้า {missingCustomers.length} (ข้าม)</span>}
                {dupTrackings.length > 0 && <span className="text-red-500 font-bold mr-3">⚠ Track ซ้ำ {dupTrackings.length} จะถูกข้าม</span>}
                {dupOrders.filter(d => !d.confirmed).length > 0 && <span className="text-amber-600 mr-3">ออเดอร์ซ้ำ {dupOrders.filter(d=>!d.confirmed).length} จะถูกข้าม</span>}
                {dupOrders.filter(d => d.confirmed).length > 0 && <span className="text-green-600">ยืนยันเพิ่ม {dupOrders.filter(d=>d.confirmed).length}</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setShowVerify(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
                <button onClick={handleVerifyComplete} disabled={checkingDups}
                  className="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium disabled:opacity-50">
                  ✓ ยืนยันและนำเข้าออเดอร์
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`} style={{minWidth:'280px', maxWidth:'400px'}}>
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base ${
            toast.type === 'success' ? 'bg-emerald-400' : 'bg-red-400'
          }`}>
            {toast.type === 'success' ? '✓' : '✕'}
          </div>
          <span className="flex-1 leading-snug">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}
    </div>
  );
}
