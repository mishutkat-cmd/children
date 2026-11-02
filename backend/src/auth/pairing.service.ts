import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { DocStore } from '../db/doc-store.service';

/**
 * Вход без паролей для детей и приглашение второго взрослого.
 *
 * - Телефон ребёнка подключает родитель: показывает QR или 6 цифр, ребёнок вводит —
 *   телефон получает долгую сессию (deviceSessions), которую родитель видит и может отозвать.
 * - Секрет из 3 картинок — вход ребёнка на семейном компьютере. 9 картинок, порядок важен;
 *   после 5 ошибок подряд вход по секрету закрыт на 15 минут.
 * - Семейный компьютер: родитель один раз отмечает браузер, дальше дети выбирают себя
 *   и вводят секрет. Детская сессия там короткая.
 * - Приглашение: ссылка на 72 часа, по ней второй взрослый заводит себе вход в эту семью.
 */

export const SECRET_PICTURES = ['cat', 'dog', 'sun', 'car', 'apple', 'ball', 'fish', 'tree', 'rocket'] as const;
export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const SESSION_TTL = '180d';
const FAMILY_PC_TTL = '30d';
const FAMILY_PC_CHILD_TTL = '2h';
const MAX_SECRET_FAILS = 5;
const SECRET_LOCK_MS = 15 * 60 * 1000;
const TOUCH_THROTTLE_MS = 15 * 60 * 1000;
export const FAMILY_PC_SCOPE = 'family-pc';

export interface SessionPayload {
  sub: string;
  role: string;
  familyId: string;
  sid?: string;
  scope?: string;
}

@Injectable()
export class PairingService {
  constructor(
    private db: DocStore,
    private jwt: JwtService,
  ) {}

  // ---------- Подключение телефона ребёнка ----------

  /** Родитель создаёт код для ребёнка. Прежние неиспользованные коды этого ребёнка гасятся. */
  async createCode(familyId: string, childUserId: string) {
    const child = await this.childInFamily(familyId, childUserId);
    for (const old of await this.db.findMany('pairingCodes', { childUserId })) {
      if (!old.usedAt && !old.cancelledAt) await this.db.update('pairingCodes', old.id, { cancelledAt: new Date() });
    }
    let code = '';
    for (let i = 0; i < 10; i++) {
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const clash = (await this.db.findMany('pairingCodes', { code })).some((c) => this.isLive(c));
      if (!clash) break;
    }
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await this.db.create('pairingCodes', { id, code, childUserId, familyId, expiresAt, usedAt: null, cancelledAt: null }, id);
    return { code, expiresAt, link: `kidsmotivation://pair?code=${code}`, childName: await this.childName(child) };
  }

  /** Телефон ребёнка вводит код (или сканирует QR) и получает долгую сессию. */
  async claimCode(code: string, deviceId: string, platform?: string, deviceName?: string) {
    const clean = String(code || '').replace(/\D/g, '');
    if (clean.length !== 6) throw new BadRequestException('Код — это 6 цифр');
    const rec = (await this.db.findMany('pairingCodes', { code: clean })).find((c) => this.isLive(c));
    if (!rec) throw new UnauthorizedException('Код не подошёл или устарел. Попроси у мамы или папы новый.');
    await this.db.update('pairingCodes', rec.id, { usedAt: new Date() });

    const user = await this.db.findFirst('users', { id: rec.childUserId });
    if (!user || user.familyId !== rec.familyId) throw new UnauthorizedException('Ребёнок не найден');
    const profile = await this.db.findFirst('childProfiles', { userId: user.id });

    // Одна сессия на пару (ребёнок, устройство): повторное подключение отзывает прежнюю.
    for (const s of await this.db.findMany('deviceSessions', { userId: user.id })) {
      if (s.deviceId === deviceId && !s.revokedAt) await this.db.update('deviceSessions', s.id, { revokedAt: new Date() });
    }
    const sid = randomUUID();
    await this.db.create(
      'deviceSessions',
      {
        id: sid,
        kind: 'phone',
        userId: user.id,
        familyId: user.familyId,
        deviceId: String(deviceId || '').slice(0, 100),
        platform: platform || 'unknown',
        name: (deviceName || '').slice(0, 60) || null,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      sid,
    );

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: 'CHILD', familyId: user.familyId, sid } satisfies SessionPayload, {
      expiresIn: SESSION_TTL,
    });
    return {
      accessToken,
      user: { id: user.id, login: user.login, role: 'CHILD', familyId: user.familyId },
      child: { name: profile?.name || user.login, avatarUrl: profile?.avatarUrl ?? null },
      hasSecret: !!user.secretHash,
    };
  }

  /** Жива ли сессия устройства. Вызывается JwtStrategy для токенов с sid. */
  async checkSession(sid: string, userId: string, familyId: string): Promise<boolean> {
    const s = await this.db.findFirst('deviceSessions', { id: sid });
    if (!s || s.revokedAt) return false;
    // Дети на семейном компьютере входят под сессией этого компьютера (её завёл родитель).
    if (s.kind === 'family-pc' ? s.familyId !== familyId : s.userId !== userId) return false;
    const last = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
    if (Date.now() - last > TOUCH_THROTTLE_MS) this.db.update('deviceSessions', sid, { lastSeenAt: new Date() }).catch(() => {});
    return true;
  }

  /** Устройства семьи для экрана «Вход и устройства». */
  async listDevices(familyId: string) {
    const sessions = (await this.db.findMany('deviceSessions', { familyId })).filter((s) => !s.revokedAt);
    const out = [];
    for (const s of sessions) {
      const user = await this.db.findFirst('users', { id: s.userId });
      const profile = user?.role === 'CHILD' ? await this.db.findFirst('childProfiles', { userId: s.userId }) : null;
      out.push({
        id: s.id,
        kind: s.kind,
        platform: s.platform,
        name: s.name,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        userId: s.userId,
        userName: profile?.name || user?.login || null,
      });
    }
    return out.sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
  }

  async revokeDevice(familyId: string, id: string) {
    const s = await this.db.findFirst('deviceSessions', { id });
    if (!s || s.familyId !== familyId) throw new NotFoundException('Устройство не найдено');
    await this.db.update('deviceSessions', id, { revokedAt: new Date() });
    return { success: true };
  }

  // ---------- Секрет из картинок ----------

  /** Ребёнок задаёт (или меняет) секрет из 3 картинок. */
  async setSecret(childUserId: string, pictures: string[]) {
    const user = await this.db.findFirst('users', { id: childUserId });
    if (!user || user.role !== 'CHILD') throw new ForbiddenException();
    await this.db.update('users', childUserId, {
      secretHash: await bcrypt.hash(this.secretKey(pictures), 10),
      secretFails: 0,
      secretLockedUntil: null,
    });
    return { success: true };
  }

  /** «Забыл секрет»: родитель сбрасывает, ребёнок задаст новый при следующем входе с телефона. */
  async resetSecret(familyId: string, childUserId: string) {
    await this.childInFamily(familyId, childUserId);
    await this.db.update('users', childUserId, { secretHash: null, secretFails: 0, secretLockedUntil: null });
    return { success: true };
  }

  // ---------- Семейный компьютер ----------

  /** Родитель отмечает этот браузер семейным: дети смогут входить сами по секрету. */
  async enableFamilyPc(familyId: string, parentUserId: string, name?: string) {
    const sid = randomUUID();
    await this.db.create(
      'deviceSessions',
      {
        id: sid,
        kind: 'family-pc',
        userId: parentUserId,
        familyId,
        deviceId: sid,
        platform: 'web',
        name: (name || '').slice(0, 60) || 'Семейный компьютер',
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      sid,
    );
    const token = await this.jwt.signAsync(
      { sub: parentUserId, role: 'PARENT', familyId, sid, scope: FAMILY_PC_SCOPE } satisfies SessionPayload,
      { expiresIn: FAMILY_PC_TTL },
    );
    return { familyPcToken: token };
  }

  /** Дети семьи для экрана «Кто ты?» на семейном компьютере. */
  async familyPcKids(token: string) {
    const pc = await this.verifyFamilyPc(token);
    const kids = await this.db.findMany('users', { familyId: pc.familyId, role: 'CHILD' });
    const out = [];
    for (const k of kids) {
      const profile = await this.db.findFirst('childProfiles', { userId: k.id });
      out.push({ id: k.id, name: profile?.name || k.login, avatarUrl: profile?.avatarUrl ?? null, hasSecret: !!k.secretHash });
    }
    return out;
  }

  /** Вход ребёнка на семейном компьютере по секрету из картинок. */
  async familyPcLogin(token: string, childUserId: string, pictures: string[]) {
    const pc = await this.verifyFamilyPc(token);
    const user = await this.db.findFirst('users', { id: childUserId });
    if (!user || user.role !== 'CHILD' || user.familyId !== pc.familyId) throw new UnauthorizedException('Ребёнок не найден');
    if (!user.secretHash) throw new BadRequestException('Секрет ещё не задан — задай его в телефоне или попроси маму');
    if (user.secretLockedUntil && new Date(user.secretLockedUntil).getTime() > Date.now()) {
      throw new ForbiddenException('Слишком много попыток. Подожди 15 минут или позови маму.');
    }
    const ok = await bcrypt.compare(this.secretKey(pictures), user.secretHash);
    if (!ok) {
      const fails = (user.secretFails || 0) + 1;
      await this.db.update(
        'users',
        user.id,
        fails >= MAX_SECRET_FAILS ? { secretFails: 0, secretLockedUntil: new Date(Date.now() + SECRET_LOCK_MS) } : { secretFails: fails },
      );
      throw new UnauthorizedException('Не тот секрет. Попробуй ещё раз.');
    }
    if (user.secretFails) await this.db.update('users', user.id, { secretFails: 0 });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: 'CHILD', familyId: user.familyId, sid: pc.sid } satisfies SessionPayload,
      { expiresIn: FAMILY_PC_CHILD_TTL },
    );
    return { accessToken, user: { id: user.id, login: user.login, role: 'CHILD', familyId: user.familyId } };
  }

  // ---------- Приглашение второго взрослого ----------

  async createInvite(familyId: string, invitedBy: string) {
    const token = randomBytes(24).toString('base64url');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.db.create('familyInvites', { id, token, familyId, invitedBy, expiresAt, usedAt: null }, id);
    return { token, expiresAt };
  }

  async describeInvite(token: string) {
    const inv = await this.liveInvite(token);
    const inviter = await this.db.findFirst('users', { id: inv.invitedBy });
    const kids = await this.db.findMany('users', { familyId: inv.familyId, role: 'CHILD' });
    const names: string[] = [];
    for (const k of kids) names.push((await this.db.findFirst('childProfiles', { userId: k.id }))?.name || k.login);
    return { inviter: inviter?.login || null, kids: names, expiresAt: inv.expiresAt };
  }

  async acceptInvite(token: string, dto: { login: string; password: string; email?: string }) {
    const inv = await this.liveInvite(token);
    const login = String(dto.login || '').trim();
    if (login.length < 3) throw new BadRequestException('Логин — от 3 символов');
    if (String(dto.password || '').length < 8) throw new BadRequestException('Пароль — от 8 символов');
    if (await this.db.findFirst('users', { login })) throw new ConflictException('Такой логин уже занят');
    if (dto.email && (await this.db.findFirst('users', { email: dto.email }))) throw new ConflictException('Эта почта уже используется');
    const id = randomUUID();
    const user = {
      id,
      login,
      email: dto.email || null,
      passwordHash: await bcrypt.hash(dto.password, 12),
      role: 'PARENT',
      familyId: inv.familyId,
    };
    await this.db.create('users', user, id);
    await this.db.update('familyInvites', inv.id, { usedAt: new Date(), usedBy: id });
    const accessToken = this.jwt.sign({ sub: id, email: user.email, role: 'PARENT', familyId: inv.familyId });
    return { accessToken, user: { id, login, role: 'PARENT', email: user.email, familyId: inv.familyId } };
  }

  // ---------- helpers ----------

  private secretKey(pictures: string[]) {
    if (!Array.isArray(pictures) || pictures.length !== 3 || !pictures.every((p) => (SECRET_PICTURES as readonly string[]).includes(p))) {
      throw new BadRequestException('Секрет — это 3 картинки');
    }
    return pictures.join('-');
  }

  private isLive(c: any) {
    return !c.usedAt && !c.cancelledAt && new Date(c.expiresAt).getTime() > Date.now();
  }

  private async liveInvite(token: string) {
    const inv = await this.db.findFirst('familyInvites', { token: String(token || '') });
    if (!inv) throw new NotFoundException('Приглашение не найдено');
    if (inv.usedAt || new Date(inv.expiresAt).getTime() < Date.now()) throw new GoneException('Приглашение уже использовано или устарело');
    return inv;
  }

  private async verifyFamilyPc(token: string): Promise<{ familyId: string; sid: string }> {
    let p: SessionPayload;
    try {
      p = await this.jwt.verifyAsync<SessionPayload>(String(token || ''));
    } catch {
      throw new UnauthorizedException('Компьютер больше не семейный — войдите как взрослый');
    }
    if (p.scope !== FAMILY_PC_SCOPE || !p.sid) throw new UnauthorizedException('Это не токен семейного компьютера');
    const s = await this.db.findFirst('deviceSessions', { id: p.sid });
    if (!s || s.revokedAt) throw new UnauthorizedException('Компьютер больше не семейный — войдите как взрослый');
    return { familyId: p.familyId, sid: p.sid };
  }

  private async childInFamily(familyId: string, childUserId: string) {
    const child = await this.db.findFirst('users', { id: childUserId });
    if (!child || child.role !== 'CHILD' || child.familyId !== familyId) throw new NotFoundException('Ребёнок не найден');
    return child;
  }

  private async childName(child: any) {
    return (await this.db.findFirst('childProfiles', { userId: child.id }))?.name || child.login;
  }
}
