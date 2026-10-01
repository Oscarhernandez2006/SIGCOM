import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireCompany } from '@/components/RequireCompany';
import { AppLayout } from '@/components/AppLayout';
import { OperationalHome } from '@/components/OperationalHome';
import { LoginPage } from '@/pages/LoginPage';
import { SsoCallbackPage } from '@/pages/SsoCallbackPage';
import { CompanySelectPage } from '@/pages/CompanySelectPage';
import { NewOrderPage } from '@/pages/NewOrderPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { CanalOrdersPage } from '@/pages/CanalOrdersPage';
import { CanalControlPage } from '@/pages/CanalControlPage';
import { CanalDispatchPage } from '@/pages/CanalDispatchPage';
import { NewQuotePage } from '@/pages/NewQuotePage';
import { QuotesPage } from '@/pages/QuotesPage';
import { StockPage } from '@/pages/StockPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AdminOrdersPage } from '@/pages/AdminOrdersPage';
import { DownloadOrdersPage } from '@/pages/DownloadOrdersPage';
import { PriceListsPage } from '@/pages/PriceListsPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { UsersPage } from '@/pages/UsersPage';
import { OrderSchedulePage } from '@/pages/OrderSchedulePage';
import { CarteraPage } from '@/pages/CarteraPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { RentabilidadPage } from '@/pages/RentabilidadPage';
import { ControladorSubproductosPage } from '@/pages/ControladorSubproductosPage';
import { VentasPorVendedorPage } from '@/pages/VentasPorVendedorPage';
import { DispatchTatInvoicesPage } from '@/pages/DispatchTatInvoicesPage';
import { FeaturedProductsPage } from '@/pages/FeaturedProductsPage';
import { ApiDocsPage } from '@/pages/ApiDocsPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso/callback" element={<SsoCallbackPage />} />

      {/* Compatibilidad: el antiguo apartado operativo/administrativo se eliminó;
          se redirige a la selección de compañía (visual unificada). */}
      <Route path="/seleccionar" element={<Navigate to="/seleccionar-compania" replace />} />

      <Route
        path="/seleccionar-compania"
        element={
          <ProtectedRoute>
            <CompanySelectPage />
          </ProtectedRoute>
        }
      />

      {/* Área de administración (solo admin) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="negocios-nacionales" element={<DashboardPage national />} />
        <Route path="inventario" element={<InventoryPage />} />
        <Route path="pedidos" element={<AdminOrdersPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="reportes/ventas-por-vendedor" element={<VentasPorVendedorPage />} />
        <Route path="descargar-pedidos" element={<DownloadOrdersPage />} />
        <Route
          path="descargar-pedidos-subproductos-cerdo"
          element={<DownloadOrdersPage orderType="subproducto" category="CERDO" />}
        />
        <Route
          path="descargar-pedidos-subproductos-res"
          element={<DownloadOrdersPage orderType="subproducto" category="RES" />}
        />
        <Route
          path="despacho-drivin-tat"
          element={<DispatchTatInvoicesPage />}
        />
        <Route path="listas-precios" element={<PriceListsPage />} />
        <Route path="productos-estrella" element={<FeaturedProductsPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="presupuestos" element={<BudgetsPage />} />
        <Route path="rentabilidad" element={<RentabilidadPage />} />
        <Route path="cartera" element={<CarteraPage />} />
        <Route path="canales-control" element={<CanalControlPage />} />
        <Route path="canales-despacho" element={<CanalDispatchPage />} />
        <Route
          path="controlador-subproductos"
          element={<ControladorSubproductosPage />}
        />
        <Route path="horario-pedidos" element={<OrderSchedulePage />} />
        <Route path="api" element={<ApiDocsPage />} />
        <Route path="usuarios" element={<UsersPage />} />
      </Route>

      {/* Área de aprobación de cartera (solo rol cartera) */}
      <Route
        path="/cartera"
        element={
          <ProtectedRoute role="cartera">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CarteraPage />} />
      </Route>

      {/* Área de vendedor / toma de pedidos (requiere compañía) */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RequireCompany>
              <AppLayout />
            </RequireCompany>
          </ProtectedRoute>
        }
      >
        <Route index element={<OperationalHome />} />
        <Route path="pedidos/nuevo" element={<NewOrderPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route path="pedidos/canales" element={<CanalOrdersPage />} />
        <Route path="cotizaciones/nueva" element={<NewQuotePage />} />
        <Route path="cotizaciones" element={<QuotesPage />} />
        <Route path="disponibilidad" element={<StockPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="productos" element={<ProductsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
