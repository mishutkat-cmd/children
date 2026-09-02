import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ActivityService } from './activity.service';
import { ReportUsageDto } from './dto/activity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';

const today = () => new Date().toISOString().slice(0, 10);

@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  /** Устройство ребёнка присылает дневной срез экранного времени. */
  @Post('usage')
  @Roles('CHILD')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  report(@User() user: RequestUser, @Body() dto: ReportUsageDto) {
    return this.activityService.report(user.userId, user.familyId, dto);
  }

  /** Итог за день по всем детям. */
  @Get('summary')
  @Roles('PARENT')
  summary(@User() user: RequestUser, @Query('date') date?: string) {
    return this.activityService.summary(user.familyId, date || today());
  }

  /** Разбивка по приложениям за день для одного ребёнка. */
  @Get('children/:childId')
  @Roles('PARENT')
  forChild(@User() user: RequestUser, @Param('childId') childId: string, @Query('date') date?: string) {
    return this.activityService.forChild(user.familyId, childId, date || today());
  }
}
