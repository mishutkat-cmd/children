import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { LocalStorageService } from '../files/local-storage.service';
import { AddToWishlistDto, ReorderWishlistDto, UpdateWishlistItemDto } from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    private db: DocStore,
    private storageService: LocalStorageService,
  ) {}

  async findAll(childId: string) {
    const childProfiles = await this.db.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfile = childProfiles[0];
    const childProfileId = childProfile.id;

    // Получаем данные пользователя для имени
    const user = await this.db.findFirst('users', { id: childId });

    const wishlistItems = await this.db.findMany('wishlist', { childId: childProfileId }, { priority: 'asc' });

    // Награды одним запросом на весь список — раньше был findFirst на каждое
    // бажання, и список из двадцати стоил двадцати чтений.
    const rewardById = await this.rewardsByIds(wishlistItems.map((i: any) => i.rewardId));

    return wishlistItems.map((item: any) => ({
      ...item,
      rewardGoal: rewardById.get(item.rewardId) ?? null,
      child: {
        id: childId,
        name: childProfile.name || user?.login,
        login: user?.login,
        email: user?.email,
      },
    }));
  }

  async add(childId: string, dto: AddToWishlistDto) {
    const childProfiles = await this.db.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    const reward = await this.db.findFirst('rewards', { id: dto.rewardGoalId });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    const existing = await this.db.findFirst('wishlist', { 
      childId: childProfileId, 
      rewardId: dto.rewardGoalId,
    });

    if (existing) {
      throw new ConflictException('Reward already in wishlist');
    }

    // Get max priority
    const allItems = await this.db.findMany('wishlist', { childId: childProfileId });
    const maxPriority = allItems.length > 0 
      ? Math.max(...allItems.map(item => item.priority || 0))
      : 0;

    const wishlistId = crypto.randomUUID();
    await this.db.create('wishlist', {
      id: wishlistId,
      childId: childProfileId,
      rewardId: dto.rewardGoalId,
      priority: maxPriority + 1,
      status: (dto as any).status || 'PENDING',
      year: (dto as any).year || new Date().getFullYear(),
      showOnDashboard: (dto as any).showOnDashboard || false,
      isFavorite: (dto as any).isFavorite || false,
      moneySpent: 0,
      isPurchased: false,
    }, wishlistId);

    const item = await this.db.findFirst('wishlist', { id: wishlistId });
    return {
      ...item,
      rewardGoal: reward,
    };
  }

  async remove(childId: string, wishlistId: string) {
    const childProfiles = await this.db.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    const wishlist = await this.db.findFirst('wishlist', {
      id: wishlistId,
      childId: childProfileId,
    });

    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    await this.db.delete('wishlist', wishlistId);
  }

  async removeForParent(wishlistId: string, familyId: string) {
    // Находим wishlist item
    const wishlist = await this.db.findFirst('wishlist', { id: wishlistId });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Проверяем, что item принадлежит семье
    const childProfiles = await this.db.findMany('childProfiles', { id: wishlist.childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child profile not found');
    }
    const childProfile = childProfiles[0];
    const user = await this.db.findFirst('users', { id: childProfile.userId });
    
    if (!user || user.familyId !== familyId) {
      throw new NotFoundException('Wishlist item not found or access denied');
    }

    // Удаляем reward image из Firebase Storage если есть
    if (wishlist.rewardId) {
      const reward = await this.db.findFirst('rewards', { id: wishlist.rewardId });
      if (reward?.imageUrl) {
        await this.storageService.deleteFile(reward.imageUrl).catch(err => 
          console.warn(`Failed to delete reward image: ${reward.imageUrl}`, err)
        );
      }
    }

    await this.db.delete('wishlist', wishlistId);
  }

  async reorder(childId: string, dto: ReorderWishlistDto) {
    const childProfiles = await this.db.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    const updates = dto.items.map((item) =>
      this.db.update('wishlist', item.id, { priority: item.priority })
    );

    await Promise.all(updates);
    return this.findAll(childId);
  }

  /** Награды для списка бажань: один запрос вместо findFirst на каждое. */
  private async rewardsByIds(ids: (string | undefined)[]) {
    const rewardIds = [...new Set(ids.filter(Boolean))] as string[];
    const rewards = rewardIds.length
      ? await this.db.findMany('rewards', { id: { in: rewardIds } })
      : [];
    return new Map<string, any>(rewards.map((r: any) => [r.id, r]));
  }

  async findAllForFamily(familyId: string) {
    // Профили, бажання и награды — по одному запросу на всю семью. Раньше на
    // каждого ребёнка шло два запроса, плюс ещё один на каждое бажання за
    // наградой: для двоих детей с двумя десятками бажань это ~45 чтений.
    const children = await this.db.findMany('users', { familyId, role: 'CHILD' });
    if (children.length === 0) return [];

    const profiles = await this.db.findMany('childProfiles', {
      userId: { in: children.map((c: any) => c.id) },
    });
    if (profiles.length === 0) return [];

    const profileByUserId = new Map<string, any>();
    for (const profile of profiles) {
      // Один профиль на ребёнка; при дубле берём первый, как делал старый код.
      if (!profileByUserId.has(profile.userId)) profileByUserId.set(profile.userId, profile);
    }

    const items = await this.db.findMany(
      'wishlist',
      { childId: { in: profiles.map((p: any) => p.id) } },
      { priority: 'asc' },
    );
    if (items.length === 0) return [];

    const rewardById = await this.rewardsByIds(items.map((i: any) => i.rewardId));
    const childByProfileId = new Map<string, any>();
    for (const child of children) {
      const profile = profileByUserId.get(child.id);
      if (!profile) continue;
      childByProfileId.set(profile.id, {
        id: child.id,
        name: profile.name || child.login,
        login: child.login,
        email: child.email,
      });
    }

    return items
      .filter((item: any) => childByProfileId.has(item.childId))
      .map((item: any) => ({
        ...item,
        rewardGoal: rewardById.get(item.rewardId) ?? null,
        child: childByProfileId.get(item.childId),
      }));
  }

  async update(wishlistId: string, familyId: string, dto: UpdateWishlistItemDto) {
    // Находим wishlist item
    const wishlist = await this.db.findFirst('wishlist', { id: wishlistId });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Проверяем, что item принадлежит семье
    const childProfiles = await this.db.findMany('childProfiles', { id: wishlist.childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child profile not found');
    }
    const childProfile = childProfiles[0];
    const user = await this.db.findFirst('users', { id: childProfile.userId });
    if (!user || user.familyId !== familyId) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Обновляем только указанные поля
    const updateData: any = {};
    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }
    if (dto.priority !== undefined) {
      updateData.priority = dto.priority;
    }
    if (dto.year !== undefined) {
      updateData.year = dto.year;
    }
    if (dto.moneySpent !== undefined) {
      updateData.moneySpent = dto.moneySpent;
    }
    if (dto.isPurchased !== undefined) {
      updateData.isPurchased = dto.isPurchased;
    }
    if (dto.showOnDashboard !== undefined) {
      updateData.showOnDashboard = dto.showOnDashboard;
      // Если устанавливаем showOnDashboard для одного элемента, снимаем с других
      if (dto.showOnDashboard === true) {
        const allItems = await this.db.findMany('wishlist', { childId: wishlist.childId });
        for (const item of allItems) {
          if (item.id !== wishlistId && item.showOnDashboard === true) {
            await this.db.update('wishlist', item.id, { showOnDashboard: false });
          }
        }
      }
    }
    if (dto.isFavorite !== undefined) {
      updateData.isFavorite = dto.isFavorite;
      if (dto.isFavorite === true) {
        const allItems = await this.db.findMany('wishlist', { childId: wishlist.childId });
        for (const item of allItems) {
          if (item.id !== wishlistId && (item.isFavorite === true || item.isFavorite === 'true' || item.isFavorite === 1)) {
            await this.db.update('wishlist', item.id, { isFavorite: false });
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.db.update('wishlist', wishlistId, updateData);
    }

    const updatedItem = await this.db.findFirst('wishlist', { id: wishlistId });
    const reward = await this.db.findFirst('rewards', { id: updatedItem.rewardId });
    return { ...updatedItem, rewardGoal: reward };
  }

  async updateForChild(wishlistId: string, childId: string, dto: UpdateWishlistItemDto) {
    // Находим wishlist item
    const wishlist = await this.db.findFirst('wishlist', { id: wishlistId });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Проверяем, что item принадлежит ребенку
    const childProfiles = await this.db.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child profile not found');
    }
    const childProfile = childProfiles[0];
    if (wishlist.childId !== childProfile.id) {
      throw new NotFoundException('Wishlist item not found or access denied');
    }

    // Обновляем только указанные поля
    const updateData: any = {};
    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }
    if (dto.priority !== undefined) {
      updateData.priority = dto.priority;
    }
    if (dto.year !== undefined) {
      updateData.year = dto.year;
    }
    if (dto.moneySpent !== undefined) {
      updateData.moneySpent = dto.moneySpent;
    }
    if (dto.isPurchased !== undefined) {
      updateData.isPurchased = dto.isPurchased;
    }
    if (dto.showOnDashboard !== undefined) {
      updateData.showOnDashboard = dto.showOnDashboard;
      // Если устанавливаем showOnDashboard для одного элемента, снимаем с других
      if (dto.showOnDashboard === true) {
        const allItems = await this.db.findMany('wishlist', { childId: childProfile.id });
        for (const item of allItems) {
          if (item.id !== wishlistId && item.showOnDashboard === true) {
            await this.db.update('wishlist', item.id, { showOnDashboard: false });
          }
        }
      }
    }
    if (dto.isFavorite !== undefined) {
      updateData.isFavorite = dto.isFavorite;
      if (dto.isFavorite === true) {
        const allItems = await this.db.findMany('wishlist', { childId: childProfile.id });
        for (const item of allItems) {
          if (item.id !== wishlistId && (item.isFavorite === true || item.isFavorite === 'true' || item.isFavorite === 1)) {
            await this.db.update('wishlist', item.id, { isFavorite: false });
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.db.update('wishlist', wishlistId, updateData);
    }

    const updatedItem = await this.db.findFirst('wishlist', { id: wishlistId });
    const reward = await this.db.findFirst('rewards', { id: updatedItem.rewardId });
    return { ...updatedItem, rewardGoal: reward };
  }
}
