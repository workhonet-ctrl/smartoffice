import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search } from 'lucide-react';

type Task = {
  id: string; title: string; task_type: string; channel: string | null;
  assigned_to: string | null; updated_at: string;
};

const CHANNELS = ['ทั้งหมด','Facebook','TikTok','Instagram','Line OA','เว็บไซต์','อื่นๆ'];
const TYPES    = ['ทั้งหมด','ภาพนิ่ง','Reels/วิดีโอ','Story','Banner','โปสเตอร์','อื่นๆ'];

export default function GraphicAssets() {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('ทั้งหมด');
  const [type, setType]       = useState('ทั้งหมด');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('graphic_tasks')
      .select('id, title, task_type, channel, assigned_to, updated_at')
      .eq('status', 'อนุมัติแล้ว').order('updated_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  const filtered = tasks.filter(t => {
    const matchCh   = channel === 'ทั้งหมด' || t.channel === channel;
    const matchType = type === 'ทั้งหมด' || t.task_type === type;
    const matchSrch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    return matchCh && matchType && matchSrch;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่องาน..."
            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
        </div>
        <select value={channel} onChange={e => setChannel(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
          {CHANNELS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
          <div className="text-center text-slate-400">
            <div className="text-4xl mb-3">🖼️</div>
            <p>ยังไม่มี Assets ที่อนุมัติแล้ว</p>
            <p className="text-xs mt-1">เมื่อมอบหมายงานผ่านรีวิวแล้ว จะปรากฏที่นี่</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-pink-200 hover:shadow transition">
                <div className="w-full h-24 bg-gradient-to-br from-pink-50 to-purple-50 rounded-lg mb-3 flex items-center justify-center">
                  <span className="text-3xl">
                    {t.task_type === 'Reels/วิดีโอ' ? '🎬' :
                     t.task_type === 'Story' ? '📱' :
                     t.task_type === 'Banner' ? '🖼️' : '🎨'}
                  </span>
                </div>
                <div className="font-medium text-slate-800 text-sm leading-tight mb-1 truncate">{t.title}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{t.channel || '-'}</span>
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold">อนุมัติ</span>
                </div>
                {t.assigned_to && <div className="text-xs text-slate-400 mt-1">{t.assigned_to}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
