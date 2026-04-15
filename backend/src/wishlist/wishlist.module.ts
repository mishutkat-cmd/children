import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { FirestoreModule } from '../firestore/firestore.module';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirestoreModule, FirebaseModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
