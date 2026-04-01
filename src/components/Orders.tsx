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
  if (s === 'ส่งแฟลช')     return { label: 'ส่งแฟลช',     color: 'bg-yellow-100 text-yellow-800' };
  if (s === 'ส่งไปรษณีย์') return { label: 'ส่งไปรษณีย์', color: 'bg-purple-100 text-purple-800' };
  if (order.tracking_no)    return { label: 'ส่งสินค้าแล้ว', color: 'bg-green-100 text-green-800' };
  return { label: 'รอแพ็ค', color: 'bg-yellow-100 text-yellow-700' };
}

// ── helper: ขนส่ง label ──
function getCarrierLabel(route: string | null) {
  if (route === 'B') return { label: 'FLASH',    color: 'bg-yellow-100 text-yellow-800' };
  if (route === 'C') return { label: 'ไปรษณีย์', color: 'bg-purple-100 text-purple-800' };
  if (route === 'A') return { label: 'มี Track',  color: 'bg-green-100 text-green-700' };
  return { label: '-', color: 'bg-slate-100 text-slate-500' };
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // filter วันที่
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);
  const [importedOrders, setImportedOrders] = useState<Array<Record<string, unknown>>>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [promoOptions, setPromoOptions] = useState<PromoOption[]>([]);
  const [autoMatched, setAutoMatched] = useState<Set<string>>(new Set());
  // map promo_id → {short_name, name} สำหรับแสดงในตาราง
  const [promoMap, setPromoMap] = useState<Record<string, { short_name: string | null; name: string }>>({});
  // Toast notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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
          customer_name: String(row[4] || ''), tel: String(row[6] || ''),
          address: String(row[7] || ''), subdistrict: String(row[8] || ''),
          district: String(row[9] || ''), province: String(row[10] || ''),
          postal_code: String(row[11] || ''), raw_prod: String(row[14] || ''),
          // quantities — เก็บ string ต้นฉบับ "1|2|1" และคำนวณ total
          quantities: String(row[15] || '1'),
          quantity: String(row[15] || '1').split('|').reduce((s, n) => s + (Number(n.trim()) || 1), 0),
          weight_kg: (Number(row[16]) || 0) / 1000,
          tracking_no: String(row[17] || ''), total_thb: Number(row[21]) || 0,
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

  const handleMappingComplete = async () => {
    for (const rawName in mappings) {
      if (!mappings[rawName]) continue;
      const { data: ex } = await supabase.from('product_mappings').select('id').eq('raw_name', rawName).maybeSingle();
      if (!ex) await supabase.from('product_mappings').insert([{ raw_name: rawName, promo_id: mappings[rawName] }]);
      else await supabase.from('product_mappings').update({ promo_id: mappings[rawName] }).eq('raw_name', rawName);
    }
    setShowMapping(false); setShowVerify(true);
  };

  const handleVerifyComplete = async () => {
    let ok = 0, skip = 0, fail = 0;
    const errors: string[] = [];

    for (const order of importedOrders) {
      try {
        // หาลูกค้าจากเบอร์โทร
        let customerId: string | undefined;
        const { data: cust } = await supabase
          .from('customers').select('id').eq('tel', String(order.tel)).maybeSingle();

        if (cust?.id) {
          // มีลูกค้าอยู่แล้ว — อัพเดตที่อยู่
          customerId = cust.id;
          await supabase.from('customers').update({
            name: order.customer_name, address: order.address,
            subdistrict: order.subdistrict, district: order.district,
            province: order.province, postal_code: order.postal_code,
          }).eq('id', cust.id);
        } else {
          // ลูกค้าใหม่ — insert
          const { data: nc, error: ce } = await supabase.from('customers').insert([{
            name: order.customer_name, tel: String(order.tel),
            address: order.address, subdistrict: order.subdistrict,
            district: order.district, province: order.province,
            postal_code: order.postal_code, channel: order.channel, tag: 'ใหม่',
          }]).select('id').single();
          if (ce) {
            errors.push(`customer: ${order.customer_name} — ${ce.message}`);
            fail++; continue;
          }
          customerId = nc?.id;
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
        const orderStatus = hasTrack ? 'ส่งสินค้าแล้ว' : 'รอแพ็ค';

        const { error: oe } = await supabase.from('orders').insert([{
          order_no: String(order.order_no), customer_id: customerId, channel: order.channel,
          order_date: order.order_date, order_time: order.order_time || null,
          raw_prod: order.raw_prod, promo_ids: promoIds,
          quantity: order.quantity,
          quantities: String(order.quantities || order.quantity || '1'),
          weight_kg: order.weight_kg,
          tracking_no: hasTrack ? order.tracking_no : null,
          total_thb: order.total_thb, payment_method: order.payment_method,
          payment_status: order.payment_status, order_status: orderStatus, route,
        }]);

        if (oe) {
          if (oe.code === '23505') { skip++; }  // ออเดอร์ซ้ำ — ข้าม
          else { errors.push(`order ${order.order_no}: ${oe.message}`); fail++; }
        } else { ok++; }

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
    setShowVerify(false); setImportedOrders([]); setMappings({}); setAutoMatched(new Set()); loadOrders();
  };

  // อัพเดต tracking → อัพเดต order_status อัตโนมัติ
  const updateTracking = async (orderId: string, tracking: string) => {
    const newStatus = tracking.trim().length > 3 ? 'ส่งสินค้าแล้ว' : 'รอแพ็ค';
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

  // filter ด้วย search + วันที่
  const filtered = orders.filter(o => {
    // search
    if (search) {
      const q = search.toLowerCase();
      const matchSearch = o.order_no?.toLowerCase().includes(q) ||
        o.customers?.name?.toLowerCase().includes(q) ||
        o.customers?.tel?.includes(q) ||
        o.raw_prod?.toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    // วันที่ — อ้างอิง order_date หรือ created_at
    const orderDay = o.order_date || o.created_at?.split('T')[0];
    if (dateFrom && orderDay && orderDay < dateFrom) return false;
    if (dateTo   && orderDay && orderDay > dateTo)   return false;
    return true;
  });

  if (loading) return <div className="p-6 flex items-center gap-2 text-slate-500"><RefreshCw size={16} className="animate-spin"/>กำลังโหลด...</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">จัดการออเดอร์</h2>
            <p className="text-sm text-slate-500 mt-0.5">{filtered.length} รายการ</p>
          </div>
          <label className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap self-start">
            <Upload size={17}/> นำเข้า Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden"/>
          </label>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border px-4 py-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา ออเดอร์ / ลูกค้า / เบอร์..."
              className="pl-9 pr-4 py-1.5 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
          </div>

          {/* วันที่ From */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 whitespace-nowrap">วันที่</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
            <span className="text-slate-400">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
          </div>

          {/* Shortcut buttons */}
          <div className="flex gap-1.5">
            {[
              { label: 'วันนี้',     from: today, to: today },
              { label: '7 วัน',     from: new Date(Date.now() - 6*86400000).toISOString().split('T')[0], to: today },
              { label: '30 วัน',    from: new Date(Date.now() - 29*86400000).toISOString().split('T')[0], to: today },
              { label: 'ทั้งหมด',   from: '', to: '' },
            ].map(btn => (
              <button key={btn.label}
                onClick={() => { setDateFrom(btn.from); setDateTo(btn.to); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  dateFrom === btn.from && dateTo === btn.to
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-200 text-xs">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">วันที่สั่งซื้อ</th>
                <th className="p-3 text-left whitespace-nowrap">เลขออเดอร์</th>
                <th className="p-3 text-left">ลูกค้า</th>
                <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
                <th className="p-3 text-left whitespace-nowrap">ที่อยู่</th>
                <th className="p-3 text-center whitespace-nowrap">ไปรษณีย์</th>
                <th className="p-3 text-left">สินค้า</th>
                <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
                <th className="p-3 text-center whitespace-nowrap">ขนส่ง</th>
                <th className="p-3 text-center whitespace-nowrap">สถานะชำระ</th>
                <th className="p-3 text-left whitespace-nowrap">Tracking</th>
                <th className="p-3 text-center whitespace-nowrap">สถานะออเดอร์</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-slate-400">ยังไม่มีออเดอร์ — กด "นำเข้า Excel" เพื่อเริ่ม</td></tr>
              )}
              {filtered.map(o => {
                const carrier = getCarrierLabel(o.route);
                const status  = getAutoStatus(o);
                return (
                  <tr key={o.id} className="border-b hover:bg-slate-50">
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${carrier.color}`}>{carrier.label}</span>
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
                        className="font-mono text-xs border rounded px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-cyan-300"
                      />
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
            <h3 className="text-xl font-bold mb-4">ตรวจสอบข้อมูล ({importedOrders.length} รายการ)</h3>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">เลขออเดอร์</th>
                    <th className="p-2 text-left">ลูกค้า</th>
                    <th className="p-2 text-left">เบอร์โทร</th>
                    <th className="p-2 text-left">สินค้า</th>
                    <th className="p-2 text-right">ยอด</th>
                    <th className="p-2 text-center">ขนส่ง</th>
                  </tr>
                </thead>
                <tbody>
                  {importedOrders.slice(0, 100).map((o, i) => {
                    const hasTrack = o.tracking_no && String(o.tracking_no).length > 3;
                    const isTourist = TOURIST_ZIPS.has(String(o.postal_code));
                    const route = hasTrack ? 'A' : isTourist ? 'C' : 'B';
                    return (
                      <tr key={i} className={'border-b ' + (isTourist ? 'bg-blue-50' : '')}>
                        <td className="p-2 font-mono text-xs">{String(o.order_no ?? '')}</td>
                        <td className="p-2">{String(o.customer_name ?? '')}</td>
                        <td className="p-2 font-mono text-xs">{String(o.tel ?? '')}</td>
                        <td className="p-2 max-w-xs truncate text-xs">{String(o.raw_prod ?? '')}</td>
                        <td className="p-2 text-right font-bold">฿{Number(o.total_thb).toLocaleString()}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${route === 'A' ? 'bg-green-100 text-green-800' : route === 'C' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {route === 'B' ? 'FLASH' : route === 'C' ? 'ไปรษณีย์' : 'มี Track'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex gap-3 pt-4 border-t">
              <button onClick={handleVerifyComplete} className="flex-1 bg-blue-500 text-white py-2.5 rounded-lg hover:bg-blue-600 font-medium">✓ ยืนยันและนำเข้าออเดอร์</button>
              <button onClick={() => setShowVerify(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
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
