import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CompletionsService } from './completions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { CreateCompletionDto, CreateCompletionForChildDto } from './dto/completions.dto';

@Controller('completions')
@UseGuards(JwtAuthGuard)
export class CompletionsController {
  constructor(
    private completionsService: CompletionsService,
  ) {}

  @Post('child/completions')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  create(@User() user: RequestUser, @Body() dto: CreateCompletionDto) {
    return this.completionsService.create(user.userId, user.familyId, dto);
  }

  @Get('child/completions')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  findAll(
    @User() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.completionsService.findAll(
      user.userId,
      user.familyId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('parent/completions/pending')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findPending(@User() user: RequestUser) {
    return this.completionsService.findPending(user.familyId);
  }

  @Get('parent/completions/:childId')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findChildCompletions(
    @User() user: RequestUser,
    @Param('childId') childId: string,
    @Query('taskId') taskId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.completionsService.findAll(
      childId, 
      user.familyId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      taskId,
    );
  }
  
  @Get('parent/completions/task/:taskId/child/:childId')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findTaskCompletions(
    @User() user: RequestUser,
    @Param('taskId') taskId: string,
    @Param('childId') childId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.completionsService.findAll(
      childId,
      user.familyId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      taskId,
    );
  }

  @Post('parent/completions')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async createForChild(@User() user: RequestUser, @Body() dto: CreateCompletionForChildDto) {
    try {
      // dto.childId - это userId из childrenStats
      // CompletionsService.create теперь сам конвертирует userId/ChildProfile.id в нужный формат
      const result = await this.completionsService.create(dto.childId, user.familyId, {
        taskId: dto.taskId,
        note: dto.note,
        proofUrl: dto.proofUrl,
      });
      return result;
    } catch (error) {
      console.error('Error creating completion for child:', error);
      console.error('Error details:', {
        childId: dto.childId,
        taskId: dto.taskId,
        familyId: user.familyId,
        errorMessage: error?.message,
        errorStack: error?.stack,
      });
      // Пробрасываем ошибку дальше, чтобы NestJS правильно обработал её
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Failed to create completion. Please check logs for details.'
      );
    }
  }

  @Post('parent/completions/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  approve(@User() user: RequestUser, @Param('id') id: string) {
    return this.completionsService.approve(id, user.familyId);
  }

  @Post('parent/completions/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  reject(@User() user: RequestUser, @Param('id') id: string) {
    return this.completionsService.reject(id, user.familyId);
  }

  @Post('parent/completions/mark-not-completed')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async markAsNotCompleted(
    @User() user: RequestUser,
    @Body() dto: { taskId: string; childId: string; date?: string },
  ) {
    try {
      console.log('[CompletionsController] markAsNotCompleted called:', {
        taskId: dto.taskId,
        childId: dto.childId,
        familyId: user.familyId,
        date: dto.date,
      });
      
      const date = dto.date ? new Date(dto.date) : undefined;
      const result = await this.completionsService.markAsNotCompleted(
        dto.taskId,
        dto.childId,
        user.familyId,
        date,
      );
      
      console.log('[CompletionsController] markAsNotCompleted success:', result);
      return result;
    } catch (error: any) {
      console.error('[CompletionsController] markAsNotCompleted error:', error.message);
      console.error('[CompletionsController] Error stack:', error.stack);
      throw error;
    }
  }
}
