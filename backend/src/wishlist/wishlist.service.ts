import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { StorageService } from '../firebase/storage.service';
import { AddToWishlistDto, ReorderWishlistDto, UpdateWishlistItemDto } from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    private firestore: FirestoreService,
    private storageService: StorageService,
  ) {}

  async findAll(childId: string) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfile = childProfiles[0];
    const childProfileId = childProfile.id;

    // Получаем данные пользователя для имени
    const user = await this.firestore.findFirst('users', { id: childId });

    const wishlistItems = await this.firestore.findMany('wishlist', { childId: childProfileId }, { priority: 'asc' });

    const result = [];
    for (const item of wishlistItems) {
      const reward = await this.firestore.findFirst('rewards', { id: item.rewardId });
      result.push({
        ...item,
        rewardGoal: reward,
        child: {
          id: childId,
          name: childProfile.name || user?.login,
          login: user?.login,
          email: user?.email,
        },
      });
    }

    return result;
  }

  async add(childId: string, dto: AddToWishlistDto) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    const reward = await this.firestore.findFirst('rewards', { id: dto.rewardGoalId });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    const existing = await this.firestore.findFirst('wishlist', { 
      childId: childProfileId, 
      rewardId: dto.rewardGoalId,
    });

    if (existing) {
      throw new ConflictException('Reward already in wishlist');
    }

    // Get max priority
    const allItems = await this.firestore.findMany('wishlist', { childId: childProfileId });
    const maxPriority = allItems.length > 0 
      ? Math.max(...allItems.map(item => item.priority || 0))
      : 0;

    const wishlistId = crypto.randomUUID();
    await this.firestore.create('wishlist', {
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

    const item = await this.firestore.findFirst('wishlist', { id: wishlistId });
    return {
      ...item,
      rewardGoal: reward,
    };
  }

  async remove(childId: string, wishlistId: string) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    const wishlist = await this.firestore.findFirst('wishlist', {
      id: wishlistId,
      childId: childProfileId,
    });

    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    await this.firestore.delete('wishlist', wishlistId);
  }

  async removeForParent(wishlistId: string, familyId: string) {
    // Находим wishlist item
    const wishlist = await this.firestore.findFirst('wishlist', { id: wishlistId });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Проверяем, что item принадлежит семье
    const childProfiles = await this.firestore.findMany('childProfiles', { id: wishlist.childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child profile not found');
    }
    const childProfile = childProfiles[0];
    const user = await this.firestore.findFirst('users', { id: childProfile.userId });
    
    if (!user || user.familyId !== familyId) {
      throw new NotFoundException('Wishlist item not found or access denied');
    }

    // Удаляем reward image из Firebase Storage если есть
    if (wishlist.rewardId) {
      const reward = await this.firestore.findFirst('rewards', { id: wishlist.rewardId });
      if (reward?.imageUrl) {
        await this.storageService.deleteFile(reward.imageUrl).catch(err => 
          console.warn(`Failed to delete reward image: ${reward.imageUrl}`, err)
        );
      }
    }

    await this.firestore.delete('wishlist', wishlistId);
  }

  async reorder(childId: string, dto: ReorderWishlistDto) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    const updates = dto.items.map((item) =>
      this.firestore.update('wishlist', item.id, { priority: item.priority })
    );

    await Promise.all(updates);
    return this.findAll(childId);
  }

  async findAllForFamily(familyId: string) {
    // Получаем всех детей семьи
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });
    
    const result = [];
    for (const child of children) {
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: child.id });
      if (childProfiles.length === 0) continue;
      
      const childProfileId = childProfiles[0].id;
      const wishlistItems = await this.firestore.findMany('wishlist', { childId: childProfileId }, { priority: 'asc' });
      
      for (const item of wishlistItems) {
        const reward = await this.firestore.findFirst('rewards', { id: item.rewardId });
        result.push({
          ...item,
          rewardGoal: reward,
          child: {
            id: child.id,
            name: childProfiles[0].name || child.login,
            login: child.login,
            email: child.email,
          },
        });
      }
    }
    
    return result;
  }

  async update(wishlistId: string, familyId: string, dto: UpdateWishlistItemDto) {
    // Находим wishlist item
    const wishlist = await this.firestore.findFirst('wishlist', { id: wishlistId });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Проверяем, что item принадлежит семье
    const childProfiles = await this.firestore.findMany('childProfiles', { id: wishlist.childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child profile not found');
    }
    const childProfile = childProfiles[0];
    const user = await this.firestore.findFirst('users', { id: childProfile.userId });
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
        const allItems = await this.firestore.findMany('wishlist', { childId: wishlist.childId });
        for (const item of allItems) {
          if (item.id !== wishlistId && item.showOnDashboard === true) {
            await this.firestore.update('wishlist', item.id, { showOnDashboard: false });
          }
        }
      }
    }
    if (dto.isFavorite !== undefined) {
      updateData.isFavorite = dto.isFavorite;
      if (dto.isFavorite === true) {
        const allItems = await this.firestore.findMany('wishlist', { childId: wishlist.childId });
        for (const item of allItems) {
          if (item.id !== wishlistId && (item.isFavorite === true || item.isFavorite === 'true' || item.isFavorite === 1)) {
            await this.firestore.update('wishlist', item.id, { isFavorite: false });
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.firestore.update('wishlist', wishlistId, updateData);
    }

    const updatedItem = await this.firestore.findFirst('wishlist', { id: wishlistId });
    const reward = await this.firestore.findFirst('rewards', { id: updatedItem.rewardId });
    return { ...updatedItem, rewardGoal: reward };
  }

  async updateForChild(wishlistId: string, childId: string, dto: UpdateWishlistItemDto) {
    // Находим wishlist item
    const wishlist = await this.firestore.findFirst('wishlist', { id: wishlistId });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }

    // Проверяем, что item принадлежит ребенку
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
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
        const allItems = await this.firestore.findMany('wishlist', { childId: childProfile.id });
        for (const item of allItems) {
          if (item.id !== wishlistId && item.showOnDashboard === true) {
            await this.firestore.update('wishlist', item.id, { showOnDashboard: false });
          }
        }
      }
    }
    if (dto.isFavorite !== undefined) {
      updateData.isFavorite = dto.isFavorite;
      if (dto.isFavorite === true) {
        const allItems = await this.firestore.findMany('wishlist', { childId: childProfile.id });
        for (const item of allItems) {
          if (item.id !== wishlistId && (item.isFavorite === true || item.isFavorite === 'true' || item.isFavorite === 1)) {
            await this.firestore.update('wishlist', item.id, { isFavorite: false });
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.firestore.update('wishlist', wishlistId, updateData);
    }

    const updatedItem = await this.firestore.findFirst('wishlist', { id: wishlistId });
    const reward = await this.firestore.findFirst('rewards', { id: updatedItem.rewardId });
    return { ...updatedItem, rewardGoal: reward };
  }
}
