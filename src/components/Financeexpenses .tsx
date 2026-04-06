import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Trash2, X, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

type ExpRecord = {
  id: string; doc_no: string | null; expense_date: string;
  description: string; category: string; amount_thb: number;
  note: string | null; created_at: string;
};
type PO = {
  id: string; po_no: string; po_date: string; supplier_name: string;
  total_thb: number; status: string; items: any[];
};
type SubTab = 'records' | 'po';
const EXP_CATS = ['ค่าวัตถุดิบ/สินค้า','ค่าจัดส่ง','ค่าบรรจุภัณฑ์','ค่าเงินเดือน','ค่าโฆษณา','ค่าสาธารณูปโภค','ค่าเช่า','อื่นๆ'];
const fmt = (n:number) => n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = (d:string) => new Date(d).toLocaleDateString('th-TH');

export default function FinanceExpenses() {
  const [subTab, setSubTab]   = useState<SubTab>('records');
  const [records, setRecords] = useState<ExpRecord[]>([]);
  const [pos, setPOs]         = useState<PO[]>([]);
  const [search, setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState('ทั้งหมด');
  const [dateFrom, setDateFrom] = useState(() => { const d=new Date(); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo]   = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ doc_no:'', expense_date:new Date().toISOString().split('T')[0], description:'', category:'ค่าวัตถุดิบ/สินค้า', amount_thb:'', note:'' });
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast]     = useState<string|null>(null);
  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(null),4000); };

  useEffect(() => { loadRecords(); loadPOs(); }, [dateFrom, dateTo]);

  const loadRecords = async () => {
    setLoading(true);
    const { data } = await supabase.from('expense_records').select('*')
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
      .order('expense_date', { ascending:false });
    if (data) setRecords(data);
    setLoading(false);
  };

  const loadPOs = async () => {
    const { data } = await supabase.from('purchase_orders').select('*')
      .gte('po_date', dateFrom).lte('po_date', dateTo)
      .order('po_date', { ascending:false });
    if (data) setPOs(data);
  };

  const handleAdd = async () => {
    if (!form.amount_thb || !form.description) return;
    setSaving(true);
    // สร้าง doc_no อัตโนมัติ
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const { count } = await supabase.from('expense_records').select('*',{count:'exact',head:true}).like('doc_no',`EXP-${dateStr}%`);
    const docNo = form.doc_no || `EXP-${dateStr}-${String((count||0)+1).padStart(3,'0')}`;
    await supabase.from('expense_records').insert([{ ...form, doc_no: docNo, amount_thb: Number(form.amount_thb) }]);
    showToast('✓ บันทึกรายจ่ายสำเร็จ');
    setSaving(false); setShowModal(false);
    setForm({doc_no:'', expense_date:new Date().toISOString().split('T')[0], description:'', category:'ค่าวัตถุดิบ/สินค้า', amount_thb:'', note:''});
    loadRecords();
  };

  // นำเข้าจาก PO
  const importFromPO = async (po: PO) => {
    const dateStr = po.po_date.replace(/-/g,'');
    const { count } = await supabase.from('expense_records').select('*',{count:'exact',head:true}).like('doc_no',`EXP-${dateStr}%`);
    const docNo = `EXP-${dateStr}-${String((count||0)+1).padStart(3,'0')}`;
    await supabase.from('expense_records').insert([{
      doc_no: docNo, expense_date: po.po_date,
      description: `ใบสั่งซื้อ ${po.po_no} — ${po.supplier_name}`,
      category: 'ค่าวัตถุดิบ/สินค้า',
      amount_thb: po.total_thb,
      ref_po_id: po.id,
      note: `นำเข้าจาก PO ${po.po_no}`,
    }]);
    showToast(`✓ นำเข้า PO ${po.po_no} สำเร็จ`);
    loadRecords();
  };

  // Upload จากไฟล์ Excel: col A=เลขที่(ถ้ามี), B=วันที่, C=รายการ, D=หมวด, E=ยอด
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf,{type:'array',cellDates:true});
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
    let count = 0;
    for (let i=1;i<rows.length;i++) {
      const row = rows[i];
      const docNo = String(row[0]||'').trim();
      const rawDate = row[1];
      const dateStr = rawDate instanceof Date ? rawDate.toISOString().split('T')[0] : String(rawDate).split('T')[0];
      const desc = String(row[2]||'').trim();
      const cat  = String(row[3]||'อื่นๆ').trim();
      const amt  = Number(row[4]);
      if (!desc || !amt || !dateStr) continue;
      const dateKey = dateStr.replace(/-/g,'');
      const { count: cnt } = await supabase.from('expense_records').select('*',{count:'exact',head:true}).like('doc_no',`EXP-${dateKey}%`);
      const finalDoc = docNo || `EXP-${dateKey}-${String((cnt||0)+count+1).padStart(3,'0')}`;
      await supabase.from('expense_records').insert([{
        doc_no:finalDoc, expense_date:dateStr, description:desc,
        category: EXP_CATS.includes(cat)?cat:'อื่นๆ',
        amount_thb:amt,
      }]);
      count++;
    }
    showToast(`✓ นำเข้า ${count} รายการ`);
    setUploading(false); e.target.value='';
    loadRecords();
  };

  const deleteRecord = async (id:string) => {
    if (!confirm('ยืนยันลบ?')) return;
    await supabase.from('expense_records').delete().eq('id',id);
    setRecords(p=>p.filter(r=>r.id!==id));
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map(r=>({
      เลขที่:r.doc_no||'', วันที่:fmtDate(r.expense_date), หมวด:r.category,
      รายการ:r.description, ยอด:r.amount_thb, หมายเหตุ:r.note||'',
    }))), 'รายจ่าย');
    XLSX.writeFile(wb, `Expenses_${dateFrom}_${dateTo}.xlsx`);
  };

  const filtered = records.filter(r => {
    const matchCat  = catFilter==='ทั้งหมด' || r.category===catFilter;
    const matchSrch = !search || r.description.toLowerCase().includes(search.toLowerCase()) || (r.doc_no||'').includes(search);
    return matchCat && matchSrch;
  });
  const total = filtered.reduce((s,r)=>s+Number(r.amount_thb),0);
  const poTotal = pos.reduce((s,p)=>s+Number(p.total_thb),0);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="shrink-0 flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4">
        <button onClick={()=>setSubTab('records')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${subTab==='records'?'bg-white shadow text-slate-800':'text-slate-500'}`}>
          ใบบันทึกรายจ่าย <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${subTab==='records'?'bg-red-100 text-red-700':'bg-slate-200 text-slate-500'}`}>{records.length}</span>
        </button>
        <button onClick={()=>setSubTab('po')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${subTab==='po'?'bg-white shadow text-slate-800':'text-slate-500'}`}>
          ใบสั่งซื้อ (PO) <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${subTab==='po'?'bg-purple-100 text-purple-700':'bg-slate-200 text-slate-500'}`}>{pos.length}</span>
        </button>
      </div>

      {/* Date filter */}
      <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
        <span className="text-slate-400">–</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
      </div>

      {/* ── Tab: ใบบันทึกรายจ่าย ── */}
      {subTab === 'records' && (
        <>
          <div className="shrink-0 flex gap-2 mb-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหา..."
                className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
            </div>
            <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
              <option>ทั้งหมด</option>
              {EXP_CATS.map(c=><option key={c}>{c}</option>)}
            </select>
            <button onClick={()=>setShowModal(true)}
              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 text-sm">
              <Plus size={13}/> เพิ่ม
            </button>
            <label className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm cursor-pointer ${uploading?'bg-slate-200 text-slate-400':'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
              <Upload size={13}/> {uploading?'กำลังนำเข้า...':'นำเข้า Excel'}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} disabled={uploading}/>
            </label>
            <button onClick={exportExcel} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 flex items-center gap-2 text-sm">
              <Download size={13}/> Export
            </button>
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'700px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
                <tr>
                  <th className="p-3 text-left whitespace-nowrap">เลขที่</th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left whitespace-nowrap">หมวด</th>
                  <th className="p-3 text-left">รายการ</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-center w-10">ลบ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ยังไม่มีรายจ่าย</td></tr>}
                {filtered.map(r=>(
                  <tr key={r.id} className="border-b hover:bg-red-50">
                    <td className="p-3 font-mono text-xs text-slate-500">{r.doc_no||'-'}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDate(r.expense_date)}</td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{r.category}</span></td>
                    <td className="p-3 font-medium">{r.description}{r.note&&<span className="text-xs text-slate-400 ml-2">({r.note})</span>}</td>
                    <td className="p-3 text-right font-bold text-red-600">฿{fmt(Number(r.amount_thb))}</td>
                    <td className="p-3 text-center">
                      <button onClick={()=>deleteRecord(r.id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 sticky bottom-0">
                <tr>
                  <td colSpan={4} className="p-3 text-right font-semibold text-slate-600">รวม {filtered.length} รายการ</td>
                  <td className="p-3 text-right font-bold text-red-600 text-base">฿{fmt(total)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="shrink-0 mt-2 text-xs text-slate-400 text-right">รูปแบบ Excel นำเข้า: A=เลขที่ | B=วันที่ | C=รายการ | D=หมวด | E=ยอด</div>
        </>
      )}

      {/* ── Tab: PO ── */}
      {subTab === 'po' && (
        <>
          <div className="shrink-0 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-700">
            ใบสั่งซื้อจากฝ่ายคลังสินค้า — กด "นำเข้าใบบันทึกรายจ่าย" เพื่อบันทึกเป็นรายจ่าย
          </div>
          <div className="flex-1 bg-white rounded-xl shadow overflow-auto min-h-0">
            <table className="text-sm w-full" style={{minWidth:'650px'}}>
              <thead className="bg-slate-800 text-slate-200 text-xs sticky top-0">
                <tr>
                  <th className="p-3 text-left">เลข PO</th>
                  <th className="p-3 text-left whitespace-nowrap">วันที่</th>
                  <th className="p-3 text-left">ผู้ขาย</th>
                  <th className="p-3 text-right whitespace-nowrap">ยอด (฿)</th>
                  <th className="p-3 text-center">สถานะ</th>
                  <th className="p-3 text-center whitespace-nowrap">นำเข้า</th>
                </tr>
              </thead>
              <tbody>
                {pos.length===0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">ไม่มี PO ในช่วงนี้</td></tr>}
                {pos.map(p=>(
                  <tr key={p.id} className="border-b hover:bg-purple-50">
                    <td className="p-3 font-mono text-xs text-purple-700">{p.po_no}</td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(p.po_date)}</td>
                    <td className="p-3 font-medium">{p.supplier_name}</td>
                    <td className="p-3 text-right font-bold text-slate-700">฿{fmt(Number(p.total_thb))}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.status==='approved'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{p.status}</span>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={()=>importFromPO(p)} className="px-3 py-1 bg-purple-500 text-white rounded-lg text-xs hover:bg-purple-600">นำเข้า</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 sticky bottom-0">
                <tr>
                  <td colSpan={3} className="p-3 text-right font-semibold text-slate-600">รวม {pos.length} ใบ</td>
                  <td className="p-3 text-right font-bold text-slate-700 text-base">฿{fmt(poTotal)}</td>
                  <td colSpan={2}/>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Modal เพิ่มรายจ่าย */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800">เพิ่มใบบันทึกรายจ่าย</h3>
              <button onClick={()=>setShowModal(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">เลขที่ (ถ้ามี)</label>
                  <input value={form.doc_no} onChange={e=>setForm(p=>({...p,doc_no:e.target.value}))}
                    placeholder="EXP-xxxx-001" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">วันที่ *</label>
                  <input type="date" value={form.expense_date} onChange={e=>setForm(p=>({...p,expense_date:e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">หมวดหมู่</label>
                <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
                  {EXP_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">รายการ *</label>
                <input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}
                  placeholder="ระบุรายการ..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">ยอดรวม (฿) *</label>
                  <input type="number" value={form.amount_thb} onChange={e=>setForm(p=>({...p,amount_thb:e.target.value}))}
                    placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">หมายเหตุ</label>
                  <input value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))}
                    placeholder="(ถ้ามี)" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"/>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={()=>setShowModal(false)} className="flex-1 py-2 bg-slate-200 rounded-lg text-sm hover:bg-slate-300">ยกเลิก</button>
              <button onClick={handleAdd} disabled={!form.amount_thb||!form.description||saving}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 font-medium">
                {saving?'กำลังบันทึก...':'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-2xl bg-emerald-500 text-white text-sm font-medium">{toast}</div>
      )}
    </div>
  );
}
