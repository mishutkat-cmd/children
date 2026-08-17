import { Injectable, NotFoundException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { CreateRewardDto, UpdateRewardDto } from './dto/rewards.dto';
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

  async create(familyId: string, dto: CreateRewardDto) {
    const rewardId = crypto.randomUUID();
    await this.db.create('rewards', {
      id: rewardId,
      familyId,
      ...dto,
      status: 'ACTIVE',
    }, rewardId);
    
    return this.db.findFirst('rewards', { id: rewardId });
  }

  async update(id: string, familyId: string, dto: UpdateRewardDto) {
    await this.findOne(id, familyId);
    await this.db.update('rewards', id, dto);
    return this.db.findFirst('rewards', { id });
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
