import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Clock, CheckCircle, User } from 'lucide-react';

type Task = {
  id: string; title: string; task_type: string; channel: string | null;
  size: string | null; deadline: string | null; status: string;
  source: string; brief: string | null; assigned_to: string | null;
  created_at: string;
};

// ── Graphic status → ADS column mapping ───────────────────────────────────
// ADS เห็นงานใน column นี้ตาม status ของ graphic_tasks
const ADS_COLUMNS = [
  {
    key:       'รอดำเนินการ',
    label:     'รอดำเนินการ',
    color:     'bg-purple-50',
    badge:     'bg-purple-400 text-white',
    // งานที่ Graphic ส่งมาให้ ADS review (status = รอรีวิว)
    // รวมถึงงานใหม่ที่ ADS เพิ่งสร้าง
    statuses:  ['รอรีวิว'],
    desc:      'กราฟฟิกส่งงานรอ ADS อนุมัติ',
  },
  {
    key:       'กำลังทำ',
    label:     'กำลังทำ',
    color:     'bg-blue-50',
    badge:     'bg-blue-400 text-white',
    // งานที่ Graphic กำลังทำอยู่
    statuses:  ['รอดำเนินการ', 'กำลังทำ'],
    desc:      'กราฟฟิกกำลังดำเนินการ',
  },
  {
    key:       'ตรวจงาน',
    label:     'ตรวจงาน',
    color:     'bg-orange-50',
    badge:     'bg-orange-400 text-white',
    // ADS อนุมัติแล้ว กำลังนำไปใช้โฆษณา
    statuses:  ['อนุมัติแล้ว'],
    desc:      'ADS อนุมัติแล้ว กำลังรัน',
  },
  {
    key:       'สำเร็จ',
    label:     'สำเร็จ',
    color:     'bg-green-50',
    badge:     'bg-green-500 text-white',
    statuses:  ['เก็บถาวร'],
    desc:      'เสร็จสมบูรณ์',
  },
];

const TYPE_OPTIONS  = ['รูปภาพ', 'วิดีโอ', 'Story', 'Reel', 'Banner', 'อื่นๆ'];
const CHAN_OPTIONS  = ['Facebook', 'Instagram', 'TikTok', 'LINE OA', 'Shopee', 'Lazada'];

function isNearDeadline(d: string | null) {
  if (!d) return false;
  return (new Date(d).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
}

const STATUS_COLOR: Record<string, string> = {
  'รอดำเนินการ': 'bg-slate-100 text-slate-600',
  'กำลังทำ':    'bg-blue-100 text-blue-700',
  'รอรีวิว':    'bg-orange-100 text-orange-700',
  'อนุมัติแล้ว':'bg-green-100 text-green-700',
  'เก็บถาวร':  'bg-gray-100 text-gray-500',
};

export default function MarketingAds() {
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]       = useState(false);

  // ── Create form state ─────────────────────────────────────────────────
  const [fTitle,   setFTitle]   = useState('');
  const [fType,    setFType]    = useState('รูปภาพ');
  const [fChannel, setFChannel] = useState('Facebook');
  const [fSize,    setFSize]    = useState('');
  const [fDeadline,setFDeadline]= useState('');
  const [fBrief,   setFBrief]   = useState('');
  const [fAssign,  setFAssign]  = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    // โหลดเฉพาะงานที่ source = ทีมโฆษณา หรือทุกงาน (แล้วแต่ business logic)
    const { data } = await supabase.from('graphic_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  // ── สร้างงานใหม่ → ส่งไปหน้ากราฟฟิก ────────────────────────────────────
  const handleCreate = async () => {
    if (!fTitle.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('graphic_tasks').insert([{
        title:       fTitle.trim(),
        task_type:   fType,
        channel:     fChannel,
        size:        fSize.trim() || null,
        deadline:    fDeadline || null,
        brief:       fBrief.trim() || null,
        assigned_to: fAssign.trim() || null,
        status:      'รอดำเนินการ',   // เริ่มที่ Graphic board column แรก
        source:      'ทีมโฆษณา',     // tag ว่ามาจาก ADS team
      }]);
      if (!error) {
        await load();
        setShowCreate(false);
        setFTitle(''); setFType('รูปภาพ'); setFChannel('Facebook');
        setFSize(''); setFDeadline(''); setFBrief(''); setFAssign('');
      }
    } finally { setSaving(false); }
  };

  // ── ADS อนุมัติ: รอรีวิว → อนุมัติแล้ว ──────────────────────────────────
  const handleApprove = async (task: Task) => {
    await supabase.from('graphic_tasks')
      .update({ status: 'อนุมัติแล้ว', updated_at: new Date().toISOString() })
      .eq('id', task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: 'อนุมัติแล้ว' } : t));
    if (selected?.id === task.id) setSelected({ ...task, status: 'อนุมัติแล้ว' });
  };

  // ── ADS ทำเสร็จ: เก็บถาวร ────────────────────────────────────────────────
  const handleComplete = async (task: Task) => {
    if (!confirm(`ยืนยันทำเครื่องหมาย "${task.title}" เป็นสำเร็จ?`)) return;
    await supabase.from('graphic_tasks')
      .update({ status: 'เก็บถาวร', updated_at: new Date().toISOString() })
      .eq('id', task.id);
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: 'เก็บถาวร' } : t));
    setSelected(null);
  };

  if (loading) return <div className="p-8 text-slate-400 text-center">กำลังโหลด...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📊 Board โฆษณา ADS</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            สร้างงานกราฟฟิก · ติดตามสถานะ · อนุมัติงาน
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 flex items-center gap-2 text-sm font-medium shadow-sm">
          <Plus size={16}/> สร้างงานใหม่
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 flex-1 overflow-x-auto overflow-y-hidden pb-2">
        {ADS_COLUMNS.map(col => {
          const colTasks = tasks.filter(t => col.statuses.includes(t.status));
          return (
            <div key={col.key} className="flex flex-col min-w-[260px] w-[260px] shrink-0">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div>
                  <span className="font-semibold text-sm text-slate-700">{col.label}</span>
                  <div className="text-[10px] text-slate-400 mt-0.5">{col.desc}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${col.badge}`}>{colTasks.length}</span>
              </div>

              {/* Cards */}
              <div className={`flex-1 rounded-xl p-2 space-y-2 overflow-y-auto ${col.color}`}>
                {colTasks.length === 0 && (
                  <div className="text-center text-slate-400 text-xs py-8">ไม่มีงาน</div>
                )}
                {colTasks.map(t => (
                  <div key={t.id}
                    onClick={() => setSelected(t)}
                    className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:shadow border border-slate-100 hover:border-purple-200 transition">
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="font-medium text-slate-800 text-sm leading-tight">{t.title}</span>
                      {t.source === 'ทีมโฆษณา' && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">ADS</span>
                      )}
                    </div>
                    {t.task_type && (
                      <div className="text-xs text-slate-400 mb-1">{t.task_type}{t.channel ? ` · ${t.channel}` : ''}</div>
                    )}
                    {/* Status badge ใน card */}
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold mb-2 ${STATUS_COLOR[t.status] || 'bg-slate-100 text-slate-500'}`}>
                      {t.status}
                    </span>
                    <div className="flex items-center justify-between">
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
                    {/* ปุ่ม approve ตรงๆ ใน card */}
                    {t.status === 'รอรีวิว' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleApprove(t); }}
                        className="mt-2 w-full py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 font-bold flex items-center justify-center gap-1">
                        <CheckCircle size={12}/> อนุมัติ
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detail Modal ──────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selected.title}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[selected.status] || 'bg-slate-100 text-slate-600'}`}>
                    {selected.status}
                  </span>
                  {selected.source === 'ทีมโฆษณา' && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">สร้างโดย ADS</span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>

            <div className="space-y-3 text-sm">
              {[
                ['ประเภท',    selected.task_type],
                ['ช่องทาง',   selected.channel || '-'],
                ['ขนาด',      selected.size || '-'],
                ['กำหนดส่ง',  selected.deadline ? new Date(selected.deadline).toLocaleDateString('th-TH') : '-'],
                ['มอบหมายให้',selected.assigned_to || '-'],
                ['ที่มา',     selected.source],
              ].map(([k, v]) => (
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

            <div className="flex gap-2 mt-5 flex-wrap">
              {/* อนุมัติ: เฉพาะงานที่ Graphic ส่งมา (รอรีวิว) */}
              {selected.status === 'รอรีวิว' && (
                <button onClick={() => handleApprove(selected)}
                  className="flex-1 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm flex items-center justify-center gap-2">
                  <CheckCircle size={15}/> อนุมัติงาน
                </button>
              )}
              {/* ทำเสร็จ: เฉพาะงานที่ ADS อนุมัติแล้ว */}
              {selected.status === 'อนุมัติแล้ว' && (
                <button onClick={() => handleComplete(selected)}
                  className="flex-1 py-2.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium text-sm">
                  ✓ ทำเสร็จสมบูรณ์
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="px-4 py-2.5 bg-slate-100 rounded-lg text-sm hover:bg-slate-200">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Task Modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">สร้างงานใหม่</h3>
                <p className="text-xs text-slate-400 mt-0.5">งานจะถูกส่งไปยังหน้ากราฟฟิกอัตโนมัติ</p>
              </div>
              <button onClick={() => setShowCreate(false)}><X size={20} className="text-slate-400"/></button>
            </div>

            <div className="space-y-4">
              {/* ชื่องาน */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่องาน *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)}
                  placeholder="เช่น โปสเตอร์โปรโมชัน April..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>

              {/* ประเภท + ช่องทาง */}
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

              {/* ขนาด + กำหนดส่ง */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ขนาด</label>
                  <input value={fSize} onChange={e => setFSize(e.target.value)}
                    placeholder="เช่น 1080×1080"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">กำหนดส่ง</label>
                  <input type="date" value={fDeadline} onChange={e => setFDeadline(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
                </div>
              </div>

              {/* มอบหมาย */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">มอบหมายให้</label>
                <input value={fAssign} onChange={e => setFAssign(e.target.value)}
                  placeholder="ชื่อกราฟฟิก..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
              </div>

              {/* Brief */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Brief / รายละเอียด</label>
                <textarea value={fBrief} onChange={e => setFBrief(e.target.value)}
                  placeholder="อธิบายสิ่งที่ต้องการ เช่น สี, ข้อความ, โทนภาพ..."
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"/>
              </div>

              {/* Info */}
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-xs text-purple-600 flex items-center gap-2">
                <span>📤</span>
                <span>งานนี้จะปรากฏที่ <strong>หน้ากราฟฟิก → รอดำเนินการ</strong> ทันที</span>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
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
