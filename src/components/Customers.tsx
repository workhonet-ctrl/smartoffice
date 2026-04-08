import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Users, TrendingUp, ShoppingBag, ChevronDown, ChevronRight, X, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

type Customer = {
  id: string; name: string; facebook_name: string | null; tel: string;
  address: string | null; subdistrict: string | null; district: string | null;
  province: string | null; postal_code: string | null;
  channel: string | null; payment_method: string | null;
  tag: string | null; order_count: number; total_spent: number;
  created_at: string; updated_at: string;
};
type Order = {
  id: string; order_no: string; order_date: string; raw_prod: string | null;
  total_thb: number; order_status: string; tracking_no: string | null;
};

const TAG_COLORS: Record<string, string> = {
  'VIP':    'bg-amber-100 text-amber-800',
  'ประจำ':  'bg-purple-100 text-purple-700',
  'ใหม่':   'bg-blue-100 text-blue-700',
};

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
const fmt2 = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Customers() {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [search, setSearch]         = useState('');
  const [tagFilter, setTagFilter]   = useState('ทั้งหมด');
  const [sortBy, setSortBy]         = useState<'total_spent' | 'order_count' | 'updated_at'>('total_spent');
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [custOrders, setCustOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editTag, setEditTag]       = useState<{id: string; tag: string} | null>(null);
  const [importing, setImporting]   = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success'|'error' } | null>(null);
  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order(sortBy, { ascending: false });
    if (data) setCustomers(data);
    setLoading(false);
  };

  useEffect(() => { loadCustomers(); }, [sortBy]);

  const loadOrders = async (customerId: string) => {
    setLoadingOrders(true);
    const { data } = await supabase.from('orders')
      .select('id, order_no, order_date, raw_prod, total_thb, order_status, tracking_no')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false });
    if (data) setCustOrders(data);
    setLoadingOrders(false);
  };

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); setCustOrders([]); }
    else { setExpanded(id); loadOrders(id); }
  };

  const saveTag = async () => {
    if (!editTag) return;
    await supabase.from('customers').update({ tag: editTag.tag, tag_manual: true }).eq('id', editTag.id);
    setCustomers(p => p.map(c => c.id === editTag.id ? { ...c, tag: editTag.tag } : c));
    setEditTag(null);
  };

  // ── นำเข้า Excel — Step 1 ──────────────────────────────────────────────
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as Array<Array<string|number>>;

      let added = 0, updated = 0, skipped = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]; if (!row[6]) continue; // ต้องมีเบอร์โทร
        const tel = String(row[6] || '').trim();
        if (!tel) { skipped++; continue; }

        const payload = {
          name:          String(row[4]  || '').trim(),
          facebook_name: String(row[5]  || '').trim() || null,
          tel,
          address:       String(row[7]  || '').trim() || null,
          subdistrict:   String(row[8]  || '').trim() || null,
          district:      String(row[9]  || '').trim() || null,
          province:      String(row[10] || '').trim() || null,
          postal_code:   String(row[11] || '').trim() || null,
          channel:       String(row[2]  || '').trim() || null,
        };
        if (!payload.name) { skipped++; continue; }

        // ค้นหาด้วยเบอร์โทร
        const { data: existing } = await supabase
          .from('customers').select('id').eq('tel', tel).maybeSingle();

        if (existing?.id) {
          await supabase.from('customers').update(payload).eq('id', existing.id);
          updated++;
        } else {
          const { error } = await supabase.from('customers').insert([{ ...payload, tag: 'ใหม่' }]);
          if (error) { skipped++; } else { added++; }
        }
      }
      setImportResult({ added, updated, skipped });
      showToast(`✓ เพิ่มใหม่ ${added} · อัพเดต ${updated} · ข้าม ${skipped}`);
      loadCustomers();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
    } finally { setImporting(false); e.target.value = ''; }
  };

  const filtered = customers.filter(c => {
    const matchTag = tagFilter === 'ทั้งหมด' || c.tag === tagFilter;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
      || (c.facebook_name || '').toLowerCase().includes(search.toLowerCase())
      || c.tel.includes(search)
      || (c.province || '').includes(search);
    return matchTag && matchSearch;
  });

  // สถิติสรุป
  const vipCount    = customers.filter(c => c.tag === 'VIP').length;
  const regularCount = customers.filter(c => c.tag === 'ประจำ').length;
  const totalSpent  = customers.reduce((s, c) => s + Number(c.total_spent), 0);
  const topChannel  = (() => {
    const freq: Record<string, number> = {};
    customers.forEach(c => { if (c.channel) freq[c.channel] = (freq[c.channel] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
  })();

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center">
            <Users size={20} className="text-white"/>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-800">ลูกค้า</h2>
              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold">Step 1</span>
            </div>
            <p className="text-xs text-slate-400">{customers.length} คน · นำเข้าก่อน แล้วไปหน้าออเดอร์ Step 2</p>
          </div>
        </div>
        {/* ปุ่ม นำเข้า Excel */}
        <div className="flex items-center gap-3">
          {importResult && (
            <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✓ เพิ่มใหม่ <strong>{importResult.added}</strong> · อัพเดต <strong>{importResult.updated}</strong>
              {importResult.skipped > 0 && <span className="text-slate-400"> · ข้าม {importResult.skipped}</span>}
            </div>
          )}
          <label className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold cursor-pointer shadow-sm transition
            ${importing ? 'bg-slate-200 text-slate-400' : 'bg-cyan-500 text-white hover:bg-cyan-600'}`}>
            <Upload size={16}/>
            {importing ? 'กำลังนำเข้า...' : '📥 นำเข้า Excel (Step 1)'}
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={handleImportExcel} disabled={importing}/>
          </label>
        </div>
      </div>

      {/* KPI */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-amber-600 mb-1">VIP</div>
          <div className="text-2xl font-bold text-amber-700">{vipCount}</div>
          <div className="text-xs text-amber-500">10+ ออเดอร์</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-purple-600 mb-1">ลูกค้าประจำ</div>
          <div className="text-2xl font-bold text-purple-700">{regularCount}</div>
          <div className="text-xs text-purple-500">3–9 ออเดอร์</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-emerald-600 mb-1">ยอดซื้อรวม</div>
          <div className="text-lg font-bold text-emerald-700">฿{fmt(totalSpent)}</div>
          <div className="text-xs text-emerald-500">ทุกลูกค้า</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-blue-600 mb-1">เพจยอดนิยม</div>
          <div className="text-sm font-bold text-blue-700 truncate">{topChannel}</div>
          <div className="text-xs text-blue-500">ช่องทางหลัก</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, เฟสบุ๊ก, เบอร์, จังหวัด..."
            className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {['ทั้งหมด','VIP','ประจำ','ใหม่'].map(t => (
            <button key={t} onClick={() => setTagFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tagFilter===t?'bg-white shadow text-slate-800':'text-slate-500'}`}>{t}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">
          <option value="total_spent">เรียงตามยอดซื้อ</option>
          <option value="order_count">เรียงตามจำนวนครั้ง</option>
          <option value="updated_at">เรียงตามล่าสุด</option>
        </select>
        <span className="text-xs text-slate-400">{filtered.length} คน</span>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'800px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8"/>
              <th className="p-3 text-left">ชื่อลูกค้า</th>
              <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
              <th className="p-3 text-left whitespace-nowrap">จังหวัด</th>
              <th className="p-3 text-left whitespace-nowrap">ช่องทาง</th>
              <th className="p-3 text-center whitespace-nowrap">ออเดอร์</th>
              <th className="p-3 text-right whitespace-nowrap">ยอดรวม (฿)</th>
              <th className="p-3 text-center whitespace-nowrap">แท็ก</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่พบลูกค้า</td></tr>}
            {filtered.map(c => (
              <>
                <tr key={c.id} onClick={() => toggleExpand(c.id)}
                  className={`border-b cursor-pointer hover:bg-cyan-50 transition ${expanded===c.id?'bg-cyan-50':''}`}>
                  <td className="p-3 text-center text-slate-400">
                    {expanded===c.id ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{c.name}</div>
                    {c.facebook_name && c.facebook_name !== c.name && (
                      <div className="text-xs text-slate-400">{c.facebook_name}</div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-600">{c.tel}</td>
                  <td className="p-3 text-xs text-slate-500">{c.province || '-'}</td>
                  <td className="p-3 text-xs text-slate-500 max-w-[120px] truncate">{c.channel || '-'}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-xs font-bold">{c.order_count}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-emerald-600">฿{fmt2(Number(c.total_spent))}</td>
                  <td className="p-3 text-center">
                    <button onClick={e => { e.stopPropagation(); setEditTag({id:c.id, tag:c.tag||'ใหม่'}); }}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer hover:opacity-80 ${TAG_COLORS[c.tag||'ใหม่'] || 'bg-slate-100 text-slate-600'}`}>
                      {c.tag || 'ใหม่'}
                    </button>
                  </td>
                </tr>

                {/* ExpandedRow: รายละเอียด + ประวัติออเดอร์ */}
                {expanded === c.id && (
                  <tr key={`${c.id}-detail`}>
                    <td colSpan={8} className="bg-cyan-50 px-6 py-4 border-b">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">ที่อยู่</div>
                          <div className="text-xs text-slate-700">{[c.address, c.subdistrict, c.district, c.province, c.postal_code].filter(Boolean).join(' ') || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">ช่องทาง</div>
                          <div className="text-xs text-slate-700">{c.channel || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">วิธีชำระ</div>
                          <div className="text-xs text-slate-700">{c.payment_method || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">ลูกค้าตั้งแต่</div>
                          <div className="text-xs text-slate-700">{new Date(c.created_at).toLocaleDateString('th-TH')}</div>
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">ประวัติออเดอร์</div>
                      {loadingOrders ? (
                        <div className="text-xs text-slate-400">กำลังโหลด...</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-auto">
                          {custOrders.length === 0 && <div className="text-xs text-slate-400">ยังไม่มีออเดอร์</div>}
                          {custOrders.map(o => (
                            <div key={o.id} className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-2">
                              <span className="font-mono text-cyan-600 w-32 shrink-0">{o.order_no}</span>
                              <span className="text-slate-400 w-20 shrink-0">{o.order_date}</span>
                              <span className="text-slate-600 flex-1 truncate">{o.raw_prod || '-'}</span>
                              <span className="font-bold text-emerald-600 shrink-0">฿{fmt2(Number(o.total_thb))}</span>
                              <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                o.order_status === 'แพ็คสินค้า' ? 'bg-teal-100 text-teal-700' :
                                o.order_status === 'รอแพ็ค' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-slate-100 text-slate-500'}`}>{o.order_status}</span>
                              {o.tracking_no && <span className="font-mono text-xs text-blue-500 shrink-0">{o.tracking_no}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal แก้ tag */}
      {editTag && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-xs w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">เปลี่ยนแท็กลูกค้า</h3>
              <button onClick={() => setEditTag(null)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-2 mb-4">
              {['VIP','ประจำ','ใหม่'].map(t => (
                <button key={t} onClick={() => setEditTag(p => p ? {...p, tag:t} : null)}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium border transition ${editTag.tag===t?'border-cyan-400 bg-cyan-50 text-cyan-700':'border-slate-200 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditTag(null)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={saveTag} className="flex-1 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
