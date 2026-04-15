# Подготовка к деплою — Kids Motivation

## Структура проекта

- **backend/** — NestJS API (Firestore, JWT, раздача SPA)
- **web/** — React + Vite SPA
- **docs/** — документация (в т.ч. DEPLOY_ISPMANAGER.md)

## Быстрый деплой (одна команда)

```bash
# Сборка фронта и упаковка архива для загрузки на сервер
npm run deploy:pack
```

Создаётся `deploy.tar.gz`: исходники backend, собранный `web/dist`, без `node_modules`, `.env` и секретов.

## Пошаговая подготовка

### 1. Переменные окружения

**Backend** (см. `backend/.env.example`):

- `JWT_SECRET` — секрет для JWT (обязательно, не менее 32 символов)
- `JWT_EXPIRES_IN` — срок жизни токена (например `7d`)
- `FRONTEND_ENABLED=true` — раздавать SPA с бэкенда
- `FRONTEND_BUILD_PATH` — путь к `web/dist` (абсолютный или относительно `backend/`)
- `FIREBASE_SA_PATH` или `FIREBASE_SA_JSON` — ключ Firebase (Firestore + Storage)
- `PORT` — порт (на продакшене обычно задаёт хостинг)

**Frontend** (см. `web/.env.example`):

- `VITE_API_URL` — для продакшена при раздаче с того же домена **оставьте пустым** (относительные запросы к API)

### 2. Сборка

```bash
# Только фронт (результат в web/dist)
npm run build:web

# Только бэкенд (результат в backend/dist)
npm run build:backend

# Всё сразу
npm run build
```

### 3. Локальная проверка продакшен-режима

```bash
# Сборка фронта
cd web && npm run build && cd ..

# Запуск бэкенда с раздачей SPA (из корня проекта)
export FRONTEND_ENABLED=true
export FRONTEND_BUILD_PATH=$PWD/web/dist
cd backend && npm run build && node dist/main.js
```

Откройте `http://localhost:3000` — должен открыться фронт и работать API с того же порта.

### 4. Деплой на сервер (ISPmanager и др.)

1. Соберите фронт: `npm run build:web`
2. Создайте архив: `npm run deploy:pack` (или вручную упакуйте backend + web без секретов и node_modules)
3. Загрузите архив на сервер и распакуйте
4. На сервере:
   - Секреты храните **вне папки проекта**, чтобы не терять их при перезаливке архива:  
     `/home/pf246008/evolvenext.net/.secrets/children.env` и  
     `/home/pf246008/evolvenext.net/.secrets/firebase-sa.json`
   - В каталоге backend: `npm ci --production` и `npm run build`
   - Запуск: **`node server.js`** (из папки backend).  
     `server.js` подгружает env из `backend/.env` или из `.secrets/children.env`, затем запускает NestJS.  
     В ISPmanager укажите скрипт запуска: **`server.js`** (рабочая директория — backend).
5. При необходимости создайте симлинк:  
   `ln -sf /home/pf246008/evolvenext.net/.secrets/children.env backend/.env`  
   Права: `chmod 700 .secrets`, `chmod 600 .secrets/children.env .secrets/firebase-sa.json`

Подробности для ISPmanager: **docs/DEPLOY_ISPMANAGER.md**. Стандарт для children.evolvenext.net: **docs/DEPLOY_ISPMANAGER_CHILDREN.md**.

### 5. Диагностика после деплоя

- **GET /health** — общий статус (ok, firebase, frontend, uptime)
- **GET /frontend/status** — включён ли фронт, найден ли build, список проверенных путей
- **GET /diagnostics** — cwd, portPresent, envFileUsed, firebaseAdminResolvable, secretsPathsExist

Проверка синтаксиса перед запуском: в backend выполните `npm run check` (вызовет `node --check dist/main.js`).

**Не запускать `npm start` вручную на проде** — иначе занят порт/сокет и при следующем старте через ISPmanager будет EADDRINUSE или 502. Ручной тест — только с другим портом: `PORT=3001 node dist/main.js`.

## Чек-лист перед деплоем

- [ ] В backend заданы `JWT_SECRET` и при необходимости Firebase
- [ ] Фронт собран: есть `web/dist/index.html`
- [ ] В продакшене `VITE_API_URL` не задан (или пустой), если SPA и API на одном домене
- [ ] Файлы `.env`, `serviceAccountKey.json`, `.secrets/` не попадают в архив и репозиторий
- [ ] На сервере после распаковки выполнен `npm ci` и `npm run build` в `backend/`

---

## Git-based деплой

Альтернатива архиву — пуллить свежий код прямо на сервере через `git`.

### Первичная настройка на сервере (один раз)

```bash
# 1. Склонировать репозиторий в нужный путь
git clone git@github.com:<org>/<repo>.git /home/pf246008/evolvenext.net/children
cd /home/pf246008/evolvenext.net/children

# 2. Поднять секреты (вне репозитория!)
mkdir -p /home/pf246008/evolvenext.net/.secrets
chmod 700 /home/pf246008/evolvenext.net/.secrets
# положить children.env и firebase-sa.json внутрь .secrets/
ln -sf /home/pf246008/evolvenext.net/.secrets/children.env backend/.env

# 3. Первая сборка
./scripts/deploy.sh main
```

### Обычный деплой

На сервере:

```bash
cd /home/pf246008/evolvenext.net/children
./scripts/deploy.sh            # деплой ветки main
./scripts/deploy.sh production # или другой ветки
```

`scripts/deploy.sh` делает:

1. `git fetch` + `git reset --hard origin/<branch>` — обновляет код.
2. `npm ci` + `npm run build` для web и backend.
3. Копирует `web/dist` → `frontend/build` (бэкенд раздаёт SPA отсюда).
4. Graceful restart через доступный process manager (PM2 → systemd → ISPmanager → supervisor).

Локальные изменения автоматически попадают в `git stash` (чтобы деплой не падал).

### Автоматический деплой через GitHub Actions

`.github/workflows/deploy.yml` деплоит на `push` в `main`. Нужны секреты в репозитории:

| Secret | Значение |
|---|---|
| `DEPLOY_HOST` | ssh-хост (`children.evolvenext.net`) |
| `DEPLOY_USER` | ssh-логин (`pf246008`) |
| `DEPLOY_SSH_KEY` | приватный ключ (id_ed25519) |
| `DEPLOY_PATH` | абсолютный путь до проекта |
| `DEPLOY_BRANCH` | *(опционально)* ветка, по умолчанию `main` |

На сервере — добавить публичный ключ деплой-пользователя в `~/.ssh/authorized_keys`.

---

## Автоматический перезапуск при падении

Чтобы сервис сам поднимался после краха, выбери **один** из вариантов:

### A) PM2 — рекомендуется, если есть права установить

```bash
npm i -g pm2
pm2 start scripts/ecosystem.config.js
pm2 save
pm2 startup      # выполнить выведенную команду от root
```

PM2 сам рестартит на exit ≠ 0, при утечке памяти (>600 MB в конфиге), и после ребута сервера. Конфиг: `scripts/ecosystem.config.js`.

### B) systemd — для root-доступных серверов

```bash
sudo cp scripts/children.service /etc/systemd/system/children.service
# подправь User, WorkingDirectory, EnvironmentFile, Environment=PORT=...
sudo systemctl daemon-reload
sudo systemctl enable --now children.service

# просмотр
systemctl status children.service
journalctl -u children.service -f
```

`Restart=always` + `RestartSec=5s` поднимет процесс после любого падения.
`StartLimitBurst=5 / StartLimitIntervalSec=120s` остановит бесконечный tight-loop при битом билде.

### C) ISPmanager

Встроенный менеджер процессов у ISPmanager сам перезапускает Node.js-приложение при падении. В панели:

- **Скрипт запуска:** `server.js`
- **Рабочая директория:** `backend`
- **Автозапуск:** включён

Для force-restart из `deploy.sh` используется `touch backend/tmp/restart.txt`.

### D) Bash-супервизор — если ничего выше недоступно

Чистый bash, без зависимостей. Работает на любом хостинге с shell-доступом:

```bash
# в screen / tmux / nohup
nohup ./scripts/auto-restart.sh >> backend/logs/supervisor.log 2>&1 &
```

`auto-restart.sh` перезапускает процесс на падении с экспоненциальным backoff (1s → 30s), сбрасывает счётчик если процесс прожил ≥60 секунд, пишет логи в `backend/logs/`.

PID супервизора: `backend/logs/children.pid` — `kill $(cat backend/logs/children.pid)` для корректной остановки.

### E) Внешний watchdog (дополнение к любому варианту выше)

`scripts/healthcheck.sh` стучится на `/health` и перезапускает сервис после N последовательных провалов. Запускать по крону:

```cron
* * * * * /home/pf246008/evolvenext.net/children/scripts/healthcheck.sh >> /home/pf246008/evolvenext.net/children/backend/logs/healthcheck.log 2>&1
```

Параметры через env: `HEALTH_URL`, `FAIL_THRESHOLD` (по умолчанию 3), `SERVICE_NAME`.

### Сравнение вариантов

| Вариант | Auto-restart на crash | После ребута | Нужны root-права |
|---|---|---|---|
| PM2 | ✅ | ✅ (`pm2 startup`) | нет (глобальная установка) |
| systemd | ✅ | ✅ | да |
| ISPmanager | ✅ | ✅ | нет |
| auto-restart.sh | ✅ | ❌ (нужен cron @reboot) | нет |
| healthcheck.sh | дополняет любой | — | нет |

**Рекомендация:** PM2 или systemd как основной менеджер + `healthcheck.sh` в cron как страховка.
