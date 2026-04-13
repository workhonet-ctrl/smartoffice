import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Plus, X, Edit2 } from 'lucide-react';

type Employee = {
  id: string; name: string; nickname: string | null; employee_code: string | null;
  tel: string | null; email: string | null; gender: string | null;
  hire_date: string | null; birth_date: string | null; status: string;
  photo_url: string | null; line_id: string | null;
  emergency_name: string | null; emergency_tel: string | null;
  national_id: string | null; bank_name: string | null; bank_account: string | null;
  address_current: string | null; role: string | null;
  department_id: string | null; position_id: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-600',
  probation: 'bg-yellow-100 text-yellow-700',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'ทำงานอยู่', inactive: 'ลาออกแล้ว', probation: 'ทดลองงาน',
};

const GENDERS = ['ชาย', 'หญิง', 'ไม่ระบุ'];
const ROLES   = ['พนักงาน', 'หัวหน้า', 'ผู้จัดการ', 'HR', 'บัญชี', 'กราฟฟิก', 'คลังสินค้า', 'การตลาด'];

const DEPARTMENTS: { code: string; name: string }[] = [
  { code: 'GM', name: 'บริหาร' },
  { code: 'GA', name: 'จัดการสนับสนุน' },
  { code: 'SL', name: 'การขาย' },
  { code: 'MK', name: 'การตลาด' },
  { code: 'AC', name: 'บัญชี' },
  { code: 'FN', name: 'การเงิน' },
  { code: 'HR', name: 'บุคคล' },
  { code: 'OP', name: 'ปฏิบัติการ' },
  { code: 'IT', name: 'เทคโนโลยีสารสนเทศ' },
];

export default function HREmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions]     = useState<any[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Employee | null>(null);
  const [selected, setSelected]   = useState<Employee | null>(null);
  const [saving, setSaving]       = useState(false);

  // form state
  const [fName,      setFName]      = useState('');
  const [fNickname,  setFNickname]  = useState('');
  const [fCode,      setFCode]      = useState('');
  const [fCodeAuto,  setFCodeAuto]  = useState(true); // auto-generate flag
  const [fTel,       setFTel]       = useState('');
  const [fEmail,     setFEmail]     = useState('');
  const [fGender,    setFGender]    = useState('ไม่ระบุ');
  const [fRole,      setFRole]      = useState('พนักงาน');
  const [fDeptCode,  setFDeptCode]  = useState('');  // dept prefix code e.g. 'GM'
  const [fPos,       setFPos]       = useState('');
  const [fHire,      setFHire]      = useState('');
  const [fBirth,     setFBirth]     = useState('');
  const [fStatus,    setFStatus]    = useState('active');
  const [fAddress,   setFAddress]   = useState('');
  const [fNatId,     setFNatId]     = useState('');
  const [fBank,      setFBank]      = useState('');
  const [fBankAcc,   setFBankAcc]   = useState('');
  const [fEmgName,   setFEmgName]   = useState('');
  const [fEmgTel,    setFEmgTel]    = useState('');
  const [fLineId,    setFLineId]    = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: emp }, { data: dept }, { data: pos }] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('hr_departments').select('*').order('name'),
      supabase.from('hr_positions').select('*').order('name'),
    ]);
    if (emp)  setEmployees(emp);
    if (dept) setDepartments(dept);
    if (pos)  setPositions(pos);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // สร้างรหัสพนักงานอัตโนมัติจาก prefix แผนก
  const generateCode = async (deptCode: string) => {
    if (!deptCode) return;
    const { data } = await supabase.from('employees')
      .select('employee_code')
      .like('employee_code', `${deptCode}%`)
      .order('employee_code', { ascending: false })
      .limit(1);
    const last = data?.[0]?.employee_code;
    const num  = last ? parseInt(last.replace(deptCode, '')) + 1 : 1;
    setFCode(`${deptCode}${String(num).padStart(4, '0')}`);
  };

  const handleDeptChange = async (code: string) => {
    setFDeptCode(code);
    if (fCodeAuto) await generateCode(code);
  };

  const openForm = (emp?: Employee) => {
    if (emp) {
      setEditing(emp);
      setFName(emp.name); setFNickname(emp.nickname||''); setFCode(emp.employee_code||'');
      setFCodeAuto(false); // ไม่ auto เมื่อแก้ไข
      setFTel(emp.tel||''); setFEmail(emp.email||''); setFGender(emp.gender||'ไม่ระบุ');
      setFRole(emp.role||'พนักงาน'); setFDeptCode(emp.department_id||''); setFPos(emp.position_id||'');
      setFHire(emp.hire_date||''); setFBirth(emp.birth_date||''); setFStatus(emp.status||'active');
      setFAddress(emp.address_current||''); setFNatId(emp.national_id||'');
      setFBank(emp.bank_name||''); setFBankAcc(emp.bank_account||'');
      setFEmgName(emp.emergency_name||''); setFEmgTel(emp.emergency_tel||'');
      setFLineId(emp.line_id||'');
    } else {
      setEditing(null); setFCodeAuto(true);
      setFName(''); setFNickname(''); setFCode(''); setFTel(''); setFEmail('');
      setFGender('ไม่ระบุ'); setFRole('พนักงาน'); setFDeptCode(''); setFPos('');
      setFHire(''); setFBirth(''); setFStatus('active'); setFAddress('');
      setFNatId(''); setFBank(''); setFBankAcc(''); setFEmgName(''); setFEmgTel(''); setFLineId('');
    }
    setShowForm(true);
  };

  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    if (!fName.trim()) return;
    setSaving(true); setSaveError('');
    const payload: any = {
      name: fName.trim(), nickname: fNickname||null, employee_code: fCode||null,
      tel: fTel||null, email: fEmail||null, gender: fGender, role: fRole,
      department_id: fDeptCode||null, position_id: fPos||null,
      hire_date: fHire||null, birth_date: fBirth||null, status: fStatus,
      address_current: fAddress||null, national_id: fNatId||null,
      bank_name: fBank||null, bank_account: fBankAcc||null,
      emergency_name: fEmgName||null, emergency_tel: fEmgTel||null, line_id: fLineId||null,
    };
    let err;
    if (editing) ({ error: err } = await supabase.from('employees').update(payload).eq('id', editing.id));
    else         ({ error: err } = await supabase.from('employees').insert([payload]));
    setSaving(false);
    if (err) {
      if (err.code === '23505') setSaveError('รหัสพนักงานนี้มีอยู่แล้ว กรุณาเปลี่ยนรหัส');
      else setSaveError('เกิดข้อผิดพลาด: ' + err.message);
      return;
    }
    setShowForm(false);
    await load();
  };

  const filtered = employees.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.nickname||'').toLowerCase().includes(search.toLowerCase()) ||
    (e.employee_code||'').toLowerCase().includes(search.toLowerCase()) ||
    (e.tel||'').includes(search)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">👤 พนักงาน</h2>
          <p className="text-xs text-slate-400">{employees.filter(e=>e.status==='active').length} คนทำงานอยู่ · รวม {employees.length} คน</p>
        </div>
        <button onClick={() => openForm()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium flex items-center gap-2">
          <Plus size={15}/> เพิ่มพนักงาน
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / รหัส / เบอร์..."
          className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"/>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
        <table className="text-sm w-full" style={{minWidth:'800px'}}>
          <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left">รหัส</th>
              <th className="p-3 text-left">ชื่อ - นามสกุล</th>
              <th className="p-3 text-left whitespace-nowrap">ชื่อเล่น</th>
              <th className="p-3 text-left whitespace-nowrap">ตำแหน่ง</th>
              <th className="p-3 text-left whitespace-nowrap">เบอร์โทร</th>
              <th className="p-3 text-center whitespace-nowrap">สถานะ</th>
              <th className="p-3 text-center whitespace-nowrap">วันเริ่มงาน</th>
              <th className="p-3 w-16"/>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-400">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่พบพนักงาน</td></tr>}
            {filtered.map(e => (
              <tr key={e.id} onClick={() => setSelected(e)} className="border-b hover:bg-blue-50 cursor-pointer">
                <td className="p-3 font-mono text-xs text-blue-600">{e.employee_code || '-'}</td>
                <td className="p-3 font-medium">{e.name}</td>
                <td className="p-3 text-xs text-slate-500">{e.nickname || '-'}</td>
                <td className="p-3 text-xs text-slate-500">{e.role || '-'}</td>
                <td className="p-3 font-mono text-xs">{e.tel || '-'}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[e.status] || 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_LABEL[e.status] || e.status}
                  </span>
                </td>
                <td className="p-3 text-center text-xs text-slate-400">{e.hire_date ? e.hire_date.split('-').reverse().join('/') : '-'}</td>
                <td className="p-3 text-center" onClick={ev => ev.stopPropagation()}>
                  <button onClick={() => openForm(e)} className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg">
                    <Edit2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selected.name}</h3>
                <p className="text-xs text-slate-400">{selected.employee_code} · {selected.role}</p>
              </div>
              <button onClick={() => setSelected(null)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['ชื่อเล่น', selected.nickname],
                ['เบอร์โทร', selected.tel],
                ['อีเมล', selected.email],
                ['เพศ', selected.gender],
                ['สถานะ', STATUS_LABEL[selected.status]||selected.status],
                ['วันเริ่มงาน', selected.hire_date?.split('-').reverse().join('/')],
                ['วันเกิด', selected.birth_date?.split('-').reverse().join('/')],
                ['LINE ID', selected.line_id],
                ['บัตรประชาชน', selected.national_id],
                ['ธนาคาร', selected.bank_name],
                ['เลขบัญชี', selected.bank_account],
                ['ที่อยู่', selected.address_current],
                ['ผู้ติดต่อฉุกเฉิน', selected.emergency_name],
                ['เบอร์ฉุกเฉิน', selected.emergency_tel],
              ].map(([k, v]) => v ? (
                <div key={k}>
                  <span className="text-slate-400 text-xs">{k}</span>
                  <div className="font-medium text-slate-700 text-sm">{v}</div>
                </div>
              ) : null)}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setSelected(null); openForm(selected); }}
                className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">แก้ไข</button>
              <button onClick={() => setSelected(null)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 pt-5 pb-3 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{editing ? 'แก้ไขพนักงาน' : '+ เพิ่มพนักงาน'}</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="p-6 space-y-4">
              {/* ข้อมูลพื้นฐาน */}
              <div className="font-semibold text-slate-600 text-sm border-b pb-1">ข้อมูลพื้นฐาน</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อ - นามสกุล *</label>
                  <input value={fName} onChange={e => setFName(e.target.value)} placeholder="ชื่อ นามสกุล"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อเล่น</label>
                  <input value={fNickname} onChange={e => setFNickname(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เพศ</label>
                  <select value={fGender} onChange={e => setFGender(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {GENDERS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">สถานะ</label>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="active">ทำงานอยู่</option>
                    <option value="probation">ทดลองงาน</option>
                    <option value="inactive">ลาออกแล้ว</option>
                  </select>
                </div>
              </div>

              {/* ตำแหน่ง */}
              <div className="font-semibold text-slate-600 text-sm border-b pb-1">ตำแหน่งงาน</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">แผนก</label>
                  <select value={fDeptCode} onChange={e => handleDeptChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="">— ไม่ระบุ —</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    รหัสพนักงาน
                    {fCodeAuto && <span className="ml-1 text-[10px] text-blue-500 font-normal">อัตโนมัติ</span>}
                  </label>
                  <div className="flex gap-1">
                    <input value={fCode} onChange={e => { setFCode(e.target.value); setFCodeAuto(false); }}
                      placeholder={fDeptCode ? `${fDeptCode}0001` : 'เลือกแผนกก่อน'}
                      readOnly={fCodeAuto && !fDeptCode}
                      className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono
                        ${fCodeAuto ? 'bg-blue-50 text-blue-700' : ''}`}/>
                    {!fCodeAuto && fDeptCode && (
                      <button onClick={async () => { setFCodeAuto(true); await generateCode(fDeptCode); }}
                        className="px-2 py-1 bg-blue-100 text-blue-600 rounded-lg text-xs hover:bg-blue-200" title="สร้างใหม่">
                        🔄
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">บทบาท</label>
                  <select value={fRole} onChange={e => setFRole(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันเริ่มงาน</label>
                  <input type="date" value={fHire} onChange={e => setFHire(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันเกิด</label>
                  <input type="date" value={fBirth} onChange={e => setFBirth(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>

              {/* ติดต่อ */}
              <div className="font-semibold text-slate-600 text-sm border-b pb-1">ข้อมูลติดต่อ</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เบอร์โทร</label>
                  <input value={fTel} onChange={e => setFTel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">อีเมล</label>
                  <input value={fEmail} onChange={e => setFEmail(e.target.value)} type="email"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">LINE ID</label>
                  <input value={fLineId} onChange={e => setFLineId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ที่อยู่ปัจจุบัน</label>
                  <input value={fAddress} onChange={e => setFAddress(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>

              {/* การเงิน */}
              <div className="font-semibold text-slate-600 text-sm border-b pb-1">ข้อมูลการเงิน</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เลขบัตรประชาชน</label>
                  <input value={fNatId} onChange={e => setFNatId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ธนาคาร</label>
                  <input value={fBank} onChange={e => setFBank(e.target.value)} placeholder="ไทยพาณิชย์"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เลขบัญชี</label>
                  <input value={fBankAcc} onChange={e => setFBankAcc(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>

              {/* ฉุกเฉิน */}
              <div className="font-semibold text-slate-600 text-sm border-b pb-1">ผู้ติดต่อฉุกเฉิน</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ชื่อ</label>
                  <input value={fEmgName} onChange={e => setFEmgName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เบอร์โทร</label>
                  <input value={fEmgTel} onChange={e => setFEmgTel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white px-6 pb-5 pt-3 border-t">
              {saveError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  ⚠ {saveError}
                </div>
              )}
              <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={!fName.trim() || saving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
