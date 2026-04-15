# Kids Motivation App

Веб-приложение для мотивации детей через систему заданий, баллов и наград.

## 🚀 Быстрый старт

### 1. Установите зависимости

```bash
# Backend
cd backend
npm install

# Frontend (Web)
cd ../web
npm install
```

### 2. Запустите проект

**Терминал 1 - Backend:**
```bash
cd backend
npm run start:dev
```

**Терминал 2 - Frontend:**
```bash
cd web
npm run dev
```

### 3. Откройте приложение

- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:3000

## 📁 Структура проекта

```
/Children
├── backend/          # NestJS API (Node.js)
│   ├── prisma/       # База данных (SQLite локально)
│   └── src/          # Исходный код
└── web/              # React веб-приложение
    └── src/          # Исходный код
```

## 🗄️ База данных

**Текущая:** SQLite (локально, файл `backend/prisma/dev.db`)

**Планируется:** Firebase Firestore

База данных создается автоматически при первом запуске. Файл базы данных: `backend/prisma/dev.db`

## 🎯 Использование

1. Откройте http://localhost:3001
2. Зарегистрируйтесь (выберите роль PARENT или CHILD)
3. Войдите в систему
4. Начните использовать приложение!

## 🔥 Миграция на Firebase

Проект подготовлен для миграции на Firebase. См. `FIREBASE_MIGRATION.md`

## 📝 Технологии

### Backend
- Node.js + NestJS
- TypeScript
- Prisma ORM
- SQLite (локально)

### Frontend
- React 18
- TypeScript
- Vite
- Material-UI
- React Query
- Zustand

## 🛠️ Разработка

### Создание миграций
```bash
cd backend
npx prisma migrate dev --name migration_name
```

### Просмотр базы данных
```bash
cd backend
npx prisma studio
```

### Сборка для продакшена
```bash
# Backend
cd backend
npm run build

# Frontend
cd web
npm run build
```

## 🚀 Деплой на ISPmanager

1. **В backend:**
   ```bash
   cd backend
   npm ci
   npm run build
   ```

2. **В ISPmanager (Node.js приложение):**
   - **Рабочая директория:** путь к папке `backend` (например `/home/pf246008/evolvenext.net/children/backend`)
   - **Команда запуска:** `node dist/main.js`
   - **PORT** задаёт ISPmanager (путь к Unix-сокету или порт)

3. **Переменные окружения и секреты:**
   - Секреты хранить вне папки проекта: `/home/<user>/<domain>/.secrets/<project>.env` (например `.secrets/children.env`)
   - Симлинк в backend: `ln -sf /path/to/.secrets/children.env backend/.env`
   - Env загружается до старта Nest: сначала `backend/.env`, затем `.secrets/children.env` (второй переопределяет первый)

Подробнее: **docs/DEPLOY_ISPMANAGER_CHILDREN.md**, **DEPLOY.md**.

## ✅ Статус

- ✅ Backend работает на http://localhost:3000
- ✅ Frontend работает на http://localhost:3001
- ✅ База данных SQLite настроена
- ✅ Готово к миграции на Firebase

---

**Готово к использованию!** 🎉
