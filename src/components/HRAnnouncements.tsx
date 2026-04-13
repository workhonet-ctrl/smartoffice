import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Pin } from 'lucide-react';

const CATEGORIES = ['ทั่วไป', 'สำคัญ', 'HR', 'กิจกรรม'];
const CAT_COLOR: Record<string, string> = {
  'ทั่วไป': 'bg-slate-100 text-slate-600', 'สำคัญ': 'bg-red-100 text-red-700',
  'HR': 'bg-blue-100 text-blue-700', 'กิจกรรม': 'bg-green-100 text-green-700',
};

export default function HRAnnouncements() {
  const [items, setItems]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [selected, setSelected]   = useState<any>(null);
  const [saving, setSaving]       = useState(false);
  const [filterCat, setFilterCat] = useState('');

  const [fTitle,   setFTitle]   = useState('');
  const [fContent, setFContent] = useState('');
  const [fCat,     setFCat]     = useState('ทั่วไป');
  const [fAuthor,  setFAuthor]  = useState('');
  const [fPinned,  setFPinned]  = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('hr_announcements').select('*')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false });
    if (data) setItems(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!fTitle.trim() || !fContent.trim()) return;
    setSaving(true);
    await supabase.from('hr_announcements').insert([{
      title: fTitle.trim(), content: fContent.trim(),
      category: fCat, author: fAuthor||null, pinned: fPinned,
    }]);
    setSaving(false); setShowForm(false); load();
  };

  const filtered = items.filter(i => !filterCat || i.category === filterCat);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📢 ประกาศ</h2>
          <p className="text-xs text-slate-400">{items.filter(i => i.pinned).length} ปักหมุด · รวม {items.length} ประกาศ</p>
        </div>
        <div className="flex gap-2">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300">
            <option value="">ทุกหมวด</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2">
            <Plus size={14}/> เพิ่มประกาศ
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 space-y-3">
        {loading && <div className="text-center text-slate-400 py-8">กำลังโหลด...</div>}
        {!loading && filtered.length === 0 && <div className="text-center text-slate-400 py-8">ยังไม่มีประกาศ</div>}
        {filtered.map(item => (
          <div key={item.id} onClick={() => setSelected(item)}
            className="bg-white rounded-xl p-4 shadow-sm border hover:border-blue-200 cursor-pointer transition">
            <div className="flex items-start gap-3">
              {item.pinned && <Pin size={14} className="text-orange-500 mt-0.5 shrink-0"/>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CAT_COLOR[item.category] || 'bg-slate-100 text-slate-500'}`}>
                    {item.category}
                  </span>
                  <span className="text-xs text-slate-400">{item.created_at?.substring(0,10).split('-').reverse().join('/')}</span>
                  {item.author && <span className="text-xs text-slate-400">โดย {item.author}</span>}
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">{item.title}</h4>
                <p className="text-xs text-slate-500 line-clamp-2">{item.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CAT_COLOR[selected.category]}`}>{selected.category}</span>
                <h3 className="text-lg font-bold text-slate-800 mt-1">{selected.title}</h3>
                <p className="text-xs text-slate-400">{selected.created_at?.substring(0,10)} · {selected.author || 'ไม่ระบุผู้เขียน'}</p>
              </div>
              <button onClick={() => setSelected(null)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selected.content}</div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มประกาศ</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หัวข้อ *</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">หมวด</label>
                  <select value={fCat} onChange={e => setFCat(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ผู้เขียน</label>
                  <input value={fAuthor} onChange={e => setFAuthor(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">เนื้อหา *</label>
                <textarea value={fContent} onChange={e => setFContent(e.target.value)} rows={6}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"/>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fPinned} onChange={e => setFPinned(e.target.checked)} className="rounded"/>
                <span className="text-sm text-slate-600 flex items-center gap-1"><Pin size={13}/> ปักหมุดไว้บนสุด</span>
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fTitle.trim() || !fContent.trim() || saving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'เผยแพร่'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
