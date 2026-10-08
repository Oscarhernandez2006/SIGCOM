import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { UserCompany } from './entities/user-company.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { baseCompanyId } from '../../common/companies';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserCompany)
    private readonly userCompaniesRepository: Repository<UserCompany>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      documentId: dto.documentId,
      email: dto.email?.toLowerCase(),
      name: dto.name,
      role: dto.role,
      siesaSellerCode: dto.siesaSellerCode,
      clientBudget: dto.clientBudget ?? false,
      permissions: dto.permissions ?? [],
      passwordHash,
    });
    return this.usersRepository.save(user);
  }

  /** Busca por cedula (documento) o, si parece correo, por email. */
  findByUsername(username: string): Promise<User | null> {
    const value = username.trim();
    if (value.includes('@')) {
      return this.usersRepository.findOne({
        where: { email: value.toLowerCase() },
      });
    }
    return this.usersRepository.findOne({ where: { documentId: value } });
  }

  findByDocumentId(documentId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { documentId } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  count(): Promise<number> {
    return this.usersRepository.count();
  }

  /** Lista todos los usuarios (para administración). */
  findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** Actualiza la información editable de un usuario. */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);

    if (dto.documentId && dto.documentId !== user.documentId) {
      const existing = await this.usersRepository.findOne({
        where: { documentId: dto.documentId },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe un usuario con esa cédula');
      }
      user.documentId = dto.documentId;
    }

    if (dto.email !== undefined) {
      user.email = dto.email ? dto.email.toLowerCase() : undefined;
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.siesaSellerCode !== undefined) {
      user.siesaSellerCode = dto.siesaSellerCode || undefined;
    }
    if (dto.clientBudget !== undefined) user.clientBudget = dto.clientBudget;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
      user.passwordChangedAt = new Date();
      user.passwordChangedBy = 'admin';
      this.logger.warn(`Contraseña de ${user.documentId} cambiada por admin`);
    }

    return this.usersRepository.save(user);
  }

  /** Actualiza la contraseña de un usuario y marca que ya no necesita cambiarla. */
  async updatePassword(id: string, newPassword: string): Promise<User> {
    const user = await this.findById(id);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    user.passwordChangedBy = 'usuario';
    this.logger.warn(`Contraseña de ${user.documentId} cambiada por el usuario`);
    return this.usersRepository.save(user);
  }

  /** Elimina un usuario (sus accesos por compañía se borran en cascada). */
  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.userCompaniesRepository.delete({ userId: user.id });
    await this.usersRepository.delete({ id: user.id });
  }

  /** Activa/desactiva un usuario. */
  async setActive(id: string, active: boolean): Promise<User> {
    const user = await this.findById(id);
    user.active = active;
    return this.usersRepository.save(user);
  }

  /** Define los módulos visibles del usuario (rutas del front). */
  async setPermissions(id: string, permissions: string[]): Promise<User> {
    const user = await this.findById(id);
    user.permissions = Array.isArray(permissions) ? permissions : [];
    return this.usersRepository.save(user);
  }

  /**
   * Define los módulos visibles del usuario EN UNA compañía especifica.
   * El usuario debe tener acceso a esa compañía (debe existir el mapeo).
   */
  async setCompanyPermissions(
    userId: string,
    companyId: string,
    permissions: string[],
  ): Promise<UserCompany> {
    const mapping = await this.userCompaniesRepository.findOne({
      where: { userId, companyId },
    });
    if (!mapping) {
      throw new NotFoundException(
        'El usuario no tiene acceso a esa compañía',
      );
    }
    mapping.permissions = Array.isArray(permissions) ? permissions : [];
    return this.userCompaniesRepository.save(mapping);
  }

  /** Quita el acceso de un usuario a una compañía. */
  async removeCompany(userId: string, companyId: string): Promise<void> {
    await this.userCompaniesRepository.delete({ userId, companyId });
  }

  /** Compañías a las que el usuario tiene acceso (activas). */
  findCompaniesForUser(userId: string): Promise<UserCompany[]> {
    return this.userCompaniesRepository.find({
      where: { userId, active: true },
    });
  }

  /** Codigo de vendedor del usuario para una compañía especifica. */
  async getSellerCode(
    userId: string,
    companyId: string,
  ): Promise<string | undefined> {
    const mapping = await this.userCompaniesRepository.findOne({
      where: { userId, companyId, active: true },
    });
    return mapping?.siesaSellerCode;
  }

  /** ¿El usuario tiene un permiso de módulo (global o en la compañía)? */
  async hasPermissionInCompany(
    userId: string,
    companyId: string,
    permission: string,
  ): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return false;
    if (user.role === UserRole.ADMIN) return true;
    if ((user.permissions ?? []).includes(permission)) return true;
    const mapping = await this.userCompaniesRepository.findOne({
      where: { userId, companyId, active: true },
    });
    return (mapping?.permissions ?? []).includes(permission);
  }

  /**
   * Vendedores de una compañía con código de vendedor en Siesa. Se usa para el
   * selector de vendedor en la toma de subproductos (el remitente elige a nombre
   * de quién va el pedido). Resuelve la compañía base (p. ej. MONTERIA TAT →
   * AGROPECUARIA).
   */
  async getCompanySellers(companyId: string): Promise<
    {
      id: string;
      name: string;
      documentId: string;
      siesaSellerCode: string;
      role: string;
    }[]
  > {
    const base = baseCompanyId(companyId);
    const mappings = await this.userCompaniesRepository.find({
      where: { companyId: base, active: true },
      relations: { user: true },
    });
    return mappings
      .map((m) => {
        const code = (m.siesaSellerCode || m.user?.siesaSellerCode || '').trim();
        return { mapping: m, code };
      })
      .filter(({ mapping, code }) => mapping.user && mapping.user.active && code)
      .map(({ mapping, code }) => ({
        id: mapping.user.id,
        name: mapping.user.name,
        documentId: mapping.user.documentId,
        siesaSellerCode: code,
        role: mapping.user.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Devuelve un mapa `código de vendedor -> nombre` para una compañía.
   * Considera tanto el código por compañía (UserCompany) como el código
   * general del usuario, para mostrar el nombre del vendedor en lugar del
   * código.
   */
  async getSellerNameMap(companyId: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    const users = await this.usersRepository.find();
    for (const user of users) {
      const code = user.siesaSellerCode?.trim();
      if (code && !map.has(code)) map.set(code, user.name);
    }

    const mappings = await this.userCompaniesRepository.find({
      where: { companyId, active: true },
      relations: { user: true },
    });
    for (const mapping of mappings) {
      const code = mapping.siesaSellerCode?.trim();
      if (code && mapping.user?.name) map.set(code, mapping.user.name);
    }

    return map;
  }

  /** Indica si el usuario tiene acceso a la compañía. */
  async hasCompanyAccess(userId: string, companyId: string): Promise<boolean> {
    const count = await this.userCompaniesRepository.count({
      where: { userId, companyId, active: true },
    });
    return count > 0;
  }

  /** Asigna (o actualiza) el acceso de un usuario a una compañía. */
  async assignCompany(
    userId: string,
    companyId: string,
    siesaSellerCode?: string,
  ): Promise<UserCompany> {
    const existing = await this.userCompaniesRepository.findOne({
      where: { userId, companyId },
    });
    const mapping = this.userCompaniesRepository.merge(
      existing ?? new UserCompany(),
      { userId, companyId, siesaSellerCode, active: true },
    );
    return this.userCompaniesRepository.save(mapping);
  }
}
