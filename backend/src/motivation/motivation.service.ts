import { Injectable, NotFoundException } from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';
import { UpdateDecayRuleDto, CreateStreakRuleDto, UpdateStreakRuleDto, CreateCharacterDto, UpdateCharacterDto } from './dto/motivation.dto';
import { invalidateFamilySettingsCache } from '../common/cache/family-settings-cache';

@Injectable()
export class MotivationService {
  constructor(private db: DocStore) {}

  async getSettings(familyId: string) {
    const decayRule = await this.db.findFirst('decayRules', { familyId });
    const streakRules = await this.db.findMany('streakRules', { familyId, enabled: true });
    const familySettings = await this.db.findFirst('familySettings', { familyId });

    return {
      decayRule: decayRule || null,
      streakRules,
      conversionRate: familySettings?.conversionRate || 10, // По умолчанию 10 баллов = 1 грн
    };
  }

  async updateConversionRate(familyId: string, conversionRate: number) {
    if (conversionRate <= 0) {
      throw new Error('Conversion rate must be greater than 0');
    }

    const existing = await this.db.findFirst('familySettings', { familyId });

    if (existing) {
      await this.db.update('familySettings', existing.id, { conversionRate });
      invalidateFamilySettingsCache(familyId);
      return this.db.findFirst('familySettings', { id: existing.id });
    }

    const settingsId = crypto.randomUUID();
    await this.db.create('familySettings', {
      id: settingsId,
      familyId,
      conversionRate,
    }, settingsId);
    invalidateFamilySettingsCache(familyId);

    return this.db.findFirst('familySettings', { id: settingsId });
  }

  async updateDecayRule(familyId: string, dto: UpdateDecayRuleDto) {
    const existing = await this.db.findFirst('decayRules', { familyId });

    if (existing) {
      await this.db.update('decayRules', existing.id, dto);
      return this.db.findFirst('decayRules', { id: existing.id });
    }

    const decayRuleId = crypto.randomUUID();
    await this.db.create('decayRules', {
      id: decayRuleId,
      familyId,
      decayType: dto.decayType || 'POINTS',
      decayValue: dto.decayValue || 1,
      enabled: dto.enabled ?? true,
      startAfterMissedDays: dto.startAfterMissedDays ?? 2,
      maxDailyPenalty: dto.maxDailyPenalty ?? 6,
      protectedBalanceDefault: dto.protectedBalanceDefault ?? 50,
      mode: dto.mode || 'WARN_ONLY',
    }, decayRuleId);
    
    return this.db.findFirst('decayRules', { id: decayRuleId });
  }

  async createStreakRule(familyId: string, dto: CreateStreakRuleDto) {
    const streakRuleId = crypto.randomUUID();
    await this.db.create('streakRules', {
      id: streakRuleId,
      familyId,
      ...dto,
    }, streakRuleId);
    
    return this.db.findFirst('streakRules', { id: streakRuleId });
  }

  async updateStreakRule(id: string, familyId: string, dto: UpdateStreakRuleDto) {
    const existing = await this.db.findFirst('streakRules', { id, familyId });
    if (!existing) {
      throw new Error('Streak rule not found');
    }
    
    await this.db.update('streakRules', id, dto);
    return this.db.findFirst('streakRules', { id });
  }

  async deleteStreakRule(id: string, familyId: string) {
    const existing = await this.db.findFirst('streakRules', { id, familyId });
    if (!existing) {
      throw new Error('Streak rule not found');
    }
    
    await this.db.delete('streakRules', id);
    return { success: true };
  }

  // Character management
  async getCharacters(familyId: string) {
    const characters = await this.db.findMany('characters', { familyId }, { createdAt: 'asc' });
    // Если нет персонажей, создаем 3 по умолчанию
    if (characters.length === 0) {
      const defaultCharacters = [
        { name: 'Персонаж 1', imageUrlZero: null, imageUrlLow: null, imageUrlHigh: null },
        { name: 'Персонаж 2', imageUrlZero: null, imageUrlLow: null, imageUrlHigh: null },
        { name: 'Персонаж 3', imageUrlZero: null, imageUrlLow: null, imageUrlHigh: null },
      ];
      const created = [];
      for (const char of defaultCharacters) {
        const charId = crypto.randomUUID();
        await this.db.create('characters', {
          id: charId,
          familyId,
          ...char,
        }, charId);
        const createdChar = await this.db.findFirst('characters', { id: charId });
        created.push(createdChar);
      }
      return created;
    }
    // Преобразуем старые данные (если есть) в новый формат
    return characters.map(char => {
      // Миграция старых данных
      // Если есть старые imageUrls*, берем первое изображение
      if (char.imageUrlsHungry && Array.isArray(char.imageUrlsHungry) && char.imageUrlsHungry.length > 0 && !char.imageUrlZero) {
        char.imageUrlZero = char.imageUrlsHungry[0];
      }
      if (char.imageUrlsNormal && Array.isArray(char.imageUrlsNormal) && char.imageUrlsNormal.length > 0 && !char.imageUrlLow) {
        char.imageUrlLow = char.imageUrlsNormal[0];
      }
      if (char.imageUrlsFull && Array.isArray(char.imageUrlsFull) && char.imageUrlsFull.length > 0 && !char.imageUrlHigh) {
        char.imageUrlHigh = char.imageUrlsFull[0];
      }
      // Если есть старые imageUrl*, используем их
      if (char.imageUrlHungry && !char.imageUrlZero) {
        char.imageUrlZero = char.imageUrlHungry;
      }
      if (char.imageUrlNormal && !char.imageUrlLow) {
        char.imageUrlLow = char.imageUrlNormal;
      }
      if (char.imageUrlFull && !char.imageUrlHigh) {
        char.imageUrlHigh = char.imageUrlFull;
      }
      // Гарантируем правильные поля
      char.imageUrlZero = char.imageUrlZero || null;
      char.imageUrlLow = char.imageUrlLow || null;
      char.imageUrlHigh = char.imageUrlHigh || null;
      return char;
    });
  }

  async createCharacter(familyId: string, dto: CreateCharacterDto) {
    const charId = crypto.randomUUID();
    await this.db.create('characters', {
      id: charId,
      familyId,
      name: dto.name,
      imageUrlZero: dto.imageUrlZero || null,
      imageUrlLow: dto.imageUrlLow || null,
      imageUrlHigh: dto.imageUrlHigh || null,
    }, charId);
    return this.db.findFirst('characters', { id: charId });
  }

  async updateCharacter(id: string, familyId: string, dto: UpdateCharacterDto) {
    const existing = await this.db.findFirst('characters', { id, familyId });
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.imageUrlZero !== undefined) updateData.imageUrlZero = dto.imageUrlZero || null;
    if (dto.imageUrlLow !== undefined) updateData.imageUrlLow = dto.imageUrlLow || null;
    if (dto.imageUrlHigh !== undefined) updateData.imageUrlHigh = dto.imageUrlHigh || null;
    
    await this.db.update('characters', id, updateData);
    return this.db.findFirst('characters', { id });
  }

  async deleteCharacter(id: string, familyId: string) {
    const existing = await this.db.findFirst('characters', { id, familyId });
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    
    await this.db.delete('characters', id);
    return { success: true };
  }
}
