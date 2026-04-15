# Деплой Children (children.evolvenext.net) на ISPmanager

## Обзор

Backend — NestJS. Точка входа: **`node dist/main.js`**. Env загружается до бутстрапа Nest из `config/env.ts` (порядок: `.../children/backend/.env` → `.../.secrets/children.env` → `process.cwd()/.env`). PORT задаётся ISPmanager (порт или путь к Unix socket).

## Обязательные эндпоинты

| Путь | Описание |
|------|----------|
| **GET /health** | Всегда 200. `{ ok: true, ts, uptime, env: { firebaseEnabled, frontendEnabled } }` + прежние поля для совместимости |
| **GET /diagnostics** | Минимальная диагностика: `cwd`, `portPresent`, `envFileUsed`, `firebaseAdminResolvable`, `secretsPathsExist` (true/false, без содержимого) |
| **GET /frontend/status** | `enabled`, `found`, `buildPath`, `indexPath`, `searchedPaths` (existsDir/existsIndex). Если билда нет → `found: false`, `reason: "build path missing"`. Не зависит от Firebase |
| **GET /api/v1/storage/health** | Без auth. При отключённом Firebase → `{ ok: false, firebase: false, reason }` |

## Загрузка env (до бутстрапа Nest)

Файл **`src/config/env.ts`** импортируется **первой строкой** в `main.ts`.

Порядок загрузки:

1. `/home/pf246008/evolvenext.net/children/backend/.env` (симлинк допускается)
2. `/home/pf246008/evolvenext.net/.secrets/children.env`
3. `process.cwd()/.env` (для локальной разработки)

Если ни один не найден — только warning в лог, приложение не падает. Секреты в лог не выводятся. Экспортируется **`envFileUsed`** (string | null) для **/diagnostics**.

Поддерживаемые ключи (без вывода значений в лог):

- `FIREBASE_SA_PATH` / `FIREBASE_SERVICE_ACCOUNT_PATH`
- `FIREBASE_SA_JSON` / `FIREBASE_SERVICE_ACCOUNT_JSON`
- `STORAGE_API_KEY`
- `FRONTEND_ENABLED`
- `FRONTEND_BUILD_PATH`
- `PORT` (устанавливается ISPmanager)

## Backend: запуск на сокете ISPmanager

### main.ts

- Первая строка: `import './config/env'`
- PORT: `const port = process.env.PORT ?? '3000'` — **без parseInt** (PORT может быть путём к сокету)
- Перед listen: `console.log("[Server] PORT:", port, "| mode:", port.includes('/') ? "socket" : "port");`
- `app.listen(port)` обёрнут в try/catch: при ошибке — лог + `process.exit(1)`

### package.json (backend)

- **`"start": "node dist/main.js"`** — основной прод-старт для ISPmanager
- **`"start:prod": "node dist/main.js"`**
- **`"check": "node --check dist/main.js || true"`** (опционально)
- **postinstall не добавлять** — сборка описана в документации

В ISPmanager указать: скрипт запуска **`node dist/main.js`** (или `npm start`), рабочая директория — **backend**.

## Firebase (не ломать старт)

- **firebase-admin** и **dotenv** в **dependencies** (не devDependencies)
- В **firebase.service.ts**: `require('firebase-admin')` внутри try/catch; креды: приоритет **FIREBASE_SA_JSON** (или FIREBASE_SERVICE_ACCOUNT_JSON), иначе **FIREBASE_SA_PATH** (или FIREBASE_SERVICE_ACCOUNT_PATH). Любая ошибка → `enabled=false`, `reason=...`, без throw
- В **/health** и **/diagnostics** показывать `firebaseEnabled` и `reason`, без содержимого JSON

### Storage API

- **GET /api/v1/storage/health** — без auth
- **POST/GET/DELETE** `/api/v1/storage/set|get|delete`: если задан **STORAGE_API_KEY** — требовать **x-api-key**; если не задан — разрешать без auth (в /diagnostics можно явно указывать, что auth выключен)

## Раздача фронта

- **FRONTEND_ENABLED=true** не должен ломать старт
- Билд считается найденным только если **директория существует** и есть **index.html**

Исходники фронта — **web/** (Vite, React). Сборка: `./scripts/build-frontend.sh` → выход в **frontend/build/**.

Поиск билда (единый алгоритм):

1. **FRONTEND_BUILD_PATH** (если задан) — на сервере: `/home/pf246008/evolvenext.net/children/frontend/build`
2. Абсолютные пути на сервере (приоритет): `.../children/frontend/build`, `.../children/frontend/dist`, затем `.../children/web/build`, `.../children/web/dist`
3. Относительно cwd backend: `../frontend/build`, `../frontend/dist`, `../web/build`, `../web/dist`, затем `frontend/...`, `backend/frontend/...`

**/frontend/status** отдаёт: `enabled`, `found`, `buildPath`, `indexPath`, `searchedPaths` с `existsDir`/`existsIndex`. Если билда нет → `found: false`, `reason: "build path missing"`.

Поведение **/**:

- Если билд найден — раздача статики + SPA fallback (не-API маршруты → index.html)
- Если билд не найден — **/** отдаёт HTML-страницу backend со ссылками: **/health**, **/diagnostics**, **/frontend/status**, **/api/v1/storage/health**

## Секреты (вне папки проекта)

- `/home/pf246008/evolvenext.net/.secrets/children.env` — переменные окружения
- `/home/pf246008/evolvenext.net/.secrets/firebase-sa.json` — Firebase (если нужен)
- Права: `.secrets` — 700, файлы — 600
- Симлинк (опционально): `backend/.env` → `.../.secrets/children.env`

## Запуск в ISPmanager (обязательно production-start)

- **Command:** `node dist/main.js`
- **Working directory:** `/home/pf246008/evolvenext.net/children/backend`
- **PORT:** ISPmanager должен передавать `PORT=/home/pf246008/.system/nodejs/children.evolvenext.net.sock`. Если PORT не задан или равен 3000 — backend будет слушать TCP :3000 и получит EADDRINUSE.
- **Важно:** В .env или children.env **не должно быть** `PORT=3000` — это переопределит сокет ISPmanager.
- **Ручной запуск:** `export PORT=/home/pf246008/.system/nodejs/children.evolvenext.net.sock; node dist/main.js`

## Команды секретов

```bash
mkdir -p /home/pf246008/evolvenext.net/.secrets
chmod 700 /home/pf246008/evolvenext.net/.secrets

# children.env
cat > /home/pf246008/evolvenext.net/.secrets/children.env <<'EOF'
JWT_SECRET=your-secret-min-32-chars
DATABASE_URL=...
FRONTEND_ENABLED=true
FRONTEND_BUILD_PATH=/home/pf246008/evolvenext.net/children/frontend/build
# PORT задаёт ISPmanager (путь к сокету). НЕ указывать PORT=3000 — это ломает unix socket!
EOF
chmod 600 /home/pf246008/evolvenext.net/.secrets/children.env

# Firebase (если нужен)
# cp firebase-sa.json /home/pf246008/evolvenext.net/.secrets/firebase-sa.json
# chmod 600 /home/pf246008/evolvenext.net/.secrets/firebase-sa.json
```

## Команды сборки

```bash
# Backend
cd /home/pf246008/evolvenext.net/children/backend
npm ci          # Установка зависимостей (включая devDependencies для сборки)
npm run build   # Компиляция TypeScript → dist/

# Frontend
cd /home/pf246008/evolvenext.net/children
./scripts/build-frontend.sh
# или: cd web && npm ci && npm run build
```

## Деплой backend (полный цикл)

```bash
cd /home/pf246008/evolvenext.net/children/backend

# Вариант 1: автоматический скрипт (рекомендуется)
./scripts/deploy.sh

# Вариант 2: вручную
pkill -f "node dist/main.js" || true
rm -f /home/pf246008/.system/nodejs/children.evolvenext.net.sock
npm ci --omit=dev
export PORT=/home/pf246008/.system/nodejs/children.evolvenext.net.sock
export NODE_ENV=production
nohup node dist/main.js >> /tmp/children-backend.out 2>&1 &

# Проверка health
SOCKET_PATH=$PORT npm run health:local
# или: curl --unix-socket $PORT http://localhost/health
```

## Проверка после деплоя

```bash
# Сокет существует?
ls -la /home/pf246008/.system/nodejs/children.evolvenext.net.sock

# Health check через сокет
curl --unix-socket /home/pf246008/.system/nodejs/children.evolvenext.net.sock http://localhost/health

# Health check через домен
curl -s https://children.evolvenext.net/health | head -5
```

## Диагностика (оперативно)

```bash
# Сокет приложения
ls -la /home/pf246008/.system/nodejs/*.sock | grep -i children || echo "NO SOCK"

# Логи Node.js приложения
tail -n 200 /home/pf246008/.system/nodejs/logs/children.evolvenext.net.log

# Эндпоинты (после запуска)
curl -s https://children.evolvenext.net/health | head -5
curl -s https://children.evolvenext.net/diagnostics | head -20
curl -s https://children.evolvenext.net/frontend/status | head -10
```

## Оперативный чек-лист 502

| Причина | Что проверить | Решение |
|--------|----------------|--------|
| **EADDRINUSE :::3000** | Сокет не создаётся, backend слушает TCP 3000 | PORT не задан или =3000. Удалить `PORT=3000` из .env. Убедиться что ISPmanager передаёт `PORT=/path/to/sock`. Перед стартом: `rm -f /path/to/sock`. |
| **PORT не сокет** | В логах: `Expected unix socket, got numeric port` | В ISPmanager задать PORT как путь к сокету. В .env **не должно быть** PORT=3000. |
| **bcrypt ERR_DLOPEN_FAILED** | В логах: `ERR_DLOPEN_FAILED` / `bcrypt` | Использовать **bcryptjs**, не bcrypt: `npm remove bcrypt && npm i bcryptjs && npm i -D @types/bcryptjs`. prestart проверяет отсутствие bcrypt. |
| **dist/main.js не существует** | Нет файла `backend/dist/main.js` | В каталоге backend выполнить `npm run build`. |
| **Зависимость не установлена** | В логах: `Cannot find module` | В каталоге backend выполнить `npm ci`. Для `dotenv`: это devDependency, не требуется в production (есть fallback-парсер). |
| **Секреты не найдены** | В логах: `No .env file found` | Создать `.secrets/children.env` или симлинк `backend/.env` → `.../.secrets/children.env`. |
| **Ручной запуск занял порт** | EADDRINUSE при старте через ISPmanager | Не запускать приложение вручную на проде. Перезапускать только через панель ISPmanager. |

## Порядок деплоя

1. Сборка: в **backend** — `npm run build`, в **frontend** — `npm run build` (если раздаётся фронт).
2. Секреты в **.secrets/** (вне папки проекта), права 700/600.
3. В ISPmanager: приложение Node.js, **working dir** — `.../children/backend`, **command** — `node dist/main.js`.
4. Проверка: **GET /health**, **GET /diagnostics**, **GET /frontend/status**.

Подробнее: **DEPLOY_ISPMANAGER.md**, **DEPLOY.md**.
