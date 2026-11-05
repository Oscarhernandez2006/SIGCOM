import { useState } from 'react';
import {
  UserPlus,
  Shield,
  User as UserIcon,
  Building2,
  Plus,
  X,
  Check,
  Power,
  KeyRound,
  LayoutGrid,
  Pencil,
  Trash2,
  Search,
} from 'lucide-react';
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useSetUserActive,
  useAssignCompany,
  useRemoveCompany,
  useSetCompanyPermissions,
} from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { MODULE_GROUPS, ALL_MODULES, areaLabel } from '@/lib/modules';
import { cn } from '@/lib/utils';
import type { AdminUser } from '@/types';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton, Modal, StatusPill } from '@/components/brand/PageShell';
import { Panel, PanelBody } from '@/components/brand/Panel';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

export function UsersPage() {
  const { data: users = [], isLoading } = useAdminUsers();
  const setActive = useSetUserActive();
  const deleteUser = useDeleteUser();

  const [showCreate, setShowCreate] = useState(false);
  const [companiesUser, setCompaniesUser] = useState<AdminUser | null>(null);
  const [permsUser, setPermsUser] = useState<AdminUser | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const filtered = term
    ? users.filter((u) =>
        [u.name, u.documentId, u.email ?? '']
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
    : users;

  function handleDelete(u: AdminUser) {
    const ok = window.confirm(
      `¿Eliminar al usuario "${u.name}" (cédula ${u.documentId})? Esta acción no se puede deshacer.`,
    );
    if (ok) deleteUser.mutate(u.id);
  }

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Usuarios</h2>
            <p className="mt-1 text-sm font-semibold text-white/90">
              Vendedores y administradores · acceso por compañía y permisos por módulo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-extrabold text-[#15803D] shadow-sm transition hover:bg-white/90"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo usuario
          </button>
        </div>
      </Hero>

      {/* Filtro de búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
        <input className="brand-input h-10 rounded-xl pl-9 pr-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
          placeholder="Buscar por nombre, cédula o correo..."
          
          value={search}
          onChange={(e) => setSearch(e.target.value)}
            />
      </div>

      {/* Listado de usuarios */}
      <Panel>
        <PanelBody className="px-0 py-0">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">
              Cargando usuarios...
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">
              {term ? 'No hay usuarios que coincidan.' : 'No hay usuarios.'}
            </p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {filtered.map((u) => (
                <li key={u.id}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        u.role === 'admin'
                          ? 'bg-[#1E9B50]/10 text-[#1E9B50]'
                          : 'bg-[#F1F5F9] text-[#4B5563]',
                      )}
                    >
                      {u.role === 'admin' ? (
                        <Shield className="h-5 w-5" />
                      ) : (
                        <UserIcon className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-[180px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-extrabold text-[#111827]">{u.name}</p>
                        {!u.active && (
                          <StatusPill label="Inactivo" color={BRAND.textSoft} />
                        )}
                      </div>
                      <p className="text-sm text-[#6B7280]">
                        Cédula {u.documentId} · {areaLabel(u.role)}
                      </p>
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-wrap items-center gap-2">
                      <BrandButton variant="outlined" className="h-9 px-3" onClick={() => setPermsUser(u)}
                      >
                        <KeyRound className="h-4 w-4" />
                        Permisos
                      </BrandButton>
                      <BrandButton variant="outlined" className="h-9 px-3" onClick={() => setCompaniesUser(u)}
                      >
                        <Building2 className="h-4 w-4" />
                        Compañías
                      </BrandButton>
                      <BrandButton variant="outlined" className="h-9 px-3" onClick={() => setEditUser(u)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </BrandButton>
                      {u.role !== 'admin' && (
                        <BrandButton variant="text" className="h-9 w-9 px-0" title={u.active ? 'Desactivar' : 'Activar'} onClick={() =>
                            setActive.mutate({ id: u.id, active: !u.active })
                          }
                        >
                          <Power
                            className={cn(
                              'h-4 w-4',
                              u.active
                                ? 'text-[#1E9B50]'
                                : 'text-[#6B7280]',
                            )}
                          />
                        </BrandButton>
                      )}
                      <BrandButton variant="text" className="h-9 w-9 px-0" title="Eliminar usuario" onClick={() => handleDelete(u)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </BrandButton>
                    </div>

                    {/* Compañías (en su propia línea para que no se amontonen) */}
                    <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-[#E2E8F0]/80 pt-3">
                      {u.companies.length === 0 ? (
                        <span className="text-xs text-[#6B7280]">
                          Sin compañías
                        </span>
                      ) : (
                        u.companies.map((c) => (
                          <StatusPill
                            key={c.companyId}
                            color={BRAND.primary}
                            label={`${c.name}${c.siesaSellerCode ? ` · ${c.siesaSellerCode}` : ''}${
                              c.permissions && c.permissions.length > 0
                                ? ` · ${c.permissions.length} mód.`
                                : ''
                            }`}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {companiesUser && (
        <CompaniesModal
          user={users.find((u) => u.id === companiesUser.id) ?? companiesUser}
          onClose={() => setCompaniesUser(null)}
        />
      )}
      {permsUser && (
        <PermissionsModal
          user={users.find((u) => u.id === permsUser.id) ?? permsUser}
          onClose={() => setPermsUser(null)}
        />
      )}
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
      )}
    </PageBackground>
  );
}

/** Modal para crear un usuario (área según el rol + módulos visibles). */
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const createUser = useCreateUser();
  const [form, setForm] = useState({
    documentId: '',
    name: '',
    password: '',
    role: 'seller' as
      | 'admin'
      | 'seller'
      | 'cartera'
      | 'alistador'
      | 'facturacion',
    clientBudget: false,
  });

  function setRole(
    role: 'admin' | 'seller' | 'cartera' | 'alistador' | 'facturacion',
  ) {
    setForm((f) => ({ ...f, role }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createUser.mutate({ ...form, permissions: [] }, { onSuccess: onClose });
  }

  return (
    <ModalShell title="Crear usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="documentId" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Cédula</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="documentId"
              inputMode="numeric"
              required
              minLength={4}
              value={form.documentId}
              onChange={(e) =>
                setForm({ ...form, documentId: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Nombre</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="name"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Contraseña</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="password"
              type="password"
              required
              minLength={4}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="role" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Área / Rol</label>
            <select
              id="role"
              className="flex h-9 w-full rounded-md border border-[#E2E8F0] bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.role}
              onChange={(e) =>
                setRole(
                  e.target.value as
                    | 'admin'
                    | 'seller'
                    | 'cartera'
                    | 'alistador'
                    | 'facturacion',
                )
              }
            >
              <option value="seller">Vendedor</option>
              <option value="admin">Administrador · Administrativa</option>
              <option value="cartera">Cartera</option>
              <option value="alistador">Alistador</option>
              <option value="facturacion">Facturación</option>
            </select>
          </div>
          {form.role === 'seller' && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#E2E8F0] bg-[#EEF2F7]/20 px-3 py-2 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={form.clientBudget}
                onChange={(e) =>
                  setForm({ ...form, clientBudget: e.target.checked })
                }
              />
              <span className="text-sm">
                Presupuesto por cliente / tienda
                <span className="block text-xs text-[#6B7280]">
                  La meta se asigna por cada cliente asignado y queda aparte del
                  presupuesto general del comercial (ej. Juan Sierra).
                </span>
              </span>
            </label>
          )}
        </div>

        {/* Los módulos visibles se asignan por compañía después de crear el
            usuario y asignarle compañías (botón "Permisos"). */}
        <div className="flex items-start gap-2 rounded-lg border border-[#E2E8F0] bg-[#F4FAF6] px-3 py-2">
          <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7280]" />
          <p className="text-xs text-[#6B7280]">
            Después de crear el usuario, asígnale sus compañías y luego define
            qué módulos puede ver <strong>en cada compañía</strong> desde el botón
            “Permisos”. Sin módulos marcados, verá los de su rol por defecto.
          </p>
        </div>

        {createUser.isError && (
          <p className="text-sm text-red-600">
            No se pudo crear. ¿La cédula ya existe?
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
          <BrandButton variant="text" className="h-10" type="button" onClick={onClose}>
            Cancelar
          </BrandButton>
          <BrandButton className="h-10" type="submit" disabled={createUser.isPending}>
            <Check className="h-4 w-4" />
            {createUser.isPending ? 'Creando...' : 'Crear usuario'}
          </BrandButton>
        </div>
      </form>
    </ModalShell>
  );
}

/** Modal para editar la información de un usuario. */
function EditUserModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const updateUser = useUpdateUser();
  const [form, setForm] = useState({
    documentId: user.documentId,
    name: user.name,
    email: user.email ?? '',
    role: user.role as 'admin' | 'seller' | 'cartera' | 'alistador' | 'facturacion',
    clientBudget: user.clientBudget ?? false,
    password: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateUser.mutate(
      {
        id: user.id,
        documentId: form.documentId,
        name: form.name,
        email: form.email ? form.email : undefined,
        role: form.role,
        clientBudget: form.clientBudget,
        // Solo enviamos la contraseña si se escribió una nueva.
        ...(form.password ? { password: form.password } : {}),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalShell title={`Editar · ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="edit-documentId" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Cédula</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="edit-documentId"
              inputMode="numeric"
              required
              minLength={4}
              value={form.documentId}
              onChange={(e) =>
                setForm({ ...form, documentId: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-name" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Nombre</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="edit-name"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-email" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Correo (opcional)</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-role" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Área / Rol</label>
            <select
              id="edit-role"
              className="flex h-9 w-full rounded-md border border-[#E2E8F0] bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as
                    | 'admin'
                    | 'seller'
                    | 'cartera'
                    | 'alistador'
                    | 'facturacion',
                })
              }
            >
              <option value="seller">Vendedor</option>
              <option value="admin">Administrador · Administrativa</option>
              <option value="cartera">Cartera</option>
              <option value="alistador">Alistador</option>
              <option value="facturacion">Facturación</option>
            </select>
          </div>
          {form.role === 'seller' && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#E2E8F0] bg-[#EEF2F7]/20 px-3 py-2 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={form.clientBudget}
                onChange={(e) =>
                  setForm({ ...form, clientBudget: e.target.checked })
                }
              />
              <span className="text-sm">
                Presupuesto por cliente / tienda
                <span className="block text-xs text-[#6B7280]">
                  La meta se asigna por cada cliente asignado y queda aparte del
                  presupuesto general del comercial (ej. Juan Sierra).
                </span>
              </span>
            </label>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="edit-password" className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">Nueva contraseña (opcional)</label>
            <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              id="edit-password"
              type="password"
              placeholder="Dejar en blanco para no cambiarla"
              minLength={4}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </div>

        {updateUser.isError && (
          <p className="text-sm text-red-600">
            No se pudieron guardar los cambios. ¿La cédula ya existe?
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
          <BrandButton variant="text" className="h-10" type="button" onClick={onClose}>
            Cancelar
          </BrandButton>
          <BrandButton className="h-10" type="submit" disabled={updateUser.isPending}>
            <Check className="h-4 w-4" />
            {updateUser.isPending ? 'Guardando...' : 'Guardar cambios'}
          </BrandButton>
        </div>
      </form>
    </ModalShell>
  );
}

/** Modal para activar/desactivar los módulos visibles de un usuario POR compañía. */
function PermissionsModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const setCompanyPermissions = useSetCompanyPermissions();
  const companies = user.companies ?? [];
  const [activeCompany, setActiveCompany] = useState<string>(
    companies[0]?.companyId ?? '',
  );
  // Permisos por compañía, inicializados desde lo que ya tiene el usuario.
  const [byCompany, setByCompany] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      companies.map((c) => [c.companyId, c.permissions ?? []]),
    ),
  );

  const selected = byCompany[activeCompany] ?? [];

  function toggle(key: string) {
    setByCompany((prev) => {
      const current = prev[activeCompany] ?? [];
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      return { ...prev, [activeCompany]: next };
    });
  }

  function setSelected(next: string[]) {
    setByCompany((prev) => ({ ...prev, [activeCompany]: next }));
  }

  function handleSave() {
    setCompanyPermissions.mutate(
      { id: user.id, companyId: activeCompany, permissions: selected },
      { onSuccess: onClose },
    );
  }

  if (companies.length === 0) {
    return (
      <ModalShell title={`Permisos · ${user.name}`} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">
            Este usuario no tiene compañías asignadas. Asigna primero una
            compañía para poder definir sus módulos por empresa.
          </p>
          <div className="flex justify-end border-t border-[#E2E8F0] pt-4">
            <BrandButton variant="text" className="h-10" onClick={onClose}>
              Cerrar
            </BrandButton>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Permisos · ${user.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F4FAF6] px-3 py-2 text-sm">
          <span className="text-[#6B7280]">Rol principal</span>
          <StatusPill label={areaLabel(user.role)} color={BRAND.primary} />
        </div>

        {/* Selector de compañía: los módulos se asignan por empresa. */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Compañía
          </p>
          <div className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <button
                key={c.companyId}
                type="button"
                onClick={() => setActiveCompany(c.companyId)}
                className={cn(
                  'h-9 rounded-full border px-4 text-[13px] font-bold transition-colors',
                  c.companyId === activeCompany
                    ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                    : 'border-[#E2E8F0] text-[#6B7280] hover:bg-[#F4FAF6]',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[#6B7280]">
            Marca los módulos que este usuario podrá ver en esta compañía. Sin
            ninguno marcado, verá los módulos por defecto de su rol.
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-[#1E9B50] hover:underline"
            onClick={() =>
              setSelected(
                selected.length === ALL_MODULES.length
                  ? []
                  : ALL_MODULES.map((m) => m.key),
              )
            }
          >
            {selected.length === ALL_MODULES.length
              ? 'Quitar todos'
              : 'Seleccionar todos'}
          </button>
        </div>

        <ModuleGroupsPicker selected={selected} onToggle={toggle} />

        {setCompanyPermissions.isError && (
          <p className="text-sm text-red-600">
            No se pudieron guardar los permisos.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-4">
          <BrandButton variant="text" className="h-10" onClick={onClose}>
            Cancelar
          </BrandButton>
          <BrandButton className="h-10" onClick={handleSave} disabled={setCompanyPermissions.isPending}>
            <Check className="h-4 w-4" />
            {setCompanyPermissions.isPending
              ? 'Guardando...'
              : 'Guardar permisos'}
          </BrandButton>
        </div>
      </div>
    </ModalShell>
  );
}

/** Selector de módulos agrupado por área (operativo + administrativo). */
function ModuleGroupsPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      {MODULE_GROUPS.map((group) => (
        <div key={group.area} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            {group.label}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.modules.map((m) => (
              <ModuleToggle
                key={m.key}
                label={m.label}
                checked={selected.includes(m.key)}
                onToggle={() => onToggle(m.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Casilla de módulo (toggle visual). */
function ModuleToggle({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
        checked
          ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
          : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
      )}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-md border',
          checked
            ? 'border-[#1E9B50] bg-[#1E9B50] text-[#1E9B50]-foreground'
            : 'border-[#E2E8F0]',
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

/** Contenedor genérico de modal. */
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-4 sm:px-5">
        <h3 className="min-w-0 truncate text-lg font-extrabold tracking-[-0.3px] text-[#111827]">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F9] text-[#4B5563] transition hover:bg-[#E2E8F0]"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
    </Modal>
  );
}

/** Modal para asignar/quitar compañías y códigos de vendedor a un usuario. */
function CompaniesModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const assign = useAssignCompany();
  const remove = useRemoveCompany();
  const [codes, setCodes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      user.companies.map((c) => [c.companyId, c.siesaSellerCode ?? '']),
    ),
  );

  return (
    <ModalShell title={`Compañías · ${user.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
          Acceso por compañía y código de vendedor en Siesa
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
        {COMPANIES.map((c) => {
          const has = user.companies.find((x) => x.companyId === c.id);
          return (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border border-[#E2E8F0] bg-white p-4"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-[#6B7280]" />
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="ml-auto">
                  {has ? (
                    <StatusPill label="Asignada" color={BRAND.primary} />
                  ) : (
                    <StatusPill label="Sin asignar" color={BRAND.textSoft} />
                  )}
                </span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`code-${c.id}`} className="text-xs font-extrabold uppercase tracking-wide text-[#6B7280]">
                  Código de vendedor en Siesa
                </label>
                <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                  id={`code-${c.id}`}
                  placeholder="Ej. 0033"
                  value={codes[c.id] ?? ''}
                  onChange={(e) =>
                    setCodes({ ...codes, [c.id]: e.target.value })
                  }
            />
              </div>

              <div className="flex items-center gap-2">
                <BrandButton className="h-9 px-3 flex-1" disabled={assign.isPending} onClick={() =>
                    assign.mutate({
                      id: user.id,
                      companyId: c.id,
                      siesaSellerCode: codes[c.id] || undefined,
                    })
                  }
                >
                  {has ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {has ? 'Guardar código' : 'Asignar compañía'}
                </BrandButton>
                {has && (
                  <BrandButton variant="text" className="h-9 w-9 px-0" title="Quitar acceso" disabled={remove.isPending} onClick={() =>
                      remove.mutate({ id: user.id, companyId: c.id })
                    }
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </BrandButton>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </ModalShell>
  );
}
