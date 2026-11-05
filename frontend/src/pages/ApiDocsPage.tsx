import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  KeyRound,
  Link2,
  Braces,
  Terminal,
  ArrowRight,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageBackground, Hero } from '@/components/brand/PageShell';
import { ResponsiveTable } from '@/components/brand/ResponsiveTable';


type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiParam {
  name: string;
  location: 'query' | 'header';
  required: boolean;
  type: string;
  description: string;
}

interface ApiField {
  name: string;
  type: string;
  description: string;
}

interface ApiEndpoint {
  id: string;
  method: Method;
  title: string;
  path: string;
  description: string;
  auth: string;
  params: ApiParam[];
  responseFields: ApiField[];
  exampleResponse: string;
  notes?: string[];
}

interface ApiModule {
  key: string;
  name: string;
  description: string;
  endpoints: ApiEndpoint[];
}

/**
 * Catálogo de la API por módulos. Se irá ampliando módulo por módulo; por ahora
 * solo el de Despacho · Drivin TAT Facturas.
 */
const API_MODULES: ApiModule[] = [
  {
    key: 'despacho-drivin-tat',
    name: 'Despacho · Drivin TAT Facturas',
    description:
      'Expone las facturas TAT que el administrador marcó y guardó para despacho en Drivin.',
    endpoints: [
      {
        id: 'get-tat-invoices',
        method: 'GET',
        title: 'Facturas marcadas para despacho',
        path: '/api/public/dispatch/tat-invoices',
        description:
          'Devuelve las facturas TAT que fueron marcadas y publicadas con el botón "Guardar" del módulo, de la compañía indicada. Consolidadas por consecutivo (kilos y valor sumados).',
        auth: 'Token de API en el header "x-api-key" o en el query "token".',
        params: [
          {
            name: 'cia',
            location: 'query',
            required: true,
            type: 'string',
            description: 'Compañía: 3 = AGROPECUARIA, 8 = CARNES FRIAS.',
          },
          {
            name: 'token',
            location: 'query',
            required: false,
            type: 'string',
            description: 'Token de API (alternativa al header x-api-key).',
          },
          {
            name: 'x-api-key',
            location: 'header',
            required: false,
            type: 'string',
            description: 'Token de API (alternativa al query token).',
          },
        ],
        responseFields: [
          { name: 'nro_documento', type: 'string', description: 'Consecutivo de la factura.' },
          { name: 'fecha_documento', type: 'string (YYYY-MM-DD)', description: 'Fecha del documento.' },
          { name: 'cliente_factura', type: 'string', description: 'Código/NIT del cliente.' },
          { name: 'razon_social_cliente', type: 'string', description: 'Nombre/razón social del cliente.' },
          { name: 'codigo_sucursal', type: 'string | null', description: 'Código de la sucursal del cliente.' },
          { name: 'descripcion_sucursal', type: 'string | null', description: 'Nombre/descripción de la sucursal.' },
          { name: 'direccion_sucursal', type: 'string | null', description: 'Dirección de la sucursal.' },
          { name: 'tipo_comercial', type: 'string | null', description: 'Tipos de la factura (p. ej. "CORTE, SUBPRODUCTO"). Null en CARNES FRIAS.' },
          { name: 'cantidad_inv', type: 'number', description: 'Kilos totales de la factura.' },
          { name: 'valor_subtotal', type: 'number', description: 'Valor subtotal total (pesos).' },
        ],
        exampleResponse: `[
  {
    "nro_documento": "1FE-00061221",
    "fecha_documento": "2026-08-27",
    "cliente_factura": "85151095",
    "razon_social_cliente": "RODRIGUEZ SERRANO JESUS DAVID",
    "codigo_sucursal": "001",
    "descripcion_sucursal": "JESUS DAVID RODRIGUEZ SERRANO",
    "direccion_sucursal": "FINCA PRIMAVERA",
    "tipo_comercial": "SUBPRODUCTO",
    "cantidad_inv": 92.96,
    "valor_subtotal": 46480
  }
]`,
        notes: [
          'Solo viajan las facturas PUBLICADAS con el botón "Guardar" del módulo.',
          'El marcado/desmarcado se autoguarda como borrador y no afecta al endpoint hasta pulsar Guardar.',
          'El token se configura en el backend (variable DISPATCH_API_TOKEN).',
        ],
      },
    ],
  },
];

/** Icono por módulo (para el índice y la portada). */
const MODULE_ICONS: Record<string, typeof Truck> = {
  'despacho-drivin-tat': Truck,
};

/** Dominio público de producción (fallback cuando se abre la doc en local). */
const PRODUCTION_BASE_URL = 'https://sigcom.grupo-santacruz.com';

const METHOD_COLORS: Record<Method, string> = {
  GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30',
  POST: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30',
  PUT: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/30',
  PATCH: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-purple-500/30',
  DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/30',
};

function MethodBadge({
  method,
  size = 'sm',
}: {
  method: Method;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded font-bold tracking-wide ring-1 ring-inset',
        METHOD_COLORS[method],
        size === 'sm'
          ? 'px-1.5 py-0.5 text-[10px]'
          : 'min-w-[52px] px-2 py-1 text-xs',
      )}
    >
      {method}
    </span>
  );
}

/** Bloque de código con barra de título estilo terminal y botón de copiar. */
function CodeBlock({
  code,
  label,
  icon: Icon = Terminal,
  badge,
}: {
  code: string;
  label: string;
  icon?: typeof Terminal;
  badge?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <Icon className="h-3.5 w-3.5" />
          {label}
          {badge && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
              {badge}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
      {children}
    </h4>
  );
}

/**
 * Documentación de la API (estilo referencia): módulos → endpoints → detalle de
 * cada endpoint (parámetros, respuesta y ejemplo de uso).
 */
export function ApiDocsPage() {
  const [openModules, setOpenModules] = useState<Set<string>>(
    () => new Set(API_MODULES.map((m) => m.key)),
  );
  // Sin endpoint seleccionado se muestra la portada (introducción).
  const [selectedId, setSelectedId] = useState<string>('');

  const selected = useMemo(() => {
    for (const m of API_MODULES) {
      const ep = m.endpoints.find((e) => e.id === selectedId);
      if (ep) return { module: m, endpoint: ep };
    }
    return null;
  }, [selectedId]);

  // URL pública base de la API. Prioridad: variable de entorno explícita >
  // dominio donde está desplegada la app (si no es local) > dominio de
  // producción. Así la doc muestra siempre la URL externa real.
  const envBase = import.meta.env.VITE_PUBLIC_API_BASE_URL as
    | string
    | undefined;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const isLocalOrigin = /localhost|127\.0\.0\.1/.test(origin);
  const baseUrl = envBase && envBase.trim()
    ? envBase.trim().replace(/\/$/, '')
    : origin && !isLocalOrigin
      ? origin
      : PRODUCTION_BASE_URL;

  const toggleModule = (key: string) =>
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const curl = selected
    ? `curl "${baseUrl}${selected.endpoint.path}?cia=3" \\\n  -H "x-api-key: <TU_API_KEY>"`
    : '';
  const fullUrl = selected ? `${baseUrl}${selected.endpoint.path}` : '';

  return (
    <PageBackground className="space-y-3.5">
      {/* Hero */}
      <Hero>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.16] text-white">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
              Documentación de la API
            </h2>
            <p className="mt-1 text-sm font-semibold text-white/90">
              Referencia de endpoints por módulos · integra SIGCOM con tus
              sistemas.
            </p>
          </div>
        </div>
      </Hero>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Índice */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="rounded-2xl border border-[#E2E8F0] bg-white p-2">
            <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Referencia
            </p>
            <button
              type="button"
              onClick={() => setSelectedId('')}
              className={cn(
                'mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
                !selected
                  ? 'bg-[#1E9B50]/10 text-[#1E9B50]'
                  : 'text-[#111827] hover:bg-[#F4FAF6]',
              )}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              Introducción
            </button>
            {API_MODULES.map((m) => {
              const open = openModules.has(m.key);
              const Icon = MODULE_ICONS[m.key] ?? BookOpen;
              return (
                <div key={m.key}>
                  <button
                    type="button"
                    onClick={() => toggleModule(m.key)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-[#F4FAF6]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#6B7280]" />
                    <span className="flex-1 truncate">{m.name}</span>
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[#6B7280]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" />
                    )}
                  </button>
                  {open && (
                    <div className="mb-1 ml-4 space-y-0.5 border-l border-[#E2E8F0] pl-2">
                      {m.endpoints.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setSelectedId(e.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                            selectedId === e.id
                              ? 'bg-[#F4FAF6] font-medium'
                              : 'hover:bg-[#F4FAF6]',
                          )}
                        >
                          <MethodBadge method={e.method} />
                          <span className="truncate">{e.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Portada / Introducción */}
        {!selected && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#E2E8F0] bg-[#1E9B50]/[0.06] p-6">
                <h3 className="text-xl font-bold">Bienvenido</h3>
                <p className="mt-1 max-w-2xl text-sm text-[#6B7280]">
                  Aquí encontrarás lo necesario para integrar SIGCOM con tus
                  sistemas. Los servicios se consumen mediante un protocolo
                  RESTful y devuelven JSON.
                </p>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-3">
                <div className="rounded-xl border border-[#E2E8F0] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Link2 className="h-4 w-4 text-[#1E9B50]" />
                    URL base
                  </div>
                  <p className="break-all font-mono text-xs text-[#6B7280]">
                    {baseUrl}/api
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="h-4 w-4 text-amber-500" />
                    Autenticación
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    Token de API en el header{' '}
                    <span className="font-mono">x-api-key</span> o el query{' '}
                    <span className="font-mono">token</span>.
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Braces className="h-4 w-4 text-[#1E9B50]" />
                    Formato
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    Respuestas en JSON. Códigos HTTP estándar (200, 401, 400).
                  </p>
                </div>
              </div>
            </div>

            <div>
              <SectionTitle>Módulos disponibles</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {API_MODULES.map((m) => {
                  const Icon = MODULE_ICONS[m.key] ?? BookOpen;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setOpenModules((prev) => new Set(prev).add(m.key));
                        setSelectedId(m.endpoints[0]?.id ?? '');
                      }}
                      className="group flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 text-left transition-all hover:border-[#1E9B50]/40 hover:shadow-sm"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1E9B50]/10 text-[#1E9B50]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {m.name}
                          </span>
                          <span className="rounded-full bg-[#EEF2F7] px-1.5 py-0.5 text-[10px] font-medium text-[#6B7280]">
                            {m.endpoints.length} endpoint
                            {m.endpoints.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#6B7280]">
                          {m.description}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[#6B7280] transition-transform group-hover:translate-x-0.5 group-hover:text-[#1E9B50]" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Detalle del endpoint */}
        {selected && (
          <div className="space-y-6">
            {/* Encabezado */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
              <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                <span>{selected.module.name}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-[#111827]">
                  {selected.endpoint.title}
                </span>
              </div>
              <h3 className="mt-2 flex items-center gap-3 text-xl font-bold">
                <MethodBadge method={selected.endpoint.method} size="md" />
                {selected.endpoint.title}
              </h3>
              <p className="mt-2 text-sm text-[#6B7280]">
                {selected.endpoint.description}
              </p>

              {/* URL con copiar */}
              <div className="mt-4">
                <UrlBar
                  method={selected.endpoint.method}
                  url={fullUrl}
                />
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <span className="font-semibold">Autenticación: </span>
                  <span className="text-[#6B7280]">
                    {selected.endpoint.auth}
                  </span>
                </div>
              </div>
            </div>

            {/* Parámetros */}
            {selected.endpoint.params.length > 0 && (
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
                <SectionTitle>Parámetros</SectionTitle>
                <ResponsiveTable className="rounded-xl border border-[#E2E8F0]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Nombre</th>
                        <th className="px-3 py-2 font-semibold">En</th>
                        <th className="px-3 py-2 font-semibold">Tipo</th>
                        <th className="px-3 py-2 font-semibold">Req.</th>
                        <th className="px-3 py-2 font-semibold">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.endpoint.params.map((p, i) => (
                        <tr
                          key={`${p.location}-${p.name}`}
                          className={cn(
                            'border-t border-[#E2E8F0]',
                            i % 2 === 1 && 'bg-[#EEF2F7]/20',
                          )}
                        >
                          <td className="px-3 py-2 font-mono font-medium text-[#1E9B50]">
                            {p.name}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-[#EEF2F7] px-1.5 py-0.5 font-mono text-[11px] text-[#6B7280]">
                              {p.location}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-[#6B7280]">
                            {p.type}
                          </td>
                          <td className="px-3 py-2">
                            {p.required ? (
                              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                                requerido
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#6B7280]">
                                opcional
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[#6B7280]">
                            {p.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ResponsiveTable>
              </div>
            )}

            {/* Ejemplo de solicitud */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
              <SectionTitle>Ejemplo de solicitud</SectionTitle>
              <CodeBlock code={curl} label="cURL" />
            </div>

            {/* Respuesta */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
              <SectionTitle>Respuesta</SectionTitle>
              <ResponsiveTable className="mb-4 rounded-xl border border-[#E2E8F0]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Campo</th>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.endpoint.responseFields.map((f, i) => (
                      <tr
                        key={f.name}
                        className={cn(
                          'border-t border-[#E2E8F0]',
                          i % 2 === 1 && 'bg-[#EEF2F7]/20',
                        )}
                      >
                        <td className="px-3 py-2 font-mono font-medium text-[#1E9B50]">
                          {f.name}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#6B7280]">
                          {f.type}
                        </td>
                        <td className="px-3 py-2 text-[#6B7280]">
                          {f.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
              <CodeBlock
                code={selected.endpoint.exampleResponse}
                label="JSON"
                icon={Braces}
                badge="200 OK"
              />
            </div>

            {/* Notas */}
            {selected.endpoint.notes && selected.endpoint.notes.length > 0 && (
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
                <SectionTitle>Notas</SectionTitle>
                <ul className="space-y-2">
                  {selected.endpoint.notes.map((n, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[#6B7280]"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </PageBackground>
  );
}

/** Barra con método + URL completa y botón de copiar. */
function UrlBar({ method, url }: { method: Method; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F4FAF6] p-1.5">
      <MethodBadge method={method} size="md" />
      <code className="flex-1 truncate px-1 font-mono text-sm">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[#6B7280] transition-colors hover:bg-[#F4FAF6]"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
