import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Clock, User } from 'lucide-react';

type Task = {
  id: string; title: string; task_type: string; channel: string | null;
  size: string | null; deadline: string | null; status: string;
  source: string; brief: string | null; assigned_to: string | null;
  created_at: string;
};

const COLUMNS = [
  { key: 'รอดำเนินการ', label: 'รอดำเนินการ', color: 'bg-slate-100',  badge: 'bg-slate-300 text-slate-700' },
  { key: 'กำลังทำ',     label: 'กำลังทำ',     color: 'bg-blue-50',   badge: 'bg-blue-400 text-white' },
  { key: 'รอรีวิว',     label: 'รอรีวิว',     color: 'bg-orange-50', badge: 'bg-orange-400 text-white' },
  { key: 'อนุมัติแล้ว', label: 'อนุมัติแล้ว', color: 'bg-green-50',  badge: 'bg-green-500 text-white' },
];

const STATUS_NEXT: Record<string, string> = {
  'รอดำเนินการ': 'กำลังทำ',
  'กำลังทำ': 'รอรีวิว',
  'รอรีวิว': 'อนุมัติแล้ว',
};

function isNearDeadline(deadline: string | null) {
  if (!deadline) return false;
  return (new Date(deadline).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
}

export default function GraphicBoard() {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('graphic_tasks')
      .select('*').neq('status','เก็บถาวร').order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  const moveNext = async (task: Task) => {
    const next = STATUS_NEXT[task.status];
    if (!next) return;
    await supabase.from('graphic_tasks').update({ status: next, updated_at: new Date().toISOString() }).eq('id', task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: next } : t));
    if (selected?.id === task.id) setSelected({ ...task, status: next });
  };

  const archive = async (task: Task) => {
    if (!confirm('เก็บถาวรงานนี้?')) return;
    await supabase.from('graphic_tasks').update({ status: 'เก็บถาวร' }).eq('id', task.id);
    setTasks(p => p.filter(t => t.id !== task.id));
    setSelected(null);
  };

  if (loading) return <div className="p-8 text-slate-400 text-center">กำลังโหลด...</div>;

  return (
    <div className="flex gap-3 h-full overflow-x-auto pb-2">
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className="flex flex-col min-w-[240px] w-[240px] shrink-0">
            {/* Column header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="font-semibold text-sm text-slate-700">{col.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${col.badge}`}>{colTasks.length}</span>
            </div>
            {/* Cards */}
            <div className={`flex-1 rounded-xl p-2 space-y-2 overflow-y-auto ${col.color}`}>
              {colTasks.length === 0 && <div className="text-center text-slate-400 text-xs py-8">ไม่มีงาน</div>}
              {colTasks.map(t => (
                <div key={t.id}
                  onClick={() => setSelected(t)}
                  className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:shadow border border-slate-100 hover:border-pink-200 transition">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-medium text-slate-800 text-sm leading-tight">{t.title}</span>
                    {t.source === 'ทีมโฆษณา' && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">ADS</span>
                    )}
                  </div>
                  {t.task_type && <div className="text-xs text-slate-400 mb-1">{t.task_type}{t.channel ? ` · ${t.channel}` : ''}</div>}
                  <div className="flex items-center justify-between mt-2">
                    {t.assigned_to
                      ? <span className="flex items-center gap-1 text-[10px] text-slate-500"><User size={10}/>{t.assigned_to}</span>
                      : <span className="text-[10px] text-slate-300">ยังไม่มอบหมาย</span>}
                    {t.deadline && (
                      <span className={`flex items-center gap-0.5 text-[10px] ${isNearDeadline(t.deadline)?'text-red-500 font-bold':'text-slate-400'}`}>
                        <Clock size={10}/>
                        {new Date(t.deadline).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit'})}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selected.title}</h3>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold
                  ${selected.status==='กำลังทำ'?'bg-blue-100 text-blue-700':
                    selected.status==='รอรีวิว'?'bg-orange-100 text-orange-700':
                    selected.status==='อนุมัติแล้ว'?'bg-green-100 text-green-700':'bg-slate-100 text-slate-600'}`}>
                  {selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>

            <div className="space-y-3 text-sm">
              {[
                ['ประเภท', selected.task_type],
                ['ช่องทาง', selected.channel||'-'],
                ['ขนาด', selected.size||'-'],
                ['กำหนดส่ง', selected.deadline ? new Date(selected.deadline).toLocaleDateString('th-TH') : '-'],
                ['มอบหมายให้', selected.assigned_to||'-'],
                ['ที่มา', selected.source],
              ].map(([k,v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">{k}</span>
                  <span className="text-slate-700 font-medium">{v}</span>
                </div>
              ))}
              {selected.brief && (
                <div>
                  <div className="text-slate-400 mb-1">Brief</div>
                  <div className="bg-slate-50 rounded-lg p-3 text-slate-700 text-xs leading-relaxed whitespace-pre-wrap">{selected.brief}</div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              {STATUS_NEXT[selected.status] && (
                <button onClick={() => moveNext(selected)}
                  className="flex-1 py-2.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 font-medium text-sm">
                  → {STATUS_NEXT[selected.status]}
                </button>
              )}
              {selected.status === 'อนุมัติแล้ว' && (
                <button onClick={() => archive(selected)}
                  className="px-4 py-2.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 text-sm">
                  เก็บถาวร
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="px-4 py-2.5 bg-slate-100 rounded-lg text-sm hover:bg-slate-200">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
