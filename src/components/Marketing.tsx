import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import GraphicBoard from './GraphicBoard';
import GraphicTasks from './GraphicTasks';
import GraphicBrief from './GraphicBrief';
import GraphicAssets from './GraphicAssets';
import MarketingAds from './MarketingAds';
import Products from './Products';

type MarketingPage = 'graphic' | 'ads' | 'admin';
type GraphicSub = 'board' | 'tasks' | 'brief' | 'assets';
type AdsSub = 'board' | 'report' | 'add-product' | 'product-list' | 'expense-receipt' | 'expense-daily';

// ── ADS Sub-menu ──────────────────────────────────────────────────────────
const ADS_MENU: { key: AdsSub; label: string; emoji: string; group?: string }[] = [
  { key: 'board',            label: 'Board & รายการงาน',      emoji: '📊' },
  { key: 'report',           label: 'รายงานการยิงโฆษณา',     emoji: '📈' },
  { key: 'add-product',      label: 'เพิ่มสินค้า',            emoji: '➕', group: 'สินค้า' },
  { key: 'product-list',     label: 'รายการสินค้า',           emoji: '📋', group: 'สินค้า' },
  { key: 'expense-receipt',  label: 'ใบเสร็จค่าโฆษณา',       emoji: '🧾', group: 'ลงค่าโฆษณา' },
  { key: 'expense-daily',    label: 'ลงโฆษณารายวัน',          emoji: '📅', group: 'ลงค่าโฆษณา' },
];

const GRAPHIC_SUBS: { key: GraphicSub; label: string; emoji: string }[] = [
  { key: 'board',  label: 'Board',          emoji: '📊' },
  { key: 'tasks',  label: 'รายการงาน',      emoji: '📋' },
  { key: 'brief',  label: 'สร้างงาน/Brief', emoji: '🆕' },
  { key: 'assets', label: 'คลัง Assets',    emoji: '🖼️' },
];

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">🚧</div>
        <p className="text-slate-600 font-semibold text-lg">{title}</p>
        <p className="text-sm text-slate-400 mt-1">อยู่ระหว่างออกแบบ</p>
      </div>
    </div>
  );
}

export default function Marketing({ page }: { page: MarketingPage }) {
  if (page === 'graphic') return <GraphicModule />;
  if (page === 'ads')     return <AdsModule />;
  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <Placeholder title="แอดมิน" />
    </div>
  );
}

// ── ADS Module ────────────────────────────────────────────────────────────
function AdsModule() {
  const [sub, setSub] = useState<AdsSub>('board');

  const groups = ['', 'สินค้า', 'ลงค่าโฆษณา'];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 shrink-0 bg-slate-900 flex flex-col py-4">
        <div className="px-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center text-white font-bold text-sm">A</div>
            <div>
              <div className="text-white text-sm font-bold leading-tight">โฆษณา ADS</div>
              <div className="text-slate-400 text-[10px]">ฝ่ายการตลาด</div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {groups.map(group => {
            const items = ADS_MENU.filter(m => (m.group || '') === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                {group && (
                  <div className="px-2 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{group}</div>
                )}
                {items.map(item => (
                  <button key={item.key} onClick={() => setSub(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition mb-0.5 text-left
                      ${sub === item.key
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                    <span style={{ fontSize: '14px' }}>{item.emoji}</span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 pb-2">
        {sub === 'board'           && <MarketingAds />}
        {sub === 'report'          && <AdsReport />}
        {sub === 'add-product'     && <Products />}
        {sub === 'product-list'    && <AdsProductList />}
        {sub === 'expense-receipt' && <AdsExpenseReceipt />}
        {sub === 'expense-daily'   && <AdsExpenseDaily />}
      </div>
    </div>
  );
}

// ── รายงานการยิงโฆษณา (placeholder) ─────────────────────────────────────
function AdsReport() {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mb-4">
        <h2 className="text-xl font-bold text-slate-800">📈 รายงานการยิงโฆษณา</h2>
        <p className="text-xs text-slate-400 mt-0.5">สรุปผลลัพธ์การโฆษณา · Reach · Click · ROAS</p>
      </div>
      <Placeholder title="รายงานการยิงโฆษณา" />
    </div>
  );
}

// ── รายการสินค้า ADS ─────────────────────────────────────────────────────
type PromoRow = {
  id: string; name: string; short_name: string | null;
  price_thb: number; active: boolean;
  products_master: { name: string; weight_g: number } | null;
};

function AdsProductList() {
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kpiMap, setKpiMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from('products_promo')
      .select('id, name, short_name, price_thb, active, products_master(name, weight_g)')
      .eq('active', true).order('id')
      .then(({ data }) => { if (data) setPromos(data as any); setLoading(false); });
  }, []);

  const filtered = promos.filter(p =>
    !search || p.id.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.short_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📋 รายการสินค้า</h2>
          <p className="text-xs text-slate-400 mt-0.5">ดึงจากรายการสินค้าทั้งหมด · {promos.length} รายการ</p>
        </div>
        <div className="relative w-60">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหารหัส / ชื่อสินค้า..."
            className="pl-8 pr-4 py-2 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-300"/>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full">
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">รหัส</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อสั้น</th>
              <th className="p-3 text-left">ชื่อโปร / ชื่อสินค้า</th>
              <th className="p-3 text-center whitespace-nowrap">น้ำหนัก (g)</th>
              <th className="p-3 text-right whitespace-nowrap">ราคาขาย (฿)</th>
              <th className="p-3 text-center whitespace-nowrap w-40">KPI</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ไม่พบสินค้า</td></tr>}
            {filtered.map(p => (
              <tr key={p.id} className="border-b hover:bg-purple-50 transition">
                <td className="p-3 font-mono text-xs text-purple-700 font-bold whitespace-nowrap">{p.id}</td>
                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{p.short_name || '-'}</td>
                <td className="p-3">
                  <div className="font-medium text-slate-800 text-sm">{p.name}</div>
                  {(p as any).products_master?.name && (
                    <div className="text-xs text-slate-400 mt-0.5">{(p as any).products_master.name}</div>
                  )}
                </td>
                <td className="p-3 text-center text-xs text-slate-500">
                  {(p as any).products_master?.weight_g || '-'}
                </td>
                <td className="p-3 text-right font-bold text-emerald-600">
                  ฿{Number(p.price_thb).toLocaleString()}
                </td>
                <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                  <input
                    value={kpiMap[p.id] || ''}
                    onChange={e => setKpiMap(prev => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="กรอก KPI..."
                    className="w-full border rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-300"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ใบเสร็จค่าโฆษณา ──────────────────────────────────────────────────────
function AdsExpenseReceipt() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fDate, setFDate]       = useState(new Date().toISOString().split('T')[0]);
  const [fChannel, setFChannel] = useState('Facebook');
  const [fAmount, setFAmount]   = useState('');
  const [fNote, setFNote]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('finance_expense')
      .select('*').eq('category', 'ค่าโฆษณา')
      .order('expense_date', { ascending: false });
    if (data) setReceipts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!fAmount) return;
    setSaving(true);
    await supabase.from('finance_expense').insert([{
      category: 'ค่าโฆษณา',
      description: fNote || `ค่าโฆษณา ${fChannel}`,
      amount_thb: Number(fAmount),
      expense_date: fDate,
      channel: fChannel,
    }]);
    setSaving(false);
    setShowForm(false);
    setFAmount(''); setFNote('');
    load();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">🧾 ใบเสร็จค่าโฆษณา</h2>
          <p className="text-xs text-slate-400 mt-0.5">บันทึกรายจ่ายค่าโฆษณาทั้งหมด</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium flex items-center gap-2">
          + เพิ่มใบเสร็จ
        </button>
      </div>
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full">
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">วันที่</th>
              <th className="p-3 text-left whitespace-nowrap">ช่องทาง</th>
              <th className="p-3 text-left">รายละเอียด</th>
              <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && receipts.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">ยังไม่มีรายการ</td></tr>}
            {receipts.map(r => (
              <tr key={r.id} className="border-b hover:bg-purple-50">
                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.expense_date}</td>
                <td className="p-3 text-xs">
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">{r.channel || '-'}</span>
                </td>
                <td className="p-3 text-xs text-slate-600">{r.description || '-'}</td>
                <td className="p-3 text-right font-bold text-red-600">฿{Number(r.amount_thb).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">เพิ่มใบเสร็จค่าโฆษณา</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ยอด (฿) *</label>
                  <input type="number" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ช่องทาง</label>
                <select value={fChannel} onChange={e => setFChannel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                  {['Facebook', 'Instagram', 'TikTok', 'LINE OA', 'Google', 'Shopee', 'Lazada', 'อื่นๆ'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="รายละเอียด..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fAmount || saving}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ลงโฆษณารายวัน ────────────────────────────────────────────────────────
function AdsExpenseDaily() {
  const [records, setRecords]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo]     = useState(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [fDate, setFDate]       = useState(new Date().toISOString().split('T')[0]);
  const [fChannel, setFChannel] = useState('Facebook');
  const [fReach, setFReach]     = useState('');
  const [fClick, setFClick]     = useState('');
  const [fSpend, setFSpend]     = useState('');
  const [fRevenue, setFRevenue] = useState('');
  const [fNote, setFNote]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('finance_expense')
      .select('*').eq('category', 'ค่าโฆษณารายวัน')
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
      .order('expense_date', { ascending: false });
    if (data) setRecords(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const handleSave = async () => {
    if (!fSpend) return;
    setSaving(true);
    const meta = JSON.stringify({ reach: fReach, click: fClick, revenue: fRevenue });
    await supabase.from('finance_expense').insert([{
      category: 'ค่าโฆษณารายวัน',
      description: fNote || `โฆษณา ${fChannel} ${fDate}`,
      amount_thb: Number(fSpend),
      expense_date: fDate, channel: fChannel,
      notes: meta,
    }]);
    setSaving(false); setShowForm(false);
    setFReach(''); setFClick(''); setFSpend(''); setFRevenue(''); setFNote('');
    load();
  };

  const totSpend   = records.reduce((s, r) => s + Number(r.amount_thb), 0);
  const totRevenue = records.reduce((s, r) => { try { return s + Number(JSON.parse(r.notes || '{}').revenue || 0); } catch { return s; } }, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📅 ลงโฆษณารายวัน</h2>
          <p className="text-xs text-slate-400 mt-0.5">บันทึก Reach · Click · ยอดใช้จ่าย · รายรับ</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          <span className="text-slate-400">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium">
            + บันทึก
          </button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="shrink-0 grid grid-cols-3 gap-3 mb-3">
        <div className="bg-red-50 rounded-xl p-3 border border-red-100">
          <div className="text-xs text-red-500 font-semibold mb-1">ค่าโฆษณารวม</div>
          <div className="text-xl font-bold text-red-600">฿{totSpend.toLocaleString()}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
          <div className="text-xs text-emerald-600 font-semibold mb-1">รายรับที่ได้</div>
          <div className="text-xl font-bold text-emerald-600">฿{totRevenue.toLocaleString()}</div>
        </div>
        <div className={`rounded-xl p-3 border ${totRevenue-totSpend >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-orange-50 border-orange-100'}`}>
          <div className={`text-xs font-semibold mb-1 ${totRevenue-totSpend >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>กำไร / ขาดทุน</div>
          <div className={`text-xl font-bold ${totRevenue-totSpend >= 0 ? 'text-teal-600' : 'text-orange-600'}`}>
            {totRevenue-totSpend >= 0 ? '+' : ''}฿{(totRevenue-totSpend).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{ minWidth: '700px' }}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">วันที่</th>
              <th className="p-3 text-left whitespace-nowrap">ช่องทาง</th>
              <th className="p-3 text-right whitespace-nowrap">Reach</th>
              <th className="p-3 text-right whitespace-nowrap">Click</th>
              <th className="p-3 text-right whitespace-nowrap">ค่าโฆษณา (฿)</th>
              <th className="p-3 text-right whitespace-nowrap">รายรับ (฿)</th>
              <th className="p-3 text-left whitespace-nowrap">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && records.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ยังไม่มีรายการ</td></tr>}
            {records.map(r => {
              let meta: any = {};
              try { meta = JSON.parse(r.notes || '{}'); } catch { /* ignore */ }
              return (
                <tr key={r.id} className="border-b hover:bg-purple-50">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.expense_date}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">{r.channel || '-'}</span>
                  </td>
                  <td className="p-3 text-right text-xs text-slate-600">{meta.reach ? Number(meta.reach).toLocaleString() : '-'}</td>
                  <td className="p-3 text-right text-xs text-slate-600">{meta.click ? Number(meta.click).toLocaleString() : '-'}</td>
                  <td className="p-3 text-right font-bold text-red-600">฿{Number(r.amount_thb).toLocaleString()}</td>
                  <td className="p-3 text-right font-bold text-emerald-600">{meta.revenue ? `฿${Number(meta.revenue).toLocaleString()}` : '-'}</td>
                  <td className="p-3 text-xs text-slate-400 max-w-[150px] truncate">{r.description || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">บันทึกโฆษณารายวัน</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ช่องทาง</label>
                  <select value={fChannel} onChange={e => setFChannel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                    {['Facebook', 'Instagram', 'TikTok', 'LINE OA', 'Google', 'อื่นๆ'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Reach</label>
                  <input type="number" value={fReach} onChange={e => setFReach(e.target.value)} placeholder="จำนวนคนเห็น"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Click</label>
                  <input type="number" value={fClick} onChange={e => setFClick(e.target.value)} placeholder="จำนวนคลิก"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ค่าโฆษณา (฿) *</label>
                  <input type="number" value={fSpend} onChange={e => setFSpend(e.target.value)} placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">รายรับที่ได้ (฿)</label>
                  <input type="number" value={fRevenue} onChange={e => setFRevenue(e.target.value)} placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="เช่น ยิงโฆษณาโปรแลก..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fSpend || saving}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Graphic Module ────────────────────────────────────────────────────────
function GraphicModule() {
  const [sub, setSub] = useState<GraphicSub>('board');
  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <div className="shrink-0 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center text-white font-bold text-lg">G</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">ฝ่ายการตลาด / กราฟฟิก</h2>
          <p className="text-xs text-slate-400">จัดการงานกราฟฟิก · Brief · Assets</p>
        </div>
      </div>
      <div className="shrink-0 flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4">
        {GRAPHIC_SUBS.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap
              ${sub === s.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            <span style={{ fontSize: '14px' }}>{s.emoji}</span> {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === 'board'  && <GraphicBoard />}
        {sub === 'tasks'  && <GraphicTasks onCreateNew={() => setSub('brief')} />}
        {sub === 'brief'  && <GraphicBrief onCreated={() => setSub('board')} />}
        {sub === 'assets' && <GraphicAssets />}
      </div>
    </div>
  );
}
