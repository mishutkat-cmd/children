import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { CreateRewardDto, UpdateRewardDto } from './dto/rewards.dto';
import { RequestUser } from '../common/decorators/user.decorator';
// Enums заменены на строки для SQLite
type RewardStatus = 'ACTIVE' | 'ARCHIVED';

@Injectable()
export class RewardsService {
  constructor(private db: DocStore) {}

  async findAll(familyId: string, status?: string, actor?: RequestUser) {
    const where: any = { familyId };
    if (status) {
      where.status = status;
    }
    const rewards = await this.db.findMany('rewards', where, { createdAt: 'desc' });
    return actor?.role === 'CHILD' ? this.visibleToChild(rewards, actor.userId) : rewards;
  }

  /**
   * Ребёнок видит общий магазин, семейные цели и свои личные цели — но не цели братьев и сестёр.
   * Старые награды без scope считаются личными, если лежат только в чужом списке целей
   * или их предложил другой ребёнок.
   */
  async visibleToChild(rewards: any[], childUserId: string) {
    const me = await this.db.findFirst('childProfiles', { userId: childUserId });
    const legacy = rewards.filter((r) => !r.scope).map((r) => r.id);
    const wishes = legacy.length ? await this.db.findMany('wishlist', { rewardId: { in: legacy } }) : [];
    const owners = new Map<string, Set<string>>();
    for (const w of wishes) {
      if (!owners.has(w.rewardId)) owners.set(w.rewardId, new Set());
      owners.get(w.rewardId)!.add(w.childId);
    }
    const creators = await this.db.findMany('users', { id: { in: [...new Set(rewards.map((r) => r.createdByUserId).filter(Boolean))] } });
    const childCreators = new Set(creators.filter((u: any) => u.role === 'CHILD').map((u: any) => u.id));
    return rewards.filter((r) => {
      if (r.scope === 'PERSONAL') return r.ownerChildId === childUserId;
      if (r.scope) return true;
      if (r.createdByUserId && childCreators.has(r.createdByUserId)) return r.createdByUserId === childUserId;
      const holders = owners.get(r.id);
      return !holders || (!!me && holders.has(me.id));
    });
  }

  async findOne(id: string, familyId: string) {
    const reward = await this.db.findFirst('rewards', { id, familyId });

    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    return reward;
  }

  async create(familyId: string, dto: CreateRewardDto, actor: RequestUser) {
    const isChild = actor.role === 'CHILD';
    if (!isChild && !dto.costPoints) {
      throw new BadRequestException('Укажите цену в звёздах');
    }
    if (!isChild && dto.ownerChildId) {
      const owner = await this.db.findFirst('users', { id: dto.ownerChildId, familyId, role: 'CHILD' });
      if (!owner) throw new BadRequestException('Ребёнок не найден');
    }
    const scope = isChild || dto.ownerChildId ? 'PERSONAL' : dto.scope === 'FAMILY' ? 'FAMILY' : 'SHOP';
    // Семейная цель копится заработком всех детей с момента создания: запоминаем, сколько у кого было.
    let familyBaseline: Record<string, number> | null = null;
    if (scope === 'FAMILY') {
      const kids = await this.db.findMany('users', { familyId, role: 'CHILD' });
      const profiles = kids.length ? await this.db.findMany('childProfiles', { userId: { in: kids.map((k: any) => k.id) } }) : [];
      familyBaseline = Object.fromEntries(profiles.map((p: any) => [p.userId, p.totalEarned ?? 0]));
    }
    const rewardId = crypto.randomUUID();
    await this.db.create('rewards', {
      familyBaseline,
      id: rewardId,
      familyId,
      ...dto,
      scope,
      ownerChildId: isChild ? actor.userId : scope === 'PERSONAL' ? dto.ownerChildId : null,
      // Ребёнок только предлагает желание: цену в звёздах и деньгах ставит родитель.
      ...(isChild && { costPoints: 0, moneyValueCents: 0, needsPrice: true }),
      createdByUserId: actor.userId,
      status: 'ACTIVE',
    }, rewardId);
    
    return this.db.findFirst('rewards', { id: rewardId });
  }

  async update(id: string, familyId: string, dto: UpdateRewardDto, actor: RequestUser) {
    const reward = await this.findOne(id, familyId);
    if (actor.role === 'CHILD') {
      await this.assertChildOwnsReward(reward, actor.userId);
      const { moneyValueCents, costPoints, scope, ownerChildId, ...rest } = dto as any;
      dto = rest;
    } else if (dto.costPoints) {
      (dto as any).needsPrice = false;
    }
    await this.db.update('rewards', id, dto);
    return this.db.findFirst('rewards', { id });
  }

  /**
   * Ребёнок правит только свои желания. Иначе он мог бы выставить любой
   * родительской награде цену в 1 балл и тут же её обменять.
   * Старые записи без createdByUserId — только если желание лежит в его вишлисте.
   */
  private async assertChildOwnsReward(reward: any, childUserId: string) {
    if (reward.createdByUserId) {
      if (reward.createdByUserId !== childUserId) {
        throw new ForbiddenException('Можно изменять только свои желания');
      }
      return;
    }
    const profile = await this.db.findFirst('childProfiles', { userId: childUserId });
    const inOwnWishlist = profile
      ? await this.db.findFirst('wishlist', { childId: profile.id, rewardId: reward.id })
      : null;
    if (!inOwnWishlist) {
      throw new ForbiddenException('Можно изменять только свои желания');
    }
  }

  async archive(id: string, familyId: string) {
    await this.findOne(id, familyId);
    await this.db.update('rewards', id, { status: 'ARCHIVED' });
    return this.db.findFirst('rewards', { id });
  }

  async unarchive(id: string, familyId: string) {
    await this.findOne(id, familyId);
    await this.db.update('rewards', id, { status: 'ACTIVE' });
    return this.db.findFirst('rewards', { id });
  }
}
