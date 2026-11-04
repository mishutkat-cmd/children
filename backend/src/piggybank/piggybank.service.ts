import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DocStore } from '../db/doc-store.service';
import { getChildProfileId } from '../db/doc-helpers';
import { ExchangesService } from '../exchanges/exchanges.service';
import { RequestUser } from '../common/decorators/user.decorator';

const COLLECTION = 'moneyEntries';

/**
 * Записи копилки. Кошелёк и отложенное на цели считаются суммой записей —
 * так история видна целиком и ничего не расходится.
 *  CASH       ± наличные (подарили, потратил)
 *  CONVERT    + гривны за обменянные звёзды
 *  ALLOCATE   ± перенос между кошельком и целью (минус в кошельке = плюс в цели)
 *  PURCHASE   − цель куплена: отложенное на неё ушло
 */
export type MoneyKind = 'CASH' | 'CONVERT' | 'ALLOCATE' | 'PURCHASE';

type Child = { childProfileId: string; userId: string };

@Injectable()
export class PiggybankService {
  constructor(
    private db: DocStore,
    private exchanges: ExchangesService,
  ) {}

  /** Ребёнок — всегда он сам; родитель — ребёнок своей семьи из запроса. */
  async resolveChild(actor: RequestUser, childId?: string): Promise<Child> {
    const target = actor.role === 'CHILD' ? actor.userId : childId;
    if (!target) throw new BadRequestException('Укажите ребёнка');
    const resolved = await getChildProfileId(this.db, target, actor.familyId);
    if (!resolved) throw new NotFoundException('Ребёнок не найден');
    return resolved;
  }

  private rate(familyId: string): number {
    const s = this.db.findFirstSync('familySettings', { familyId });
    const r = typeof s?.conversionRate === 'string' ? parseFloat(s.conversionRate) : s?.conversionRate;
    return r > 0 ? r : 10;
  }

  /** Свободные деньги в кошельке (без отложенного на цели). */
  private walletSync(childProfileId: string): number {
    const rows = this.db.findManySync(COLLECTION, { childId: childProfileId });
    return rows.reduce((sum: number, r: any) => {
      if (r.kind === 'ALLOCATE') return sum - r.amountCents;
      if (r.kind === 'PURCHASE') return sum; // списывается из цели, не из кошелька
      return sum + r.amountCents;
    }, 0);
  }

  private savedSync(childProfileId: string, rewardId: string): number {
    const rows = this.db.findManySync(COLLECTION, { childId: childProfileId, rewardId });
    return rows.reduce((sum: number, r: any) => {
      if (r.kind === 'ALLOCATE') return sum + r.amountCents;
      if (r.kind === 'PURCHASE') return sum + r.amountCents; // отрицательная
      return sum;
    }, 0);
  }

  private addSync(familyId: string, child: Child, actor: RequestUser, data: Record<string, any>) {
    const id = crypto.randomUUID();
    this.db.createSync(
      COLLECTION,
      { id, familyId, childId: child.childProfileId, childUserId: child.userId, byUserId: actor.userId, byRole: actor.role, ...data },
      id,
    );
    return id;
  }

  /** Цели с ценой в гривнах, которые есть у ребёнка (его личные и семейные из вишлиста). */
  private async moneyGoals(child: Child, familyId: string) {
    const wish = await this.db.findMany('wishlist', { childId: child.childProfileId });
    const ids = [...new Set(wish.map((w: any) => w.rewardId).filter(Boolean))] as string[];
    const rewards = ids.length ? await this.db.findMany('rewards', { id: { in: ids }, familyId }) : [];
    const byId = new Map(rewards.map((r: any) => [r.id, r]));
    return wish
      .map((w: any) => ({ w, r: byId.get(w.rewardId) as any }))
      .filter(({ r }) => r && r.status !== 'ARCHIVED')
      .map(({ w, r }) => ({
        rewardId: r.id,
        wishId: w.id,
        title: r.title,
        imageUrl: r.imageUrl ?? null,
        priceCents: r.moneyValueCents > 0 ? r.moneyValueCents : null,
        savedCents: this.savedSync(child.childProfileId, r.id),
        bought: !!w.isPurchased || w.status === 'COMPLETED',
        isFavorite: w.isFavorite === true || w.isFavorite === 'true',
      }));
  }

  async summary(actor: RequestUser, childId?: string) {
    const child = await this.resolveChild(actor, childId);
    const profile = await this.db.findFirst('childProfiles', { id: child.childProfileId });
    const entries = await this.db.findMany(COLLECTION, { childId: child.childProfileId }, { createdAt: 'desc' }, 30);
    const goals = await this.moneyGoals(child, actor.familyId);
    const titles = new Map(goals.map((g) => [g.rewardId, g.title]));
    return {
      childId: child.childProfileId,
      childUserId: child.userId,
      walletCents: this.walletSync(child.childProfileId),
      savedTotalCents: goals.filter((g) => !g.bought).reduce((s, g) => s + Math.max(0, g.savedCents), 0),
      pointsBalance: profile?.pointsBalance ?? 0,
      conversionRate: this.rate(actor.familyId),
      goals,
      entries: entries.map((e: any) => ({
        id: e.id,
        kind: e.kind,
        amountCents: e.amountCents,
        note: e.note ?? null,
        rewardId: e.rewardId ?? null,
        goalTitle: e.rewardId ? titles.get(e.rewardId) ?? null : null,
        points: e.points ?? null,
        byRole: e.byRole,
        createdAt: e.createdAt,
      })),
    };
  }

  async cash(actor: RequestUser, amountCents: number, note?: string, childId?: string) {
    const child = await this.resolveChild(actor, childId);
    this.db.transaction(() => {
      if (amountCents < 0 && this.walletSync(child.childProfileId) + amountCents < 0) {
        throw new BadRequestException('В кошельке столько нет');
      }
      this.addSync(actor.familyId, child, actor, { kind: 'CASH', amountCents, note: note?.trim() || null });
    });
    return this.summary(actor, child.userId);
  }

  /**
   * Звёзды → гривны. Списание звёзд идёт через обычный обмен (ExchangesService
   * с cashCents): та же проверка баланса, та же история обменов у родителя.
   *
   * Обменянные гривны по умолчанию сразу идут на главную цель (ту, на которую
   * ребёнок копит) — так прогресс не обнуляется: звёзд стало меньше, но на цели
   * отложено ровно столько же. Остаток сверх цены цели остаётся свободным в
   * кошельке. keepInWallet — ребёнок захотел оставить деньги себе «на потратить».
   */
  async convert(actor: RequestUser, points: number, childId?: string, keepInWallet = false) {
    const child = await this.resolveChild(actor, childId);
    const rate = this.rate(actor.familyId);
    const cents = Math.floor((points * 100) / rate);
    if (cents < 1) throw new BadRequestException(`Слишком мало звёзд: ${rate} звёзд = 1 грн`);
    // Куда отложить обмен: главная цель с ценой (избранная, иначе первая), где ещё есть куда.
    let target: { rewardId: string; room: number } | null = null;
    if (!keepInWallet) {
      const active = (await this.moneyGoals(child, actor.familyId)).filter((g) => !g.bought && g.priceCents != null);
      const pick = active.find((g) => g.isFavorite) || active[0];
      if (pick) {
        const room = Math.max(0, (pick.priceCents as number) - pick.savedCents);
        if (room > 0) target = { rewardId: pick.rewardId, room };
      }
    }
    const exchange: any = await this.exchanges.create(child.userId, actor.familyId, { cashCents: cents });
    this.db.transaction(() => {
      this.addSync(actor.familyId, child, actor, {
        kind: 'CONVERT',
        amountCents: cents,
        points: exchange?.pointsSpent ?? points,
        exchangeId: exchange?.id ?? null,
      });
      if (target) {
        const toGoal = Math.min(cents, target.room);
        if (toGoal > 0) this.addSync(actor.familyId, child, actor, { kind: 'ALLOCATE', amountCents: toGoal, rewardId: target.rewardId });
      }
    });
    return this.summary(actor, child.userId);
  }

  async allocate(actor: RequestUser, rewardId: string, amountCents: number, childId?: string) {
    const child = await this.resolveChild(actor, childId);
    const goal = (await this.moneyGoals(child, actor.familyId)).find((g) => g.rewardId === rewardId);
    if (!goal) throw new NotFoundException('Цель не найдена');
    if (goal.bought) throw new BadRequestException('Эта цель уже куплена');
    this.db.transaction(() => {
      if (amountCents > 0 && this.walletSync(child.childProfileId) < amountCents) {
        throw new BadRequestException('В кошельке не хватает денег');
      }
      if (amountCents < 0 && this.savedSync(child.childProfileId, rewardId) + amountCents < 0) {
        throw new BadRequestException('На цели столько не отложено');
      }
      this.addSync(actor.familyId, child, actor, { kind: 'ALLOCATE', amountCents, rewardId });
    });
    return this.summary(actor, child.userId);
  }

  /** Цель куплена: отложенное списывается, желание отмечается выполненным. */
  async goalDone(actor: RequestUser, rewardId: string, childId?: string) {
    const child = await this.resolveChild(actor, childId);
    const goal = (await this.moneyGoals(child, actor.familyId)).find((g) => g.rewardId === rewardId);
    if (!goal) throw new NotFoundException('Цель не найдена');
    if (goal.bought) throw new BadRequestException('Эта цель уже отмечена купленной');
    if (actor.role === 'CHILD' && goal.priceCents && goal.savedCents < goal.priceCents) {
      throw new ForbiddenException('Сначала накопи всю сумму');
    }
    this.db.transaction(() => {
      const saved = this.savedSync(child.childProfileId, rewardId);
      if (saved > 0) this.addSync(actor.familyId, child, actor, { kind: 'PURCHASE', amountCents: -saved, rewardId });
      this.db.updateSync('wishlist', goal.wishId, { isPurchased: true, status: 'COMPLETED', completedAt: new Date() });
    });
    return this.summary(actor, child.userId);
  }
}
