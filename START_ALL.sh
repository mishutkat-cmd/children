#!/bin/bash

# Скрипт для запуска всего проекта

echo "🚀 Запуск Kids Motivation App"
echo ""

# Проверка PostgreSQL
echo "📊 Проверка PostgreSQL..."
if command -v pg_isready &> /dev/null; then
    if pg_isready -h localhost -p 5432 &> /dev/null; then
        echo "✅ PostgreSQL запущен"
    else
        echo "❌ PostgreSQL не запущен"
        echo "Запустите: brew services start postgresql@15"
        exit 1
    fi
else
    echo "❌ PostgreSQL не установлен"
    echo "Установите: brew install postgresql@15"
    exit 1
fi

# Проверка базы данных
echo "📦 Проверка базы данных..."
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw kids_motivation; then
    echo "✅ База данных существует"
else
    echo "📝 Создание базы данных..."
    createdb kids_motivation 2>/dev/null || {
        echo "Ошибка создания базы данных"
        exit 1
    }
    echo "✅ База данных создана"
fi

# Проверка миграций
echo "🔄 Проверка миграций..."
cd "$(dirname "$0")/backend"
if [ ! -d "prisma/migrations" ]; then
    echo "📝 Создание миграций..."
    npx prisma migrate dev --name init
fi

# Запуск Backend
echo "🔧 Запуск Backend..."
npm run start:dev &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Запуск Frontend
echo "🌐 Запуск Frontend..."
cd "../web"
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "✅ Все запущено!"
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo ""
echo "Для остановки нажмите Ctrl+C"

# Ожидание
wait
