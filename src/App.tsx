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
import Marketing from './components/Marketing';
import HR from './components/HR';

type PageKey =
  | 'products' | 'product-list' | 'packaging' | 'pack-products' | 'pack-history'
  | 'requisition' | 'stock' | 'purchase-order' | 'suppliers'
  | 'customers' | 'orders' | 'flash-export' | 'myorder-export'
  | 'finance-daily' | 'finance-monthly' | 'finance-yearly' | 'finance-expenses'
  | 'marketing-graphic' | 'marketing-ads' | 'marketing-admin'
  | 'hr';

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>('products');
  const [packagingOrderIds, setPackagingOrderIds] = useState<string[]>([]);
  const [packHistoryId, setPackHistoryId]         = useState<string>('');

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
      case 'product-list':   return <ProductList />;
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
      case 'hr':             return <HR />;
      case 'marketing-graphic': return <Marketing page="graphic" />;
      case 'marketing-ads':     return <Marketing page="ads" />;
      case 'marketing-admin':   return <Marketing page="admin" />;
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

function MarketingPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <div className="shrink-0 mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center">
          <span style={{fontSize:'18px', color:'white'}}>★</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">ฝ่ายการตลาด / {title}</h2>
          <p className="text-xs text-slate-400">อยู่ระหว่างออกแบบ</p>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center mx-auto mb-4">
            <span style={{fontSize:'28px'}}>★</span>
          </div>
          <p className="text-slate-500 font-medium text-lg">{title}</p>
          <p className="text-sm text-slate-400 mt-2">ยังไม่ได้ออกแบบการทำงาน</p>
        </div>
      </div>
    </div>
  );
}
