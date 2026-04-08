import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Clock, CheckCircle, User, Search } from 'lucide-react';

type Task = {
  id: string; title: string; task_type: string; channel: string | null;
  size: string | null; deadline: string | null; status: string;
  source: string; brief: string | null; assigned_to: string | null;
  created_at: string; updated_at?: string;
};

type Tab = 'board' | 'list';

const ADS_COLUMNS = [
  { key: 'รอดำเนินการ', label: 'รอดำเนินการ', color: 'bg-purple-50',  badge: 'bg-purple-400 text-white',  statuses: ['รอรีวิว'],                    desc: 'กราฟฟิกส่งงานรอ ADS อนุมัติ' },
  { key: 'กำลังทำ',     label: 'กำลังทำ',     color: 'bg-blue-50',    badge: 'bg-blue-400 text-white',    statuses: ['รอดำเนินการ', 'กำลังทำ'],      desc: 'กราฟฟิกกำลังดำเนินการ' },
  { key: 'ตรวจงาน',    label: 'ตรวจงาน',    color: 'bg-orange-50',  badge: 'bg-orange-400 text-white',  statuses: ['อนุมัติแล้ว'],                  desc: 'ADS อนุมัติแล้ว กำลังรัน' },
  { key: 'สำเร็จ',     label: 'สำเร็จ',     color: 'bg-green-50',   badge: 'bg-green-500 text-white',   statuses: ['เก็บถาวร'],                     desc: 'เสร็จสมบูรณ์' },
];

function getAdsColumn(status: string) {
  for (const col of ADS_COLUMNS) {
    if (col.statuses.includes(status)) return col.key;
  }
  return '-';
}

const TYPE_OPTIONS = ['รูปภาพ', 'วิดีโอ', 'Story', 'Reel', 'Banner', 'อื่นๆ'];
const CHAN_OPTIONS = ['Facebook', 'Instagram', 'TikTok', 'LINE OA', 'Shopee', 'Lazada'];
const ALL_STATUSES = ['รอดำเนินการ', 'กำลังทำ', 'รอรีวิว', 'อนุมัติแล้ว', 'เก็บถาวร'];

function isNear(d: string | null) {
  if (!d) return false;
  return (new Date(d).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
}

const STATUS_COLOR: Record<string, string> = {
  'รอดำเนินการ': 'bg-slate-100 text-slate-600',
  'กำลังทำ':    'bg-blue-100 text-blue-700',
  'รอรีวิว':    'bg-orange-100 text-orange-700',
  'อนุมัติแล้ว': 'bg-green-100 text-green-700',
  'เก็บถาวร':   'bg-gray-100 text-gray-500',
};

const ADS_COL_COLOR: Record<string, string> = {
  'รอดำเนินการ': 'bg-purple-100 text-purple-700',
  'กำลังทำ':    'bg-blue-100 text-blue-700',
  'ตรวจงาน':   'bg-orange-100 text-orange-700',
  'สำเร็จ':     'bg-green-100 text-green-700',
  '-':           'bg-slate-100 text-slate-400',
};

function fmtDate(d: string | null | undefined, short = false) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', short
    ? { day: '2-digit', month: '2-digit', year: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function MarketingAds() {
  const [tab,  setTab]    = useState<Tab>('board');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]       = useState(false);

  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAdsCol, setFilterAdsCol] = useState('');

  const [fTitle,    setFTitle]    = useState('');
  const [fType,     setFType]     = useState('รูปภาพ');
  const [fChannel,  setFChannel]  = useState('Facebook');
  const [fSize,     setFSize]     = useState('');
  const [fDeadline, setFDeadline] = useState('');
  const [fBrief,    setFBrief]    = useState('');
  const [fAssign,   setFAssign]   = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('graphic_tasks')
      .select('*').order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!fTitle.trim()) return;
    setSaving(true);
    try {
      await supabase.from('graphic_tasks').insert([{
        title: fTitle.trim(), task_type: fType, channel: fChannel,
        size: fSize.trim() || null, deadline: fDeadline || null,
        brief: fBrief.trim() || null, assigned_to: fAssign.trim() || null,
        status: 'รอดำเนินการ', source: 'ทีมโฆษณา',
      }]);
      await load();
      setShowCreate(false);
      setFTitle(''); setFType('รูปภาพ'); setFChannel('Facebook');
      setFSize(''); setFDeadline(''); setFBrief(''); setFAssign('');
    } finally { setSaving(false); }
  };

  const handleApprove = async (task: Task) => {
    await supabase.from('graphic_tasks')
      .update({ status: 'อนุมัติแล้ว', updated_at: new Date().toISOString() }).eq('id', task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: 'อนุมัติแล้ว' } : t));
    if (selected?.id === task.id) setSelected({ ...task, status: 'อนุมัติแล้ว' });
  };

  const handleComplete = async (task: Task) => {
    if (!confirm('ยืนยันทำเครื่องหมายเป็นสำเร็จ?')) return;
    await supabase.from('graphic_tasks')
      .update({ status: 'เก็บถาวร', updated_at: new Date().toISOString() }).eq('id', task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: 'เก็บถาวร' } : t));
    setSelected(null);
  };

  const filteredList = tasks.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!(t.title.toLowerCase().includes(q) || (t.assigned_to || '').toLowerCase().includes(q))) return false;
    }
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterAdsCol && getAdsColumn(t.status) !== filterAdsCol) return false;
    return true;
  });

  if (loading) return <div className="p-8 text-slate-400 text-center">กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header + tabs */}
      <div className="shrink-0 flex items-center justify-between mb-4 px-1 flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([['board', '📊 Board'], ['list', '📋 รายการงาน']] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === key ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'}`}>
                {tasks.length}
              </span>
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 flex items-center gap-2 text-sm font-medium shadow-sm">
          <Plus size={16} /> สร้างงานใหม่
        </button>
      </div>

      {/* Board tab */}
      {tab === 'board' && (
        <div className="flex gap-3 flex-1 overflow-x-auto overflow-y-hidden pb-2">
          {ADS_COLUMNS.map(col => {
            const colTasks = tasks.filter(t => col.statuses.includes(t.status));
            return (
              <div key={col.key} className="flex flex-col min-w-[260px] w-[260px] shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div>
                    <span className="font-semibold text-sm text-slate-700">{col.label}</span>
                    <div className="text-[10px] text-slate-400 mt-0.5">{col.desc}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${col.badge}`}>{colTasks.length}</span>
                </div>
                <div className={`flex-1 rounded-xl p-2 space-y-2 overflow-y-auto ${col.color}`}>
                  {colTasks.length === 0 && <div className="text-center text-slate-400 text-xs py-8">ไม่มีงาน</div>}
                  {colTasks.map(t => (
                    <div key={t.id} onClick={() => setSelected(t)}
                      className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:shadow border border-slate-100 hover:border-purple-200 transition">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-medium text-slate-800 text-sm leading-tight">{t.title}</span>
                        {t.source === 'ทีมโฆษณา' && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">ADS</span>
                        )}
                      </div>
                      {t.task_type && <div className="text-xs text-slate-400 mb-1">{t.task_type}{t.channel ? ` · ${t.channel}` : ''}</div>}
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold mb-2 ${STATUS_COLOR[t.status] || 'bg-slate-100 text-slate-500'}`}>
                        {t.status}
                      </span>
                      <div className="flex items-center justify-between">
                        {t.assigned_to
                          ? <span className="flex items-center gap-1 text-[10px] text-slate-500"><User size={10} />{t.assigned_to}</span>
                          : <span className="text-[10px] text-slate-300">ยังไม่มอบหมาย</span>}
                        {t.deadline && (
                          <span className={`flex items-center gap-0.5 text-[10px] ${isNear(t.deadline) ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                            <Clock size={10} />{fmtDate(t.deadline, true)}
                          </span>
                        )}
                      </div>
                      {t.status === 'รอรีวิว' && (
                        <button onClick={e => { e.stopPropagation(); handleApprove(t); }}
                          className="mt-2 w-full py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 font-bold flex items-center justify-center gap-1">
                          <CheckCircle size={12} /> อนุมัติ
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List tab */}
      {tab === 'list' && (
        <>
          <div className="shrink-0 mb-3 bg-white rounded-xl border px-4 py-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่องาน / ผู้รับผิดชอบ..."
                className="pl-8 pr-4 py-2 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-300" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">สถานะกราฟฟิก: ทั้งหมด</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterAdsCol} onChange={e => setFilterAdsCol(e.target.value)}
              className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">Board ADS: ทั้งหมด</option>
              {ADS_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
            {(search || filterStatus || filterAdsCol) && (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterAdsCol(''); }}
                className="px-2.5 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200">ล้าง ✕</button>
            )}
            <span className="text-xs text-slate-400 ml-auto">{filteredList.length} รายการ</span>
          </div>

          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{ minWidth: '1000px' }}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">วันที่เพิ่ม</th>
                  <th className="p-3 text-left">ชื่องาน</th>
                  <th className="p-3 text-left whitespace-nowrap">ประเภทงาน</th>
                  <th className="p-3 text-left whitespace-nowrap">ช่องทาง</th>
                  <th className="p-3 text-left whitespace-nowrap">ที่มา</th>
                  <th className="p-3 text-left whitespace-nowrap">มอบหมายให้</th>
                  <th className="p-3 text-center whitespace-nowrap">กำหนดส่ง</th>
                  <th className="p-3 text-center whitespace-nowrap">สถานะกราฟฟิก</th>
                  <th className="p-3 text-center whitespace-nowrap">Board ADS</th>
                  <th className="p-3 text-center whitespace-nowrap">อนุมัติ</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">ไม่พบรายการ</td></tr>
                )}
                {filteredList.map(t => {
                  const adsCol = getAdsColumn(t.status);
                  return (
                    <tr key={t.id} onClick={() => setSelected(t)}
                      className="border-b hover:bg-purple-50 cursor-pointer transition">
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                        <div>{fmtDate(t.created_at, true)}</div>
                        {t.updated_at && t.updated_at !== t.created_at && (
                          <div className="text-slate-300 text-[10px]">อัพ {fmtDate(t.updated_at, true)}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800 leading-tight">{t.title}</div>
                        {t.brief && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{t.brief}</div>}
                      </td>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{t.task_type || '-'}</td>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{t.channel || '-'}</td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.source === 'ทีมโฆษณา' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-700'}`}>
                          {t.source || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-slate-600 whitespace-nowrap">
                        {t.assigned_to
                          ? <span className="flex items-center gap-1"><User size={11} />{t.assigned_to}</span>
                          : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {t.deadline
                          ? <span className={`text-xs font-medium ${isNear(t.deadline) ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                              {fmtDate(t.deadline, true)}{isNear(t.deadline) && ' ⚠'}
                            </span>
                          : <span className="text-slate-300 text-xs">-</span>}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[t.status] || 'bg-slate-100 text-slate-500'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ADS_COL_COLOR[adsCol]}`}>
                          {adsCol}
                        </span>
                      </td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        {t.status === 'รอรีวิว' && (
                          <button onClick={() => handleApprove(t)}
                            className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 font-bold whitespace-nowrap">
                            ✓ อนุมัติ
                          </button>
                        )}
                        {t.status === 'อนุมัติแล้ว' && (
                          <button onClick={() => handleComplete(t)}
                            className="px-3 py-1 bg-teal-500 text-white text-xs rounded-lg hover:bg-teal-600 font-bold whitespace-nowrap">
                            ✓ เสร็จ
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selected.title}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[selected.status] || 'bg-slate-100 text-slate-600'}`}>{selected.status}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ADS_COL_COLOR[getAdsColumn(selected.status)]}`}>Board: {getAdsColumn(selected.status)}</span>
                  {selected.source === 'ทีมโฆษณา' && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">ADS</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-2.5 text-sm">
              {([
                ['ประเภท',      selected.task_type],
                ['ช่องทาง',     selected.channel || '-'],
                ['ขนาด',        selected.size || '-'],
                ['ที่มา',       selected.source],
                ['มอบหมายให้',  selected.assigned_to || '-'],
                ['กำหนดส่ง',    fmtDate(selected.deadline)],
                ['วันที่เพิ่ม',  fmtDate(selected.created_at)],
                ['อัพเดตล่าสุด', fmtDate(selected.updated_at)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 w-28 shrink-0">{k}</span>
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
              {selected.status === 'รอรีวิว' && (
                <button onClick={() => handleApprove(selected)}
                  className="flex-1 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm flex items-center justify-center gap-2">
                  <CheckCircle size={15} /> อนุมัติงาน
                </button>
              )}
              {selected.status === 'อนุมัติแล้ว' && (
                <button onClick={() => handleComplete(selected)}
                  className="flex-1 py-2.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium text-sm">
                  ✓ ทำเสร็จสมบูรณ์
                </button>
              )}
              <button onClick={() => setSelected(null)} className="px-4 py-2.5 bg-slate-100 rounded-lg text-sm hover:bg-slate-200">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">สร้างงานใหม่</h3>
                <p className="text-xs text-slate-400 mt-0.5">งานจะถูกส่งไปยังหน้ากราฟฟิกอัตโนมัติ</p>
              </div>
              <button onClick={() => setShowCreate(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่องาน *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="เช่น โปสเตอร์โปรโมชัน April..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ประเภทงาน</label>
                  <select value={fType} onChange={e => setFType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white">
                    {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ช่องทาง</label>
                  <select value={fChannel} onChange={e => setFChannel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white">
                    {CHAN_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ขนาด</label>
                  <input value={fSize} onChange={e => setFSize(e.target.value)} placeholder="เช่น 1080x1080"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">กำหนดส่ง</label>
                  <input type="date" value={fDeadline} onChange={e => setFDeadline(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">มอบหมายให้</label>
                <input value={fAssign} onChange={e => setFAssign(e.target.value)} placeholder="ชื่อกราฟฟิก..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Brief / รายละเอียด</label>
                <textarea value={fBrief} onChange={e => setFBrief(e.target.value)} rows={4}
                  placeholder="อธิบายสิ่งที่ต้องการ เช่น สี, ข้อความ, โทนภาพ..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none" />
              </div>
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-xs text-purple-600 flex items-center gap-2">
                <span>📤</span><span>งานนี้จะปรากฏที่ <strong>หน้ากราฟฟิก → รอดำเนินการ</strong> ทันที</span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleCreate} disabled={!fTitle.trim() || saving}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังสร้าง...' : '📤 ส่งไปกราฟฟิก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
