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
import { BadgesService } from './badges.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { CreateBadgeDto, AwardBadgeDto, CreateAchievementDto } from './dto/badges.dto';

@Controller('badges')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BadgesController {
  constructor(private badgesService: BadgesService) {}

  @Get()
  @Roles('PARENT')
  findAll(@User() user: RequestUser) {
    return this.badgesService.findAll(user.familyId);
  }

  @Get('achievements')
  @Roles('PARENT')
  achievements(@User() user: RequestUser) {
    return this.badgesService.getAchievements(user.familyId);
  }

  @Post('achievements')
  @Roles('PARENT')
  createAchievement(@User() user: RequestUser, @Body() dto: CreateAchievementDto) {
    return this.badgesService.createAchievement(user.familyId, dto);
  }

  @Delete('achievements/:id')
  @Roles('PARENT')
  deleteAchievement(@User() user: RequestUser, @Param('id') id: string) {
    return this.badgesService.deleteAchievement(user.familyId, id);
  }

  @Post()
  @Roles('PARENT')
  create(@User() user: RequestUser, @Body() dto: CreateBadgeDto) {
    return this.badgesService.create(user.familyId, dto);
  }

  @Patch(':id')
  @Roles('PARENT')
  update(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateBadgeDto>,
  ) {
    return this.badgesService.update(id, user.familyId, dto);
  }

  @Delete(':id')
  @Roles('PARENT')
  delete(@User() user: RequestUser, @Param('id') id: string) {
    return this.badgesService.delete(id, user.familyId);
  }

  @Get('child/badges')
  @Roles('CHILD')
  getChildBadges(@User() user: RequestUser) {
    return this.badgesService.getChildBadges(user.userId);
  }

  @Get('child/badges/with-progress')
  @Roles('CHILD')
  async getChildBadgesWithProgress(@User() user: RequestUser) {
    return this.badgesService.getChildBadgesWithProgress(user.userId, user.familyId);
  }

  @Get('parent/child/:childId/badges')
  @Roles('PARENT')
  async getChildBadgesForParent(@User() user: RequestUser, @Param('childId') childId: string) {
    await this.badgesService.assertChildInFamily(childId, user.familyId);
    return this.badgesService.getChildBadges(childId);
  }

  @Post('child/badges/award')
  @Roles('PARENT')
  async awardBadge(@User() user: RequestUser, @Body() dto: AwardBadgeDto & { childId: string }) {
    await this.badgesService.assertChildInFamily(dto.childId, user.familyId);
    const badge = await this.badgesService.findBadgeVisibleToFamily(dto.badgeId, user.familyId);
    return this.badgesService.awardBadge(dto.childId, { badgeId: badge.id });
  }

  /**
   * Пересчитать и назначить все заслуженные бейджи для всех детей семьи.
   * POST /badges/check-all
   * Используется для ретроспективного назначения пропущенных бейджей.
   */
  @Post('check-all')
  @Roles('PARENT')
  async checkAllBadges(@User() user: RequestUser) {
    return this.badgesService.checkAndAwardAllChildren(user.familyId);
  }
}
