# Kids Motivation Web App

Исходники фронтенда приложения Kids Motivation (React + TypeScript + Vite).

## Технологии

- **React 18** - UI библиотека
- **TypeScript** - типизация
- **Vite** - сборщик (output: `build/`)
- **Material-UI** - компоненты
- **React Query** - управление состоянием сервера
- **Zustand** - локальное состояние
- **React Router** - маршрутизация
- **Axios** - HTTP клиент

## Установка

```bash
npm install
```

## Запуск (разработка)

```bash
npm run dev
```

Приложение будет доступно на http://localhost:5173

## Сборка (production)

Рекомендуется использовать скрипт из корня проекта:

```bash
# Из корня children/
./scripts/build-frontend.sh
```

Скрипт:
1. Устанавливает зависимости в `web/`
2. Собирает проект (`npm run build` → `web/build/`)
3. Копирует результат в `frontend/build/`

Или вручную:

```bash
cd web
npm ci
npm run build
# Затем скопировать web/build/* в frontend/build/
```

## Структура проекта

```
children/
├── web/                    # Исходники (этот каталог)
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── frontend/               # Production build
│   └── build/
│       ├── index.html
│       └── assets/
└── backend/
```

## Деплой на сервер

```bash
# На сервере (ISPmanager)
cd /home/pf246008/evolvenext.net/children
./scripts/build-frontend.sh

# Проверка
ls -la frontend/build/index.html
```

Переменные в `.secrets/children.env`:

```
FRONTEND_ENABLED=true
FRONTEND_BUILD_PATH=/home/pf246008/evolvenext.net/children/frontend/build
```

## API

В production API-запросы используют относительные пути (без хардкода домена).
В development API проксируется на `http://localhost:3000`.

## Структура исходников

- `src/pages/` - страницы приложения
- `src/components/` - переиспользуемые компоненты
- `src/store/` - Zustand stores
- `src/lib/` - утилиты и API клиент

## Backend

Убедитесь, что backend запущен:
- Development: http://localhost:3000
- Production: раздаётся с того же домена через NestJS
