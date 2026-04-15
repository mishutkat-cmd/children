import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { getFirebaseCredentials } from '../config/env-loader';

/** Project must use childrenevolvenext Firebase (matches web firebaseConfig) */
const FIREBASE_PROJECT_ID = 'childrenevolvenext';
const FIREBASE_STORAGE_BUCKET = 'childrenevolvenext.firebasestorage.app';

export enum FirebaseErrorType {
  MODULE_NOT_FOUND = 'MODULE_NOT_FOUND',
  NO_CREDS = 'NO_CREDS',
  INVALID_JSON = 'INVALID_JSON',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  SERVICE_DISABLED = 'SERVICE_DISABLED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN = 'UNKNOWN',
}

export interface FirebaseStatus {
  enabled: boolean;
  reason?: string;
  errorType?: FirebaseErrorType;
  credentialsSource?: string;
  projectId?: string;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private adminModule: any = null;
  private firestore: any = null;
  private auth: any = null;
  private status: FirebaseStatus = { enabled: false };

  async onModuleInit() {
    await this.initialize();
  }

  /**
   * Initialize Firebase Admin SDK with graceful error handling.
   * firebase-admin is required dynamically so missing module does not crash the server.
   */
  async initialize(): Promise<void> {
    let admin: any;
    try {
      admin = require('firebase-admin');
    } catch (_error) {
      this.status = {
        enabled: false,
        reason: 'firebase-admin not installed',
        errorType: FirebaseErrorType.MODULE_NOT_FOUND,
      };
      this.logger.warn(`[Firebase] ${this.status.reason}`);
      return;
    }

    // Try to get credentials
    const serviceAccount = getFirebaseCredentials();
    if (!serviceAccount) {
      this.status = {
        enabled: false,
        reason: 'No credentials provided',
        errorType: FirebaseErrorType.NO_CREDS,
      };
      this.logger.warn(`[Firebase] ${this.status.reason}`);
      return;
    }

    // Validate credentials structure
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      this.status = {
        enabled: false,
        reason: 'Invalid Firebase credentials structure. Missing required fields.',
        errorType: FirebaseErrorType.INVALID_JSON,
      };
      this.logger.warn(`[Firebase] ${this.status.reason}`);
      return;
    }

    this.logger.log('[Firebase] Credentials loaded');

    // Ensure credentials are for childrenevolvenext project
    if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) {
      this.status = {
        enabled: false,
        reason: `Wrong Firebase project. Credentials are for "${serviceAccount.project_id}", must be "${FIREBASE_PROJECT_ID}". Use childrenevolvenext service account JSON.`,
        errorType: FirebaseErrorType.INVALID_JSON,
      };
      this.logger.error(`[Firebase] ${this.status.reason}`);
      return;
    }

    // Initialize Firebase Admin SDK
    try {
      if (admin.apps.length > 0) {
        try {
          admin.app().delete();
        } catch (_) {}
      }

      const storageBucket =
        process.env.FIREBASE_STORAGE_BUCKET || FIREBASE_STORAGE_BUCKET;

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket,
      });

      this.adminModule = admin;
      this.firestore = admin.firestore();
      this.auth = admin.auth();

      // Test connection (simple operation)
      try {
        // Try to get a collection (this will fail fast if permissions are wrong)
        await this.firestore.collection('_test').limit(1).get();
      } catch (testError: any) {
        if (testError.code === 7 || testError.code === 'PERMISSION_DENIED') {
          this.status = {
            enabled: false,
            reason: 'Firebase permission denied. Check IAM roles and Firestore rules.',
            errorType: FirebaseErrorType.PERMISSION_DENIED,
          };
          this.logger.warn(`[Firebase] ${this.status.reason}`);
          // Clear firestore/auth but don't throw
          this.firestore = null;
          this.auth = null;
          return;
        }
        if (testError.code === 8 || testError.code === 'UNAVAILABLE' || testError.message?.includes('SERVICE_DISABLED')) {
          this.status = {
            enabled: false,
            reason: 'Firebase service disabled. Enable Firestore API in GCP Console.',
            errorType: FirebaseErrorType.SERVICE_DISABLED,
          };
          this.logger.warn(`[Firebase] ${this.status.reason}`);
          this.firestore = null;
          this.auth = null;
          return;
        }
        // Other errors might be fine (e.g., network), just log
        this.logger.debug(`[Firebase] Test query warning: ${testError.message}`);
      }

      this.status = {
        enabled: true,
        credentialsSource: process.env.FIREBASE_SA_JSON ? 'env' : 'file',
        projectId: serviceAccount.project_id,
      };
      this.logger.log('[Firebase] Admin SDK initialized successfully');
    } catch (error: any) {
      // Classify error
      let errorType = FirebaseErrorType.UNKNOWN;
      let reason = error.message || 'Unknown error during Firebase initialization';

      if (error.code === 'ENOENT' || error.message?.includes('Cannot find module')) {
        errorType = FirebaseErrorType.MODULE_NOT_FOUND;
        reason = 'firebase-admin module not found or corrupted. Reinstall: npm install firebase-admin';
      } else if (error.message?.includes('JSON') || error.message?.includes('parse')) {
        errorType = FirebaseErrorType.INVALID_JSON;
        reason = 'Invalid JSON in Firebase credentials';
      } else if (error.code === 7 || error.code === 'PERMISSION_DENIED') {
        errorType = FirebaseErrorType.PERMISSION_DENIED;
        reason = 'Firebase permission denied. Check IAM roles.';
      } else if (error.code === 8 || error.code === 'SERVICE_DISABLED') {
        errorType = FirebaseErrorType.SERVICE_DISABLED;
        reason = 'Firebase service disabled. Enable API in GCP Console.';
      }

      this.status = {
        enabled: false,
        reason,
        errorType,
      };
      this.logger.error(`[Firebase] Initialization failed: ${reason}`, error.stack);
      // Don't throw - allow server to start without Firebase
    }
  }

  getStatus(): FirebaseStatus {
    return { ...this.status };
  }

  getFirestore(): any {
    return this.firestore;
  }

  getAuth(): any {
    return this.auth;
  }

  /** For StorageService and uploads; null if Firebase not configured */
  getAdmin(): any {
    return this.adminModule;
  }

  isEnabled(): boolean {
    return this.status.enabled;
  }

  // Helper methods with null checks
  async getCollection(collectionName: string): Promise<any> {
    if (!this.firestore) {
      throw new Error('Firebase is not initialized');
    }
    return this.firestore.collection(collectionName);
  }

  async getDocument(collectionName: string, docId: string): Promise<any> {
    if (!this.firestore) {
      throw new Error('Firebase is not initialized');
    }
    const doc = await this.firestore.collection(collectionName).doc(docId).get();
    return doc.exists ? doc : null;
  }

  async createDocument(collectionName: string, data: any, docId?: string): Promise<any> {
    if (!this.firestore) {
      throw new Error('Firebase is not initialized');
    }
    const collection = this.firestore.collection(collectionName);
    if (docId) {
      await collection.doc(docId).set(data);
      return collection.doc(docId);
    }
    return collection.add(data);
  }

  async updateDocument(collectionName: string, docId: string, data: any): Promise<void> {
    if (!this.firestore) {
      throw new Error('Firebase is not initialized');
    }
    await this.firestore.collection(collectionName).doc(docId).update(data);
  }

  async deleteDocument(collectionName: string, docId: string): Promise<void> {
    if (!this.firestore) {
      throw new Error('Firebase is not initialized');
    }
    await this.firestore.collection(collectionName).doc(docId).delete();
  }

  async queryCollection(collectionName: string, ...queryConstraints: any[]): Promise<any> {
    if (!this.firestore) {
      throw new Error('Firebase is not initialized');
    }
    let query: any = this.firestore.collection(collectionName);

    for (const constraint of queryConstraints) {
      if (constraint.field && constraint.operator && constraint.value !== undefined) {
        query = query.where(constraint.field, constraint.operator, constraint.value);
      }
    }

    return query.get();
  }
}
