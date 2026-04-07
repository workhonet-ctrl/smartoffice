import { useState } from 'react';
import { supabase } from '../lib/supabase';

const TYPES    = ['ภาพนิ่ง','Reels/วิดีโอ','Story','Banner','โปสเตอร์','อื่นๆ'];
const CHANNELS = ['Facebook','TikTok','Instagram','Line OA','เว็บไซต์','อื่นๆ'];
const SOURCES  = ['ทีมโฆษณา','ทีมงานภายใน','HR/แอดมิน'];

export default function GraphicBrief({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', task_type: 'ภาพนิ่ง', channel: '', size: '',
    deadline: '', source: 'ทีมโฆษณา', brief: '',
    assigned_to: '', created_by: '',
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!form.title) return;
    setSaving(true);
    await supabase.from('graphic_tasks').insert([{
      ...form,
      channel: form.channel || null,
      size: form.size || null,
      deadline: form.deadline || null,
      assigned_to: form.assigned_to || null,
      created_by: form.created_by || null,
      status: 'รอดำเนินการ',
    }]);
    setSaving(false); setDone(true);
    setTimeout(() => { setDone(false); onCreated(); }, 1200);
  };

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-5">สร้างงานใหม่ / ส่ง Brief</h3>

        {done && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
            ✓ สร้างงานสำเร็จ กำลังกลับไป Board...
          </div>
        )}

        <div className="space-y-4">
          {/* ที่มา */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">ที่มาของงาน</label>
            <div className="flex gap-2 flex-wrap">
              {SOURCES.map(s => (
                <button key={s} onClick={() => set('source', s)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${form.source===s?'bg-pink-500 text-white border-pink-500':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* ชื่องาน */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">ชื่องาน *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="เช่น ภาพโปรโมชั่นเมษายน Secret Rose"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
          </div>

          {/* ประเภท + ช่องทาง */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">ประเภทงาน</label>
              <select value={form.task_type} onChange={e => set('task_type', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">ช่องทาง</label>
              <select value={form.channel} onChange={e => set('channel', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
                <option value="">-- เลือก --</option>
                {CHANNELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* ขนาด + กำหนดส่ง */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">ขนาด</label>
              <input value={form.size} onChange={e => set('size', e.target.value)}
                placeholder="เช่น 1080×1080, 9:16"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">กำหนดส่ง</label>
              <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
            </div>
          </div>

          {/* มอบหมาย + สร้างโดย */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">มอบหมายให้</label>
              <input value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
                placeholder="ชื่อกราฟฟิก..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">สร้างโดย</label>
              <input value={form.created_by} onChange={e => set('created_by', e.target.value)}
                placeholder="ชื่อผู้สร้าง..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
            </div>
          </div>

          {/* Brief */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Brief / รายละเอียด</label>
            <textarea value={form.brief} onChange={e => set('brief', e.target.value)}
              rows={5} placeholder="อธิบายสิ่งที่ต้องการ เช่น สี tone mood สินค้า ข้อความที่ต้องการ..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"/>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => onCreated()}
              className="px-4 py-2.5 bg-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
            <button onClick={handleSubmit} disabled={!form.title || saving}
              className="flex-1 py-2.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 font-medium text-sm">
              {saving ? 'กำลังสร้าง...' : '✓ สร้างงาน'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
