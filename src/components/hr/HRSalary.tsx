import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, ChevronLeft, ChevronRight, Settings } from 'lucide-react';

export default function HRSalary() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());
  const [records, setRecords]   = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [settings, setSettings]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [fEmp,        setFEmp]        = useState('');
  const [fBase,       setFBase]       = useState('');
  const [fOtHours,    setFOtHours]    = useState('');
  const [fOtRate,     setFOtRate]     = useState('');
  const [fBonus,      setFBonus]      = useState('');
  const [fAllowance,  setFAllowance]  = useState('');
  const [fTax,        setFTax]        = useState('');
  const [fSsf,        setFSsf]        = useState('');
  const [fDeductOther,setFDeductOther]= useState('');

  const [sEmp,    setSEmp]    = useState('');
  const [sBase,   setSBase]   = useState('');
  const [sSsf,    setSSsf]    = useState('5');
  const [sTax,    setSTax]    = useState('0');
  const [sOtRate, setSOtRate] = useState('');

  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;

  useEffect(() => { load(); }, [month, year]);

  const load = async () => {
    setLoading(true);
    const [{ data: sal }, { data: emp }, { data: set }] = await Promise.all([
      supabase.from('hr_salary').select('*, employees(name,nickname)').eq('month', monthStr).order('created_at'),
      supabase.from('employees').select('id,name,nickname').eq('status','active').order('name'),
      supabase.from('hr_salary_settings').select('*, employees(name)').order('created_at'),
    ]);
    if (sal) setRecords(sal);
    if (emp) setEmployees(emp);
    if (set) setSettings(set);
    setLoading(false);
  };

  const calcNet = () => {
    const base    = Number(fBase)||0;
    const ot      = (Number(fOtHours)||0) * (Number(fOtRate)||0);
    const bonus   = Number(fBonus)||0;
    const allow   = Number(fAllowance)||0;
    const tax     = Number(fTax)||0;
    const ssf     = Number(fSsf)||0;
    const deduct  = Number(fDeductOther)||0;
    return base + ot + bonus + allow - tax - ssf - deduct;
  };

  const openForm = (emp?: any) => {
    if (emp) {
      const setting = settings.find(s => s.employee_id === emp.id);
      setFEmp(emp.id);
      setFBase(setting?.base_salary?.toString() || '');
      setFOtRate(setting?.ot_rate?.toString() || '');
      setFSsf(setting ? String(Number(setting.base_salary||0) * Number(setting.ssf_rate||5) / 100) : '');
      setFTax(setting ? String(Number(setting.base_salary||0) * Number(setting.tax_rate||0) / 100) : '');
    } else {
      setFEmp(''); setFBase(''); setFOtHours(''); setFOtRate('');
      setFBonus(''); setFAllowance(''); setFTax(''); setFSsf(''); setFDeductOther('');
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!fEmp) return;
    setSaving(true);
    const otAmt = (Number(fOtHours)||0) * (Number(fOtRate)||0);
    const net   = calcNet();
    await supabase.from('hr_salary').upsert([{
      employee_id: fEmp, month: monthStr,
      base_salary: Number(fBase)||0, ot_hours: Number(fOtHours)||0, ot_amount: otAmt,
      bonus: Number(fBonus)||0, allowance: Number(fAllowance)||0,
      deduct_tax: Number(fTax)||0, deduct_ssf: Number(fSsf)||0, deduct_other: Number(fDeductOther)||0,
      net_salary: net, status: 'draft',
    }], { onConflict: 'employee_id,month' });
    setSaving(false); setShowForm(false); load();
  };

  const markPaid = async (id: string) => {
    await supabase.from('hr_salary').update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    load();
  };

  const saveSetting = async () => {
    if (!sEmp) return;
    setSaving(true);
    await supabase.from('hr_salary_settings').upsert([{
      employee_id: sEmp, base_salary: Number(sBase)||0,
      ssf_rate: Number(sSsf)||5, tax_rate: Number(sTax)||0, ot_rate: Number(sOtRate)||0,
    }], { onConflict: 'employee_id' });
    setSaving(false); setShowSettings(false); load();
  };

  const totalNet = records.reduce((s, r) => s + Number(r.net_salary), 0);
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">💰 เงินเดือน</h2>
          <p className="text-xs text-slate-400">สรุปเงินเดือน {records.length} คน · รวม ฿{totalNet.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg bg-white border"><ChevronLeft size={16}/></button>
          <span className="font-semibold text-slate-700 min-w-[120px] text-center">
            {new Date(year, month).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg bg-white border"><ChevronRight size={16}/></button>
          <button onClick={() => setShowSettings(true)}
            className="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 text-sm flex items-center gap-1">
            <Settings size={14}/> ตั้งค่า
          </button>
          <button onClick={() => openForm()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2">
            <Plus size={14}/> เพิ่ม
          </button>
        </div>
      </div>

      {/* Bulk generate */}
      {records.length === 0 && !loading && (
        <div className="shrink-0 mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700">ยังไม่มีข้อมูลเงินเดือนเดือนนี้ — สร้างจากตั้งค่าได้เลย</p>
          <button onClick={async () => {
            const empWithSettings = settings.filter(s => s.base_salary > 0);
            for (const s of empWithSettings) {
              const ssf = Number(s.base_salary) * Number(s.ssf_rate||5) / 100;
              const tax = Number(s.base_salary) * Number(s.tax_rate||0) / 100;
              const net = Number(s.base_salary) - ssf - tax;
              await supabase.from('hr_salary').upsert([{
                employee_id: s.employee_id, month: monthStr,
                base_salary: s.base_salary, ot_hours: 0, ot_amount: 0,
                bonus: 0, allowance: 0, deduct_tax: tax, deduct_ssf: ssf, deduct_other: 0,
                net_salary: net, status: 'draft',
              }], { onConflict: 'employee_id,month' });
            }
            load();
          }} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            สร้างอัตโนมัติ ({settings.filter(s => s.base_salary > 0).length} คน)
          </button>
        </div>
      )}

      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'900px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left">พนักงาน</th>
              <th className="p-3 text-right whitespace-nowrap">เงินเดือน</th>
              <th className="p-3 text-right whitespace-nowrap">OT</th>
              <th className="p-3 text-right whitespace-nowrap">โบนัส</th>
              <th className="p-3 text-right whitespace-nowrap">เบี้ยเลี้ยง</th>
              <th className="p-3 text-right whitespace-nowrap">หักภาษี</th>
              <th className="p-3 text-right whitespace-nowrap">หัก ปกส.</th>
              <th className="p-3 text-right whitespace-nowrap font-bold">สุทธิ</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
              <th className="p-3 w-20"/>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && records.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>}
            {records.map(r => (
              <tr key={r.id} className="border-b hover:bg-blue-50">
                <td className="p-3 font-medium">{r.employees?.name || '-'}</td>
                <td className="p-3 text-right text-slate-600">฿{Number(r.base_salary).toLocaleString()}</td>
                <td className="p-3 text-right text-slate-600">{r.ot_amount > 0 ? `฿${Number(r.ot_amount).toLocaleString()}` : '-'}</td>
                <td className="p-3 text-right text-slate-600">{r.bonus > 0 ? `฿${Number(r.bonus).toLocaleString()}` : '-'}</td>
                <td className="p-3 text-right text-slate-600">{r.allowance > 0 ? `฿${Number(r.allowance).toLocaleString()}` : '-'}</td>
                <td className="p-3 text-right text-red-500">{r.deduct_tax > 0 ? `-฿${Number(r.deduct_tax).toLocaleString()}` : '-'}</td>
                <td className="p-3 text-right text-red-500">{r.deduct_ssf > 0 ? `-฿${Number(r.deduct_ssf).toLocaleString()}` : '-'}</td>
                <td className="p-3 text-right font-bold text-emerald-600">฿{Number(r.net_salary).toLocaleString()}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {r.status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  {r.status !== 'paid' && (
                    <button onClick={() => markPaid(r.id)}
                      className="px-2 py-1 bg-green-500 text-white text-[10px] rounded font-bold hover:bg-green-600">
                      ✓ จ่ายแล้ว
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {records.length > 0 && (
            <tfoot className="bg-slate-50 border-t-2">
              <tr>
                <td className="p-3 font-bold text-slate-700" colSpan={7}>รวมทั้งหมด</td>
                <td className="p-3 text-right font-bold text-emerald-600 text-base">฿{totalNet.toLocaleString()}</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add/Edit salary */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">บันทึกเงินเดือน</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">พนักงาน *</label>
                <select value={fEmp} onChange={e => {
                  setFEmp(e.target.value);
                  const emp = employees.find(x => x.id === e.target.value);
                  if (emp) openForm(emp);
                }} className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— เลือกพนักงาน —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['เงินเดือนฐาน', fBase, setFBase],
                  ['ชั่วโมง OT', fOtHours, setFOtHours],
                  ['อัตรา OT/ชม.', fOtRate, setFOtRate],
                  ['โบนัส', fBonus, setFBonus],
                  ['เบี้ยเลี้ยง', fAllowance, setFAllowance],
                  ['หักภาษี', fTax, setFTax],
                  ['หัก ปกส.', fSsf, setFSsf],
                  ['หักอื่นๆ', fDeductOther, setFDeductOther],
                ].map(([label, val, set]: any) => (
                  <div key={label}>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">{label}</label>
                    <input type="number" value={val} onChange={e => set(e.target.value)} min="0"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm font-bold text-blue-700 flex justify-between">
                <span>เงินเดือนสุทธิ</span>
                <span>฿{calcNet().toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fEmp || saving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">⚙️ ตั้งค่าเงินเดือน</h3>
              <button onClick={() => setShowSettings(false)}><X size={18} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">พนักงาน</label>
                <select value={sEmp} onChange={e => {
                  setSEmp(e.target.value);
                  const s = settings.find(x => x.employee_id === e.target.value);
                  if (s) { setSBase(s.base_salary||''); setSSsf(s.ssf_rate||'5'); setSTax(s.tax_rate||'0'); setSOtRate(s.ot_rate||''); }
                  else { setSBase(''); setSSsf('5'); setSTax('0'); setSOtRate(''); }
                }} className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— เลือก —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['เงินเดือนฐาน', sBase, setSBase],
                  ['% ประกันสังคม', sSsf, setSSsf],
                  ['% ภาษี', sTax, setSTax],
                  ['อัตรา OT/ชม.', sOtRate, setSOtRate],
                ].map(([label, val, set]: any) => (
                  <div key={label}>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">{label}</label>
                    <input type="number" value={val} onChange={e => set(e.target.value)} min="0"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={saveSetting} disabled={!sEmp || saving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm disabled:opacity-50">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
