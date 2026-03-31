import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, HRDocument, EMPLOYEE_ROLES, HR_DOC_TYPES } from '../lib/types';
import { Plus, Edit2, Trash2, FileText, X } from 'lucide-react';

export default function HR() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<HRDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showDocForm, setShowDocForm]           = useState(false);
  const [editingEmployee, setEditingEmployee]   = useState<Employee | null>(null);

  const [employeeForm, setEmployeeForm] = useState({
    employee_code: '',
    name:          '',
    role:          'แอดมิน',          // ← role (ไม่ใช่ position)
    salary:        0,
    start_date:    new Date().toISOString().split('T')[0],
  });

  const [docForm, setDocForm] = useState({
    employee_id: '',
    doc_type:    'ลา',
    amount:      0,
    doc_date:    new Date().toISOString().split('T')[0],
    description: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [empRes, docRes] = await Promise.all([
        // FIX: ใช้ .eq('active', true) แทน .eq('status', 'active')
        supabase.from('employees').select('*').eq('active', true).order('created_at', { ascending: false }),
        supabase.from('hr_documents').select('*, employees(*)').order('doc_date', { ascending: false }),
      ]);
      if (empRes.data) setEmployees(empRes.data);
      if (docRes.data) setDocuments(docRes.data);
    } catch (error) {
      console.error('Error loading HR data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveEmployee = async () => {
    if (!employeeForm.name.trim()) { alert('กรุณากรอกชื่อพนักงาน'); return; }
    try {
      if (editingEmployee) {
        const { error } = await supabase.from('employees').update(employeeForm).eq('id', editingEmployee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employees').insert([{ ...employeeForm, active: true }]);
        if (error) throw error;
      }
      setShowEmployeeForm(false);
      setEditingEmployee(null);
      setEmployeeForm({ employee_code: '', name: '', role: 'แอดมิน', salary: 0, start_date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (error) {
      console.error('Error saving employee:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const saveDocument = async () => {
    if (!docForm.employee_id) { alert('กรุณาเลือกพนักงาน'); return; }
    try {
      const { error } = await supabase.from('hr_documents').insert([{
        ...docForm,
        status: 'รออนุมัติ',
      }]);
      if (error) throw error;
      setShowDocForm(false);
      setDocForm({ employee_id: '', doc_type: 'ลา', amount: 0, doc_date: new Date().toISOString().split('T')[0], description: '' });
      loadData();
    } catch (error) {
      console.error('Error saving document:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  // FIX: soft delete ด้วย active=false แทนการ update status
  const deleteEmployee = async (id: string) => {
    if (!confirm('ยืนยันการลบพนักงาน?')) return;
    try {
      const { error } = await supabase.from('employees').update({ active: false }).eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting employee:', error);
    }
  };

  if (loading) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">จัดการพนักงาน</h2>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => { setEditingEmployee(null); setShowEmployeeForm(true); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
        >
          <Plus size={20} /> เพิ่มพนักงาน
        </button>
        <button
          onClick={() => setShowDocForm(true)}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
        >
          <FileText size={20} /> เพิ่มเอกสาร
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* พนักงาน */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4 text-blue-600">พนักงาน ({employees.length} คน)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">รหัส</th>
                  <th className="p-2 text-left">ชื่อ</th>
                  <th className="p-2 text-left">ตำแหน่ง</th>
                  <th className="p-2 text-right">เงินเดือน</th>
                  <th className="p-2 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-slate-400">ยังไม่มีพนักงาน</td></tr>
                )}
                {employees.map(e => (
                  <tr key={e.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{e.employee_code}</td>
                    <td className="p-2">{e.name}</td>
                    <td className="p-2">{e.role}</td>   {/* ← role */}
                    <td className="p-2 text-right">{Number(e.salary || 0).toLocaleString()}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => {
                          setEditingEmployee(e);
                          setEmployeeForm({
                            employee_code: e.employee_code || '',
                            name:          e.name,
                            role:          e.role || 'แอดมิน',   // ← role
                            salary:        Number(e.salary) || 0,
                            start_date:    e.start_date || new Date().toISOString().split('T')[0],
                          });
                          setShowEmployeeForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteEmployee(e.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* เอกสาร HR */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4 text-green-600">เอกสาร HR</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">วันที่</th>
                  <th className="p-2 text-left">พนักงาน</th>
                  <th className="p-2 text-left">ประเภท</th>
                  <th className="p-2 text-left">สถานะ</th>
                  <th className="p-2 text-right">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-slate-400">ยังไม่มีเอกสาร</td></tr>
                )}
                {documents.slice(0, 20).map(d => (
                  <tr key={d.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{d.doc_date || d.submitted_at?.split('T')[0]}</td>
                    <td className="p-2">{d.employees?.name}</td>
                    <td className="p-2">{d.doc_type}</td>
                    <td className="p-2">
                      <span className={'px-1.5 py-0.5 rounded text-xs ' +
                        (d.status === 'อนุมัติ' ? 'bg-green-100 text-green-700' :
                         d.status === 'ไม่อนุมัติ' ? 'bg-red-100 text-red-700' :
                         'bg-yellow-100 text-yellow-700')}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">{Number(d.amount) > 0 ? `฿${Number(d.amount).toLocaleString()}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: เพิ่ม/แก้ไขพนักงาน */}
      {showEmployeeForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{editingEmployee ? 'แก้ไข' : 'เพิ่ม'}พนักงาน</h3>
              <button onClick={() => { setShowEmployeeForm(false); setEditingEmployee(null); }} className="text-slate-500 hover:text-slate-700">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">รหัสพนักงาน</label>
                <input type="text" value={employeeForm.employee_code}
                  onChange={e => setEmployeeForm({ ...employeeForm, employee_code: e.target.value })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อ-สกุล</label>
                <input type="text" value={employeeForm.name}
                  onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ตำแหน่ง</label>
                <select value={employeeForm.role}
                  onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                  className="w-full border rounded px-3 py-2">
                  {EMPLOYEE_ROLES.map(r => <option key={r}>{r}</option>)}  {/* ← EMPLOYEE_ROLES */}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เงินเดือน</label>
                <input type="number" value={employeeForm.salary}
                  onChange={e => setEmployeeForm({ ...employeeForm, salary: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">วันเริ่มงาน</label>
                <input type="date" value={employeeForm.start_date}
                  onChange={e => setEmployeeForm({ ...employeeForm, start_date: e.target.value })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <button onClick={saveEmployee} className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: เพิ่มเอกสาร HR */}
      {showDocForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">เพิ่มเอกสาร HR</h3>
              <button onClick={() => setShowDocForm(false)} className="text-slate-500 hover:text-slate-700">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">พนักงาน</label>
                <select value={docForm.employee_id}
                  onChange={e => setDocForm({ ...docForm, employee_id: e.target.value })}
                  className="w-full border rounded px-3 py-2">
                  <option value="">เลือกพนักงาน</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ประเภทเอกสาร</label>
                <select value={docForm.doc_type}
                  onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}
                  className="w-full border rounded px-3 py-2">
                  {HR_DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">จำนวนเงิน (ถ้ามี)</label>
                <input type="number" value={docForm.amount}
                  onChange={e => setDocForm({ ...docForm, amount: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">วันที่</label>
                <input type="date" value={docForm.doc_date}
                  onChange={e => setDocForm({ ...docForm, doc_date: e.target.value })}
                  className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">รายละเอียด</label>
                <textarea value={docForm.description}
                  onChange={e => setDocForm({ ...docForm, description: e.target.value })}
                  className="w-full border rounded px-3 py-2" rows={3} />
              </div>
              <button onClick={saveDocument} className="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
