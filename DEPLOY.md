# Деплой Kids Motivation

Текущий прод: **https://children.evolvenext.net** (VPS, Caddy + PM2).

## Текущая инфраструктура

| Что | Значение |
|---|---|
| Хост | `91.227.181.162` (LAN: `10.20.17.240`) |
| SSH | порт **22022**, пользователь `odoo` |
| Путь проекта | `/home/odoo/crmproject/children` |
| Process manager | **PM2** (`scripts/ecosystem.config.js`), автозапуск через `pm2-odoo.service` |
| Бэкенд слушает | TCP `localhost:3010` (можно переключить на unix-socket через `PORT=`) |
| Reverse proxy | **Caddy** (`/etc/caddy/Caddyfile`) → `localhost:3010` |
| TLS | Let's Encrypt, авто через Caddy |
| CI | GitHub Actions, `.github/workflows/deploy.yml`, push в `main` → автодеплой |

## Структура проекта

- `backend/` — NestJS API (Firestore, JWT, опционально раздаёт SPA)
- `web/` — React + Vite SPA
- `frontend/build/` — куда `scripts/deploy.sh` копирует собранный фронт; бэкенд раздаёт его при `FRONTEND_ENABLED=true`
- `scripts/deploy.sh` — git-based деплой (запускается на сервере; то же делает CI)
- `scripts/ecosystem.config.js` — PM2 конфиг
- `scripts/children.service` — шаблон systemd unit (на текущем проде не используется)
- `scripts/auto-restart.sh`, `scripts/healthcheck.sh` — fallback/страховки

## Переменные окружения

`backend/.env` (на проде это симлинк на секрет вне репо, см. ниже):

| Ключ | Назначение |
|---|---|
| `JWT_SECRET` | секрет для JWT, ≥ 32 символа (на проде сгенерирован `openssl rand -hex 48`) |
| `JWT_EXPIRES_IN` | например `7d` |
| `FRONTEND_ENABLED` | `true` чтобы бэкенд раздавал SPA |
| `FRONTEND_BUILD_PATH` | абсолютный путь к `frontend/build` (на проде `/home/odoo/crmproject/children/frontend/build`) |
| `FIREBASE_SA_PATH` | абсолютный путь к Firebase service account JSON |
| `FIREBASE_SA_JSON` | альтернатива: содержимое JSON прямо в env |
| `PORT` | TCP-порт (`3010`) **или** путь к unix-сокету (начинается с `/` или `.sock`) |
| `NODE_ENV` | `production` |

`web/.env` для Vite-сборки: `VITE_API_URL` оставить пустым — фронт ходит относительными путями к API (тот же домен).

## Секреты на сервере

Хранятся **вне репо**, чтобы не теряться при `git reset --hard`:

```
~/.secrets/children/
  children.env       (chmod 600)
  firebase-sa.json   (chmod 600)
```

Каталог `~/.secrets` — `chmod 700`. В `backend/`:

```bash
ln -sfn ~/.secrets/children/children.env backend/.env
```

Симлинк коммитить не нужно — он в `.gitignore`.

## Локальная проверка прод-режима

```bash
# Сборка фронта
cd web && npm ci && npm run build && cd ..

# Сборка и запуск бэкенда с раздачей SPA
cd backend && npm ci && npm run build
FRONTEND_ENABLED=true \
FRONTEND_BUILD_PATH=$PWD/../frontend/build \
PORT=3000 \
node dist/main.js
```

Открыть `http://localhost:3000` — должна открыться SPA, `/health` отвечает JSON-ом.

## Деплой через GitHub Actions

`push` в `main` → автоматический деплой на сервер. Workflow: `.github/workflows/deploy.yml`.

Нужны GitHub Secrets:

| Secret | Текущее значение |
|---|---|
| `DEPLOY_HOST` | `91.227.181.162` |
| `DEPLOY_PORT` | `22022` |
| `DEPLOY_USER` | `odoo` |
| `DEPLOY_PATH` | `/home/odoo/crmproject/children` |
| `DEPLOY_SSH_KEY` | приватный ключ деплоя (публичный лежит в `~odoo/.ssh/authorized_keys`) |
| `DEPLOY_BRANCH` | (опц., по умолчанию `main`) |

CI запускает на сервере `scripts/deploy.sh main`.

## Ручной деплой на сервере

```bash
ssh -p 22022 odoo@91.227.181.162
cd /home/odoo/crmproject/children
./scripts/deploy.sh           # ветка main
./scripts/deploy.sh production
```

`scripts/deploy.sh` делает:

1. `git fetch` + `git reset --hard origin/<branch>` (локальные изменения в `git stash`)
2. `npm ci` + `npm run build` для `web/` и `backend/`
3. Копирует `web/build` → `frontend/build`
4. Перезапускает сервис: PM2 → systemd → ISPmanager touch → fallback

## Автоперезапуск

На текущем сервере: **PM2** + `pm2 save` + `pm2-odoo.service` (systemd-юнит, поднимающий PM2 после ребута).

```bash
# первичная настройка PM2 (уже сделано на текущем проде)
pm2 start scripts/ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u odoo --hp /home/odoo
```

PM2 рестартит на crash, при `max_memory_restart=600M`, и после ребута сервера. Конфиг — `scripts/ecosystem.config.js`.

Альтернативы (для других хостов):
- `scripts/children.service` — systemd unit (шаблон, заполнить плейсхолдеры).
- `scripts/auto-restart.sh` — bash-супервизор, без зависимостей.
- `scripts/healthcheck.sh` — внешний watchdog по `/health`, в cron как страховка.

## Caddy vhost

В `/etc/caddy/Caddyfile`:

```caddy
children.evolvenext.net {
    encode gzip
    reverse_proxy localhost:3010
    request_body {
        max_size 50MB
    }
}
```

Reload без даунтайма: `sudo systemctl reload caddy`. TLS Caddy получает сам у Let's Encrypt — отдельной настройки не нужно.

## Диагностика

- **GET `/health`** — общий статус (`firebase`, `frontend`, `uptime`)
- **GET `/diagnostics`** — `cwd`, `portPresent`, `envFileUsed`, `firebaseAdminResolvable`, `secretsPathsExist`, `frontendConfiguredPathExists`, `mode` (port/socket)
- **GET `/frontend/status`** — найден ли SPA build, какие пути проверены

```bash
curl https://children.evolvenext.net/health
curl https://children.evolvenext.net/diagnostics
curl https://children.evolvenext.net/frontend/status
```

PM2:

```bash
pm2 list
pm2 logs children --lines 50
pm2 describe children
```

Caddy:

```bash
sudo journalctl -u caddy -f
```

## Чек-лист перед первым деплоем нового окружения

- [ ] Node 20+, PM2, git, reverse-proxy (Caddy/nginx) установлены
- [ ] DNS домена указывает на сервер
- [ ] SSH-ключ деплой-юзера добавлен в `authorized_keys`
- [ ] Секреты лежат вне репо в `~/.secrets/<project>/`, права `700`/`600`
- [ ] `backend/.env` — симлинк на секрет
- [ ] GitHub Secrets обновлены (`DEPLOY_HOST/PORT/USER/PATH/SSH_KEY`)
- [ ] `pm2 save` сделан, `pm2-<user>.service` enabled

## Опциональный ISPmanager-режим

Поддержка осталась как fallback (бэкенд умеет слушать на unix-сокете, см. `backend/src/main.ts`), но активной конфигурации сейчас нет. Если переезжать обратно на shared-хостинг с ISPmanager — задайте `PORT=/path/to/socket.sock`, скрипт запуска `server.js`, рабочая директория `backend/`.
