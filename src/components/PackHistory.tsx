import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ClipboardList, Search, ChevronDown, ChevronRight } from 'lucide-react';

type PackHistoryRow = {
  id: string; req_doc_no: string | null; pack_date: string;
  responsible_person: string | null; order_count: number;
  orders_snapshot: any[]; summary_snapshot: any[];
  status: string; created_at: string;
};

export default function PackHistory() {
  const [rows, setRows]         = useState<PackHistoryRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('pack_history').select('*').eq('status','approved').order('created_at', { ascending: false });
    if (dateFrom) q = q.gte('pack_date', dateFrom);
    if (dateTo)   q = q.lte('pack_date', dateTo);
    const { data } = await q;
    if (data) setRows(data as PackHistoryRow[]);
    setLoading(false);
  };

  const filtered = rows.filter(r => {
    if (!search) return true;
    return (r.req_doc_no||'').includes(search) || (r.responsible_person||'').toLowerCase().includes(search.toLowerCase());
  });

  const toggleExpand = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const statusBadge = (s: string) => s === 'approved'
    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">✓ อนุมัติแล้ว</span>
    : <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">รอ</span>;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <div className="shrink-0 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center">
          <ClipboardList size={20} className="text-white"/>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">ประวัติแพ็คสินค้า</h2>
          <p className="text-sm text-slate-500">{rows.length} รายการที่อนุมัติแล้ว</p>
        </div>
      </div>

      {/* Filter */}
      <div className="shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาเลขใบเบิก / ผู้รับผิดชอบ..."
              className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"/>
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"/>
          <div className="flex gap-2">
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"/>
            <button onClick={load} className="px-3 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 text-sm shrink-0 flex items-center gap-1.5">
              <Search size={13}/> ค้นหา
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'700px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3 text-left whitespace-nowrap">วันที่แพ็ค</th>
              <th className="p-3 text-left whitespace-nowrap">เลขใบเบิก</th>
              <th className="p-3 text-left whitespace-nowrap">ผู้รับผิดชอบ</th>
              <th className="p-3 text-center whitespace-nowrap">จำนวนออเดอร์</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
              <th className="p-3 text-left whitespace-nowrap">สรุปสินค้า</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                ยังไม่มีประวัติ — อนุมัติใบเบิกสินค้าเพื่อบันทึกประวัติ
              </td></tr>
            )}
            {filtered.map(r => {
              const isOpen = expanded.has(r.id);
              return (
                <>
                  <tr key={r.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                    <td className="p-3 text-center text-slate-400">
                      {isOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(r.pack_date).toLocaleDateString('th-TH')}
                      <div className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div>
                    </td>
                    <td className="p-3 font-mono text-sm text-blue-700 font-bold whitespace-nowrap">
                      {r.req_doc_no || <span className="text-slate-300 font-normal">-</span>}
                    </td>
                    <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                      {r.responsible_person || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-xs font-bold">{r.order_count} ออเดอร์</span>
                    </td>
                    <td className="p-3 text-center">{statusBadge(r.status)}</td>
                    <td className="p-3 text-xs text-slate-500">
                      {(r.summary_snapshot||[]).slice(0,2).map((s:any, i:number) => (
                        <div key={i} className="truncate max-w-[200px]">{s.name} ({s.count} ออเดอร์)</div>
                      ))}
                      {(r.summary_snapshot||[]).length > 2 && <div className="text-slate-400">+{(r.summary_snapshot||[]).length-2} รายการ</div>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.id}-detail`} className="bg-teal-50 border-b">
                      <td colSpan={7} className="p-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          {/* ใบสรุป */}
                          <div>
                            <h4 className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-2">ใบสรุปการแพ็ค</h4>
                            <table className="w-full text-xs">
                              <thead><tr className="bg-slate-200">
                                <th className="px-2 py-1 text-left">#</th>
                                <th className="px-2 py-1 text-left">สินค้า</th>
                                <th className="px-2 py-1 text-center">จำนวน</th>
                                <th className="px-2 py-1 text-left">กล่อง</th>
                              </tr></thead>
                              <tbody>
                                {(r.summary_snapshot||[]).map((s:any, i:number) => (
                                  <tr key={i} className={`border-b ${s.type==='multi'?'bg-amber-50':''}`}>
                                    <td className="px-2 py-1 text-slate-400">{i+1}</td>
                                    <td className="px-2 py-1 font-medium text-slate-700">{s.name}</td>
                                    <td className="px-2 py-1 text-center font-bold text-cyan-700">{s.count} ออเดอร์</td>
                                    <td className="px-2 py-1 text-slate-500">{s.box||'-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {/* รายการออเดอร์ */}
                          <div>
                            <h4 className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-2">รายการออเดอร์ ({r.order_count})</h4>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {(r.orders_snapshot||[]).map((o:any, i:number) => (
                                <div key={i} className="text-xs text-slate-600 flex gap-2">
                                  <span className="text-slate-400 shrink-0">{i+1}.</span>
                                  <span>{o.customer}</span>
                                  <span className="text-slate-400">·</span>
                                  <span className="text-slate-500">{o.order_no}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
