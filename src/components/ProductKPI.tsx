import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Types ─────────────────────────────────────────────────────

type PromoKPI = {
  promo_id:   string;
  master_id:  string;
  short_name: string | null;
  name:       string;
  qty:        number;          // จำนวนชิ้นต่อแพ็ค
  price:      number;          // ราคาขาย
  cost_goods: number;          // ต้นทุนสินค้า (cost_thb × qty)
  box_price:  number;          // ราคากล่อง
  bub_price:  number;          // ราคาบั้บเบิ้ล
  ship_thb:   number;          // ค่าขนส่ง
  box_name:   string;
  bub_name:   string;
  vat:        number;          // VAT (กรอกได้)
};

const fmt  = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n: number) => n.toFixed(1) + '%';

function extractQty(name: string): number {
  const t = name.match(/(\d+)\s*แถม\s*(\d+)/);
  if (t) return parseInt(t[1]) + parseInt(t[2]);
  const u = name.match(/\(?\s*(\d+)\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน)/i);
  if (u) return parseInt(u[1]);
  const f = name.match(/(\d+)/);
  return f ? parseInt(f[1]) : 1;
}

// ── Component ─────────────────────────────────────────────────

export default function ProductKPI() {
  const [promos, setPromos]     = useState<PromoKPI[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  // VAT per promo_id (กรอกเองได้ทีละแถว)
  const [vatMap, setVatMap]     = useState<Record<string, string>>({});
  // bulk VAT
  const [bulkVat, setBulkVat]   = useState('');
  const [bulkInput, setBulkInput] = useState('');

  // เลือกแถวสำหรับ bulk VAT
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: promosData } = await supabase
      .from('products_promo')
      .select('id, master_id, name, short_name, price_thb, ship_thb, active, boxes(name,price_thb), bubbles(name,length_cm,price_thb), products_master(cost_thb,weight_g)')
      .eq('active', true)
      .order('id');

    const rows: PromoKPI[] = (promosData || []).map((p: any) => {
      const qty       = extractQty(p.name);
      const costPer   = Number(p.products_master?.cost_thb || 0);
      const boxPrice  = Number(p.boxes?.price_thb || 0);
      const bubLen    = Number(p.bubbles?.length_cm || 0);
      const bubPrice  = bubLen > 0 ? Number(p.bubbles?.price_thb || 0) : 0;
      return {
        promo_id:   p.id,
        master_id:  p.master_id,
        short_name: p.short_name,
        name:       p.name,
        qty,
        price:      Number(p.price_thb || 0),
        cost_goods: costPer * qty,
        box_price:  boxPrice,
        bub_price:  bubPrice,
        ship_thb:   Number(p.ship_thb || 0),
        box_name:   p.boxes?.name || '-',
        bub_name:   bubLen > 0 ? `${p.bubbles?.name || ''} (฿${bubPrice.toFixed(2)})` : '-',
        vat:        0,
      };
    });

    setPromos(rows);
    // init vatMap
    const vm: Record<string, string> = {};
    rows.forEach(r => { vm[r.promo_id] = ''; });
    setVatMap(vm);
    setLoading(false);
  };

  // คำนวณ KPI ต่อแถว
  const calcRow = (p: PromoKPI) => {
    const vatVal   = parseFloat(vatMap[p.promo_id] || '0') || 0;
    const com      = p.price * 0.015;
    const free2    = p.price * 0.02;
    const totalCost = p.cost_goods + p.box_price + p.bub_price + p.ship_thb + vatVal + com + free2;
    const profit   = p.price - totalCost;
    const margin   = p.price > 0 ? (profit / p.price) * 100 : 0;
    const roas     = com > 0 ? p.price / com : 0;
    return { vatVal, com, free2, totalCost, profit, margin, roas };
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return promos.filter(p =>
      !q ||
      (p.short_name || '').toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.promo_id.toLowerCase().includes(q)
    );
  }, [promos, search]);

  // apply bulk VAT
  const applyBulkVat = () => {
    if (!bulkInput) return;
    const next = { ...vatMap };
    if (selectedIds.size > 0) {
      selectedIds.forEach(id => { next[id] = bulkInput; });
    } else {
      filtered.forEach(p => { next[p.promo_id] = bulkInput; });
    }
    setVatMap(next);
    setBulkVat(bulkInput);
  };

  // Export Excel
  const exportExcel = () => {
    const rows = filtered.map(p => {
      const { vatVal, com, free2, totalCost, profit, margin, roas } = calcRow(p);
      return {
        'รหัส':            p.promo_id,
        'ชื่อสั้น':         p.short_name || '-',
        'ชื่อโปร':          p.name,
        'จำนวน':           p.qty,
        'ราคาขาย':         p.price,
        'ต้นทุนสินค้า':    p.cost_goods,
        'กล่อง (฿)':       p.box_price,
        'บั้บเบิ้ล (฿)':   p.bub_price,
        'ค่าขนส่ง (฿)':    p.ship_thb,
        'VAT (฿)':          vatVal,
        'COM 1.5% (฿)':     com,
        'FREE 2% (฿)':      free2,
        'ต้นทุนรวม (฿)':   totalCost,
        'กำไร (฿)':         profit,
        'Margin %':         margin.toFixed(1),
        'ROAS':             roas.toFixed(2),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Product KPI');
    XLSX.writeFile(wb, 'ProductKPI.xlsx');
  };

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.promo_id));

  return (
    <div className="flex flex-col h-screen p-4 sm:p-6 pb-2 gap-3">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">📊 KPI สินค้า</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} โปร · วิเคราะห์ต้นทุน กำไร Margin ROAS</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} disabled={loading}
            className="px-3 py-2 bg-white border rounded-lg text-xs flex items-center gap-1.5 hover:bg-slate-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> รีเฟรช
          </button>
          <button onClick={exportExcel} disabled={loading}
            className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-xs flex items-center gap-1.5 hover:bg-emerald-600">
            <Download size={12}/> Export Excel
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-wrap gap-2 items-center">
        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ค้นหารหัส / ชื่อโปร..."
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 flex-1 min-w-[200px]"
        />

        {/* Bulk VAT */}
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="text-xs text-amber-700 font-medium whitespace-nowrap">
            {selectedIds.size > 0 ? `VAT (${selectedIds.size} รายการ)` : 'VAT ทั้งหมด'}
          </span>
          <input
            type="number"
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
            placeholder="0.00"
            className="w-20 border border-amber-300 rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <span className="text-xs text-amber-600">฿/แพ็ค</span>
          <button onClick={applyBulkVat}
            className="px-3 py-1 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600">
            ใช้
          </button>
          {bulkVat && (
            <button onClick={() => {
              const next = { ...vatMap };
              promos.forEach(p => { next[p.promo_id] = ''; });
              setVatMap(next); setBulkVat(''); setBulkInput('');
            }} className="text-xs text-amber-500 hover:text-amber-700">ล้าง</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-xs w-full" style={{ minWidth: '1300px' }}>
          <thead className="bg-slate-800 text-slate-200 sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={allSelected}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(p => p.promo_id)) : new Set())}
                  className="rounded cursor-pointer"/>
              </th>
              <th className="p-3 text-left whitespace-nowrap">รหัส</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อสั้น</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อโปร</th>
              <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
              <th className="p-3 text-right whitespace-nowrap text-emerald-300">ราคาขาย</th>
              <th className="p-3 text-right whitespace-nowrap">ต้นทุนสินค้า</th>
              <th className="p-3 text-right whitespace-nowrap">กล่อง (฿)</th>
              <th className="p-3 text-right whitespace-nowrap">บั้บเบิ้ล (฿)</th>
              <th className="p-3 text-right whitespace-nowrap">ขนส่ง (฿)</th>
              <th className="p-3 text-right whitespace-nowrap text-amber-300">VAT (฿)</th>
              <th className="p-3 text-right whitespace-nowrap">COM 1.5%</th>
              <th className="p-3 text-right whitespace-nowrap">FREE 2%</th>
              <th className="p-3 text-right whitespace-nowrap">ต้นทุนรวม</th>
              <th className="p-3 text-right whitespace-nowrap text-teal-300">กำไร</th>
              <th className="p-3 text-right whitespace-nowrap text-teal-300">Margin</th>
              <th className="p-3 text-right whitespace-nowrap text-blue-300">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={17} className="p-8 text-center text-slate-400">
                <RefreshCw size={16} className="animate-spin inline mr-2"/>กำลังโหลด...
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={17} className="p-8 text-center text-slate-400">ไม่พบสินค้า</td></tr>
            )}
            {filtered.map(p => {
              const { vatVal, com, free2, totalCost, profit, margin, roas } = calcRow(p);
              const isSelected = selectedIds.has(p.promo_id);
              return (
                <tr key={p.promo_id}
                  className={`border-b transition ${isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                  <td className="p-3 text-center">
                    <input type="checkbox" checked={isSelected}
                      onChange={e => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(p.promo_id) : next.delete(p.promo_id);
                        setSelectedIds(next);
                      }}
                      className="rounded cursor-pointer"/>
                  </td>
                  <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{p.promo_id}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap">
                    {p.short_name || <span className="text-slate-300">-</span>}
                  </td>
                  <td className="p-3 text-slate-700 max-w-[180px] truncate">{p.name}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold">{p.qty}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-emerald-600">฿{fmt(p.price)}</td>
                  <td className="p-3 text-right text-slate-500">฿{fmt(p.cost_goods)}</td>
                  <td className="p-3 text-right text-slate-500">
                    {p.box_price > 0 ? `฿${fmt(p.box_price)}` : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="p-3 text-right text-slate-500">
                    {p.bub_price > 0 ? `฿${fmt(p.bub_price)}` : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="p-3 text-right text-blue-600">
                    {p.ship_thb > 0 ? `฿${fmt(p.ship_thb)}` : <span className="text-slate-300">-</span>}
                  </td>
                  {/* VAT — กรอกได้ทีละแถว */}
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      value={vatMap[p.promo_id] ?? ''}
                      onChange={e => setVatMap(prev => ({ ...prev, [p.promo_id]: e.target.value }))}
                      placeholder="0"
                      className="w-16 text-right border border-amber-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 bg-amber-50"
                    />
                  </td>
                  <td className="p-3 text-right text-slate-500">฿{fmt(com)}</td>
                  <td className="p-3 text-right text-slate-500">฿{fmt(free2)}</td>
                  <td className="p-3 text-right font-medium text-slate-700">฿{fmt(totalCost)}</td>
                  <td className={`p-3 text-right font-bold ${profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {profit < 0 ? '-' : ''}฿{fmt(Math.abs(profit))}
                  </td>
                  <td className={`p-3 text-right font-bold ${margin >= 20 ? 'text-teal-600' : margin >= 10 ? 'text-amber-600' : 'text-red-500'}`}>
                    {fmtP(margin)}
                  </td>
                  <td className="p-3 text-right font-medium text-blue-600">
                    {roas > 0 ? roas.toFixed(2) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Summary footer */}
          {!loading && filtered.length > 0 && (() => {
            const totPrice   = filtered.reduce((s, p) => s + p.price, 0);
            const totProfit  = filtered.reduce((s, p) => s + calcRow(p).profit, 0);
            const avgMargin  = filtered.reduce((s, p) => s + calcRow(p).margin, 0) / filtered.length;
            return (
              <tfoot className="bg-slate-50 border-t-2 sticky bottom-0 font-bold text-[11px]">
                <tr>
                  <td colSpan={5} className="p-3 text-slate-500">รวม {filtered.length} โปร</td>
                  <td className="p-3 text-right text-emerald-600">฿{fmt(totPrice)}</td>
                  <td colSpan={7}/>
                  <td className={`p-3 text-right ${totProfit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {totProfit < 0 ? '-' : ''}฿{fmt(Math.abs(totProfit))}
                  </td>
                  <td className={`p-3 text-right ${avgMargin >= 15 ? 'text-teal-600' : 'text-amber-600'}`}>
                    {fmtP(avgMargin)}
                  </td>
                  <td/>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    </div>
  );
}
