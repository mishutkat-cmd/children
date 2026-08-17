# 🗺️ MAP_GEOLOCATION_PLAN.md — Страница «Карта» + геолокация детей

> План реализации: экран карты для родителя в мобильном приложении и фоновая
> передача геопозиции с устройств детей.
> Статус: **P0–P3 реализованы** (17.08.2026), P4 не начат. См. §9 и §12.

---

## 1. Что уже есть (исходная точка)

| Слой | Технологии | Факты, важные для фичи |
|---|---|---|
| Mobile | Expo SDK 54, RN 0.81, new arch **вкл.**, React Navigation 7, react-query 5, zustand + AsyncStorage | **Одно приложение на обе роли**: `AppNavigator` переключает `ParentNavigator` / `ChildNavigator` по `user.role` |
| Backend | NestJS 10, Firestore через `FirestoreService` (Prisma-подобная обёртка), JWT + `RolesGuard`, `ThrottlerModule` (120 req/min) | Все клиенты ходят только через backend, `firestore.rules` запрещает прямой доступ |
| Auth | JWT, `JWT_EXPIRES_IN` по умолчанию **1d**, вход ребёнка — по PIN | Refresh-токена **нет** |
| Сборка | EAS: `development` / `preview` / `production`, dev идёт через Expo Go | Expo Go **не поддерживает** фоновую геолокацию |

Геолокации в коде сейчас нет вообще (grep по `geoloc|latitude|longitude` — пусто).

---

## 2. Три блокера, которые определяют архитектуру

Это не «нюансы реализации» — если их не решить, фича работать в фоне не будет.

### 2.1. JWT живёт 1 день → фоновая отправка умрёт через сутки

Ребёнок логинится по PIN, получает токен на 24 часа. Фоновый таск через сутки
начнёт получать 401, интерсептор в [api.ts](mobile/src/lib/api.ts#L44-L48) вызовет
`clearAuth()` — и телефон ребёнка молча перестанет слать координаты. Родитель
увидит «последний раз 3 дня назад» и решит, что приложение сломано.

**Решение (P0):** отдельный долгоживущий токен устройства.
- `POST /auth/device-token` (роль CHILD, обычный JWT) → выдаёт JWT на 180 дней с
  `scope: 'location'` и `deviceId`.
- Хранится в `expo-secure-store`, **не** в zustand-персисте.
- Guard `DeviceTokenGuard` пускает такой токен **только** на `POST /locations/batch`.
- Родитель может отозвать: `deviceTokens/{id}.revokedAt` → 401 → приложение ребёнка
  просит перелогиниться.

Альтернатива подешевле: полноценный `/auth/refresh`. Он полезнее в целом, но
требует переделки логина на обеих ролях и вебе. Рекомендую device-token: скоуп
узкий, риск минимальный.

### 2.2. Фоновый таск не видит zustand-стор

`TaskManager` в Android поднимает **headless JS**: React-дерево не смонтировано,
`useAuthStore` не гидратирован, интерсептор `api` токен не подставит. Читать токен
надо напрямую из `SecureStore` внутри таска, отдельным `axios`-инстансом
без зависимости от стора.

### 2.3. Expo Go отпадает

`Location.startLocationUpdatesAsync` в Expo Go бросает исключение. Нужен
**development build** (`eas build --profile development`) для всей дальнейшей
разработки этой фичи. Поэтому:
- в коде — `Constants.appOwnership === 'expo'` → фолбэк на foreground-only режим
  с честным баннером «фоновый режим доступен только в собранной версии»;
- в [RELEASE.md](mobile/RELEASE.md) — обновить раздел запуска.

---

## 3. Архитектура потока

```
Телефон ребёнка (role=CHILD)
  expo-location (background task)
      │  фильтр точности + дедуп + сглаживание
      ▼
  Очередь в AsyncStorage  ──(нет сети)──┐
      │                                  │ повтор при появлении сети
      ▼                                  │  + expo-background-task (safety net)
  POST /locations/batch  ◄───────────────┘
  Authorization: Bearer <device token>
      │
      ▼
NestJS LocationsModule
  ├─ валидация (zod/class-validator), throttle, дедуп по capturedAt
  ├─ Firestore batch:
  │     childLocations/{childProfileId}   ← перезапись «последняя точка»
  │     locationPoints/{auto}             ← история, TTL по expiresAt
  └─ (P4) проверка геозон → notifications + push
      │
      ▼
GET /locations/children  (роль PARENT, familyId из JWT)
      │
      ▼
Телефон родителя → MapScreen (react-query, refetchInterval при фокусе)
```

---

## 4. Модель данных (Firestore)

### `childLocations` — последняя точка, doc id = `childProfileId`

```ts
{
  familyId: string
  childId: string          // childProfileId
  userId: string
  lat: number
  lng: number
  accuracy: number         // метры, CEP68
  altitude?: number
  speed?: number           // м/с
  heading?: number
  capturedAt: Timestamp    // время фикса на устройстве
  receivedAt: Timestamp    // серверное время (serverTimestamp)
  source: 'background' | 'foreground' | 'manual'
  isMoving: boolean
  battery?: number         // 0..1
  isCharging?: boolean
  mocked?: boolean         // Android: подделка координат
  deviceId: string
  permissionState: 'always' | 'whenInUse' | 'denied'
  servicesEnabled: boolean
}
```

Один документ на ребёнка, перезаписывается → `GET` карты = N мелких чтений,
без сортировок и составных индексов.

### `locationPoints` — история

Те же поля + `expiresAt: Timestamp`. Настроить **TTL-политику Firestore** на поле
`expiresAt` (консоль / `gcloud firestore fields ttls update`) — Google сам чистит,
кода для очистки писать не нужно.

Индекс (добавить в [firestore.indexes.json](firestore.indexes.json)):
```json
{ "collectionGroup": "locationPoints", "queryScope": "COLLECTION",
  "fields": [ { "fieldPath": "childId", "order": "ASCENDING" },
              { "fieldPath": "capturedAt", "order": "DESCENDING" } ] }
```

### `locationSettings` — doc id = `familyId`

```ts
{
  enabled: boolean                  // мастер-выключатель на семью
  perChild: { [childId]: { enabled, historyDays } }
  movingIntervalSec: number         // default 60
  idleIntervalSec: number           // default 300
  historyDays: number               // default 7, максимум 30
  quietHours?: { from: string, to: string }  // не писать историю ночью
}
```

### `deviceTokens`, `geofences` (P4)

`geofences`: `{ familyId, childId | null, name, lat, lng, radiusM, notifyOnEnter, notifyOnExit }`.

**Оценка стоимости.** 1 точка/мин на ребёнка = 1440 записей/сутки. Батч по 10
точек = 2 write-операции на батч (last + история пишутся batch'ем, история — по
точке). Реально ~2900 записей/ребёнка/сутки ≈ **$0.005/сутки/ребёнок** при
$0.18/100k. На 500 детей — ~$2.6/сутки. Адаптивный интервал (см. 6.2) режет это
в 3–5 раз, потому что дети большую часть суток неподвижны.

---

## 5. Backend: `LocationsModule`

Новый модуль по образцу `NotificationsModule`, регистрируется в
[app.module.ts](backend/src/app.module.ts).

```
backend/src/locations/
  locations.module.ts
  locations.controller.ts       # родительские эндпоинты
  locations.ingest.controller.ts# приём точек (device token)
  locations.service.ts
  geofence.service.ts           # P4
  dto/locations.dto.ts
  guards/device-token.guard.ts
```

| Метод | Путь | Роль | Назначение |
|---|---|---|---|
| POST | `/locations/batch` | CHILD / device token | Приём массива точек (≤ 50) |
| GET | `/locations/children` | PARENT | Последние точки всех детей семьи + `staleness` |
| GET | `/locations/children/:childId/history` | PARENT | История `?from&to&limit` (≤ 1000) |
| POST | `/locations/children/:childId/refresh` | PARENT | «Обновить сейчас» (P3, silent push) |
| GET/PATCH | `/locations/settings` | PARENT | Настройки семьи |
| GET | `/locations/me/status` | CHILD | Что видит ребёнок о своём шеринге |

Правила на сервере:
- **Всегда** брать `familyId` из JWT, никогда из тела запроса. `childId` из тела
  проверять через `getChildProfileId()` из
  [firestore.helpers.ts](backend/src/firestore/firestore.helpers.ts#L79) —
  ребёнок из другой семьи должен получить 403.
- Отбрасывать точки с `capturedAt` в будущем (> +2 мин) или старше 24 ч.
- Отбрасывать `accuracy > 200` (кроме случая, когда за окном нет ни одной точки лучше).
- Дедуп по `(childId, capturedAt)` — id документа истории делать детерминированным:
  `${childId}_${capturedAt.getTime()}` → повторная отправка того же батча
  (ретрай после таймаута) не задваивает историю.
- `@Throttle({ default: { limit: 30, ttl: 60_000 } })` на `/locations/batch`.
- Ответ на батч: `{ accepted, rejected, nextIntervalSec }` — сервер может
  на лету менять период опроса устройства (пригодится при экономии батареи).

---

## 6. Mobile — сторона ребёнка (отправка)

Новые зависимости:
```
npx expo install expo-location expo-task-manager expo-secure-store expo-background-task expo-device
```

```
mobile/src/location/
  tracker.ts          # defineTask + start/stop + конфиг точности
  queue.ts            # офлайн-очередь в AsyncStorage
  filters.ts          # фильтрация выбросов и джиттера
  permissions.ts      # пошаговый запрос разрешений
  deviceToken.ts      # SecureStore + получение/обновление токена
mobile/src/screens/child/LocationConsentScreen.tsx
```

### 6.1. Регистрация таска — на верхнем уровне модуля

```ts
// tracker.ts — импортируется из index.ts ДО рендера App
import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'

export const LOCATION_TASK = 'kids-location-updates'

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return
  const { locations } = data as { locations: Location.LocationObject[] }
  const points = filterPoints(locations)      // filters.ts
  if (!points.length) return
  await enqueue(points)                        // queue.ts
  await flushQueue()                           // best-effort отправка
})
```

`defineTask` обязан вызываться в глобальной области при каждом старте JS,
включая headless-запуск. Поэтому импорт `./src/location/tracker` кладём в
[index.ts](mobile/index.ts), а не внутрь компонента.

### 6.2. Конфигурация точности — компромисс «точность / батарея»

```ts
await Location.startLocationUpdatesAsync(LOCATION_TASK, {
  accuracy: Location.Accuracy.Balanced,   // ~100 м, GPS не молотит постоянно
  timeInterval: moving ? 60_000 : 300_000,
  distanceInterval: 0,                    // см. ниже — намеренно ноль
  deferredUpdatesInterval: timeInterval,  // iOS: копить в фоне, будить реже
  deferredUpdatesDistance: 0,
  activityType: Location.ActivityType.Other,
  pausesUpdatesAutomatically: false,      // иначе iOS сам заглушит навсегда
  showsBackgroundLocationIndicator: true, // требование App Store
  foregroundService: {                    // Android: без этого фон не живёт
    notificationTitle: 'Геолокация включена',
    notificationBody: 'Родители видят, где ты находишься',
    notificationColor: '#007AFF',
  },
})
```

**Почему `distanceInterval: 0`.** Напрашивающийся фильтр по дистанции («не
двигается — не шлём») ломает главный сценарий: `distanceInterval` действует
вместе с `timeInterval` по «И», поэтому у неподвижного телефона обновления не
приходят вообще. Родитель, открыв карту, видит «был час назад» вместо «всё ещё
в школе» — и решает, что приложение сломано. Экономим не фильтром, а интервалом
(60 с в движении → 300 с в покое), а шум на месте режет `filters.ts` уже после
получения фикса: в сеть он не уходит, точка истории не создаётся, но раз в
10 минут heartbeat всё равно подтверждает «ребёнок здесь».

**Адаптивность.** `Accuracy.High` (~10 м) включаем только на явный запрос
родителя «обновить сейчас» и на 60 секунд, потом возвращаемся. Переключение
режима moving/idle: 3 подряд точки в радиусе 100 м — переходим на
`idleIntervalSec`; появилось смещение — обратно.

Ожидаемый расход: 5–8 % батареи за 12 часов при `Balanced`. Постоянный `High`
даёт 15–25 % — это то, из-за чего пользователи удаляют такие приложения.
Цифру нужно подтвердить замером на реальном устройстве (см. §10).

### 6.3. Фильтрация (`filters.ts`) — то, что отличает «точную» карту от прыгающей

1. `accuracy > 150 м` → отбросить (кроме первой точки после холодного старта).
2. `mocked === true` (Android) → пометить флагом, не отбрасывать (родителю показать значок).
3. Скачок: если расстояние от предыдущей точки требует скорости > 200 км/ч → отбросить.
4. Джиттер: смещение меньше, чем `accuracy` предыдущей точки → не создавать новую точку истории, только обновить `capturedAt`.
5. Сглаживание: одномерный фильтр Калмана по координатам с весом `1/accuracy²` — 30 строк, убирает «дрожание» маркера на месте.

### 6.4. Офлайн-очередь

- `AsyncStorage` ключ `loc-queue`, кольцевой буфер на 500 точек (старые вытесняются).
- Отправка батчем по 25, экспоненциальный бэкофф 5с → 5мин.
- Успешный ответ → удаление ровно отправленных id (не `clear()` — за время
  запроса таск мог дописать новые).
- `expo-background-task` (min 15 мин) как страховка: разгребает очередь, если
  геотаск почему-то не запускался, но система будила приложение.

### 6.5. Разрешения — пошагово, иначе Android откажет

1. Экран-объяснение **до** системного диалога (prominent disclosure — требование Google Play).
2. `requestForegroundPermissionsAsync()`.
3. Только после `granted` — `requestBackgroundPermissionsAsync()`.
4. Android 11+: система не покажет «Разрешить всегда» в диалоге — нужен переход
   в настройки, `Linking.openSettings()` с объяснением.
5. `Location.hasServicesEnabledAsync()` — GPS может быть выключен целиком.
6. Состояние разрешения писать в каждую точку и в `childLocations` → родитель
   видит «ребёнок отключил геолокацию», а не пустую карту.

### 6.6. app.json

```jsonc
"ios": {
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription": "Чтобы родители видели, где ты находишься.",
    "NSLocationAlwaysAndWhenInUseUsageDescription": "Чтобы родители видели твоё местоположение, даже когда приложение закрыто.",
    "UIBackgroundModes": ["location", "fetch", "processing"]
  }
},
"android": {
  "permissions": [
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_LOCATION"
  ],
  "config": { "googleMaps": { "apiKey": "<из GCP-проекта childrenevolvenext>" } }
},
"plugins": [
  ["expo-location", {
    "locationAlwaysAndWhenInUsePermission": "Чтобы родители видели, где ты находишься.",
    "isAndroidBackgroundLocationEnabled": true,
    "isAndroidForegroundServiceEnabled": true
  }]
]
```

Google Maps API key — в EAS Secrets, не в git (см. [SECRETS.md](SECRETS.md)).

---

## 7. Mobile — сторона родителя (карта)

**Карта:** `react-native-maps` (≥ 1.20, поддерживает new architecture).
iOS — Apple Maps, ключ не нужен; Android — Google Maps, нужен API-ключ.
Альтернатива `expo-maps` пока сырая, брать не рекомендую.

```
mobile/src/screens/parent/MapScreen.tsx
mobile/src/components/parent/ChildMarker.tsx     # аватар + пульсация + круг точности
mobile/src/components/parent/ChildLocationSheet.tsx  # нижний список детей
mobile/src/hooks/useChildrenLocations.ts
```

**Размещение.** У родителя уже 5 табов. Добавляем шестой — «Карта» между
«Дети» и «Подтверждения», иконка `map` / `map-outline`. Шесть табов на телефоне
помещаются, но подписи станут тесными. Альтернатива — экран в стеке с входом
с `HomeScreen` и с карточки ребёнка; фича частая, поэтому таб предпочтительнее.
Решение за вами, код меняется в двух строках
[ParentNavigator.tsx](mobile/src/navigation/ParentNavigator.tsx#L18-L24).

**Функциональность экрана:**
- Маркеры детей: аватар в кружке (`childProfile.avatarUrl`), окружность точности
  (`<Circle radius={accuracy}/>`), серый маркер если данные старше 15 минут.
- Автофрейминг: `fitToCoordinates` по всем детям при первом рендере; далее не
  трогаем камеру, чтобы не выдёргивать пользователя из ручного зума.
- Нижний лист: список детей — имя, «5 мин назад», адрес
  (`Location.reverseGeocodeAsync` **на устройстве родителя** — бесплатно, без
  Geocoding API), батарея, значок «геолокация отключена» / «подделка координат».
- Тап по ребёнку → `animateToRegion` на его точку.
- «История за сегодня» → `Polyline` по `/history`, точки прореживаются
  (Douglas–Peucker) до ~200 на трек.
- Обновление: `useQuery` с `refetchInterval: 20_000`, **только когда экран
  сфокусирован** (`useFocusEffect` + `refetchIntervalInBackground: false`) —
  иначе фон родителя тоже начнёт жечь батарею и трафик.
- Пустые состояния: «Ребёнок ещё не разрешил геолокацию» с кнопкой «Отправить
  напоминание» (создаёт запись в `notifications`).

Экран ребёнка (прозрачность — требование сторов и просто честность): в
`ProfileScreen` блок «Геолокация: включена, родители видят твоё местоположение»
+ ссылка на объяснение. Скрытая слежка через App Store не пройдёт.

---

## 8. Приватность и публикация в сторах

Это отдельный пункт, потому что он реально блокирует релиз.

- **Google Play**: фоновая геолокация требует заполнения Location Permissions
  Declaration + видео-демонстрации сценария. Family safety — одобряемая
  категория, но декларация обязательна, ревью занимает до двух недель.
- **App Store 5.1.1**: нужны внятные purpose strings (уже в п.6.6),
  `showsBackgroundLocationIndicator: true`, и ребёнок должен видеть, что его
  отслеживают. Приложение в категории Kids — дополнительное внимание ревьюера.
- **Политика конфиденциальности**: обновить — какие геоданные, срок хранения
  (`historyDays`, по умолчанию 7), кто видит (только родители своей семьи).
- Мастер-выключатель на семью и per-child — уже заложен в `locationSettings`.
- История сама удаляется через TTL, отдельной «кнопки удалить всё» тоже стоит
  добавить (`DELETE /locations/children/:id/history`).

---

## 9. Фазы

| Фаза | Содержание | Статус |
|---|---|---|
| **P0. Фундамент** | Device-token (`/auth/device-token`, `DeviceTokenGuard`, SecureStore), зависимости, app.json, `app.config.js` для Maps key | ✅ сделано |
| **P1. Backend** | `LocationsModule`: `/batch`, `/children`, `/history`, `/settings`, `/refresh`, валидация, throttle, индексы | ✅ сделано |
| **P2. Отправка (ребёнок)** | `tracker.ts`, `storage.ts`, `sync.ts`, `filters.ts`, `permissions.ts`, экран «Геолокация», автоподъём трекинга при запуске | ✅ сделано |
| **P3. Карта (родитель)** | `MapScreen`, маркеры с аватарами, круги точности, карточки детей, трек за день, вкладка «Карта», переключатели в настройках | ✅ сделано |
| **P4. Плюсы** | Геозоны (`startGeofencingAsync`, до 20 регионов на iOS) «дом/школа» + уведомления, silent push «обновить сейчас» (нужен `expo-notifications` + FCM/APNs), карта в вебе | ⬜ не начато, 3–4 дня |

Осталось до запуска на реальных устройствах — §12: это не код, а конфигурация
облака и сборка dev-клиента.

---

## 10. Проверка качества

**Что меряем.**
- Медианная `accuracy` принятых точек — цель < 50 м в городе.
- Доля «протухших» детей (последняя точка > 30 мин) при включённом шеринге — цель < 5 %.
- Расход батареи за 12 ч — цель < 8 % (обязательно замерить: расчёт не заменяет
  измерение на живом устройстве).
- Доля точек, доставленных с задержкой > 5 мин (показатель работы очереди).

Первые два — считаем на бэкенде и выводим в `/health` или в аналитику;
без этого «работает ли фон» узнаётся только из жалоб.

**Как тестируем.**
- iOS Simulator: Features → Location → City Run / кастомный GPX-маршрут.
- Android Emulator: Extended controls → Location → Routes playback.
- Реальный сценарий: телефон в кармане, приложение свёрнуто, экран заблокирован,
  прогулка 30 минут → сверяем трек.
- Отдельно: авиарежим 20 минут → возврат сети → очередь долилась без дублей.
- Отдельно: убить приложение свайпом (iOS перезапускает геотаск, Android — через
  foreground service; проверить обе платформы).
- Отдельно: устройство сутки без открытия приложения → device-token не протух.

---

## 11. Что где лежит (после реализации)

**Backend**

| Файл | Роль |
|---|---|
| `backend/src/auth/device-token.service.ts` | Выпуск/проверка/отзыв долгоживущих токенов устройств |
| `backend/src/common/guards/device-token.guard.ts` | Пускает только на приём геоточек |
| `backend/src/locations/locations.service.ts` | Приём батчей, чтение для карты, история, настройки |
| `backend/src/locations/location-rules.ts` | Чистые правила отсева (покрыты `location-rules.spec.ts`, 12 тестов) |
| `backend/src/locations/locations.controller.ts` | Родительские и детские эндпоинты |
| `backend/src/locations/locations.ingest.controller.ts` | `POST /locations/batch` |

**Mobile — отправка (ребёнок)**

| Файл | Роль |
|---|---|
| `mobile/src/location/tracker.ts` | `defineTask`, профили точности, старт/стоп, разовый фикс |
| `mobile/src/location/filters.ts` | Отсев джиттера и телепортов, Калман, heartbeat |
| `mobile/src/location/sync.ts` | Батчи, бэкофф, перевыпуск токена на 401 |
| `mobile/src/location/storage.ts` | Очередь и состояние трекера (AsyncStorage + SecureStore) |
| `mobile/src/location/permissions.ts` | Пошаговый запрос разрешений |
| `mobile/src/screens/child/LocationSharingScreen.tsx` | Что видят родители + починка разрешений |

**Mobile — карта (родитель)**

| Файл | Роль |
|---|---|
| `mobile/src/screens/parent/MapScreen.tsx` | Карта, маркеры, карточки, трек |
| `mobile/src/components/parent/ChildMarker.tsx` | Маркер с аватаром и индикацией «протухло» |
| `mobile/src/hooks/useChildrenLocations.ts` | Опрос только при фокусе экрана |

---

## 12. Что нужно сделать руками до первого запуска

Кода это не требует, но без этого фича не поедет.

1. **Индексы Firestore** — добавлены в `firestore.indexes.json`, задеплоить:
   `firebase deploy --only firestore:indexes`
2. **TTL-политика** на `locationPoints.expiresAt` — иначе история копится вечно:
   ```bash
   gcloud firestore fields ttls update expiresAt \
     --collection-group=locationPoints --enable-ttl
   ```
3. **Google Maps API key для Android** (iOS не нужен):
   `eas secret:create --name GOOGLE_MAPS_ANDROID_KEY --value <ключ>`
   Ключ из GCP-проекта `childrenevolvenext`, ограничить по package name + SHA-1.
4. **Development build** — в Expo Go фон не работает:
   `eas build --profile development --platform android` (и `ios`).
   В проекте включена новая архитектура (`newArchEnabled: true`), а
   `react-native-maps` 1.20 живёт под ней только через Legacy Interop Layer —
   за это отвечает [mobile/react-native.config.js](mobile/react-native.config.js).
   Без него сборка проходит, но карта рендерится пустым местом, поэтому первый
   же билд надо проверить глазами.
5. **Google Play**: заполнить Location Permissions Declaration и записать видео
   сценария. Ревью до двух недель — подавать заранее, а не в день релиза.
6. **Политика конфиденциальности**: добавить раздел о геоданных (что собираем,
   срок хранения 7 дней, кто видит).

---

## 13. Решения, которые нужны от вас

Реализовано по дефолтам ниже — поменять любой из них дёшево.

1. **Карта — шестой таб** у родителя (не экран в стеке). Подписи вкладок
   уменьшены до 10 pt, иначе «Подтверждения» не помещается.
2. **История — 7 дней** по умолчанию, поле `historyDays` настраивается до 30.
3. **Геозоны — в P4**, не в MVP: тянут за собой push-уведомления.
4. **Device-token**, а не полноценный refresh-token — узкий скоуп, меньше риска.
5. **Веб-карта не делалась** — только мобильное приложение.
6. **Ребёнок не может выключить шеринг** — только родитель в настройках. Ребёнок
   видит статус и может починить разрешения.
