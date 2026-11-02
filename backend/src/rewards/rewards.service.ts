import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
    const isChild = actor.role === 'CHILD';
    if (!isChild && !dto.costPoints) {
      throw new BadRequestException('Укажите цену в звёздах');
    }
    const rewardId = crypto.randomUUID();
    await this.db.create('rewards', {
      id: rewardId,
      familyId,
      ...dto,
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
      const { moneyValueCents, costPoints, ...rest } = dto as any;
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
