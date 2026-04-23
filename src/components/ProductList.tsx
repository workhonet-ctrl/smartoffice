import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { extractQty } from '../lib/utils';
import { Search, RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

type PromoRow = {
  id: string;
  master_id: string;
  name: string;
  short_name: string | null;
  price_thb: number;
  color: string | null;
  item_type: string | null;
  active: boolean;
  ship_thb: number | null;
  boxes:   { name: string; length_cm: number; width_cm: number; height_cm: number; price_thb: number } | null;
  bubbles: { length_cm: number | null; price_thb: number | null } | null;
};

type MasterRow = {
  id: string;
  name: string;
  cost_thb: number;
  weight_g: number;
  promos: PromoRow[];
};

// Extract จำนวนจากชื่อ Promo (เหมือน FlashExport)

export default function ProductList() {
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openMasters, setOpenMasters] = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mastersRes, promosRes] = await Promise.all([
        supabase.from('products_master').select('*').order('id', { ascending: true }),
        supabase.from('products_promo').select('*, ship_thb, boxes(*), bubbles(*)').order('id', { ascending: true }),
      ]);
      if (mastersRes.error) throw mastersRes.error;
      if (promosRes.error) throw promosRes.error;

      const promos = (promosRes.data || []) as PromoRow[];
      const result: MasterRow[] = (mastersRes.data || []).map((m: any) => ({
        ...m,
        promos: promos.filter(p => p.master_id === m.id),
      }));
      setMasters(result);
      // เปิดทุก Master ตั้งต้น
      setOpenMasters(new Set(result.map(m => m.id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMaster = (id: string) => {
    setOpenMasters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (open: boolean) => {
    setOpenMasters(open ? new Set(masters.map(m => m.id)) : new Set());
  };

  // filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return masters;
    return masters
      .map(m => {
        const matchM = m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
        const matchedPromos = m.promos.filter(p =>
          p.id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.short_name || '').toLowerCase().includes(q)
        );
        if (matchM) return { ...m };                      // แสดงทั้ง master พร้อม promo ทั้งหมด
        if (matchedPromos.length) return { ...m, promos: matchedPromos };
        return null;
      })
      .filter(Boolean) as MasterRow[];
  }, [masters, search]);

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <RefreshCw size={18} className="animate-spin" /> กำลังโหลด...
    </div>
  );

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">รายการสินค้าทั้งหมด</h2>
          <p className="text-sm text-slate-500 mt-1">
            {filtered.length} Master · {filtered.reduce((s, m) => s + m.promos.length, 0)} Promo
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => toggleAll(true)}  className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">ขยายทั้งหมด</button>
          <button onClick={() => toggleAll(false)} className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">ย่อทั้งหมด</button>
          <button onClick={loadData}               className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 flex items-center gap-1"><RefreshCw size={13} />รีเฟรช</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 shrink-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา M / P / ชื่อสินค้า / ชื่อสั้น..."
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
        />
      </div>

      {/* Table — เต็มพื้นที่เหลือ scroll ได้ทั้ง X และ Y */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm" style={{ minWidth: '900px', width: '100%' }}>
          <thead className="bg-slate-800 text-slate-200 text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left w-8"></th>
              <th className="p-3 text-left whitespace-nowrap">รหัส</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อสั้น</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อโปร / ชื่อสินค้า</th>
              <th className="p-3 text-center whitespace-nowrap">จำนวน</th>
              <th className="p-3 text-right whitespace-nowrap">ราคาขาย</th>
              <th className="p-3 text-right whitespace-nowrap">ต้นทุนรวม</th>
              <th className="p-3 text-left whitespace-nowrap">กล่อง</th>
              <th className="p-3 text-left whitespace-nowrap">บั้บเบิ้ล</th>
              <th className="p-3 text-right whitespace-nowrap">ค่าขนส่ง (฿)</th>
              <th className="p-3 text-right whitespace-nowrap">น้ำหนัก (kg)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-8 text-center text-slate-400">ไม่พบสินค้าที่ค้นหา</td></tr>
            )}

            {filtered.map(master => {
              const isOpen = openMasters.has(master.id);
              return (
                <>
                  {/* ── แถว Master ── */}
                  <tr
                    key={master.id}
                    onClick={() => toggleMaster(master.id)}
                    className="bg-cyan-50 border-b border-cyan-100 cursor-pointer hover:bg-cyan-100 transition"
                  >
                    <td className="p-3 text-cyan-600">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="p-3">
                      <span className="font-mono font-bold text-cyan-700 text-sm whitespace-nowrap">{master.id}</span>
                    </td>
                    <td className="p-3 text-slate-500 text-xs">-</td>
                    <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">{master.name}</td>
                    <td className="p-3 text-center text-slate-400 text-xs">-</td>
                    <td className="p-3 text-right text-slate-400 text-xs">-</td>
                    {/* ต้นทุนต่อชิ้น */}
                    <td className="p-3 text-right text-xs text-slate-500 whitespace-nowrap">฿{Number(master.cost_thb).toFixed(2)}</td>
                    <td className="p-3 text-xs text-slate-400">-</td>
                    <td className="p-3 text-xs text-slate-400">-</td>
                    {/* น้ำหนักต่อชิ้น — แสดงหน่วยที่เหมาะสม */}
                    <td className="p-3 text-right text-xs text-slate-500 whitespace-nowrap">
                      {master.weight_g
                        ? `${parseFloat((master.weight_g / 1000).toFixed(3))} /ชิ้น`
                        : '-'}
                    </td>
                  </tr>

                  {isOpen && master.promos.map(promo => {
                    const qty      = extractQty(promo.name);
                    // FIX: ต้นทุนรวม = qty × cost_thb (ต้นทุนต่อชิ้น × จำนวน)
                    const costTotal = Number(master.cost_thb) * qty;
                    // FIX: น้ำหนัก = qty × weight_g → kg แสดงทศนิยมพอดี
                    const weightKg  = (master.weight_g * qty) / 1000;
                    const weightStr = parseFloat(weightKg.toFixed(3)).toString(); // 0.5 ไม่ใช่ 0.500
                    const missingQty = qty === 1 && !promo.name.match(/1\s*(?:กระป๋อง|ชิ้น|แพ็ค|ซอง|กล่อง|ขวด|ถุง|อัน|แถม)/i);

                    return (
                      <tr key={promo.id} className={`border-b hover:bg-slate-50 transition ${!promo.active ? 'opacity-40' : ''}`}>
                        <td className="p-3"></td>
                        <td className="p-3 pl-6">
                          <span className="font-mono text-xs font-bold text-slate-600 whitespace-nowrap">{promo.id}</span>
                        </td>
                        <td className="p-3 text-slate-500 text-xs whitespace-nowrap">
                          {promo.short_name || <span className="text-orange-400 flex items-center gap-1"><AlertCircle size={12}/>ไม่มี</span>}
                        </td>
                        <td className="p-3 text-slate-700 whitespace-nowrap">{promo.name}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${missingQty ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-700'}`}>
                            {qty}{missingQty && <span className="ml-1 text-orange-400">?</span>}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800 whitespace-nowrap">
                          ฿{Number(promo.price_thb).toLocaleString()}
                        </td>
                        {/* ต้นทุนรวม = qty × cost_thb */}
                        <td className="p-3 text-right text-slate-600 font-medium whitespace-nowrap">
                          ฿{costTotal.toFixed(2)}
                        </td>
                        <td className="p-3 text-xs text-slate-600 whitespace-nowrap">
                          {promo.boxes?.name || <span className="text-orange-400">ไม่มีกล่อง</span>}
                        </td>
                        <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                          {promo.bubbles ? `ยาว ${Number(promo.bubbles.length_cm ?? 0)} cm` : <span className="text-slate-400">-</span>}
                        </td>
                        {/* ค่าขนส่ง */}
                        <td className="p-3 text-right text-sm font-medium text-blue-600 whitespace-nowrap">
                          {promo.ship_thb && Number(promo.ship_thb) > 0
                            ? `฿${Number(promo.ship_thb).toFixed(2)}`
                            : <span className="text-slate-300 text-xs">-</span>}
                        </td>
                        {/* น้ำหนัก — 0.5 ไม่ใช่ 0.500 */}
                        <td className="p-3 text-right text-sm font-medium text-slate-700 whitespace-nowrap">
                          {weightStr}
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
