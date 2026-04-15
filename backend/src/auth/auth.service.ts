import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { FirestoreService } from '../firestore/firestore.service';
import { DecayService } from '../motivation/decay.service';
import { LedgerService } from '../ledger/ledger.service';
import { LoginDto, RegisterDto, ChildPinLoginDto, UpdateProfileDto, ChangePasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private firestore: FirestoreService,
    private jwtService: JwtService,
    private decayService: DecayService,
    private ledgerService: LedgerService,
  ) {}

  async register(dto: RegisterDto) {
    // Проверяем существование пользователя по email или login
    const existingByEmail = dto.email ? await this.firestore.findFirst('users', { email: dto.email }) : null;
    const existingByLogin = await this.firestore.findFirst('users', { login: dto.login });

    if (existingByEmail || existingByLogin) {
      throw new ConflictException('User with this email or login already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
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
        streakState: JSON.stringify({}),
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

      // Если это ребенок - проверяем и применяем decay, а также синхронизируем баланс
      if (user.role === 'CHILD') {
        console.log('[AuthService] Processing decay for child');
        await this.decayService.processDecayForFamily(user.familyId);
        
        // Синхронизируем баланс с ledger записями
        console.log('[AuthService] Synchronizing balance for child');
        try {
          const childProfiles = await this.firestore.findMany('childProfiles', { userId: user.id });
          if (childProfiles.length > 0) {
            const childProfile = childProfiles[0];
            const currentBalance = childProfile.pointsBalance || 0;
            
            // Пересчитываем баланс из ledger
            const correctBalance = await this.ledgerService.updateChildBalance(user.id);
            
            if (currentBalance !== correctBalance) {
              console.log('[AuthService] Balance mismatch detected:', {
                userId: user.id,
                childProfileId: childProfile.id,
                currentBalance,
                correctBalance,
                difference: correctBalance - currentBalance,
              });
              console.log('[AuthService] Balance has been synchronized');
            } else {
              console.log('[AuthService] Balance is correct:', { userId: user.id, balance: correctBalance });
            }
          }
        } catch (balanceError: any) {
          console.error('[AuthService] Error synchronizing balance:', balanceError.message);
          // Не прерываем логин из-за ошибки синхронизации баланса
        }
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

    // Проверяем и применяем decay при логине ребенка
    await this.decayService.processDecayForFamily(user.familyId);
    
    // Синхронизируем баланс с ledger записями
    console.log('[AuthService] Synchronizing balance for child (PIN login)');
    try {
      if (childProfile) {
        const currentBalance = childProfile.pointsBalance || 0;
        
        // Пересчитываем баланс из ledger
        const correctBalance = await this.ledgerService.updateChildBalance(user.id);
        
        if (currentBalance !== correctBalance) {
          console.log('[AuthService] Balance mismatch detected (PIN login):', {
            userId: user.id,
            childProfileId: childProfile.id,
            currentBalance,
            correctBalance,
            difference: correctBalance - currentBalance,
          });
          console.log('[AuthService] Balance has been synchronized');
        } else {
          console.log('[AuthService] Balance is correct (PIN login):', { userId: user.id, balance: correctBalance });
        }
      }
    } catch (balanceError: any) {
      console.error('[AuthService] Error synchronizing balance (PIN login):', balanceError.message);
      // Не прерываем логин из-за ошибки синхронизации баланса
    }

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
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
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
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
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
