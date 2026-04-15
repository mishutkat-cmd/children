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
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto } from './dto/tasks.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findAll(@User() user: RequestUser, @Query('status') status?: string) {
    try {
      return this.tasksService.findAll(user.familyId, status as any);
    } catch (error: any) {
      console.error('[TasksController] Error in findAll:', error.message);
      console.error('[TasksController] Error stack:', error.stack);
      throw error;
    }
  }

  @Get('statistics/today')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  getTodayStatistics(@User() user: RequestUser) {
    return this.tasksService.getTodayStatistics(user.familyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async create(@User() user: RequestUser, @Body() dto: CreateTaskDto) {
    try {
      console.log('[TasksController] Creating task:', { familyId: user.familyId, dto });
      const result = await this.tasksService.create(user.familyId, dto);
      console.log('[TasksController] Task created successfully, returning:', result?.id || 'NO ID');
      return result;
    } catch (error: any) {
      console.error('[TasksController] Error creating task:', error.message);
      console.error('[TasksController] Error stack:', error.stack);
      throw error;
    }
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async delete(@User() user: RequestUser, @Param('id') id: string) {
    try {
      return await this.tasksService.delete(id, user.familyId);
    } catch (error: any) {
      console.error('[TasksController] Error deleting task:', error.message);
      console.error('[TasksController] Error stack:', error.stack);
      throw error;
    }
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findOne(@User() user: RequestUser, @Param('id') id: string) {
    return this.tasksService.findOne(id, user.familyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  update(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, user.familyId, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  archive(@User() user: RequestUser, @Param('id') id: string) {
    return this.tasksService.archive(id, user.familyId);
  }

  @Post(':id/unarchive')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  unarchive(@User() user: RequestUser, @Param('id') id: string) {
    return this.tasksService.unarchive(id, user.familyId);
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  assign(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasksService.assign(id, user.familyId, dto);
  }

  // Child endpoints
  @Get('child/tasks/today')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  getTodayTasks(@User() user: RequestUser) {
    return this.tasksService.getChildTasks(user.userId, user.familyId, true);
  }

  @Get('child/tasks/date/:date')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  getTasksByDate(@User() user: RequestUser, @Param('date') date: string) {
    return this.tasksService.getChildTasksForDate(user.userId, user.familyId, date);
  }

  @Get('child/tasks/all')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  getAllTasks(@User() user: RequestUser) {
    return this.tasksService.getChildTasks(user.userId, user.familyId, false);
  }
}
