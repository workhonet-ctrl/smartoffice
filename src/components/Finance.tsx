import { DollarSign, BarChart2, FileText, Calendar } from 'lucide-react';
import FinanceDaily from './FinanceDaily';
import FinanceMonthly from './FinanceMonthly';
import FinanceExpenses from './FinanceExpenses';

type FinPage = 'daily' | 'monthly' | 'yearly' | 'expenses';

const PAGE_LABELS: Record<FinPage, { label: string; icon: any; sub: string }> = {
  daily:    { label: 'บัญชีรายวัน',   icon: Calendar,  sub: 'P&L รายวัน' },
  monthly:  { label: 'บัญชีรายเดือน', icon: BarChart2,  sub: 'สรุปรายเดือน' },
  yearly:   { label: 'บัญชีรายปี',    icon: BarChart2,  sub: 'สรุปรายปี' },
  expenses: { label: 'รายจ่าย',       icon: FileText,   sub: 'PO + ใบบันทึกรายจ่าย' },
};

export default function Finance({ page = 'daily' }: { page?: FinPage }) {
  const meta = PAGE_LABELS[page];
  const Icon = meta.icon;

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      {/* Header */}
      <div className="shrink-0 mb-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
          <DollarSign size={20} className="text-white"/>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">การเงิน</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700">{meta.label}</span>
          </div>
          <p className="text-xs text-slate-400">{meta.sub}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {page === 'daily'    && <FinanceDaily />}
        {page === 'monthly'  && <FinanceMonthly />}
        {page === 'yearly'   && <FinanceYearly />}
        {page === 'expenses' && <FinanceExpenses />}
      </div>
    </div>
  );
}

function FinanceYearly() {
  return (
    <div className="h-full bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
      <div className="text-center">
        <BarChart2 size={40} className="text-slate-300 mx-auto mb-3"/>
        <p className="text-slate-500 font-medium">บัญชีรายปี</p>
        <p className="text-sm text-slate-400 mt-1">อยู่ระหว่างพัฒนา</p>
      </div>
    </div>
  );
}
