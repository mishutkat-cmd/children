# Быстрый старт

## 1. Создайте файл .env в папке backend

Создайте файл `backend/.env` со следующим содержимым:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kids_motivation?schema=public"
JWT_SECRET="dev-secret-key-change-in-production"
JWT_EXPIRES_IN="1d"
JWT_REFRESH_SECRET="dev-refresh-secret-key"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
```

**Важно:** Измените `DATABASE_URL` на ваши реальные данные PostgreSQL, если они отличаются.

## 2. Убедитесь, что PostgreSQL запущен и база данных создана

```bash
# Создайте базу данных (если еще не создана)
createdb kids_motivation
```

## 3. Запустите миграции

```bash
cd backend
npx prisma migrate dev --name init
```

## 4. Запустите backend

```bash
npm run start:dev
```

Backend будет доступен на http://localhost:3000

## 5. В другом терминале запустите frontend

```bash
cd frontend
npm install
npm start
```

## Альтернатива: SQLite для быстрой разработки

Если у вас нет PostgreSQL, можно временно использовать SQLite:

1. Измените в `prisma/schema.prisma`:
```
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

2. Затем:
```bash
npx prisma migrate dev --name init
```
