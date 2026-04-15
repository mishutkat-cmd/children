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
import { CreateBadgeDto, AwardBadgeDto } from './dto/badges.dto';

@Controller('badges')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BadgesController {
  constructor(private badgesService: BadgesService) {}

  @Get()
  @Roles('PARENT')
  findAll(@User() user: RequestUser) {
    return this.badgesService.findAll(user.familyId);
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
  getChildBadgesForParent(@User() user: RequestUser, @Param('childId') childId: string) {
    return this.badgesService.getChildBadges(childId);
  }

  @Post('child/badges/award')
  @Roles('PARENT')
  awardBadge(@User() user: RequestUser, @Body() dto: AwardBadgeDto & { childId: string }) {
    return this.badgesService.awardBadge(dto.childId, { badgeId: dto.badgeId });
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
