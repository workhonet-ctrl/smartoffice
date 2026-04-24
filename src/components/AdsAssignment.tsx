import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, Edit2, Save, X, ChevronDown } from 'lucide-react';

type AdsAccount = {
  id: string;
  name: string;
  account_id: string;
  business_name: string | null;
  status: string | null;
};

type AdsPage = {
  id: string;
  name: string;
  account_id: string | null;
  admin_id: string | null;
  status: string | null;
};

type AdsAdmin = {
  id: string;
  name: string;
};

const STATUS_COLOR: Record<string, string> = {
  'ยิงโฆษณา':        'bg-emerald-100 text-emerald-700 border-emerald-200',
  'ไม่ได้ยิงโฆษณา': 'bg-slate-100 text-slate-500 border-slate-200',
  'ใช้งาน':          'bg-blue-100 text-blue-700 border-blue-200',
  'ค้างเงิน':        'bg-red-100 text-red-600 border-red-200',
  'ว่าง':            'bg-amber-100 text-amber-600 border-amber-200',
};

export default function AdsAssignment() {
  const [pages,    setPages]    = useState<AdsPage[]>([]);
  const [accounts, setAccounts] = useState<AdsAccount[]>([]);
  const [admins,   setAdmins]   = useState<AdsAdmin[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState<string | null>(null); // page id ที่กำลัง edit
  const [draft,    setDraft]    = useState<Partial<AdsPage>>({});
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);
  const [filterAdmin,  setFilterAdmin]  = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: a }, { data: adm }] = await Promise.all([
      supabase.from('ads_pages').select('*').order('name'),
      supabase.from('ads_accounts').select('*').order('name'),
      supabase.from('ads_admins').select('*').order('name'),
    ]);
    setPages(p || []);
    setAccounts(a || []);
    setAdmins(adm || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (page: AdsPage) => {
    setEditing(page.id);
    setDraft({ account_id: page.account_id, admin_id: page.admin_id, status: page.status });
  };

  const cancelEdit = () => { setEditing(null); setDraft({}); };

  const saveEdit = async (page: AdsPage) => {
    setSaving(true);
    const { error } = await supabase.from('ads_pages').update({
      account_id: draft.account_id || null,
      admin_id:   draft.admin_id   || null,
      status:     draft.status     || page.status,
    }).eq('id', page.id);
    if (error) { showToast('บันทึกไม่สำเร็จ'); }
    else {
      setPages(prev => prev.map(p => p.id === page.id
        ? { ...p, account_id: draft.account_id||null, admin_id: draft.admin_id||null, status: draft.status||p.status }
        : p));
      showToast('✓ บันทึกแล้ว');
      setEditing(null); setDraft({});
    }
    setSaving(false);
  };

  // ─── helpers ─────────────────────────────────────────────
  const getAdmin   = (id: string | null) => admins.find(a => a.id === id);
  const getAccount = (id: string | null) => accounts.find(a => a.id === id);

  // ─── filter ──────────────────────────────────────────────
  const filtered = pages.filter(p => {
    if (filterAdmin  && p.admin_id   !== filterAdmin)  return false;
    if (filterStatus && p.status     !== filterStatus)  return false;
    return true;
  });

  // ─── stats ────────────────────────────────────────────────
  const firing    = pages.filter(p => p.status === 'ยิงโฆษณา').length;
  const assigned  = pages.filter(p => p.admin_id).length;
  const unassigned= pages.filter(p => !p.admin_id).length;

  // ─── group by admin ───────────────────────────────────────
  const adminSummary = admins.map(adm => ({
    ...adm,
    pageCount:    pages.filter(p => p.admin_id === adm.id).length,
    firingCount:  pages.filter(p => p.admin_id === adm.id && p.status === 'ยิงโฆษณา').length,
  }));

  return (
    <div className="flex flex-col h-screen p-6 pb-2 gap-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📣 ตารางความรับผิดชอบโฆษณา</h1>
          <p className="text-xs text-slate-400 mt-0.5">ดูว่าใครยิงโฆษณา เฟสบุ๊กไหน เพจอะไร — แก้ไขได้โดยตรง</p>
        </div>
        <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">เพจทั้งหมด</div>
          <div className="text-2xl font-bold text-slate-700">{pages.length}</div>
        </div>
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
          <div className="text-xs text-emerald-600 mb-1">กำลังยิงโฆษณา</div>
          <div className="text-2xl font-bold text-emerald-600">{firing}</div>
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
          <div className="text-xs text-blue-600 mb-1">มอบหมายแล้ว</div>
          <div className="text-2xl font-bold text-blue-600">{assigned}</div>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4">
          <div className="text-xs text-amber-600 mb-1">ยังไม่มอบหมาย</div>
          <div className="text-2xl font-bold text-amber-600">{unassigned}</div>
        </div>
      </div>

      {/* Admin summary chips */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs text-slate-400 mr-1">สรุปต่อแอดมิน:</span>
        {adminSummary.map(adm => (
          <button key={adm.id}
            onClick={() => setFilterAdmin(filterAdmin === adm.id ? '' : adm.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterAdmin === adm.id
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}>
            <span>{adm.name}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              filterAdmin === adm.id ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-500'
            }`}>{adm.pageCount} เพจ</span>
            {adm.firingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="กำลังยิงโฆษณา"/>
            )}
          </button>
        ))}
        <button
          onClick={() => setFilterStatus(filterStatus === 'ยิงโฆษณา' ? '' : 'ยิงโฆษณา')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ml-auto ${
            filterStatus === 'ยิงโฆษณา'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          }`}>
          🟢 แสดงเฉพาะยิงโฆษณา
        </button>
        {(filterAdmin || filterStatus) && (
          <button onClick={() => { setFilterAdmin(''); setFilterStatus(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <X size={11}/> ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-800 text-white z-10">
            <tr>
              <th className="p-3 text-left text-xs font-medium w-6">#</th>
              <th className="p-3 text-left text-xs font-medium">เพจ</th>
              <th className="p-3 text-left text-xs font-medium">สถานะเพจ</th>
              <th className="p-3 text-left text-xs font-medium">แอดมินรับผิดชอบ</th>
              <th className="p-3 text-left text-xs font-medium">บัญชีโฆษณา (เฟสบุ๊ก)</th>
              <th className="p-3 text-left text-xs font-medium">สถานะบัญชี</th>
              <th className="p-3 text-center text-xs font-medium w-20">แก้ไข</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400 text-sm">กำลังโหลด...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400 text-sm">ไม่พบข้อมูล</td></tr>
            )}
            {filtered.map((page, idx) => {
              const admin   = getAdmin(page.admin_id);
              const account = getAccount(page.account_id);
              const isEdit  = editing === page.id;

              return (
                <tr key={page.id}
                  className={`border-b transition ${isEdit ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}>
                  <td className="p-3 text-xs text-slate-400">{idx + 1}</td>

                  {/* เพจ */}
                  <td className="p-3">
                    <div className="font-medium text-slate-800 text-sm">{page.name}</div>
                  </td>

                  {/* สถานะเพจ */}
                  <td className="p-3">
                    {isEdit ? (
                      <div className="relative">
                        <select value={draft.status || page.status || ''}
                          onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                          className="w-full pl-2 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none bg-white">
                          <option>ยิงโฆษณา</option>
                          <option>ไม่ได้ยิงโฆษณา</option>
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${STATUS_COLOR[page.status || ''] || 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {page.status || '-'}
                      </span>
                    )}
                  </td>

                  {/* แอดมิน */}
                  <td className="p-3">
                    {isEdit ? (
                      <div className="relative">
                        <select value={draft.admin_id || ''}
                          onChange={e => setDraft(d => ({ ...d, admin_id: e.target.value || null }))}
                          className="w-full pl-2 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none bg-white">
                          <option value="">— ยังไม่มอบหมาย —</option>
                          {admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                      </div>
                    ) : admin ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {admin.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{admin.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 italic">ยังไม่มอบหมาย</span>
                    )}
                  </td>

                  {/* บัญชีโฆษณา */}
                  <td className="p-3">
                    {isEdit ? (
                      <div className="relative">
                        <select value={draft.account_id || ''}
                          onChange={e => setDraft(d => ({ ...d, account_id: e.target.value || null }))}
                          className="w-full pl-2 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 appearance-none bg-white">
                          <option value="">— ยังไม่กำหนด —</option>
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                      </div>
                    ) : account ? (
                      <div>
                        <div className="text-xs font-medium text-slate-700">{account.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{account.account_id}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 italic">ยังไม่กำหนด</span>
                    )}
                  </td>

                  {/* สถานะบัญชี */}
                  <td className="p-3">
                    {account ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLOR[account.status || ''] || 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {account.status || '-'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-200">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-center">
                    {isEdit ? (
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => saveEdit(page)} disabled={saving}
                          className="p-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50">
                          <Save size={13}/>
                        </button>
                        <button onClick={cancelEdit}
                          className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition">
                          <X size={13}/>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(page)}
                        className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition">
                        <Edit2 size={13}/>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
