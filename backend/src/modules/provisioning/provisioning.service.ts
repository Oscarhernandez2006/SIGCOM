import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { UserCompany } from '../users/entities/user-company.entity';
import { COMPANIES } from '../../common/companies';
import { ProvisionUsuarioDto } from './dto/provisioning.dto';

/**
 * Catálogo de módulos (rutas del front) asignables por permisos. Refleja
 * `frontend/src/lib/modules.ts` para que la suite muestre las mismas opciones.
 */
const MODULE_GROUPS = [
  {
    area: 'seller',
    label: 'Operativo · Toma de pedidos',
    modules: [
      { key: '/', label: 'Dashboard comercial' },
      { key: '/pedidos', label: 'Pedidos' },
      { key: '/pedidos/canales', label: 'Pedidos · Canales' },
      { key: '/pedidos/subproductos', label: 'Pedidos · Subproductos' },
      { key: '/cotizaciones', label: 'Cotizaciones' },
      { key: '/clientes', label: 'Cartera de Clientes' },
      { key: '/disponibilidad', label: 'Disponibilidad' },
    ],
  },
  {
    area: 'admin',
    label: 'Administrativo',
    modules: [
      { key: '/admin', label: 'Dashboard' },
      { key: '/admin/inventario', label: 'Inventario' },
      { key: '/admin/pedidos', label: 'Administración de pedidos' },
      { key: '/admin/reportes', label: 'Reportes' },
      { key: '/admin/descargar-pedidos', label: 'Descargar pedidos · Cortes' },
      {
        key: '/admin/descargar-pedidos-subproductos-cerdo',
        label: 'Descargar subproductos · Cerdo',
      },
      {
        key: '/admin/descargar-pedidos-subproductos-res',
        label: 'Descargar subproductos · Res',
      },
      { key: '/admin/listas-precios', label: 'Listas de precios' },
      { key: '/admin/clientes', label: 'Clientes' },
      { key: '/admin/presupuestos', label: 'Presupuestos' },
      { key: '/admin/rentabilidad', label: 'Rentabilidad · Costos' },
      { key: '/admin/cartera', label: 'Aprobación de cartera' },
      {
        key: '/admin/controlador-subproductos',
        label: 'Controlador Subproductos',
      },
      { key: '/admin/horario-pedidos', label: 'Horario de pedidos' },
      { key: '/admin/usuarios', label: 'Usuarios' },
    ],
  },
];

const MODULOS_VALIDOS = new Set(
  MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.key)),
);

/**
 * Aprovisionamiento de usuarios controlado por la suite (SCTOOLS). Crea/actualiza
 * usuarios, cambia estado (activo/bloqueo), contraseña y permisos escribiendo
 * directamente en la BD de esta aplicación (la suite es la fuente de verdad).
 */
@Injectable()
export class ProvisioningService implements OnModuleInit {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserCompany)
    private readonly userCompaniesRepository: Repository<UserCompany>,
  ) {}

  async onModuleInit() {
    // Garantiza la columna de bloqueo aunque DB_SYNCHRONIZE esté desactivado.
    await this.usersRepository.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS suite_blocked boolean NOT NULL DEFAULT false`,
    );
  }

  catalogo() {
    return {
      roles: Object.values(UserRole),
      grupos: MODULE_GROUPS,
      // Sigcom asigna los módulos POR compañía: la suite las usa como pestañas.
      companies: COMPANIES.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  private toRole(rol?: string): UserRole | undefined {
    if (rol === undefined) return undefined;
    const valor = rol.trim().toLowerCase();
    const encontrado = Object.values(UserRole).find((r) => r === valor);
    return encontrado ?? UserRole.SELLER;
  }

  private sanitizarPermisos(permisos?: string[]): string[] {
    if (!Array.isArray(permisos)) return [];
    return Array.from(new Set(permisos.filter((p) => MODULOS_VALIDOS.has(p))));
  }

  async obtenerPorCedula(cedula: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { documentId: cedula.trim() },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Forma normalizada de un usuario (con permisos por compañía). */
  private async toRemote(user: User) {
    const mappings = await this.userCompaniesRepository.find({
      where: { userId: user.id },
    });
    return {
      cedula: user.documentId,
      nombre: user.name,
      email: user.email ?? null,
      rol: user.role,
      activo: user.active,
      bloqueadoSuite: user.suiteBlocked,
      permisos: user.permissions ?? [],
      companies: mappings
        .filter((m) => m.active !== false)
        .map((m) => ({
          companyId: m.companyId,
          name: COMPANIES.find((c) => c.id === m.companyId)?.name ?? m.companyId,
          sellerCode: m.siesaSellerCode ?? null,
          permisos: m.permissions ?? [],
        })),
    };
  }

  /** Un usuario por cédula, normalizado (para refresco puntual desde la suite). */
  async obtenerRemoto(cedula: string) {
    return this.toRemote(await this.obtenerPorCedula(cedula));
  }

  /**
   * Lista todos los usuarios (para que la suite los importe y refleje su rol y
   * permisos actuales por compañía). Forma normalizada común con las demás apps.
   */
  async listarUsuarios() {
    const users = await this.usersRepository.find({ order: { name: 'ASC' } });
    return Promise.all(users.map((u) => this.toRemote(u)));
  }

  /**
   * Define los módulos del usuario EN una compañía. Crea el acceso a la
   * compañía si no existe (equivale a habilitarla). Sigcom es multi-compañía.
   */
  async setCompanyPermisos(
    cedula: string,
    companyId: string,
    permisos: string[],
  ) {
    const user = await this.obtenerPorCedula(cedula);
    let mapping = await this.userCompaniesRepository.findOne({
      where: { userId: user.id, companyId },
    });
    if (!mapping) {
      mapping = this.userCompaniesRepository.create({
        userId: user.id,
        companyId,
        active: true,
        permissions: [],
      });
    }
    mapping.permissions = this.sanitizarPermisos(permisos);
    mapping.active = true;
    await this.userCompaniesRepository.save(mapping);
    return this.toRemote(user);
  }

  /** Asigna (o actualiza) el acceso del usuario a una compañía, con su código de vendedor. */
  async assignCompany(
    cedula: string,
    companyId: string,
    siesaSellerCode?: string,
  ) {
    const user = await this.obtenerPorCedula(cedula);
    let mapping = await this.userCompaniesRepository.findOne({
      where: { userId: user.id, companyId },
    });
    if (!mapping) {
      mapping = this.userCompaniesRepository.create({
        userId: user.id,
        companyId,
        active: true,
        permissions: [],
      });
    }
    if (siesaSellerCode !== undefined) {
      mapping.siesaSellerCode = siesaSellerCode.trim() || undefined;
    }
    mapping.active = true;
    await this.userCompaniesRepository.save(mapping);
    return this.toRemote(user);
  }

  /** Quita el acceso del usuario a una compañía. */
  async removeCompany(cedula: string, companyId: string) {
    const user = await this.obtenerPorCedula(cedula);
    await this.userCompaniesRepository.delete({ userId: user.id, companyId });
    return this.toRemote(user);
  }

  /** Crea o actualiza (upsert por cédula) un usuario. */
  async upsertUsuario(dto: ProvisionUsuarioDto): Promise<User> {
    const documentId = dto.cedula.trim();
    if (!documentId) throw new BadRequestException('La cédula es obligatoria');

    let user = await this.usersRepository.findOne({ where: { documentId } });

    if (!user) {
      const password =
        dto.password && dto.password.length
          ? dto.password
          : crypto.randomBytes(24).toString('hex');
      user = this.usersRepository.create({
        documentId,
        name: (dto.nombre ?? '').trim() || documentId,
        email: dto.email ? dto.email.toLowerCase() : undefined,
        role: this.toRole(dto.rol) ?? UserRole.SELLER,
        permissions: this.sanitizarPermisos(dto.permisos),
        active: dto.activo ?? true,
        passwordHash: await bcrypt.hash(password, 10),
        // Alta desde la suite: no forzamos cambio de contraseña.
        mustChangePassword: false,
      });
      return this.usersRepository.save(user);
    }

    if (dto.nombre !== undefined) user.name = dto.nombre.trim();
    if (dto.email !== undefined) {
      user.email = dto.email ? dto.email.toLowerCase() : undefined;
    }
    const role = this.toRole(dto.rol);
    if (role !== undefined) user.role = role;
    if (dto.permisos !== undefined) {
      user.permissions = this.sanitizarPermisos(dto.permisos);
    }
    if (dto.activo !== undefined) user.active = dto.activo;
    // La suite no puede cambiar la contraseña de un usuario existente (solo se fija al crearlo).
    if (dto.password) {
      this.logger.warn(
        `Suite intentó cambiar la contraseña de ${user.documentId} (upsert); ignorado`,
      );
    }
    return this.usersRepository.save(user);
  }

  async setEstado(
    cedula: string,
    activo?: boolean,
    bloqueadoSuite?: boolean,
  ): Promise<User> {
    const user = await this.obtenerPorCedula(cedula);
    if (activo !== undefined) user.active = activo;
    if (bloqueadoSuite !== undefined) user.suiteBlocked = bloqueadoSuite;
    return this.usersRepository.save(user);
  }

  setPassword(cedula: string): never {
    this.logger.warn(`Suite intentó cambiar la contraseña de ${cedula}; bloqueado`);
    throw new ForbiddenException(
      'La contraseña de SIGCOM no se puede cambiar desde la suite. Se gestiona solo en SIGCOM.',
    );
  }

  async setPermisos(
    cedula: string,
    rol?: string,
    permisos?: string[],
  ): Promise<User> {
    const user = await this.obtenerPorCedula(cedula);
    const role = this.toRole(rol);
    if (role !== undefined) user.role = role;
    if (permisos !== undefined) {
      user.permissions = this.sanitizarPermisos(permisos);
    }
    return this.usersRepository.save(user);
  }
}
