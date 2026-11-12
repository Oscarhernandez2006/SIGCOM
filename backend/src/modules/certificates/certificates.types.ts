/** Fila de `/clientes-por-cia-detalle` (una por cliente + sucursal). */
export interface ClientDetailRaw {
  CODIGO?: string;
  TERCERO?: string;
  SUCURSAL?: string;
  NOMBRE_SUCURSAL?: string | null;
  COND_PAGO?: string | null;
  FECHA_INGRESO_CLIENTE?: string | null;
  FECHA_CREACION_TERCERO?: string | null;
  FECHA_PRIMERA_FACTURA?: string | null;
  DESC_COND_PAGO?: string | null;
  DIAS_COND_PAGO?: number | null;
  ESTADO_CLIENTE?: string | null;
  CUPO_CREDITO?: number | null;
  BLOQUEO_CUPO?: string | null;
  PORC_TOLERANCIA?: number | null;
  DIAS_GRACIA?: number | null;
  FECHA_CUPO?: string | null;
}

/** Fila de `/cartera-historico` (un documento, pagado o abierto). */
export interface PortfolioHistoryRaw {
  CIA?: number;
  CODIGO?: string;
  SUCURSAL?: string;
  DESC_SUCURSAL?: string | null;
  CO?: string;
  TIPO_DOC_CRUCE?: string;
  DESCRIPCION?: string;
  CONS_DOC_CRUCE?: number;
  FECHA?: string | null;
  FECHA_VCTO?: string | null;
  VALOR_FACTURA?: number;
  VALOR_PAGADO?: number;
  SALDO?: number;
  FECHA_CANCELACION?: string | null;
  FECHA_ULTIMO_PAGO?: string | null;
  DOC_PAGO?: string | null;
}

/** Sucursal del cliente con sus condiciones comerciales. */
export interface CertificateBranch {
  branch: string;
  name?: string;
  status?: string;
  /** Fecha de ingreso del cliente en Siesa (YYYY-MM-DD). */
  since?: string;
  paymentTermCode?: string;
  paymentTerm?: string;
  paymentTermDays?: number;
  creditLimit: number;
  blocked: boolean;
  tolerancePct: number;
  graceDays: number;
  creditDate?: string;
}

/** Documento del histórico normalizado. */
export interface CertificateDocument {
  branch: string;
  docType?: string;
  number: number;
  invoiceDate?: string;
  dueDate?: string;
  amount: number;
  paid: number;
  balance: number;
  /** Fecha en que quedó en saldo 0. */
  paidDate?: string;
  lastPaymentDate?: string;
  paymentDoc?: string;
  /** Días entre la factura y su cancelación. */
  paymentDays?: number;
  /** Días de retraso respecto al vencimiento + gracia (0 si a tiempo). */
  daysLate?: number;
}

/** Indicadores de comportamiento de pago en el periodo. */
export interface PaymentBehavior {
  invoices: number;
  invoicedAmount: number;
  paidInvoices: number;
  paidOnTime: number;
  paidLate: number;
  /** % de facturas pagadas dentro del plazo (sobre las pagadas). */
  onTimePct: number;
  /** Promedio de días entre la factura y su pago. */
  avgPaymentDays: number;
  /** Promedio de días de retraso de las facturas pagadas tarde. */
  avgDaysLate: number;
  maxDaysLate: number;
  openInvoices: number;
  openAmount: number;
  lastPaymentDate?: string;
}

/** Estado actual de la cartera (consulta `/cartera`). */
export interface CurrentPortfolio {
  totalBalance: number;
  overdueBalance: number;
  maxDaysOverdue: number;
  openDocuments: number;
  creditAvailable: number;
}

/** Datos verificados en Siesa con los que se emite el certificado. */
export interface CertificateData {
  company: { id: string; name: string };
  client: {
    code: string;
    name: string;
    status?: string;
    /** Inicio de la relación comercial (YYYY-MM-DD). */
    since?: string;
    /** De dónde sale `since`: fecha de ingreso o primera factura. */
    sinceSource?: 'ingreso' | 'primera_factura';
    firstInvoice?: string;
    relationshipMonths?: number;
    branches: CertificateBranch[];
    totalCreditLimit: number;
  };
  period: { from: string; to: string };
  behavior: PaymentBehavior;
  current: CurrentPortfolio;
  documents: CertificateDocument[];
  /** Fecha y hora de la consulta a Siesa (ISO). */
  verifiedAt: string;
}
