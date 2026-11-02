import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ActivityService } from './activity.service';
import { ReportUsageDto } from './dto/activity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';

// Даты — календарные дни устройства ребёнка/родителя (YYYY-MM-DD, локальные).
// Клиент присылает свой «сегодня»; серверный UTC — только запасной вариант.
const today = () => new Date().toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayOrToday = (date?: string) => (date && DATE_RE.test(date) ? date : today());

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
    return this.activityService.summary(user.familyId, dayOrToday(date));
  }

  /** Тренд экранного времени по дням (для графика). Объявлен ДО ':childId'-детали. */
  @Get('children/:childId/history')
  @Roles('PARENT')
  history(
    @User() user: RequestUser,
    @Param('childId') childId: string,
    @Query('days') days?: string,
    @Query('to') to?: string,
  ) {
    return this.activityService.history(user.familyId, childId, days ? parseInt(days, 10) || 7 : 7, dayOrToday(to));
  }

  /** Разбивка по приложениям за день для одного ребёнка. */
  @Get('children/:childId')
  @Roles('PARENT')
  forChild(@User() user: RequestUser, @Param('childId') childId: string, @Query('date') date?: string) {
    return this.activityService.forChild(user.familyId, childId, dayOrToday(date));
  }
}
