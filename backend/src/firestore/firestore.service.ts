import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

/**
 * FirestoreService - замена PrismaService для работы с Firebase Firestore
 * Предоставляет методы, похожие на Prisma API для упрощения миграции
 */
@Injectable()
export class FirestoreService implements OnModuleInit {
  private readonly logger = new Logger(FirestoreService.name);
  private firestore: admin.firestore.Firestore | null = null;

  constructor(private firebaseService: FirebaseService) {}

  async onModuleInit() {
    // Ждём инициализации Firebase (один раз, без спама в лог)
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.firestore = this.firebaseService.getFirestore();
      if (this.firestore) {
        this.logger.log('[FirestoreService] ✅ Initialized successfully');
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    const status = this.firebaseService.getStatus();
    if (!status.enabled) {
      this.logger.error(`[FirestoreService] Firestore not initialized. Reason: ${status.reason || 'Unknown'}. Check Firebase credentials and enable Firestore API in GCP.`);
    } else {
      this.logger.warn('[FirestoreService] Firestore not ready after waiting. Will retry on first use.');
    }
  }

  /**
   * Получить коллекцию
   */
  collection(name: string): admin.firestore.CollectionReference {
    // Всегда пытаемся получить Firestore, если он еще не был инициализирован
    if (!this.firestore) {
      this.firestore = this.firebaseService.getFirestore();
      if (this.firestore) {
        this.logger.log('[FirestoreService] ✅ Firestore initialized on first use');
      }
    }
    
    if (!this.firestore) {
      const status = this.firebaseService.getStatus();
      const errorMsg = `Firestore is not initialized. Reason: ${status.reason || 'Unknown'}. Check Firebase configuration and serviceAccountKey.json file.`;
      this.logger.error(`[FirestoreService] ${errorMsg}`);
      this.logger.error(`[FirestoreService] Attempted to access collection: ${name}`);
      throw new Error(errorMsg);
    }
    return this.firestore.collection(name);
  }

  /**
   * Получить документ
   */
  async doc(collectionName: string, docId: string): Promise<admin.firestore.DocumentSnapshot> {
    const doc = await this.collection(collectionName).doc(docId).get();
    if (!doc.exists) {
      throw new Error(`Document ${docId} not found in collection ${collectionName}`);
    }
    return doc;
  }

  /**
   * Создать документ
   */
  async create(collectionName: string, data: any, docId?: string): Promise<string> {
    const collection = this.collection(collectionName);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    // Удаляем поля createdAt и updatedAt из data, если они уже есть, чтобы использовать serverTimestamp
    const { createdAt, updatedAt, ...restData } = data;
    
    // Конвертируем Date в Timestamp для полей дат
    const processedData: any = {};
    for (const [key, value] of Object.entries(restData)) {
      if (value === undefined) {
        // Firestore не принимает undefined — пропускаем
        continue;
      }
      if (value instanceof Date) {
        processedData[key] = admin.firestore.Timestamp.fromDate(value);
      } else if (key === 'startDate' || key === 'endDate' || key === 'performedAt' || key === 'approvedAt' || key === 'deliveredAt' || key === 'decidedAt' || key === 'earnedAt') {
        // Для специальных полей дат используем Timestamp
        if (value && typeof value === 'string') {
          processedData[key] = admin.firestore.Timestamp.fromDate(new Date(value));
        } else if (value) {
          processedData[key] = value;
        }
      } else {
        processedData[key] = value;
      }
    }

    const docData = {
      ...processedData,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (docId) {
      await collection.doc(docId).set(docData);
      return docId;
    } else {
      const docRef = await collection.add(docData);
      return docRef.id;
    }
  }

  /**
   * Обновить документ
   */
  async update(collectionName: string, docId: string, data: any): Promise<void> {
    const docRef = this.collection(collectionName).doc(docId);

    // Конвертируем Date в Timestamp для полей дат
    const processedData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        // Firestore не принимает undefined — пропускаем
        continue;
      }
      if (value instanceof Date) {
        processedData[key] = admin.firestore.Timestamp.fromDate(value);
      } else if (key === 'startDate' || key === 'endDate' || key === 'performedAt' || key === 'approvedAt' || key === 'deliveredAt' || key === 'decidedAt' || key === 'earnedAt' || key === 'requestedAt') {
        if (value && typeof value === 'string') {
          processedData[key] = admin.firestore.Timestamp.fromDate(new Date(value));
        } else if (value) {
          processedData[key] = value;
        }
      } else {
        processedData[key] = value;
      }
    }
    
    await docRef.update({
      ...processedData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Удалить документ
   */
  async delete(collectionName: string, docId: string): Promise<void> {
    await this.collection(collectionName).doc(docId).delete();
  }

  /**
   * Найти первый документ по условию
   */
  private convertDocData(id: string, data: admin.firestore.DocumentData): any {
    const result: any = { id };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'toDate' in value) {
        result[key] = (value as admin.firestore.Timestamp).toDate();
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async findFirst(collectionName: string, where?: any): Promise<any | null> {
    try {
      // OR: несколько запросов по одному условию
      if (where?.OR) {
        const promises = (where.OR as any[]).map((condition: any) => {
          const [field, value] = Object.entries(condition)[0];
          return this.collection(collectionName).where(field, '==', value).limit(1).get();
        });
        for (const result of await Promise.all(promises)) {
          if (!result.empty) {
            return this.convertDocData(result.docs[0].id, result.docs[0].data());
          }
        }
        return null;
      }

      // Применяем ВСЕ условия (не только первое — это был корневой баг)
      let query: admin.firestore.Query = this.collection(collectionName);
      for (const [field, value] of Object.entries(where ?? {})) {
        if (field !== 'OR') {
          query = query.where(field, '==', value);
        }
      }

      const snapshot = await query.limit(1).get();
      if (snapshot.empty) return null;
      return this.convertDocData(snapshot.docs[0].id, snapshot.docs[0].data());
    } catch (error: any) {
      this.logger.error(`Error in findFirst(${collectionName}):`, error.message);
      this.logger.error('Where condition:', JSON.stringify(where));
      throw error;
    }
  }

  /**
   * Найти уникальный документ
   */
  async findUnique(collectionName: string, where: any): Promise<any | null> {
    return this.findFirst(collectionName, where);
  }

  /**
   * Найти много документов
   */
  async findMany(collectionName: string, where?: any, orderBy?: any, take?: number): Promise<any[]> {
    try {
      let query: admin.firestore.Query = this.collection(collectionName);
      let useInMemorySort = false; // Флаг для сортировки в памяти

      if (where) {
      // Обработка нескольких условий where
      const whereEntries = Object.entries(where);
      
      for (const [field, value] of whereEntries) {
        if (field === 'OR') {
          // OR обрабатывается отдельно через несколько запросов
          continue;
        }
        
        if (typeof value === 'object' && value !== null) {
          // Обработка сложных условий (gte, lte, in)
          const valueObj = value as any;
          if (valueObj.gte !== undefined) {
            query = query.where(field, '>=', valueObj.gte);
          } else if (valueObj.lte !== undefined) {
            query = query.where(field, '<=', valueObj.lte);
          } else if (valueObj.in !== undefined && Array.isArray(valueObj.in)) {
            // Firestore поддерживает до 10 элементов в 'in'
            if (valueObj.in.length <= 10) {
              query = query.where(field, 'in', valueObj.in);
            } else {
              // Для больших массивов делаем несколько запросов
              const chunks = [];
              for (let i = 0; i < valueObj.in.length; i += 10) {
                chunks.push(valueObj.in.slice(i, i + 10));
              }
              const promises = chunks.map(chunk => 
                this.collection(collectionName).where(field, 'in', chunk).get()
              );
              const results = await Promise.all(promises);
              const allDocs = results.flatMap(result => result.docs);
              const uniqueDocs = new Map();
              allDocs.forEach(doc => uniqueDocs.set(doc.id, doc));
              const docs = Array.from(uniqueDocs.values());
              
              // Применяем остальные фильтры в памяти
              let filtered = docs.map(doc => ({ id: doc.id, ...doc.data() }));
              
              // Применяем остальные условия where
              for (const [otherField, otherValue] of whereEntries) {
                if (otherField !== field && otherField !== 'OR') {
                  if (typeof otherValue === 'object' && otherValue !== null) {
                    // Пропускаем сложные условия для in
                  } else {
                    filtered = filtered.filter(item => item[otherField] === otherValue);
                  }
                }
              }
              
              // Применяем orderBy и take
              if (orderBy) {
                const orderField = Object.keys(orderBy)[0];
                const direction = orderBy[orderField] === 'asc' ? 1 : -1;
                filtered.sort((a, b) => {
                  const aVal = a[orderField];
                  const bVal = b[orderField];
                  return aVal < bVal ? -direction : aVal > bVal ? direction : 0;
                });
              }
              
              if (take) {
                filtered = filtered.slice(0, take);
              }
              
              return filtered;
            }
          } else {
            query = query.where(field, '==', value);
          }
        } else {
          query = query.where(field, '==', value);
        }
      }
    }

    if (orderBy) {
      const field = Object.keys(orderBy)[0];
      const direction = orderBy[field] === 'asc' ? 'asc' : 'desc';
      query = query.orderBy(field, direction);
    }

      if (take) {
        query = query.limit(take);
      }

      let snapshot;
      try {
        snapshot = await query.get();
      } catch (error: any) {
        // Если ошибка индекса при выполнении запроса, получаем без сортировки
        if (error.message && error.message.includes('index')) {
          this.logger.warn(`[FirestoreService] Index error during query execution, fetching without orderBy and sorting in memory`);
          useInMemorySort = true;
          // Пересоздаем запрос без orderBy
          query = this.collection(collectionName);
          if (where) {
            const whereEntries = Object.entries(where);
            for (const [field, value] of whereEntries) {
              if (field !== 'OR' && typeof value !== 'object') {
                query = query.where(field, '==', value);
              }
            }
          }
          snapshot = await query.get();
        } else {
          throw error;
        }
      }
      
      let results = snapshot.docs.map(doc => this.convertDocData(doc.id, doc.data()));
      
      // Сортируем в памяти, если была ошибка индекса
      if (useInMemorySort && orderBy) {
        const field = Object.keys(orderBy)[0];
        const direction = orderBy[field] === 'asc' ? 1 : -1;
        results.sort((a, b) => {
          let aVal = a[field];
          let bVal = b[field];
          
          // Обрабатываем Timestamp
          if (aVal && typeof aVal === 'object' && aVal.toDate) {
            aVal = aVal.toDate();
          }
          if (bVal && typeof bVal === 'object' && bVal.toDate) {
            bVal = bVal.toDate();
          }
          
          // Обрабатываем Date
          if (aVal instanceof Date) aVal = aVal.getTime();
          if (bVal instanceof Date) bVal = bVal.getTime();
          
          if (aVal < bVal) return -direction;
          if (aVal > bVal) return direction;
          return 0;
        });
        this.logger.debug(`[FirestoreService] Sorted ${results.length} documents in memory by ${field}`);
      }
      
      // Применяем take после сортировки, если нужно
      if (take && useInMemorySort && results.length > take) {
        results = results.slice(0, take);
      }
      
      // Применяем фильтрацию в памяти для условий, которые не поддерживаются Firestore
      if (where) {
        for (const [field, value] of Object.entries(where)) {
          if (typeof value === 'object' && value !== null) {
            const valueObj = value as any;
            if (valueObj.gte || valueObj.lte) {
              results = results.filter(item => {
                const itemValue = item[field];
                if (!itemValue) return false;
                const itemDate = itemValue?.toDate ? itemValue.toDate() : new Date(itemValue);
                if (valueObj.gte && itemDate < valueObj.gte) return false;
                if (valueObj.lte && itemDate > valueObj.lte) return false;
                return true;
              });
            }
          }
        }
      }
      
      return results;
    } catch (error: any) {
      this.logger.error(`Error in findMany(${collectionName}):`, error.message);
      this.logger.error('Where condition:', JSON.stringify(where));
      throw error;
    }
  }

  /**
   * Подсчитать документы
   */
  async count(collectionName: string, where?: any): Promise<number> {
    let query: admin.firestore.Query = this.collection(collectionName);

    if (where) {
      for (const [field, value] of Object.entries(where)) {
        query = query.where(field, '==', value);
      }
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  /**
   * Batch операции
   */
  batch(): admin.firestore.WriteBatch {
    if (!this.firestore) {
      throw new Error('Firestore is not initialized');
    }
    return this.firestore.batch();
  }

  /**
   * Транзакции
   */
  async runTransaction<T>(
    updateFunction: (transaction: admin.firestore.Transaction) => Promise<T>
  ): Promise<T> {
    if (!this.firestore) {
      throw new Error('Firestore is not initialized');
    }
    return this.firestore.runTransaction(updateFunction);
  }

  /**
   * Получить Timestamp
   */
  timestamp(): admin.firestore.Timestamp {
    return admin.firestore.Timestamp.now();
  }

  /**
   * ServerTimestamp
   */
  serverTimestamp(): admin.firestore.FieldValue {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  /**
   * FieldValue для удаления поля
   */
  deleteField(): admin.firestore.FieldValue {
    return admin.firestore.FieldValue.delete();
  }

  /**
   * FieldValue для инкремента
   */
  increment(n: number): admin.firestore.FieldValue {
    return admin.firestore.FieldValue.increment(n);
  }
}
