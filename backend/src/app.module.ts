import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { FirebaseModule } from './firebase/firebase.module';
import { FirestoreModule } from './firestore/firestore.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ChildrenModule } from './children/children.module';
import { TasksModule } from './tasks/tasks.module';
import { CompletionsModule } from './completions/completions.module';
import { RewardsModule } from './rewards/rewards.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { LedgerModule } from './ledger/ledger.module';
import { MotivationModule } from './motivation/motivation.module';
import { BadgesModule } from './badges/badges.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageKvModule } from './storage-kv/storage-kv.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Default soft global limit; tight per-route limits on /auth/* via @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ConfigModule,
    FirebaseModule,
    FirestoreModule,
    HealthModule,
    StorageKvModule,
    AuthModule,
    ChildrenModule,
    TasksModule,
    CompletionsModule,
    RewardsModule,
    WishlistModule,
    ExchangesModule,
    LedgerModule,
    MotivationModule,
    BadgesModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
