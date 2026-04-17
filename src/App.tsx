import { useState } from 'react';
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
      // ฝ่ายการตลาด
      case 'marketing-graphic': return <Marketing page="graphic" />;
      case 'marketing-ads':     return <Marketing page="ads" />;
      default:               return <Products />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <main className="flex-1 overflow-x-auto">{renderPage()}</main>
    </div>
  );
}
