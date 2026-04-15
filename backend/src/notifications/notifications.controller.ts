import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@User() user: RequestUser) {
    return this.notificationsService.findAll(user.familyId);
  }

  @Get('unread/count')
  getUnreadCount(@User() user: RequestUser) {
    return this.notificationsService.getUnreadCount(user.familyId);
  }

  // ВАЖНО: 'all/read' должен быть объявлен ДО ':id/read',
  // иначе NestJS матчит ':id' = 'all' и зовёт markAsRead('all', ...).
  @Patch('all/read')
  markAllAsRead(@User() user: RequestUser) {
    return this.notificationsService.markAllAsRead(user.familyId);
  }

  @Patch(':id/read')
  markAsRead(@User() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, user.familyId);
  }
}
