import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Clock } from 'lucide-react';

type Task = {
  id: string; title: string; task_type: string; channel: string | null;
  size: string | null; deadline: string | null; status: string;
  source: string; assigned_to: string | null; created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  'รอดำเนินการ': 'bg-slate-100 text-slate-600',
  'กำลังทำ':     'bg-blue-100 text-blue-700',
  'รอรีวิว':     'bg-orange-100 text-orange-700',
  'อนุมัติแล้ว': 'bg-green-100 text-green-700',
};

function isNear(deadline: string | null) {
  if (!deadline) return false;
  return (new Date(deadline).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
}

export default function GraphicTasks({ onCreateNew }: { onCreateNew: () => void }) {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [sourceFilter, setSourceFilter] = useState('ทั้งหมด');
  const [loading, setLoading]   = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('graphic_tasks').select('*')
      .neq('status', 'เก็บถาวร').order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  const filtered = tasks.filter(t => {
    const matchStatus = statusFilter === 'ทั้งหมด' || t.status === statusFilter;
    const matchSource = sourceFilter === 'ทั้งหมด' || t.source === sourceFilter;
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
      || (t.assigned_to||'').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSource && matchSearch;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่องาน / ผู้รับผิดชอบ..."
            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
          {['ทั้งหมด','รอดำเนินการ','กำลังทำ','รอรีวิว','อนุมัติแล้ว'].map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
          {['ทั้งหมด','ทีมโฆษณา','ทีมงานภายใน','HR/แอดมิน'].map(s=><option key={s}>{s}</option>)}
        </select>
        <button onClick={onCreateNew}
          className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 flex items-center gap-2 text-sm">
          <Plus size={14}/> สร้างงานใหม่
        </button>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'700px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left">ชื่องาน</th>
              <th className="p-3 text-left whitespace-nowrap">ประเภท</th>
              <th className="p-3 text-left whitespace-nowrap">ช่องทาง</th>
              <th className="p-3 text-left whitespace-nowrap">ที่มา</th>
              <th className="p-3 text-left whitespace-nowrap">มอบหมายให้</th>
              <th className="p-3 text-center whitespace-nowrap">กำหนดส่ง</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">ไม่มีงาน</td></tr>}
            {filtered.map(t => (
              <tr key={t.id} className="border-b hover:bg-pink-50">
                <td className="p-3 font-medium text-slate-800">{t.title}</td>
                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{t.task_type}</td>
                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{t.channel || '-'}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold
                    ${t.source==='ทีมโฆษณา'?'bg-purple-100 text-purple-700':'bg-slate-100 text-slate-600'}`}>
                    {t.source}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-600">{t.assigned_to || <span className="text-slate-300">-</span>}</td>
                <td className="p-3 text-center">
                  {t.deadline ? (
                    <span className={`flex items-center justify-center gap-1 text-xs ${isNear(t.deadline)?'text-red-500 font-bold':'text-slate-500'}`}>
                      <Clock size={11}/>{new Date(t.deadline).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                    </span>
                  ) : <span className="text-slate-300 text-xs">-</span>}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[t.status]||'bg-slate-100 text-slate-500'}`}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 mt-2 text-xs text-right text-slate-400">{filtered.length} งาน</div>
    </div>
  );
}
