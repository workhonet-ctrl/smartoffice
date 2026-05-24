import { useState } from 'react';
import { useAuth } from './lib/AuthProvider';
import LoginPage from './pages/LoginPage';
import ProblemCases from './components/ProblemCases';
import AdsAssignment from './components/AdsAssignment';
import Sidebar from './components/Sidebar';
import Products from './components/Products';
import ProductList from './components/ProductList';
import Packaging from './components/Packaging';
import PackingMaterials from './components/PackingMaterials';
import Requisition from './components/Requisition';
import Stock from './components/Stock';
import PurchaseOrder from './components/PurchaseOrder';
import Suppliers from './components/Suppliers';
import Customers from './components/Customers';
import Orders from './components/Orders';
import FlashExport from './components/FlashExport';
import MyOrderExport from './components/MyOrderExport';
import ShippingPage from './components/ShippingPage';
import Finance from './components/Finance';
import FinanceIncome from './components/FinanceIncome';
import type { CodFileState } from './components/FinanceIncome';
import { EMPTY_COD_STATE } from './components/FinanceIncome';
import Marketing from './components/Marketing';
import HR from './components/HR';
import ComingSoon from './components/ComingSoon';
import ProductKPI from './components/ProductKPI';

type PageKey =
  | 'sales-admin' | 'sales-customers' | 'sales-customers-problem' | 'sales-crm'
  | 'marketing-graphic' | 'marketing-ads' | 'marketing-ads-assign'
  | 'product-list' | 'product-search' | 'product-kpi' | 'products' | 'packaging'
  | 'orders' | 'flash-export' | 'myorder-export' | 'shipping-import'
  | 'pack-products' | 'requisition'
  | 'stock' | 'purchase-order' | 'suppliers'
  | 'finance-daily' | 'finance-monthly' | 'finance-yearly'
  | 'finance-expenses' | 'finance-income' | 'finance-cost'
  | 'hr-recruit' | 'hr' | 'hr-train' | 'hr-kpi' | 'hr-sop';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [activePage, setActivePage]             = useState<PageKey>('orders');
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [packagingOrderIds, setPackagingOrderIds] = useState<string[]>([]);
  const [packHistoryId, setPackHistoryId]       = useState<string>('');
  // finance-expenses subTab — Sidebar ส่งมาผ่าน state แทน PageKey ซ้อน
  const [expenseSubTab, setExpenseSubTab]       = useState<string>('records');
  const [codState, setCodState]                 = useState<CodFileState>(EMPTY_COD_STATE);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const handlePageChange = (page: PageKey, subTab?: string) => {
    setActivePage(page);
    setSidebarOpen(false);
    if (page === 'finance-expenses' && subTab) setExpenseSubTab(subTab);
  };
  const goToPackaging    = (ids: string[])  => { setPackagingOrderIds(ids); setActivePage('pack-products'); };
  const goToRequisition  = (id: string)     => { setPackHistoryId(id); setActivePage('requisition'); };
  const handleSignOut    = ()               => { if (confirm('ออกจากระบบ?')) signOut(); };

  const renderPage = () => {
    switch (activePage) {
      case 'products':        return <Products />;
      case 'product-list':    return <ProductList />;
      case 'product-search':  return <ComingSoon title="หาสินค้า" description="ค้นหาสินค้าจากแหล่งต่างๆ" />;
      case 'product-kpi':     return <ProductKPI />;
      case 'packaging':       return <PackingMaterials />;
      case 'pack-products':   return <Packaging orderIds={packagingOrderIds} onDone={() => { setPackagingOrderIds([]); setActivePage('orders'); }} onCreateRequisition={goToRequisition}/>;
      case 'requisition':     return <Requisition packHistoryId={packHistoryId} />;
      case 'stock':           return <Stock onGoToPO={() => setActivePage('purchase-order')} />;
      case 'purchase-order':  return <PurchaseOrder />;
      case 'suppliers':       return <Suppliers />;
      case 'orders':          return <Orders onImportDone={goToPackaging} />;
      case 'flash-export':    return <FlashExport />;
      case 'myorder-export':  return <MyOrderExport />;
      case 'shipping-import': return <ShippingPage />;
      case 'finance-daily':   return <Finance page="daily" />;
      case 'finance-monthly': return <Finance page="monthly" />;
      case 'finance-yearly':  return <Finance page="yearly" />;
      case 'finance-income':  return <FinanceIncome codState={codState} setCodState={setCodState} />;
      case 'finance-expenses': return <Finance page="expenses" subTab={expenseSubTab} onGoToShippingImport={() => setActivePage('shipping-import')} />;
      case 'finance-cost':    return <ComingSoon title="ต้นทุนสินค้า" description="วิเคราะห์ต้นทุนและกำไรรายสินค้า" />;
      case 'hr-recruit': return <ComingSoon title="สรรหาพนักงาน" description="ระบบรับสมัครและคัดเลือกพนักงาน" />;
      case 'hr':         return <HR />;
      case 'hr-train':   return <ComingSoon title="เทรนพนักงาน" description="ระบบฝึกอบรมพนักงาน" />;
      case 'hr-kpi':     return <ComingSoon title="KPI พนักงาน" description="ประเมินผลงานพนักงาน" />;
      case 'hr-sop':     return <ComingSoon title="คู่มือการทำงาน (SOP)" description="Standard Operating Procedures" />;
      case 'sales-admin':             return <Marketing page="admin" />;
      case 'sales-customers':         return <Customers onGoToProducts={() => setActivePage('products')} />;
      case 'sales-customers-problem': return <ProblemCases />;
      case 'sales-crm':               return <ComingSoon title="CRM" description="ระบบจัดการความสัมพันธ์ลูกค้า" />;
      case 'marketing-graphic':       return <Marketing page="graphic" />;
      case 'marketing-ads-assign':    return <AdsAssignment />;
      case 'marketing-ads':           return <Marketing page="ads" />;
      default: return <Products />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)}/>
      )}

      <div className={`
        fixed inset-y-0 left-0 z-40 transform transition-all duration-300 ease-in-out shrink-0
        lg:relative lg:translate-x-0 lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${sidebarCollapsed ? 'lg:w-[56px]' : 'lg:w-[220px]'}
      `}>
        <Sidebar
          activePage={activePage}
          setActivePage={handlePageChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(c => !c)}
          userEmail={user.email || ''}
          onSignOut={handleSignOut}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile topbar */}
        <div className="lg:hidden shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 transition">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>S</div>
            <span className="font-bold text-slate-800 text-sm">SmartOffice</span>
          </div>
          <button onClick={handleSignOut}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-500 transition">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>

        <main className="flex-1 overflow-auto">{renderPage()}</main>
      </div>
    </div>
  );
}
