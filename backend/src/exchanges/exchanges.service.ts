import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateExchangeDto } from './dto/exchanges.dto';
// Enums заменены на строки для SQLite
type ExchangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELIVERED';
type LedgerType = 'EARN' | 'SPEND' | 'BONUS' | 'PENALTY' | 'ADJUST';
type LedgerRefType = 'COMPLETION' | 'EXCHANGE' | 'CHALLENGE' | 'DECAY' | 'MANUAL';

@Injectable()
export class ExchangesService {
  constructor(
    private firestore: FirestoreService,
    private ledgerService: LedgerService,
  ) {}

  async create(childId: string, familyId: string, dto: CreateExchangeDto) {
    // childId может быть userId или childProfileId, проверяем оба варианта
    let childProfile = await this.firestore.findFirst('childProfiles', { userId: childId });
    if (!childProfile) {
      childProfile = await this.firestore.findFirst('childProfiles', { id: childId });
    }
    if (!childProfile) {
      throw new NotFoundException(`Child not found: ${childId}`);
    }
    const child = childProfile;
    const childProfileId = child.id;
    const userId = child.userId;

    let pointsSpent = 0;
    let rewardGoal = null;

    if (dto.rewardGoalId) {
      rewardGoal = await this.firestore.findFirst('rewards', { id: dto.rewardGoalId, familyId });

      if (!rewardGoal) {
        throw new NotFoundException('Reward not found');
      }

      pointsSpent = rewardGoal.costPoints;
    } else if (dto.cashCents) {
      // Получаем курс конвертации из настроек семьи
      let conversionRate = 10; // По умолчанию 10 баллов = 1 грн
      try {
        const familySettings = await this.firestore.findFirst('familySettings', { familyId });
        if (familySettings?.conversionRate) {
          conversionRate = typeof familySettings.conversionRate === 'string' 
            ? parseFloat(familySettings.conversionRate) 
            : familySettings.conversionRate;
        }
      } catch (error: any) {
        console.warn('[ExchangesService] Failed to get familySettings, using default conversion rate:', error.message);
      }
      
      // Вычисляем количество баллов: cashCents (в копейках) / 100 (грн) * conversionRate
      // Например: 320 копеек (3.20 грн) / 100 * 10 = 32 балла
      // Или: 100 копеек (1 грн) * conversionRate = pointsSpent
      // Формула: pointsSpent = (cashCents / 100) * conversionRate
      pointsSpent = Math.round((dto.cashCents / 100) * conversionRate);
    } else {
      throw new BadRequestException('Either rewardGoalId or cashCents must be provided');
    }

    // Пересчитываем баланс из ledger перед проверкой, чтобы исключить
    // конвертацию устаревших/уже потраченных баллов второй раз.
    const freshBalance = await this.ledgerService.updateChildBalance(userId);
    if ((freshBalance || 0) < pointsSpent) {
      throw new BadRequestException(
        `Недостаточно баллов: доступно ${freshBalance || 0}, нужно ${pointsSpent}`,
      );
    }

    const exchangeId = crypto.randomUUID();
    
    // Для конвертации в деньги (cashCents) - сразу APPROVED, без одобрения
    // Для наград (rewardGoalId) - оставляем PENDING для одобрения
    const status = dto.cashCents ? 'APPROVED' : 'PENDING';
    
    const exchangeData: any = {
      id: exchangeId,
      familyId,
      childId: childProfileId, // Используем childProfileId для консистентности
      pointsSpent,
      status,
      rewardId: dto.rewardGoalId || null, // Firestore не принимает undefined
      cashCents: dto.cashCents !== undefined && dto.cashCents !== null ? dto.cashCents : null, // Firestore не принимает undefined
      ...(status === 'APPROVED' && { approvedAt: new Date() }),
    };
    
    try {
      await this.firestore.create('exchanges', exchangeData, exchangeId);
    } catch (error: any) {
      console.error('[ExchangesService] Error creating exchange:', error.message);
      throw error;
    }

    // Для конвертации в деньги - сразу списываем баллы и обновляем баланс денег
    if (dto.cashCents && status === 'APPROVED') {
      // Списываем баллы через ledger
      await this.ledgerService.createEntry(
        familyId,
        userId,
        'SPEND',
        'EXCHANGE',
        -pointsSpent,
        exchangeId,
        {
          cashCents: dto.cashCents,
          reason: 'POINTS_TO_MONEY_CONVERSION',
        },
      );
      
      // Обновляем общую сумму заработанных денег ребенка
      const currentMoneyEarned = (child.moneyBalanceCents || 0) + dto.cashCents;
      await this.firestore.update('childProfiles', childProfileId, {
        moneyBalanceCents: currentMoneyEarned,
      });
    }

    const exchange = await this.firestore.findFirst('exchanges', { id: exchangeId });
    if (!exchange) {
      throw new Error('Exchange was created but could not be retrieved');
    }
    
    return {
      ...exchange,
      rewardGoal,
    };
  }

  async findAll(childId: string, familyId: string) {
    const exchanges = await this.firestore.findMany('exchanges', { childId, familyId }, { createdAt: 'desc' });
    
    const result = [];
    for (const exchange of exchanges) {
      const reward = exchange.rewardId ? await this.firestore.findFirst('rewards', { id: exchange.rewardId }) : null;
      result.push({
        ...exchange,
        rewardGoal: reward,
      });
    }
    
    return result;
  }

  async findHistory(familyId: string) {
    const exchanges = await this.firestore.findMany('exchanges', { familyId }, { createdAt: 'desc' });
    const cashExchanges = exchanges.filter((e: any) => e.cashCents != null && (e.status === 'APPROVED' || e.status === 'DELIVERED'));

    const result = [];
    for (const exchange of cashExchanges) {
      let childProfile = await this.firestore.findFirst('childProfiles', { id: exchange.childId });
      if (!childProfile) {
        childProfile = await this.firestore.findFirst('childProfiles', { userId: exchange.childId });
      }
      result.push({
        ...exchange,
        childName: childProfile?.name || 'Ребенок',
      });
    }
    return result;
  }

  async findPending(familyId: string) {
    try {
      const exchanges = await this.firestore.findMany('exchanges', { familyId, status: 'PENDING' }, { createdAt: 'desc' });
      
      const result = [];
      for (const exchange of exchanges) {
        try {
          const reward = exchange.rewardId ? await this.firestore.findFirst('rewards', { id: exchange.rewardId }) : null;
          
          // childId в exchange может быть userId или childProfileId
          let childProfile = null;
          if (exchange.childId) {
            const childProfileByUserId = await this.firestore.findFirst('childProfiles', { userId: exchange.childId });
            const childProfileById = await this.firestore.findFirst('childProfiles', { id: exchange.childId });
            childProfile = childProfileByUserId || childProfileById;
          }
          
          result.push({
            ...exchange,
            rewardGoal: reward,
            child: childProfile,
          });
        } catch (error: any) {
          console.error('[ExchangesService] Error processing exchange:', error.message);
        }
      }

      return result;
    } catch (error: any) {
      console.error('[ExchangesService] Error in findPending:', error.message);
      throw error;
    }
  }

  async approve(id: string, familyId: string) {
    const exchange = await this.firestore.findFirst('exchanges', { id, familyId });

    if (!exchange) {
      throw new NotFoundException('Exchange not found');
    }

    if (exchange.status !== 'PENDING') {
      throw new BadRequestException('Exchange is not pending');
    }

    await this.firestore.update('exchanges', id, {
      status: 'APPROVED',
      decidedAt: new Date(),
    });

    const updated = await this.firestore.findFirst('exchanges', { id });

    // Create ledger entry (spend points)
    // Получаем userId из childProfile для ledger
    const childProfile = await this.firestore.findFirst('childProfiles', { id: exchange.childId });
    if (!childProfile) {
      throw new NotFoundException('Child profile not found');
    }
    const userId = childProfile.userId;
    
    // exchange.childId это childProfileId, но для ledger нужен userId
    await this.ledgerService.createEntry(
      familyId,
      userId,
      'SPEND',
      'EXCHANGE',
      -exchange.pointsSpent,
      exchange.id,
      {
        rewardGoalId: exchange.rewardId,
        cashCents: exchange.cashCents,
      },
    );

    return updated;
  }

  async reject(id: string, familyId: string) {
    const exchange = await this.firestore.findFirst('exchanges', { id, familyId });

    if (!exchange) {
      throw new NotFoundException('Exchange not found');
    }

    await this.firestore.update('exchanges', id, {
      status: 'REJECTED',
      decidedAt: new Date(),
    });
    
    return this.firestore.findFirst('exchanges', { id });
  }

  async markDelivered(id: string, familyId: string) {
    const exchange = await this.firestore.findFirst('exchanges', { id, familyId });

    if (!exchange) {
      throw new NotFoundException('Exchange not found');
    }

    if (exchange.status !== 'APPROVED') {
      throw new BadRequestException('Exchange must be approved first');
    }

    await this.firestore.update('exchanges', id, {
      status: 'DELIVERED',
      deliveredAt: new Date(),
    });

    // Если это покупка товара из wishlist, обновляем wishlist
    if (exchange.rewardId) {
      const wishlistItems = await this.firestore.findMany('wishlist', { 
        childId: exchange.childId,
        rewardId: exchange.rewardId 
      });
      
      if (wishlistItems.length > 0) {
        const wishlistItem = wishlistItems[0];
        const reward = await this.firestore.findFirst('rewards', { id: exchange.rewardId });
        
        if (reward) {
          // Получаем курс конвертации
          let conversionRate = 10;
          try {
            const familySettings = await this.firestore.findFirst('familySettings', { familyId });
            if (familySettings?.conversionRate) {
              conversionRate = typeof familySettings.conversionRate === 'string' 
                ? parseFloat(familySettings.conversionRate) 
                : familySettings.conversionRate;
            }
          } catch (error: any) {
            console.warn('[ExchangesService] Failed to get familySettings for wishlist update:', error.message);
          }

          // Вычисляем стоимость в деньгах (если есть конвертация)
          let moneySpent = 0;
          if (exchange.cashCents) {
            moneySpent = exchange.cashCents;
          } else {
            // Если нет cashCents, вычисляем из pointsSpent и conversionRate
            // pointsSpent / conversionRate * 100 = moneySpent в центах
            moneySpent = Math.round((exchange.pointsSpent / conversionRate) * 100);
          }

          const currentMoneySpent = (wishlistItem.moneySpent || 0) + moneySpent;
          const rewardCostCents = reward.costPoints ? Math.round((reward.costPoints / conversionRate) * 100) : 0;
          
          // Обновляем wishlist item
          await this.firestore.update('wishlist', wishlistItem.id, {
            moneySpent: currentMoneySpent,
            isPurchased: currentMoneySpent >= rewardCostCents,
            status: currentMoneySpent >= rewardCostCents ? 'COMPLETED' : 'PENDING',
          });
        }
      }
    }
    
    return this.firestore.findFirst('exchanges', { id });
  }
}
