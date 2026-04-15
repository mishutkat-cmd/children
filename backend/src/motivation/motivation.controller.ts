import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { MotivationService } from './motivation.service';
import { StreakService } from './streak.service';
import { DecayService } from './decay.service';
import { ChallengesService } from './challenges.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import {
  UpdateDecayRuleDto,
  CreateStreakRuleDto,
  UpdateStreakRuleDto,
  CreateCharacterDto,
  UpdateCharacterDto,
} from './dto/motivation.dto';

@Controller('motivation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MotivationController {
  constructor(
    private motivationService: MotivationService,
    private streakService: StreakService,
    private decayService: DecayService,
    private challengesService: ChallengesService,
  ) {}

  @Get('settings')
  getSettings(@User() user: RequestUser) {
    // Доступно и родителям, и детям (для получения conversionRate)
    return this.motivationService.getSettings(user.familyId);
  }

  @Patch('conversion-rate')
  @Roles('PARENT')
  updateConversionRate(@User() user: RequestUser, @Body() dto: { conversionRate: number }) {
    return this.motivationService.updateConversionRate(user.familyId, dto.conversionRate);
  }

  @Patch('decay-rule')
  @Roles('PARENT')
  updateDecayRule(@User() user: RequestUser, @Body() dto: UpdateDecayRuleDto) {
    return this.motivationService.updateDecayRule(user.familyId, dto);
  }

  @Post('streak-rules')
  @Roles('PARENT')
  createStreakRule(@User() user: RequestUser, @Body() dto: CreateStreakRuleDto) {
    return this.motivationService.createStreakRule(user.familyId, dto);
  }

  @Patch('streak-rules/:id')
  @Roles('PARENT')
  updateStreakRule(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateStreakRuleDto,
  ) {
    return this.motivationService.updateStreakRule(id, user.familyId, dto);
  }

  @Delete('streak-rules/:id')
  @Roles('PARENT')
  deleteStreakRule(@User() user: RequestUser, @Param('id') id: string) {
    return this.motivationService.deleteStreakRule(id, user.familyId);
  }

  // Child endpoints
  @Get('streak')
  @Roles('CHILD')
  getStreak(@User() user: RequestUser) {
    return this.streakService.getStreakState(user.userId);
  }

  @Get('decay-status')
  @Roles('CHILD')
  getDecayStatus(@User() user: RequestUser) {
    return this.decayService.getDecayStatus(user.userId, user.familyId);
  }

  // Challenges endpoints
  @Get('challenges')
  getChallenges(@User() user: RequestUser) {
    try {
      const childId = user.role === 'CHILD' ? user.userId : undefined;
      return this.challengesService.findAll(user.familyId, childId);
    } catch (error: any) {
      console.error('[MotivationController] Error in getChallenges:', error.message);
      console.error('[MotivationController] Error stack:', error.stack);
      throw error;
    }
  }

  @Get('challenges/:id')
  getChallenge(@User() user: RequestUser, @Param('id') id: string) {
    const childId = user.role === 'CHILD' ? user.userId : undefined;
    return this.challengesService.findOne(id, user.familyId, childId);
  }

  @Post('challenges')
  @Roles('PARENT')
  createChallenge(@User() user: RequestUser, @Body() dto: any) {
    return this.challengesService.create(user.familyId, dto);
  }

  @Patch('challenges/:id')
  @Roles('PARENT')
  updateChallenge(@User() user: RequestUser, @Param('id') id: string, @Body() dto: any) {
    return this.challengesService.update(id, user.familyId, dto);
  }

  @Delete('challenges/:id')
  @Roles('PARENT')
  deleteChallenge(@User() user: RequestUser, @Param('id') id: string) {
    return this.challengesService.delete(id, user.familyId);
  }

  @Post('challenges/:id/check')
  @Roles('CHILD')
  checkChallenge(@User() user: RequestUser, @Param('id') id: string) {
    return this.challengesService.checkAndRewardChallenge(id, user.familyId, user.userId);
  }

  // Characters endpoints
  @Get('characters')
  getCharacters(@User() user: RequestUser) {
    // Доступно и родителям, и детям для выбора персонажа
    return this.motivationService.getCharacters(user.familyId);
  }

  @Post('characters')
  @Roles('PARENT')
  createCharacter(@User() user: RequestUser, @Body() dto: CreateCharacterDto) {
    return this.motivationService.createCharacter(user.familyId, dto);
  }

  @Patch('characters/:id')
  @Roles('PARENT')
  updateCharacter(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.motivationService.updateCharacter(id, user.familyId, dto);
  }

  @Delete('characters/:id')
  @Roles('PARENT')
  deleteCharacter(@User() user: RequestUser, @Param('id') id: string) {
    return this.motivationService.deleteCharacter(id, user.familyId);
  }
}
