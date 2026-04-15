# Миграция на Firebase Firestore

## Статус миграции

### ✅ Завершено:
1. **FirestoreService** - создан сервис для работы с Firestore
2. **FirebaseModule** - модуль уже настроен
3. **AuthService** - переписан для работы с Firestore
4. **Конфигурация** - добавлена поддержка serviceAccountKey.json

### 🔄 В процессе:
- Переписывание остальных сервисов (Children, Tasks, Completions, etc.)

### 📋 Структура коллекций Firestore:

```
users/
  - {userId}
    - id, email, login, passwordHash, role, familyId, createdAt, updatedAt

childProfiles/
  - {childProfileId}
    - id, userId, name, avatarUrl, pointsBalance, streakState, createdAt, updatedAt

tasks/
  - {taskId}
    - id, familyId, title, description, icon, category, points, frequency, daysOfWeek, assignedTo, requiresProof, requiresParentApproval, status, createdAt, updatedAt

taskAssignments/
  - {assignmentId}
    - id, taskId, childId, createdAt

completions/
  - {completionId}
    - id, familyId, childId, taskId, note, proofUrl, status, pointsAwarded, performedAt, approvedAt, createdAt, updatedAt

ledgerEntries/
  - {entryId}
    - id, familyId, childId, type, refType, refId, amount, metaJson, createdAt

rewards/
  - {rewardId}
    - id, familyId, title, description, costPoints, status, createdAt, updatedAt

wishlist/
  - {wishlistId}
    - id, childId, rewardId, priority, createdAt

exchanges/
  - {exchangeId}
    - id, familyId, childId, rewardId, pointsSpent, cashCents, status, requestedAt, approvedAt, deliveredAt, createdAt, updatedAt

challenges/
  - {challengeId}
    - id, familyId, title, description, startDate, endDate, participantsJson, rulesJson, penaltyEnabled, penaltyValue, penaltyAfterDays, status, createdAt, updatedAt

decayRules/
  - {decayRuleId}
    - id, familyId, decayType, decayValue, enabled, startAfterMissedDays, maxDailyPenalty, protectedBalanceDefault, mode, createdAt, updatedAt

streakRules/
  - {streakRuleId}
    - id, familyId, taskId, minDays, bonusType, bonusValue, enabled, createdAt, updatedAt

badges/
  - {badgeId}
    - id, familyId, name, description, icon, criteria, createdAt, updatedAt

childBadges/
  - {childBadgeId}
    - id, childId, badgeId, earnedAt, createdAt
```

## Инструкции по миграции

1. **Проверьте подключение к Firebase:**
   - Убедитесь, что `serviceAccountKey.json` находится в `backend/`
   - Или установите переменную окружения `FIREBASE_SA_PATH`

2. **Запустите проект:**
   ```bash
   cd backend
   npm run start:dev
   ```

3. **Проверьте логи:**
   - Должно быть сообщение: `[Firebase] Admin SDK initialized successfully`
   - Должно быть сообщение: `FirestoreService initialized successfully`

## Примечания

- Firestore не поддерживает сложные запросы с несколькими условиями `where` без составных индексов
- Для запросов с `OR` нужно делать несколько запросов и объединять результаты
- Timestamps в Firestore автоматически добавляются через `serverTimestamp()`
