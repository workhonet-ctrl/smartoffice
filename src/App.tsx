import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Products from './components/Products';
import ProductList from './components/ProductList';
import Packaging from './components/Packaging';
import Requisition from './components/Requisition';
import Stock from './components/Stock';
import PurchaseOrder from './components/PurchaseOrder';
import Customers from './components/Customers';
import Orders from './components/Orders';
import FlashExport from './components/FlashExport';
import MyOrderExport from './components/MyOrderExport';
import Finance from './components/Finance';
import HR from './components/HR';

type PageKey =
  | 'products' | 'product-list' | 'packaging' | 'pack-products'
  | 'requisition' | 'stock' | 'purchase-order' | 'customers'
  | 'orders' | 'flash-export' | 'myorder-export' | 'finance' | 'hr';

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>('products');
  const [packagingOrderIds, setPackagingOrderIds] = useState<string[]>([]);

  const goToPackaging = (ids: string[]) => {
    setPackagingOrderIds(ids);
    setActivePage('pack-products');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'products':       return <Products />;
      case 'product-list':   return <ProductList />;
      case 'packaging':      return <Packaging orderIds={[]} onDone={() => setActivePage('orders')} onCreateRequisition={() => setActivePage('requisition')}/>;
      case 'pack-products':  return <Packaging orderIds={packagingOrderIds} onDone={() => { setPackagingOrderIds([]); setActivePage('orders'); }} onCreateRequisition={() => setActivePage('requisition')}/>;
      case 'requisition':    return <Requisition />;
      case 'stock':          return <Stock onGoToPO={() => setActivePage('purchase-order')} />;
      case 'purchase-order': return <PurchaseOrder />;
      case 'customers':      return <Customers />;
      case 'orders':         return <Orders onImportDone={goToPackaging} />;
      case 'flash-export':   return <FlashExport />;
      case 'myorder-export': return <MyOrderExport />;
      case 'finance':        return <Finance />;
      case 'hr':             return <HR />;
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
