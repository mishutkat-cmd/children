import { Module, Global } from '@nestjs/common';
import { FirestoreService } from './firestore.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Global()
@Module({
  imports: [FirebaseModule],
  providers: [FirestoreService],
  exports: [FirestoreService],
})
export class FirestoreModule {}
