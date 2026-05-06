import FinanceDaily from './FinanceDaily';
import FinanceMonthly from './FinanceMonthly';
import FinanceExpenses from './FinanceExpenses';
import { BarChart2 } from 'lucide-react';

type FinPage = 'daily' | 'monthly' | 'yearly' | 'expenses';
type ExpSubTab = 'records' | 'po' | 'ads' | 'shipping' | 'all';

export default function Finance({ page = 'daily', subTab }: { page?: FinPage; subTab?: ExpSubTab }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {page === 'daily'    && <FinanceDaily />}
      {page === 'monthly'  && <FinanceMonthly />}
      {page === 'yearly'   && <FinanceYearly />}
      {page === 'expenses' && <FinanceExpenses initialSubTab={subTab} />}
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
