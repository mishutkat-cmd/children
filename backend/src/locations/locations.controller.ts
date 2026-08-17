import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import {
  HistoryQueryDto,
  UpdateMySharingDto,
  UpdateChildLocationSettingsDto,
  UpdateFamilyLocationSettingsDto,
} from './dto/locations.dto';

// @Roles ставится на КАЖДЫЙ обработчик: RolesGuard читает метаданные только
// с handler'а (context.getHandler()), поэтому декоратор на классе не сработал бы.
@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

  /** Что участник знает о собственном шеринге. Объявлен ДО ':childId'-роутов. */
  @Get('me/status')
  @Roles('CHILD', 'PARENT')
  getMyStatus(@User() user: RequestUser) {
    return this.locationsService.getMyStatus(
      user.userId,
      user.familyId,
      user.role === 'PARENT' ? 'PARENT' : 'CHILD',
    );
  }

  /** Родитель сам решает, делиться ли своим местоположением с семьёй. */
  @Patch('me/sharing')
  @Roles('PARENT')
  setMySharing(@User() user: RequestUser, @Body() dto: UpdateMySharingDto) {
    return this.locationsService.setMySharing(user.userId, user.familyId, dto.enabled);
  }

  /** Вся семья на карте: дети и родители, включившие шеринг. */
  @Get('family')
  @Roles('PARENT')
  getFamilyMembers(@User() user: RequestUser) {
    return this.locationsService.getFamilyMembers(user.familyId, user.userId);
  }

  @Get('children')
  @Roles('PARENT')
  getChildrenLocations(@User() user: RequestUser) {
    return this.locationsService.getFamilyLocations(user.familyId);
  }

  @Get('settings')
  @Roles('PARENT')
  getSettings(@User() user: RequestUser) {
    return this.locationsService.getSettings(user.familyId);
  }

  @Patch('settings')
  @Roles('PARENT')
  updateSettings(@User() user: RequestUser, @Body() dto: UpdateFamilyLocationSettingsDto) {
    return this.locationsService.updateSettings(user.familyId, dto);
  }

  @Patch('children/:childId/settings')
  @Roles('PARENT')
  updateChildSettings(
    @User() user: RequestUser,
    @Param('childId') childId: string,
    @Body() dto: UpdateChildLocationSettingsDto,
  ) {
    return this.locationsService.updateChildSettings(user.familyId, childId, dto);
  }

  @Get('children/:childId/history')
  @Roles('PARENT')
  getHistory(
    @User() user: RequestUser,
    @Param('childId') childId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.locationsService.getHistory(
      user.familyId,
      childId,
      query.from,
      query.to,
      query.limit ?? 500,
    );
  }

  @Post('children/:childId/refresh')
  @Roles('PARENT')
  @HttpCode(HttpStatus.OK)
  requestRefresh(@User() user: RequestUser, @Param('childId') childId: string) {
    return this.locationsService.requestRefresh(user.familyId, childId);
  }

  @Delete('children/:childId/history')
  @Roles('PARENT')
  deleteHistory(@User() user: RequestUser, @Param('childId') childId: string) {
    return this.locationsService.deleteHistory(user.familyId, childId);
  }
}
