import { Module } from '@nestjs/common';
import { ChildrenController } from './children.controller';
import { UploadController } from './upload.controller';
import { ChildrenService } from './children.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { MotivationModule } from '../motivation/motivation.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [FirestoreModule, FirebaseModule, MotivationModule, LedgerModule],
  controllers: [ChildrenController, UploadController],
  providers: [ChildrenService],
  exports: [ChildrenService],
})
export class ChildrenModule {}
