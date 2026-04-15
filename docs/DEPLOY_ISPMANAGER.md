# Деплой на ISPmanager (Shared Hosting)

## Обзор

Этот документ описывает процесс деплоя проекта Node.js + React на shared hosting с ISPmanager через Unix socket.

## Требования

- ISPmanager с поддержкой Node.js приложений
- Доступ к `/home/<user>/.system/nodejs/` для создания Unix socket
- Доступ к файловой системе для размещения секретов

## Структура проекта

Секреты должны находиться **вне папки проекта**, чтобы не пропадать при перезаливке архива:

```
/home/pf246008/evolvenext.net/
  .secrets/                    # Официальное место секретов (НЕ в репозитории)
    children.env               # переменные окружения
    firebase-sa.json           # Firebase service account (если нужен)
  children/                    # или <site>/ — папка проекта (может перезаливаться)
    backend/
      server.js                # точка входа: загружает env, затем dist/main.js
      dist/
      node_modules/
      package.json
    web/
      dist/
      node_modules/
      package.json
    docs/
```

**Симлинк (рекомендуется):**  
`backend/.env` → `/home/pf246008/evolvenext.net/.secrets/children.env`  
Даже без симлинка бэкенд подхватит env из `.secrets/children.env` при старте.

## Шаг 1: Подготовка секретов

### 1.1 Создание директории для секретов (вне папки проекта)

```bash
mkdir -p /home/pf246008/evolvenext.net/.secrets
chmod 700 /home/pf246008/evolvenext.net/.secrets
```

### 1.2 Создание .env файла (children.env)

```bash
cat > /home/pf246008/evolvenext.net/.secrets/children.env <<EOF
# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="your-secret-key-here-min-32-chars"
JWT_EXPIRES_IN="1d"

# Firebase (optional)
FIREBASE_SA_PATH="/home/pf246008/evolvenext.net/.secrets/firebase-sa.json"

# Frontend
FRONTEND_ENABLED=true
FRONTEND_BUILD_PATH=/home/pf246008/evolvenext.net/children/web/dist

# Storage API (optional)
# STORAGE_API_KEY=your-api-key

# PORT устанавливается ISPmanager автоматически
EOF
chmod 600 /home/pf246008/evolvenext.net/.secrets/children.env
```

### 1.3 Симлинк в backend (опционально)

Чтобы backend подхватывал env из одного и того же файла при любом рабочем каталоге:

```bash
cd /home/pf246008/evolvenext.net/children/backend
ln -sf /home/pf246008/evolvenext.net/.secrets/children.env .env
```

Без симлинка `server.js` всё равно загрузит env из `/home/pf246008/evolvenext.net/.secrets/children.env`.

### 1.4 Firebase credentials (если используется)

```bash
cp serviceAccountKey.json /home/pf246008/evolvenext.net/.secrets/firebase-sa.json
chmod 600 /home/pf246008/evolvenext.net/.secrets/firebase-sa.json
```

**ВАЖНО:** Никогда не коммитьте файлы из `.secrets/` в репозиторий. Права: `.secrets` — 700, файлы внутри — 600.

## Шаг 2: Деплой кода

### 2.1 Загрузка архива проекта

1. Соберите frontend:
   ```bash
   cd web
   npm run build
   ```

2. Создайте архив проекта (без node_modules, dist, и секретов):
   ```bash
   tar -czf project.tar.gz \
     --exclude='node_modules' \
     --exclude='dist' \
     --exclude='build' \
     --exclude='*.db' \
     --exclude='.env' \
     --exclude='serviceAccount*.json' \
     --exclude='.secrets' \
     backend/ web/ docs/
   ```

3. Загрузите архив на сервер через ISPmanager или FTP

4. Распакуйте в рабочую директорию:
   ```bash
   cd /home/<user>/<site>
   tar -xzf project.tar.gz
   ```

### 2.2 Установка зависимостей

**ВАЖНО:** Всегда выполняйте `npm install` в директории `backend/`

```bash
cd /home/<user>/<site>/backend
npm install --production
```

Если нужны dev зависимости (для сборки):
```bash
npm install
npm run build
```

### 2.3 Сборка frontend (если еще не собрана)

```bash
cd /home/<user>/<site>/web
npm install
npm run build
```

## Шаг 3: Настройка Node.js приложения в ISPmanager

1. Зайдите в ISPmanager → **WWW → Node.js приложения**

2. Создайте новое приложение:
   - **Имя:** название приложения (например children)
   - **Путь к приложению:** `/home/pf246008/evolvenext.net/children/backend`
   - **Скрипт запуска:** **`node dist/main.js`** (env загружается в main.ts до бутстрапа Nest)
   - **Node.js версия:** 20.x или выше (`engines.node >= 20`)
   - **Переменные окружения** (при необходимости):
     ```
     NODE_ENV=production
     ```
   `PORT` задаётся ISPmanager (Unix socket или порт).

3. Сохраните настройки

4. **Перезапустите приложение** (обязательно после каждого деплоя!)

## Шаг 4: Проверка деплоя

### 4.1 Автоматическая проверка

```bash
cd /home/<user>/<site>/backend
bash scripts/verify-prod.sh <domain>
```

### 4.2 Ручная проверка и диагностика

1. Проверка синтаксиса (в backend):
   ```bash
   npm run check
   ```
   (выполняет `node --check server.js`)

2. Проверьте health:
   ```bash
   curl https://children.evolvenext.net/health
   ```
   Ожидается JSON с `ok: true`, `firebase`, `frontend`, `uptime`.

3. Статус фронта:
   ```bash
   curl https://children.evolvenext.net/frontend/status
   ```
   Показывает `enabled`, `found`, `buildPath`, `searchedPaths`.

4. Полная диагностика (cwd, env, firebase-admin, режим socket/port):
   ```bash
   curl https://children.evolvenext.net/diagnostics
   ```

## Типовые ошибки и решения

### 502 Bad Gateway

**Причина:** Приложение не запущено или упало при старте

**Решение:**
1. Проверьте логи в ISPmanager: **WWW → Node.js приложения → Логи**
2. Проверьте синтаксис:
   ```bash
   cd backend
   node --check dist/main.js
   ```
3. Проверьте наличие зависимостей:
   ```bash
   cd backend
   ls -la node_modules | head -20
   ```
4. Если `firebase-admin` отсутствует:
   ```bash
   cd backend
   npm install firebase-admin
   ```

### MODULE_NOT_FOUND

**Причина:** Отсутствует модуль в `node_modules`

**Решение:**
```bash
cd backend
npm install
```

Если модуль специфичный (например, `firebase-admin`):
```bash
npm install firebase-admin
```

### Build not found (frontend)

**Причина:** Frontend не собран или путь неправильный

**Решение:**
1. Соберите frontend:
   ```bash
   cd web
   npm run build
   ```

2. Проверьте, что `web/dist/index.html` существует

3. Установите `FRONTEND_BUILD_PATH` в `.secrets/kids-motivation.env`:
   ```
   FRONTEND_BUILD_PATH=/home/<user>/<site>/web/dist
   ```

4. Перезапустите приложение в ISPmanager

### SERVICE_DISABLED (Firebase)

**Причина:** Firebase API не включен в GCP Console

**Решение:**
1. Зайдите в [GCP Console](https://console.cloud.google.com)
2. Выберите проект
3. Включите **Firestore API** и **Cloud Storage API**
4. Перезапустите приложение

### PERMISSION_DENIED (Firebase)

**Причина:** Неправильные IAM роли для service account

**Решение:**
1. Проверьте service account в GCP Console
2. Убедитесь, что у него есть роль **Firebase Admin SDK Administrator Service Agent**
3. Проверьте файл `firebase-sa.json` в `.secrets/`

### Health endpoint returns ok:false

**Причина:** Firebase не инициализирован

**Решение:**
- Если Firebase не нужен, это нормально
- Если нужен, проверьте credentials и включите API (см. выше)

## Где находятся логи

### ISPmanager логи
- **WWW → Node.js приложения → Логи** (в веб-интерфейсе)
- Или файлы в `/home/<user>/logs/`

### Приложение логи
- Логи выводятся в stdout/stderr
- Доступны через ISPmanager интерфейс

### Socket файл
```
/home/<user>/.system/nodejs/<domain>.sock
```

## Порядок действий при деплое

1. **Сборка frontend:**
   ```bash
   cd web && npm run build
   ```

2. **Создание архива** (без секретов и node_modules)

3. **Загрузка архива** на сервер

4. **Распаковка** в рабочую директорию

5. **Установка зависимостей:**
   ```bash
   cd backend && npm install --production
   ```

6. **Сборка backend** (если не в архиве):
   ```bash
   cd backend && npm run build
   ```

7. **Проверка секретов:**
   - Убедитесь, что `.secrets/<project>.env` существует
   - Убедитесь, что `firebase-sa.json` существует (если нужен)

8. **Перезапуск приложения** в ISPmanager

9. **Проверка:**
   ```bash
   bash backend/scripts/verify-prod.sh <domain>
   ```

## Переменные окружения

### Обязательные
- `JWT_SECRET` - секретный ключ для JWT токенов
- `DATABASE_URL` - URL базы данных (для Prisma)

### Опциональные
- `FRONTEND_ENABLED=true` - включить обслуживание frontend
- `FRONTEND_BUILD_PATH=/path/to/build` - явный путь к build
- `FIREBASE_SA_PATH=/path/to/firebase-sa.json` - путь к Firebase credentials
- `FIREBASE_SA_JSON='{...}'` - Firebase credentials как JSON строка (env var)
- `PROJECT_NAME=kids-motivation` - имя проекта (для загрузки .env)
- `SITE_NAME=<site>` - имя сайта (для определения .secrets пути)

### Автоматически устанавливаемые ISPmanager
- `PORT` - порт приложения (через Unix socket)
- `NODE_ENV` - окружение (production)

## Безопасность

1. **Никогда не коммитьте секреты** в репозиторий
2. **Используйте `.gitignore`** для исключения:
   - `*.env`
   - `serviceAccount*.json`
   - `.secrets/`
   - `node_modules/`
3. **Устанавливайте правильные права** на секреты:
   ```bash
   chmod 700 .secrets
   chmod 600 .secrets/*.json
   ```
4. **Не логируйте секреты** - они автоматически маскируются

## Поддержка

При проблемах:
1. Проверьте логи в ISPmanager
2. Запустите `verify-prod.sh`
3. Проверьте `/health` endpoint
4. Проверьте `/` и `/frontend/status`
