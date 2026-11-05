# Contexto SIGCOM (leer antes de explorar el código)

Este archivo resume los dos proyectos hermanos para evitar releer el código.
**Antes de abrir archivos, consulta aquí; solo lee el código que vas a modificar.**
Cuando hagas un cambio relevante (archivo nuevo, convención, decisión), **actualiza este archivo** en la sección correspondiente.

## Reglas de trabajo con Oscar (usuario)

- Responde en español, conciso.
- **No pruebes en el navegador** ni automatices logins; él verifica en http://localhost:5173. Solo corre `tsc` y `eslint` sobre lo tocado.
- Objetivo general en curso: que **SIGCOM WEB se vea igual que la app móvil SIGCOM MOVIL** (misma paleta, heros con degradado, tarjetas redondeadas, pills) conservando toda la lógica web.
- Nunca commitear ni compartir secretos (cadena DB, `.env`). No hacer commits salvo que lo pida.
- Servidores (procesos detached, ya suelen estar corriendo): backend web NestJS en **3000** (`/api`, Swagger `/api/docs`; Vite hace proxy a 3000), frontend Vite en **5173**, API móvil Laravel en **8000**, Postgres remoto `20.121.178.90:3009/comercialdb`.

## Rutas

- Raíz: `~/Escritorio/PROYECTO SIGCOM/CODIGOS FUENTES/`
  - `SIGCOM WEB/` (este repo, git `Oscarhernandez2006/COMERCIALWEB-PEDIDOS`): `backend/` NestJS + `frontend/` React 19 + Vite + Tailwind **v4** + TanStack Query + react-router.
  - `SIGCOM MOVIL/`: `mobile/` Flutter (referencia de diseño) + `backend/` Laravel (API móvil, `app/Http/Controllers/Api/*Controller.php`).

## Comandos

Arrancar servidores (los binarios de `node_modules/.bin` dan "Permission denied": usar `node` directo, en modo detached):
```bash
cd backend && node node_modules/@nestjs/cli/bin/nest.js start --watch   # puerto 3000
cd frontend && node node_modules/vite/bin/vite.js                       # puerto 5173
```

### Frontend web

```bash
cd frontend
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json   # npx tsc da "Permission denied"
node node_modules/eslint/bin/eslint.js src/ruta/Archivo.tsx
```
Reglas ESLint que muerden: `react-hooks/set-state-in-effect` (hay errores **preexistentes** en `NewOrderPage.tsx` ×4 y `AppLayout.tsx` ×1: no son regresión), `react-refresh/only-export-components` (helpers no-componente van en `.ts` aparte), `no-useless-assignment`.

## SIGCOM WEB · frontend (`frontend/src`)

- `App.tsx` rutas; `auth/` (AuthProvider, `useAuth` → `user.role`: admin | seller | cartera | alistador); `company/` (`useCompany` → `company.id/name/permissions[]`, `clearCompany`). localStorage: `comercial_token`, `comercial_company`.
- `hooks/useApi.ts` (useOrders, useClients, useSiesaStates, useCancelOrder, downloadOrderPdf, useCreateOrder…), `hooks/useAdminApi.ts`, `hooks/useTheme.ts` (dark/toggle).
- `types.ts`: Order, OrderItem, Client, SellableProduct, CartLine, Company, User, Dashboard…
- `lib/brand.ts` → `BRAND` = paleta de la app: primary `#1E9B50`, primaryDark `#15803D`, text `#111827`, textMuted `#4B5563`, textSoft `#6B7280`, field `#F1F5F9`, border `#E2E8F0`, background `#F4FAF6`.
- `lib/format.ts`: formatMoney ("$ 291.000"), formatPercent (fracción), formatInt, formatQuantity, formatDate ("05/11/2026"), formatTime, formatShortDateTimeDay, formatDateTime, todayISO, shiftDays, firstOfMonthISO.
- `index.css`: tokens shadcn (oklch), `.brand-input:focus/disabled`, animaciones `login-fade-in`, `trend-draw`.
- **Primitivas de marca** `components/brand/PageShell.tsx`: PageBackground (fondo degradado, `-m-4 md:-m-6`, max-w-7xl), Hero (degradado verde + círculos), EmptyMessage, StatusPill, InlineNote, BrandButton (filled/outlined/danger/danger-outlined/text), BrandInput, BrandTextarea, Modal (centrado en sm+, **hoja inferior en móvil**), Segmented, Field, TitledCard, AmountRow. `components/brand/RangeChip.tsx`: chip de periodo con presets. `components/brand/Panel.tsx`: Panel/PanelHeader/PanelTitle/PanelBody (reemplazo de Card shadcn para migrar páginas admin). `components/brand/QtyControl.tsx`: Agregar → [− n +] / Agotado (compartido por pedidos y cotizaciones).
- `components/dashboard/`: `primitives.tsx` (CardShell, SectionHeader, MiniStat, StatText, GrowthChip, PendingChip, HeroChip, FadeIn, skeletons), `TrendChart.tsx` (SVG con ResizeObserver), `RingGauge.tsx`.
- `components/orders/`: `order-status.ts` (statusStyle, siesaStyle, ORDER_GROUPS in_progress/synced/issues/cancelled, groupOf, orderNote, summarizeGroups), `OrderCard.tsx` (+CardAction), `GroupFilter.tsx`, `OrderDetailModal.tsx`, `CancelOrderModal.tsx`, `OrderTypeModal.tsx` (Cortes/Canales/Subproductos por permisos).
- Otros componentes: `AppLayout.tsx` (sidebar 272px `md:flex`, drawer móvil, header, logo `/sigcom-logo.png`; nav = `sellerNav` + `adminSections` filtrados por `company.permissions`), `EditOrderModal`, `DuplicateOrderModal`, `ClientSellerInfoModal`, `DeliverySchedulePicker`, `CanalOrderForm`, `ApprovalCountdown`, notificaciones (Cartera, CanalCartera, SiesaState, FeaturedProductNotice), `ui/` shadcn (button, card, input, badge, label).
- **Páginas ya rediseñadas estilo app**: `LoginPage` (logos `/logo-santacruz.png`, `/sigcom-logo.png`, `/logo-carnesfrias.png`), `CompanySelectPage`, `DashboardPage` (hero + chips vendedor/periodo, ventas, cumplimiento, tendencia, categorías/cortes, canales, clientes/presupuestos; modal ranking), `OrdersPage` (hero, RangeChip, búsqueda con sugerencias, GroupFilter, grid OrderCard xl:2, FAB "Nuevo pedido"; filtro por grupo/texto **en cliente**), `NewOrderPage` (wizard 3 pasos Cliente/Productos/Entrega, banner fuera de horario, QtyControl, barra inferior fija `md:left-[272px]`; conserva horario, idempotencyKey, ubicación cliente, asociación de pedido, estrella, mínimo, permisos, PDF), `QuotesPage` (hero + búsqueda local, QuoteCard con pill Vigente/Vencida, FAB, QuoteDetailModal con PDF), `NewQuotePage` (wizard Cliente/Productos/Resumen, descuento por línea en DiscountModal, chips vigencia 8/15/30, barra inferior, modal creada), `CustomersPage` (ruta `/clientes` "Cartera de Clientes"; hero con stats Saldo total/Vencido/Con saldo + barra de progreso de consulta Siesa + buscador, chips Todos/Con saldo/Con vencido, ClientCard con pill de vencido, PortfolioModal: Saldo al…, antigüedad de saldos, cliente, documentos con Segmented Todos/Vencidos, PDF; usa useClientPortfolios + summarize() local con días de mora por dueDate; NOTA: `ClientsPage.tsx` es la admin de useAdminApi, no la de /clientes), `StockPage` (`/disponibilidad`; hero con contador, selector de lista de precios tipo botón → PriceListModal con búsqueda y "Sin precios", buscador; Segmented Todos/Res/Cerdo por `category === 'CERDO'`; ProductTile con precio + pill "N disp."; StockPdfModal con select de lista, iframe de vista previa y descarga), `AdminDashboardPage` (`/admin` "Panel de control" gerencial; hero con botón refrescar + RangeChip, Panel "Ingresos por compañía", VentaAcumuladaSection (mes/día, Venta ERP vs Pedido app), chips Comparativo/compañías, ComparativoGrid o CompanyColumn; toda la lógica/accents por compañía intactos, solo re-estilizado con `components/brand/Panel.tsx`), `ReportsPage` (`/admin/reportes`; hero + grid de tarjetas de reporte con icono degradado; ReportModalShell usa `Modal` de marca max-w-5xl con fondo verde claro; constantes DATE_INPUT/SELECT_INPUT/FIELD_STYLE para inputs; chips de compañía tipo pill; notas informativas verdes, errores en caja roja; tablas con thead verde claro; SummaryTile blanco con borde por tono. Los 8 cuerpos de reporte conservan su lógica; VentasPorVendedorPage sigue con diseño antiguo), `DownloadOrdersPage` (3 rutas: `/admin/descargar-pedidos`, `…-subproductos-cerdo`, `…-subproductos-res`; hero con refrescar, stats Pedidos/Por alistar/Descargados y chips de compañía; Panel con búsqueda, fecha + chips Hoy/Todos los días, chips Todos/Pendientes/Alistados, botones Descargar PDF (n)/Seleccionar todos; tabla de marca con checkboxes de selección y alistado individual/masivo; lógica intacta), **Catálogo** (`InventoryPage`, `PriceListsPage`, `FeaturedProductsPage`, `ClientsPage` admin, `BudgetsPage`, `RentabilidadPage`): re-estilizadas con `/tmp/restyle.py`-style (Hero con botón refrescar circular en Budgets/Rentabilidad, Panel en vez de Card, BrandButton, inputs `brand-input` con FIELD_STYLE, StatusPill en vez de Badge, chips pill para tipo de inventario Cortes/Subproductos, modal de cartera de ClientsPage con `Modal` de marca; lógica intacta; FeaturedProducts conserva ámbar para estrella), **Configuración** (`OrderSchedulePage`, `ApiDocsPage`, `UsersPage`): Hero (Usuarios con botón blanco "Nuevo usuario" dentro del Hero), Panel/BrandButton/inputs de marca, `<label>` de marca en vez de `Label` shadcn, StatusPill en vez de Badge, `ModalShell` de Usuarios sobre el `Modal` de marca; ApiDocs conserva su layout índice+contenido con tokens de color de marca.
- Páginas **con diseño antiguo** (pendientes si se pide): AdminOrdersPage, CanalOrdersPage, Cartera (aprobación), VentasPorVendedorPage, Informe Bajas/Devoluciones (ocultas), DashboardPage national, etc.
- Responsive: ya aplicado en Dashboard, Orders, NewOrder, AppLayout (breakpoints sm/md/lg/xl; safe-area en FAB y barra inferior).
- **Tablas responsive**: envolver siempre `<table>` en `components/brand/ResponsiveTable.tsx` (`<ResponsiveTable className="rounded-2xl border …">`). En escritorio hace scroll horizontal; en móvil (<640px, CSS `.rt` en `index.css`) cada fila se vuelve tarjeta "ETIQUETA · valor" tomando el texto del `th` (asigna `data-label` vía MutationObserver; `colSpan>1` → `data-span` centrado; th vacío/checkbox → sin etiqueta). Ya aplicado en DownloadOrders, Clients (lista y modal cartera), Inventory, PriceLists, Budgets, Rentabilidad, Reports (8 tablas), ApiDocs, AdminOrders, VentasPorVendedor.
- Reglas CSS globales anti-desborde en `index.css`: `.grid > * { min-width:0 }`. Filas de controles (buscador+botón, paginación) deben llevar `flex-wrap` y el input `min-w-0 flex-1`. `Modal` de marca: el contenido aporta padding y `flex-1 overflow-y-auto`.
- `CompanyProvider`: `loading` se deriva de `loadedFor !== user.id` (antes un render intermedio redirigía a `/seleccionar-compania` al recargar rutas de vendedor).
- Auditoría responsive: Oscar autorizó puntualmente usar el navegador integrado (sesión iniciada por él) para medir `main.scrollWidth > clientWidth` a 360/400/768 por ruta; pedir autorización de nuevo si se repite.
- Assets en `frontend/public/`: `sigcom-logo.png` (logo nuevo horizontal, también favicon), `logo-santacruz.png`, `logo-carnesfrias.png`, legados `SIGCOM.png`, `AGROPECUARIA.png`, `CARNESFRIAS.png`.

## SIGCOM WEB · backend (`backend/src`)

- NestJS. `modules/`: auth, users, admin, orders, canal-orders, quotes, clients, customers, products, price-lists, product-costs, featured-products, budgets, dashboard, channel-sales, siesa, dispatch, bajas, devoluciones, settings, provisioning. `common/`, `config/`, `database/` (TypeORM/Postgres).
- `.env` en `backend/` (DATABASE_URL apunta al Postgres remoto). Backups de env en la carpeta de sesión de Copilot, no en el repo.
- Scripts: `npm run start:dev`, `build`, `lint`, `test` (jest).

## SIGCOM MOVIL (referencia de diseño)

- `mobile/lib/theme.dart` paleta (misma que `BRAND`). `widgets/`: app_drawer, brand_background, dashboard_charts, order_widgets (OrderCard, QtyControl…), range_sheet, status_pill, email_sheet, quote_actions.
- `screens/`: login, company_select, app_shell, dashboard, orders, order_detail, new_order, quotes, new_quote, clients, availability, portfolio, approvals, price_lists, featured_products, reports, schedule, subproduct_control, users, managerial.
- `models/order.dart`: colores por estado y `OrderGroup`. API móvil `OrderController.php` define `STATUS_GROUPS` (in_progress=[draft,pending_approval,pending_control,confirmed,syncing], synced, issues=[failed,bounced,disapproved,expired], cancelled).
- Laravel backend: `routes/api.php`, controladores en `app/Http/Controllers/Api/` (Auth, Company, Dashboard, Order, Ordering, Quote, Client, Portfolio, Approval, Availability, PriceList, FeaturedProduct, Report, Schedule, SubproductControl, UserAdmin, Managerial, Health). Tiene su propio `AGENTS.md`/`CLAUDE.md`.

## Historial de decisiones

- Informe de bajas: exportación Excel rediseñada con celdas/fórmulas reales (no imagen) para que sume registros añadidos.
- Se quitó el campo de descuento (deshabilitado) de NewOrderPage.
- `useOrders` web no soporta search/status/group → se filtra en cliente y los totales por grupo se calculan con `summarizeGroups`.
- Backups de páginas originales en `/tmp/*.old.tsx` (OrdersPage, NewOrderPage, QuotesPage, NewQuotePage; temporales).

- **Módulos ocultos**: Despacho Drivin TAT, Despacho Canales, Informe de bajas e Informe de devoluciones quitados del menú y rutas (páginas conservadas en `pages/`).
