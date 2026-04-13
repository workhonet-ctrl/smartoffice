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
type AdsSub = 'board' | 'report' | 'add-product' | 'product-list' | 'expense-receipt' | 'expense-daily' | 'data';

// ── ADS Sub-menu ──────────────────────────────────────────────────────────
const ADS_MENU: { key: AdsSub; label: string; emoji: string; group?: string }[] = [
  { key: 'board',            label: 'Board & รายการงาน',      emoji: '📊' },
  { key: 'report',           label: 'รายงานการยิงโฆษณา',     emoji: '📈' },
  { key: 'add-product',      label: 'เพิ่มสินค้า',            emoji: '➕', group: 'สินค้า' },
  { key: 'product-list',     label: 'รายการสินค้า',           emoji: '📋', group: 'สินค้า' },
  { key: 'expense-receipt',  label: 'ใบเสร็จค่าโฆษณา',       emoji: '🧾', group: 'ลงค่าโฆษณา' },
  { key: 'expense-daily',    label: 'ลงโฆษณารายวัน',          emoji: '📅', group: 'ลงค่าโฆษณา' },
  { key: 'data',             label: 'DATA',                   emoji: '🗂️', group: 'จัดการข้อมูล' },
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

  const groups = ['', 'สินค้า', 'ลงค่าโฆษณา', 'จัดการข้อมูล'];

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
        {sub === 'data'            && <AdsData />}
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
  const [saving, setSaving]     = useState(false);

  // form fields
  const [fDate,    setFDate]    = useState(new Date().toISOString().split('T')[0]);
  const [fAdName,  setFAdName]  = useState('');
  const [fPage,    setFPage]    = useState('');
  const [fSpend,   setFSpend]   = useState('');

  // excel import state
  const [showImport,   setShowImport]   = useState(false);
  const [xlsHeaders,   setXlsHeaders]   = useState<string[]>([]);
  const [xlsRows,      setXlsRows]      = useState<any[][]>([]);
  const [importing,    setImporting]     = useState(false);
  const [importResult, setImportResult] = useState<string>('');
  // column mapping (index into xlsRows[i])
  const [mapDate,   setMapDate]   = useState<number>(-1);
  const [mapAdName, setMapAdName] = useState<number>(-1);
  const [mapPage,   setMapPage]   = useState<number>(-1);
  const [mapSpend,  setMapSpend]  = useState<number>(-1);

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
    if (!fSpend || !fDate) return;
    setSaving(true);
    await supabase.from('finance_expense').insert([{
      category: 'ค่าโฆษณารายวัน',
      description: fAdName || '-',
      amount_thb: Number(fSpend),
      expense_date: fDate,
      channel: fPage || '-',
      notes: JSON.stringify({ ad_name: fAdName, page: fPage }),
    }]);
    setSaving(false); setShowForm(false);
    setFAdName(''); setFPage(''); setFSpend('');
    load();
  };

  // read Excel file → extract headers + rows
  const handleFileRead = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const XLSX = await import('xlsx');
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) return;
    const headers = (data[0] as any[]).map(h => String(h || ''));
    setXlsHeaders(headers);
    setXlsRows(data.slice(1));
    // auto-map by keywords
    const find = (kw: string[]) => headers.findIndex(h => kw.some(k => h.includes(k)));
    setMapDate(find(['เริ่มการรายงาน', 'วันที่', 'Date']));
    setMapAdName(find(['ชื่อโฆษณา', 'Ad Name']));
    setMapPage(find(['ชื่อชุดโฆษณา', 'ชุดโฆษณา', 'Ad Set']));
    setMapSpend(find(['จำนวนเงินที่ใช้จ่าย', 'Spend', 'ยอดใช้จ่าย']));
    setImportResult('');
    setShowImport(true);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (mapDate < 0 || mapSpend < 0) return;
    setImporting(true);
    let inserted = 0;
    for (const row of xlsRows) {
      const rawDate = String(row[mapDate] || '').trim();
      const adName  = mapAdName >= 0 ? String(row[mapAdName] || '').trim() : '';
      const page    = mapPage   >= 0 ? String(row[mapPage]   || '').trim() : '';
      const spendRaw = String(row[mapSpend] || '').replace(/,/g, '');
      const spend   = parseFloat(spendRaw);
      if (!rawDate || isNaN(spend) || spend <= 0) continue;
      // normalize date (YYYY-MM-DD or DD/MM/YYYY)
      let dateStr = rawDate;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(rawDate)) {
        const [d, m, y] = rawDate.split('/');
        dateStr = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        dateStr = rawDate.substring(0, 10);
      }
      await supabase.from('finance_expense').insert([{
        category: 'ค่าโฆษณารายวัน',
        description: adName || '-',
        amount_thb: spend,
        expense_date: dateStr,
        channel: page || '-',
        notes: JSON.stringify({ ad_name: adName, page }),
      }]);
      inserted++;
    }
    setImportResult(`✓ นำเข้าสำเร็จ ${inserted} รายการ`);
    setImporting(false);
    setShowImport(false);
    setXlsRows([]); setXlsHeaders([]);
    load();
  };

  const totSpend = records.reduce((s, r) => s + Number(r.amount_thb), 0);

  const SELECT_CLS = "w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-purple-300";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📅 ลงโฆษณารายวัน</h2>
          <p className="text-xs text-slate-400 mt-0.5">บันทึกชื่อโฆษณา · เพจ · ยอดใช้จ่าย</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          <span className="text-slate-400">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          <label className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm font-medium cursor-pointer flex items-center gap-2">
            📂 นำเข้า Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileRead}/>
          </label>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium">
            + บันทึก
          </button>
        </div>
      </div>

      {importResult && (
        <div className="shrink-0 mb-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">{importResult}</div>
      )}

      {/* KPI */}
      <div className="shrink-0 bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
        <div className="text-xs text-red-500 font-semibold mb-1">ค่าโฆษณารวม</div>
        <div className="text-2xl font-bold text-red-600">฿{totSpend.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{ minWidth: '650px' }}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left whitespace-nowrap">วันที่</th>
              <th className="p-3 text-left">ชื่อโฆษณา</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อเพจ</th>
              <th className="p-3 text-right whitespace-nowrap">ยอดใช้จ่าย (฿)</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && records.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">ยังไม่มีรายการ</td></tr>}
            {records.map(r => {
              let meta: any = {};
              try { meta = JSON.parse(r.notes || '{}'); } catch { /* */ }
              return (
                <tr key={r.id} className="border-b hover:bg-purple-50">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{r.expense_date}</td>
                  <td className="p-3 text-sm text-slate-700 max-w-[220px] truncate" title={meta.ad_name || r.description}>
                    {meta.ad_name || r.description || '-'}
                  </td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{meta.page || r.channel || '-'}</td>
                  <td className="p-3 text-right font-bold text-red-600">
                    ฿{Number(r.amount_thb).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual entry form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">บันทึกโฆษณารายวัน</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อโฆษณา</label>
                <input value={fAdName} onChange={e => setFAdName(e.target.value)} placeholder="เช่น ครีมกุหลาบ หน้าใส..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อเพจโฆษณา</label>
                <input value={fPage} onChange={e => setFPage(e.target.value)} placeholder="เช่น Test - Level S..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">จำนวนเงินที่ใช้จ่ายไป (THB) *</label>
                <input type="number" value={fSpend} onChange={e => setFSpend(e.target.value)} placeholder="0.00"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fSpend || !fDate || saving}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel column mapping modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-1">เลือกคอลัมน์จากไฟล์ Excel</h3>
            <p className="text-xs text-slate-400 mb-4">{xlsRows.length} แถวข้อมูล · เลือกว่าแต่ละฟิลด์มาจากคอลัมน์ไหน</p>

            <div className="space-y-3 mb-5">
              {[
                { label: 'วันที่ *', val: mapDate,   set: setMapDate   },
                { label: 'ชื่อโฆษณา', val: mapAdName, set: setMapAdName },
                { label: 'จำนวนเงินที่ใช้จ่ายไป (THB) *', val: mapSpend, set: setMapSpend },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">{label}</label>
                  <select value={val} onChange={e => set(Number(e.target.value))} className={SELECT_CLS}>
                    <option value={-1}>— ไม่ใช้ —</option>
                    {xlsHeaders.map((h, i) => (
                      <option key={i} value={i}>[{String.fromCharCode(65+i)}] {h}</option>
                    ))}
                  </select>
                  {val >= 0 && xlsRows[0] && (
                    <p className="text-[10px] text-slate-400 mt-0.5">ตัวอย่าง: {String(xlsRows[0][val] || '-').substring(0,60)}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-purple-50 rounded-lg px-3 py-2 text-xs text-purple-700 mb-4">
              จะนำเข้า <strong>{xlsRows.filter(r => {
                const s = parseFloat(String(r[mapSpend] || '').replace(/,/g,''));
                return mapDate >= 0 && mapSpend >= 0 && r[mapDate] && !isNaN(s) && s > 0;
              }).length}</strong> รายการ (กรองแถวที่ไม่มียอดออก)
              <br/><span className="text-slate-400">* ชื่อเพจโฆษณา — กรอกเองในฟอร์มแยก หรือเพิ่ม Dropdown ทีหลัง</span>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setShowImport(false); setXlsRows([]); setXlsHeaders([]); }}
                className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleImport}
                disabled={mapDate < 0 || mapSpend < 0 || importing}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">
                {importing ? 'กำลังนำเข้า...' : '📥 นำเข้าข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ADS DATA ─────────────────────────────────────────────────────────────
function AdsData() {
  type DataTab = 'pages' | 'accounts' | 'admins';
  const [tab, setTab] = useState<DataTab>('pages');

  // ── shared data ──
  const [pages,     setPages]     = useState<any[]>([]);
  const [accounts,  setAccounts]  = useState<any[]>([]);
  const [admins,    setAdmins]    = useState<any[]>([]); // จาก employees
  const [employees, setEmployees] = useState<any[]>([]); // ทั้งหมดสำหรับ dropdown

  const loadAll = async () => {
    const [p, a, emp] = await Promise.all([
      supabase.from('ads_pages').select('*').order('created_at'),
      supabase.from('ads_accounts').select('*').order('created_at'),
      supabase.from('employees').select('id,name,nickname,employee_code,department_id,status')
        .eq('status','active').order('name'),
    ]);
    if (p.data)   setPages(p.data);
    if (a.data)   setAccounts(a.data);
    if (emp.data) {
      setEmployees(emp.data);
      // ผู้ดูแล = employees ทั้งหมด (แสดงในแท็บผู้ดูแล)
      setAdmins(emp.data);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const PAGE_STATUS = ['ยิงโฆษณา', 'ไม่ได้ยิงโฆษณา', 'ถูกจำกัด', 'ปิดเพจถาวร'];
  const ACC_STATUS  = ['ว่าง', 'ใช้งาน', 'ค้างเงิน', 'ปิดถาวร'];

  // ── Page modal ──
  const [showPageForm, setShowPageForm] = useState(false);
  const [editPage, setEditPage]         = useState<any>(null);
  const [pName,    setPName]            = useState('');
  const [pAccount, setPAccount]         = useState('');
  const [pAdmin,   setPAdmin]           = useState('');
  const [pStatus,  setPStatus]          = useState('ยิงโฆษณา');

  const openPageForm = (row?: any) => {
    setEditPage(row || null);
    setPName(row?.name || '');
    setPAccount(row?.account_id || '');
    setPAdmin(row?.admin_id || '');
    setPStatus(row?.status || 'ยิงโฆษณา');
    setShowPageForm(true);
  };
  const savePage = async () => {
    if (!pName.trim()) return;
    const payload = { name: pName.trim(), account_id: pAccount || null, admin_id: pAdmin || null, status: pStatus };
    if (editPage) await supabase.from('ads_pages').update(payload).eq('id', editPage.id);
    else          await supabase.from('ads_pages').insert([payload]);
    setShowPageForm(false); loadAll();
  };

  // ── Account modal ──
  const [showAccForm, setShowAccForm] = useState(false);
  const [editAcc, setEditAcc]         = useState<any>(null);
  const [aName,   setAName]           = useState('');
  const [aId,     setAId]             = useState('');
  const [aStatus, setAStatus]         = useState('ว่าง');

  const openAccForm = (row?: any) => {
    setEditAcc(row || null);
    setAName(row?.name || '');
    setAId(row?.account_id || '');
    setAStatus(row?.status || 'ว่าง');
    setShowAccForm(true);
  };
  const saveAccount = async () => {
    if (!aName.trim()) return;
    const payload = { name: aName.trim(), account_id: aId.trim() || null, status: aStatus };
    if (editAcc) await supabase.from('ads_accounts').update(payload).eq('id', editAcc.id);
    else         await supabase.from('ads_accounts').insert([payload]);
    setShowAccForm(false); loadAll();
  };

  const STATUS_COLOR: Record<string, string> = {
    'ยิงโฆษณา': 'bg-green-100 text-green-700',
    'ไม่ได้ยิงโฆษณา': 'bg-slate-100 text-slate-500',
    'ถูกจำกัด': 'bg-orange-100 text-orange-700',
    'ปิดเพจถาวร': 'bg-red-100 text-red-700',
    'ว่าง': 'bg-slate-100 text-slate-500',
    'ใช้งาน': 'bg-green-100 text-green-700',
    'ค้างเงิน': 'bg-orange-100 text-orange-700',
    'ปิดถาวร': 'bg-red-100 text-red-700',
  };

  const TABS = [
    { key: 'pages'    as DataTab, label: 'รายชื่อเพจ',   count: pages.length },
    { key: 'accounts' as DataTab, label: 'บัญชีโฆษณา',   count: accounts.length },
    { key: 'admins'   as DataTab, label: 'ผู้ดูแล',       count: admins.length },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mb-4">
        <h2 className="text-xl font-bold text-slate-800">🗂️ DATA</h2>
        <p className="text-xs text-slate-400">จัดการข้อมูลอ้างอิงสำหรับโฆษณา</p>
      </div>

      {/* Tab bar + add button */}
      <div className="shrink-0 flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        {tab === 'pages'    && <button onClick={() => openPageForm()}  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium">+ เพิ่มเพจ</button>}
        {tab === 'accounts' && <button onClick={() => openAccForm()}   className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium">+ เพิ่มบัญชี</button>}
      </div>

      {/* ── รายชื่อเพจ ── */}
      {tab === 'pages' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full">
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left">รายชื่อเพจ</th>
                <th className="p-3 text-left whitespace-nowrap">บัญชีโฆษณา</th>
                <th className="p-3 text-left whitespace-nowrap">ผู้ดูแล</th>
                <th className="p-3 text-center whitespace-nowrap">สถานะเพจ</th>
                <th className="p-3 w-16"/>
              </tr>
            </thead>
            <tbody>
              {pages.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ยังไม่มีเพจ</td></tr>}
              {pages.map(p => {
                const acc = accounts.find(a => a.id === p.account_id);
                const adm = admins.find(a => a.id === p.admin_id);
                return (
                  <tr key={p.id} className="border-b hover:bg-purple-50">
                    <td className="p-3 font-medium text-slate-800">{p.name}</td>
                    <td className="p-3 text-xs text-slate-500">{acc?.name || '-'}</td>
                    <td className="p-3 text-xs text-slate-500">{adm?.name || '-'}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[p.status] || 'bg-slate-100 text-slate-500'}`}>
                        {p.status || '-'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => openPageForm(p)} className="text-slate-400 hover:text-purple-600 text-xs px-2 py-1 rounded hover:bg-purple-50">✏</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── บัญชีโฆษณา ── */}
      {tab === 'accounts' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <table className="text-sm w-full">
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left">ชื่อบัญชี</th>
                <th className="p-3 text-left whitespace-nowrap">ID</th>
                <th className="p-3 text-center whitespace-nowrap">สถานะบัญชี</th>
                <th className="p-3 w-16"/>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">ยังไม่มีบัญชีโฆษณา</td></tr>}
              {accounts.map(a => (
                <tr key={a.id} className="border-b hover:bg-purple-50">
                  <td className="p-3 font-medium text-slate-800">{a.name}</td>
                  <td className="p-3 font-mono text-xs text-slate-400">{a.account_id || '-'}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[a.status] || 'bg-slate-100 text-slate-500'}`}>
                      {a.status || '-'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => openAccForm(a)} className="text-slate-400 hover:text-purple-600 text-xs px-2 py-1 rounded hover:bg-purple-50">✏</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ผู้ดูแล (ดึงจากพนักงาน) ── */}
      {tab === 'admins' && (
        <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 text-xs text-purple-700">
            📌 รายชื่อผู้ดูแลดึงอัตโนมัติจาก <strong>หน้าพนักงาน (HR)</strong> · เพิ่มผู้ดูแลได้ที่ พนักงาน → เพิ่มพนักงาน
          </div>
          <table className="text-sm w-full">
            <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left whitespace-nowrap">รหัส</th>
                <th className="p-3 text-left">ชื่อ - นามสกุล</th>
                <th className="p-3 text-left whitespace-nowrap">ชื่อเล่น</th>
                <th className="p-3 text-left whitespace-nowrap">แผนก</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400">
                  ยังไม่มีพนักงาน — ไปเพิ่มที่ ฝ่าย HR → พนักงาน
                </td></tr>
              )}
              {admins.map(e => (
                <tr key={e.id} className="border-b hover:bg-purple-50">
                  <td className="p-3 font-mono text-xs text-purple-600">{e.employee_code || '-'}</td>
                  <td className="p-3 font-medium text-slate-800">{e.name}</td>
                  <td className="p-3 text-xs text-slate-500">{e.nickname || '-'}</td>
                  <td className="p-3 text-xs text-slate-500">{e.department_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Page Modal ── */}
      {showPageForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{editPage ? 'แก้ไขเพจ' : '+ เพิ่มเพจ'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">รายชื่อเพจ *</label>
                <input value={pName} onChange={e => setPName(e.target.value)} placeholder="ชื่อเพจ..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">บัญชีโฆษณา</label>
                <select value={pAccount} onChange={e => setPAccount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                  <option value="">— ไม่ระบุ —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ผู้ดูแล</label>
                <select value={pAdmin} onChange={e => setPAdmin(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                  <option value="">— ไม่ระบุ —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.employee_code ? `[${e.employee_code}] ` : ''}{e.name}{e.nickname ? ` (${e.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">สถานะเพจ</label>
                <select value={pStatus} onChange={e => setPStatus(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                  {PAGE_STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowPageForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={savePage} disabled={!pName.trim()}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Account Modal ── */}
      {showAccForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{editAcc ? 'แก้ไขบัญชี' : '+ เพิ่มบัญชีโฆษณา'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อบัญชี *</label>
                <input value={aName} onChange={e => setAName(e.target.value)} placeholder="ชื่อบัญชีโฆษณา..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ID</label>
                <input value={aId} onChange={e => setAId(e.target.value)} placeholder="Account ID (ไม่จำเป็น)"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">สถานะบัญชี</label>
                <select value={aStatus} onChange={e => setAStatus(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
                  {ACC_STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAccForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={saveAccount} disabled={!aName.trim()}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">บันทึก</button>
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
