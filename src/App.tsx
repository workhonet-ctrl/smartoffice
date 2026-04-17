import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Products from './components/Products';
import ProductList from './components/ProductList';
import Packaging from './components/Packaging';
import PackingMaterials from './components/PackingMaterials';
import PackHistory from './components/PackHistory';
import Requisition from './components/Requisition';
import Stock from './components/Stock';
import PurchaseOrder from './components/PurchaseOrder';
import Suppliers from './components/Suppliers';
import Customers from './components/Customers';
import Orders from './components/Orders';
import FlashExport from './components/FlashExport';
import MyOrderExport from './components/MyOrderExport';
import Finance from './components/Finance';
import FinanceIncome from './components/FinanceIncome';
import type { CodFileState } from './components/FinanceIncome';
import { EMPTY_COD_STATE } from './components/FinanceIncome';
import Marketing from './components/Marketing';
import HR from './components/HR';
import ComingSoon from './components/ComingSoon';

type PageKey =
  // ฝ่ายขาย
  | 'sales-admin' | 'sales-customers' | 'sales-crm'
  // ฝ่ายการตลาด
  | 'marketing-graphic' | 'marketing-ads'
  // ฝ่ายสินค้า
  | 'product-list' | 'product-search' | 'product-kpi' | 'products' | 'packaging'
  // ฝ่ายคลังสินค้า
  | 'orders' | 'flash-export' | 'myorder-export'
  | 'pack-products' | 'requisition' | 'pack-history'
  | 'stock' | 'purchase-order' | 'suppliers'
  // ฝ่ายการเงิน
  | 'finance-daily' | 'finance-monthly' | 'finance-yearly'
  | 'finance-expenses' | 'finance-income' | 'finance-cost'
  // ฝ่าย HR
  | 'hr-recruit' | 'hr' | 'hr-train' | 'hr-kpi' | 'hr-sop';

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>('orders');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ปิด sidebar อัตโนมัติเมื่อเปลี่ยนหน้าบนมือถือ
  const handlePageChange = (page: PageKey) => {
    setActivePage(page);
    setSidebarOpen(false);
  };
  const [packagingOrderIds, setPackagingOrderIds] = useState<string[]>([]);
  const [packHistoryId, setPackHistoryId]         = useState<string>('');
  const [codState, setCodState]                   = useState<CodFileState>(EMPTY_COD_STATE);

  const goToPackaging = (ids: string[]) => {
    setPackagingOrderIds(ids);
    setActivePage('pack-products');
  };

  const goToRequisition = (historyId: string) => {
    setPackHistoryId(historyId);
    setActivePage('requisition');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'products':       return <Products />;
      // ฝ่ายสินค้า
      case 'product-list':   return <ProductList />;
      case 'product-search': return <ComingSoon title="หาสินค้า" description="ค้นหาสินค้าจากแหล่งต่างๆ" />;
      case 'product-kpi':    return <ComingSoon title="KPI สินค้า" description="ติดตามผลการขายรายสินค้า" />;
      case 'packaging':      return <PackingMaterials />;
      case 'pack-products':  return <Packaging orderIds={packagingOrderIds} onDone={() => { setPackagingOrderIds([]); setActivePage('orders'); }} onCreateRequisition={goToRequisition}/>;
      case 'pack-history':   return <PackHistory />;
      case 'requisition':    return <Requisition packHistoryId={packHistoryId} />;
      case 'stock':          return <Stock onGoToPO={() => setActivePage('purchase-order')} />;
      case 'purchase-order': return <PurchaseOrder />;
      case 'suppliers':      return <Suppliers />;
      case 'customers':      return <Customers />;
      case 'orders':         return <Orders onImportDone={goToPackaging} />;
      case 'flash-export':   return <FlashExport />;
      case 'myorder-export': return <MyOrderExport />;
      case 'finance-daily':    return <Finance page="daily" />;
      case 'finance-monthly':  return <Finance page="monthly" />;
      case 'finance-yearly':   return <Finance page="yearly" />;
      case 'finance-expenses': return <Finance page="expenses" />;
      case 'finance-income':   return <FinanceIncome codState={codState} setCodState={setCodState} />;
      case 'finance-cost':     return <ComingSoon title="ต้นทุนสินค้า" description="วิเคราะห์ต้นทุนและกำไรรายสินค้า" />;
      // ฝ่าย HR
      case 'hr-recruit': return <ComingSoon title="สรรหาพนักงาน" description="ระบบรับสมัครและคัดเลือกพนักงาน" />;
      case 'hr':         return <HR />;
      case 'hr-train':   return <ComingSoon title="เทรนพนักงาน" description="ระบบฝึกอบรมพนักงาน" />;
      case 'hr-kpi':     return <ComingSoon title="KPI พนักงาน" description="ประเมินผลงานพนักงาน" />;
      case 'hr-sop':     return <ComingSoon title="คู่มือการทำงาน (SOP)" description="Standard Operating Procedures" />;
      // ฝ่ายขาย
      case 'sales-admin':     return <Marketing page="admin" />;
      case 'sales-customers': return <Customers onGoToProducts={() => setActivePage('products')} />;
      case 'sales-crm':       return <ComingSoon title="CRM" description="ระบบจัดการความสัมพันธ์ลูกค้า" />;
      // ฝ่ายการตลาด
      case 'marketing-graphic': return <Marketing page="graphic" />;
      case 'marketing-ads':     return <Marketing page="ads" />;
      default:               return <Products />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Overlay backdrop บนมือถือ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — ซ่อนบนมือถือ, แสดงเมื่อกด hamburger */}
      <div className={`
        fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar activePage={activePage} setActivePage={handlePageChange} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile topbar */}
        <div className="lg:hidden shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              S
            </div>
            <span className="font-bold text-slate-800 text-sm">SmartOffice</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{renderPage()}</main>
      </div>
    </div>
  );
}
