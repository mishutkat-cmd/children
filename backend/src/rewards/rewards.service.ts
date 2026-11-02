import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { CreateRewardDto, UpdateRewardDto } from './dto/rewards.dto';
import { RequestUser } from '../common/decorators/user.decorator';
// Enums заменены на строки для SQLite
type RewardStatus = 'ACTIVE' | 'ARCHIVED';

@Injectable()
export class RewardsService {
  constructor(private db: DocStore) {}

  async findAll(familyId: string, status?: string) {
    const where: any = { familyId };
    if (status) {
      where.status = status;
    }
    return this.db.findMany('rewards', where, { createdAt: 'desc' });
  }

  async findOne(id: string, familyId: string) {
    const reward = await this.db.findFirst('rewards', { id, familyId });

    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    return reward;
  }

  async create(familyId: string, dto: CreateRewardDto, actor: RequestUser) {
    const rewardId = crypto.randomUUID();
    await this.db.create('rewards', {
      id: rewardId,
      familyId,
      ...dto,
      // Ребёнок заводит только «желание»: денежную стоимость задаёт родитель.
      ...(actor.role === 'CHILD' && { moneyValueCents: 0 }),
      createdByUserId: actor.userId,
      status: 'ACTIVE',
    }, rewardId);
    
    return this.db.findFirst('rewards', { id: rewardId });
  }

  async update(id: string, familyId: string, dto: UpdateRewardDto, actor: RequestUser) {
    const reward = await this.findOne(id, familyId);
    if (actor.role === 'CHILD') {
      await this.assertChildOwnsReward(reward, actor.userId);
      const { moneyValueCents, ...rest } = dto as any;
      dto = rest;
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
