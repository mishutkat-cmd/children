import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { FirestoreService } from '../firestore/firestore.service';
import { DecayService } from '../motivation/decay.service';
import { LedgerService } from '../ledger/ledger.service';
import { LoginDto, RegisterDto, ChildPinLoginDto, UpdateProfileDto, ChangePasswordDto } from './dto/auth.dto';

/**
 * Bcrypt cost. Raised from the legacy value of 10 to 12 in Phase 4 —
 * 12 ≈ 4× more expensive on a brute-force, still <300 ms on the
 * server's CPU. Existing 10-round hashes are NOT migrated en masse;
 * they're transparently re-hashed on the user's next successful
 * login via maybeRehashPassword(). That way nobody is logged out, and
 * the cost upgrade rolls out organically over the next few weeks.
 */
const BCRYPT_COST = 12;

/**
 * Detect whether a stored hash uses a cost lower than BCRYPT_COST.
 * bcryptjs.getRounds() returns the cost factor encoded in the hash;
 * if it can't parse we treat it as up-to-date to avoid double-rehash
 * loops on malformed records.
 */
function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return false;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private firestore: FirestoreService,
    private jwtService: JwtService,
    private decayService: DecayService,
    private ledgerService: LedgerService,
  ) {}

  /**
   * After a successful password verification, transparently re-hash at
   * the current cost if the stored hash is older/weaker. Errors here are
   * swallowed — the login still succeeds; we just try again next time.
   */
  private async maybeRehashPassword(userId: string, plainPassword: string, currentHash: string): Promise<void> {
    if (!needsRehash(currentHash)) return;
    try {
      const newHash = await bcrypt.hash(plainPassword, BCRYPT_COST);
      await this.firestore.update('users', userId, { passwordHash: newHash });
    } catch (e: any) {
      // Non-fatal: user is already authenticated; log and move on.
      console.warn('[AuthService] password rehash failed for user', userId, e?.message);
    }
  }

  async register(dto: RegisterDto) {
    // Проверяем существование пользователя по email или login
    const existingByEmail = dto.email ? await this.firestore.findFirst('users', { email: dto.email }) : null;
    const existingByLogin = await this.firestore.findFirst('users', { login: dto.login });

    if (existingByEmail || existingByLogin) {
      throw new ConflictException('User with this email or login already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const familyId = dto.familyId || crypto.randomUUID();
    const userId = crypto.randomUUID();

    // Создаем пользователя в Firestore
    await this.firestore.create('users', {
      id: userId,
      email: dto.email,
      login: dto.login,
      passwordHash,
      role: dto.role,
      familyId,
    }, userId);

    const user = {
      id: userId,
      email: dto.email,
      login: dto.login,
      passwordHash,
      role: dto.role,
      familyId,
    };

    // Если это ребенок - создаем профиль
    if (dto.role === 'CHILD') {
      const childProfileId = crypto.randomUUID();
      await this.firestore.create('childProfiles', {
        id: childProfileId,
        userId: userId,
        name: dto.name || dto.login,
        avatarUrl: null, // При регистрации avatarUrl не передается
        pointsBalance: 0,
        moneyBalanceCents: 0,
        streakState: {},
      }, childProfileId);
    }

    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
    try {
      console.log('[AuthService] Login attempt:', { loginOrEmail: dto.loginOrEmail });
      
      // Ищем пользователя по email или login
      let user = null;
      try {
        if (dto.loginOrEmail.includes('@')) {
          console.log('[AuthService] Searching user by email:', dto.loginOrEmail);
          user = await this.firestore.findFirst('users', { email: dto.loginOrEmail });
          console.log('[AuthService] Search result by email:', user ? 'found' : 'not found');
        } else {
          console.log('[AuthService] Searching user by login:', dto.loginOrEmail);
          user = await this.firestore.findFirst('users', { login: dto.loginOrEmail });
          console.log('[AuthService] Search result by login:', user ? 'found' : 'not found');
        }
      } catch (error: any) {
        console.error('[AuthService] Error searching user in Firestore:', error.message);
        console.error('[AuthService] Error stack:', error.stack);
        throw new UnauthorizedException('Database error');
      }

      if (!user) {
        console.error('[AuthService] User not found');
        // Проверяем, есть ли вообще пользователи в базе
        try {
          const allUsers = await this.firestore.findMany('users', {}, {}, 5);
          console.log('[AuthService] Total users in database:', allUsers.length);
          if (allUsers.length > 0) {
            console.log('[AuthService] Sample users:', allUsers.map(u => ({ id: u.id, login: u.login, email: u.email })));
          }
        } catch (err: any) {
          console.error('[AuthService] Error checking users:', err.message);
        }
        throw new UnauthorizedException('Invalid credentials');
      }

      console.log('[AuthService] User found:', { id: user.id, email: user.email, login: user.login, role: user.role });

      if (!user.passwordHash) {
        console.error('[AuthService] User has no password hash');
        throw new UnauthorizedException('Invalid credentials');
      }

      console.log('[AuthService] Comparing password...');
      const isValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isValid) {
        console.error('[AuthService] Invalid password');
        throw new UnauthorizedException('Invalid credentials');
      }

      console.log('[AuthService] Password valid');

      // Transparent cost upgrade for legacy 10-round hashes.
      void this.maybeRehashPassword(user.id, dto.password, user.passwordHash);

      // Если это ребенок — применяем decay. Раньше тут же шла
      // updateChildBalance "на всякий случай" — больше не нужна:
      // pointsBalance теперь поддерживается транзакционно в createEntry,
      // расхождения ловит отдельный integrity-check.
      if (user.role === 'CHILD') {
        await this.decayService.processDecayForFamily(user.familyId);
      }

      console.log('[AuthService] Generating tokens...');
      const tokens = await this.generateTokens(user);
      console.log('[AuthService] Login successful');
      return tokens;
    } catch (error: any) {
      console.error('[AuthService] Login error:', error.message);
      console.error('[AuthService] Error stack:', error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Login failed: ' + error.message);
    }
  }

  async childPinLogin(dto: ChildPinLoginDto) {
    console.log('[AuthService] Child PIN login attempt:', { login: dto.login });
    
    const user = await this.firestore.findFirst('users', { login: dto.login });

    if (!user) {
      console.error('[AuthService] User not found:', dto.login);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role !== 'CHILD') {
      console.error('[AuthService] User is not a child:', { login: dto.login, role: user.role });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Получаем профиль ребенка
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: user.id });
    const childProfile = childProfiles.length > 0 ? childProfiles[0] : null;

    console.log('[AuthService] User found:', { userId: user.id, hasPasswordHash: !!user.passwordHash });

    // Проверка PIN: если у пользователя есть passwordHash, проверяем PIN
    if (!user.passwordHash) {
      console.error('[AuthService] User has no passwordHash (PIN not set)');
      throw new UnauthorizedException('PIN не установлен. Обратитесь к родителю.');
    }

    const pinValid = await bcrypt.compare(dto.pin, user.passwordHash);
    if (!pinValid) {
      console.error('[AuthService] Invalid PIN');
      throw new UnauthorizedException('Неверный PIN');
    }

    console.log('[AuthService] PIN verified successfully');
    void this.maybeRehashPassword(user.id, dto.pin, user.passwordHash);

    // Apply decay on child login. Balance-sync (updateChildBalance) used
    // to live here too; it's gone — balance is now maintained by every
    // createEntry transaction, and integrity is checked separately.
    await this.decayService.processDecayForFamily(user.familyId);

    return this.generateTokens(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.firestore.findFirst('users', { id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updateData: any = {};

    // Обновляем login
    if (dto.login) {
      // Проверяем, что login не занят другим пользователем
      const existingByLogin = await this.firestore.findFirst('users', { login: dto.login });
      if (existingByLogin && existingByLogin.id !== userId) {
        throw new ConflictException('User with this login already exists');
      }
      updateData.login = dto.login;
    }

    // Обновляем email
    if (dto.email) {
      // Проверяем, что email не занят другим пользователем
      const existingByEmail = await this.firestore.findFirst('users', { email: dto.email });
      if (existingByEmail && existingByEmail.id !== userId) {
        throw new ConflictException('User with this email already exists');
      }
      updateData.email = dto.email;
    }

    // Обновляем пароль
    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    }

    // Обновляем avatarUrl (для родителя хранится в users, для ребенка в childProfiles)
    if (dto.avatarUrl !== undefined) {
      if (user.role === 'PARENT') {
        updateData.avatarUrl = dto.avatarUrl || null;
      } else {
        // Для ребенка обновляем в childProfiles
        const childProfiles = await this.firestore.findMany('childProfiles', { userId });
        if (childProfiles.length > 0) {
          await this.firestore.update('childProfiles', childProfiles[0].id, {
            avatarUrl: dto.avatarUrl || null,
          });
        }
      }
    }

    // Обновляем пользователя
    if (Object.keys(updateData).length > 0) {
      await this.firestore.update('users', userId, updateData);
    }

    // Возвращаем обновленного пользователя
    const updatedUser = await this.firestore.findFirst('users', { id: userId });
    return updatedUser;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.firestore.findFirst('users', { id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('User has no password set');
    }

    // Проверяем текущий пароль
    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Обновляем пароль
    const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    await this.firestore.update('users', userId, {
      passwordHash: newPasswordHash,
    });

    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.firestore.findFirst('users', { id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    let avatarUrl = user.avatarUrl || null;

    // Для ребенка получаем avatarUrl из childProfiles
    if (user.role === 'CHILD') {
      const childProfiles = await this.firestore.findMany('childProfiles', { userId });
      if (childProfiles.length > 0) {
        avatarUrl = childProfiles[0].avatarUrl || null;
      }
    }

    return {
      id: user.id,
      login: user.login,
      email: user.email,
      role: user.role,
      avatarUrl,
    };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      familyId: user.familyId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        login: user.login,
        role: user.role,
        email: user.email,
        familyId: user.familyId,
      },
    };
  }
}
