export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'comercial',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },

  // SSO: canje de tickets emitidos por la suite (SCTOOLS).
  sso: {
    // URL base del backend de la suite (SCTOOLS). Ej: http://localhost:8000
    issuerUrl: process.env.SSO_ISSUER_URL ?? '',
    // Secreto compartido con la suite para canjear tickets server-to-server.
    sharedSecret: process.env.SSO_SHARED_SECRET ?? '',
  },

  siesa: {
    baseUrl: process.env.SIESA_BASE_URL ?? '',
    conniKey: process.env.SIESA_CONNI_KEY ?? '',
    conniToken: process.env.SIESA_CONNI_TOKEN ?? '',
    username: process.env.SIESA_USERNAME ?? '',
    password: process.env.SIESA_PASSWORD ?? '',
    companyId: process.env.SIESA_COMPANY_ID ?? '',
    timeoutMs: parseInt(process.env.SIESA_TIMEOUT_MS ?? '15000', 10),
  },

  priceLists: {
    baseUrl:
      process.env.PRICE_LISTS_BASE_URL ??
      'https://apiconsulta.grupo-santacruz.com',
    token: process.env.PRICE_LISTS_TOKEN ?? '',
    timeoutMs: parseInt(process.env.PRICE_LISTS_TIMEOUT_MS ?? '30000', 10),
  },

  // Carga de pedidos al ERP (mismo gateway que priceLists, pero con más
  // margen: en horas pico de cierre de pedidos el ERP responde más lento y
  // 30s no alcanzaba, generando pedidos marcados "Error" que en realidad sí
  // se habían creado en Siesa.
  ordersUpload: {
    timeoutMs: parseInt(process.env.ORDERS_UPLOAD_TIMEOUT_MS ?? '60000', 10),
  },

  // Despacho: endpoints de Siesa con las facturas TAT que se suben a Drivin.
  // Cada compañía tiene su propio endpoint (AGROPECUARIA=3, CARNES FRIAS=8).
  dispatch: {
    tatInvoicesUrls: {
      '3':
        process.env.DISPATCH_TAT_INVOICES_URL ??
        'https://apiconsulta.grupo-santacruz.com/ventas/facturas-agropecuaria-tat',
      '8':
        process.env.DISPATCH_TAT_INVOICES_URL_CARNES ??
        'https://apiconsulta.grupo-santacruz.com/ventas/facturas-tat-inversiones',
    } as Record<string, string>,
    tatInvoicesToken: process.env.DISPATCH_TAT_INVOICES_TOKEN ?? '',
    timeoutMs: parseInt(process.env.DISPATCH_TIMEOUT_MS ?? '30000', 10),
    // Token de la API pública que expone las facturas marcadas para despacho.
    apiToken: process.env.DISPATCH_API_TOKEN ?? '',
  },
});
