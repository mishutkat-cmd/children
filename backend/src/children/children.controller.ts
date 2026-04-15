import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChildrenService } from './children.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { CreateChildDto, UpdateChildDto, CreateParentDto } from './dto/children.dto';

@Controller('children')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT')
export class ChildrenController {
  constructor(private childrenService: ChildrenService) {}

  @Get()
  findAll(@User() user: RequestUser) {
    return this.childrenService.findAll(user.familyId);
  }

  @Post()
  create(@User() user: RequestUser, @Body() dto: CreateChildDto) {
    return this.childrenService.create(user.familyId, dto);
  }

  // Child endpoint - ребенок может получить свой summary (должен быть ДО :id routes)
  @Get('child/summary')
  @Roles('CHILD')
  getMySummary(@User() user: RequestUser) {
    return this.childrenService.getSummary(user.userId, user.familyId);
  }

  // Child endpoint - ребенок может обновить свой профиль (должен быть ДО :id routes)
  @Patch('child/profile')
  @Roles('CHILD')
  updateMyProfile(@User() user: RequestUser, @Body() dto: UpdateChildDto) {
    return this.childrenService.update(user.userId, user.familyId, dto);
  }

  // Эти эндпоинты должны быть ДО :id, иначе они будут перехвачены параметром
  @Get('parents/all')
  getParents(@User() user: RequestUser) {
    return this.childrenService.findAllParents(user.familyId);
  }

  @Get('statistics/points-money')
  async getChildrenStats(@User() user: RequestUser, @Query('date') date?: string) {
    try {
      return await this.childrenService.getChildrenStats(user.familyId, date);
    } catch (error: any) {
      console.error('[ChildrenController] Error in getChildrenStats:', {
        familyId: user.familyId,
        date,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  @Post('parents')
  createParent(@User() user: RequestUser, @Body() dto: CreateParentDto) {
    return this.childrenService.createParent(user.familyId, dto);
  }

  @Delete(':id')
  delete(@User() user: RequestUser, @Param('id') id: string) {
    return this.childrenService.delete(id, user.familyId);
  }

  @Get(':id/summary')
  getSummary(@User() user: RequestUser, @Param('id') id: string) {
    return this.childrenService.getSummary(id, user.familyId);
  }

  @Patch(':id')
  update(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateChildDto,
  ) {
    return this.childrenService.update(id, user.familyId, dto);
  }

  @Get(':id')
  findOne(@User() user: RequestUser, @Param('id') id: string) {
    return this.childrenService.findOne(id, user.familyId);
  }
}
