#!/bin/bash

# Скрипт установки PostgreSQL на macOS

echo "🐘 Установка PostgreSQL..."

# Проверка Homebrew
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew не установлен. Установите с https://brew.sh"
    exit 1
fi

# Установка PostgreSQL
echo "📦 Установка PostgreSQL через Homebrew..."
brew install postgresql@15

# Запуск PostgreSQL
echo "🚀 Запуск PostgreSQL..."
brew services start postgresql@15

# Ожидание запуска
sleep 3

# Создание базы данных
echo "📊 Создание базы данных..."
createdb kids_motivation 2>/dev/null || echo "База данных уже существует или ошибка создания"

echo "✅ PostgreSQL установлен и запущен!"
echo ""
echo "Следующие шаги:"
echo "1. cd backend"
echo "2. npx prisma migrate dev --name init"
echo "3. npm run start:dev"
