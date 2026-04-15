import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksSchedulerService } from './tasks-scheduler.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { CompletionsModule } from '../completions/completions.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [FirestoreModule, CompletionsModule, LedgerModule],
  controllers: [TasksController],
  providers: [TasksService, TasksSchedulerService],
  exports: [TasksService],
})
export class TasksModule {}
