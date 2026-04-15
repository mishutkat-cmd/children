#!/bin/bash

set -e

echo "🚀 Настройка Kids Motivation App"
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker не установлен${NC}"
    echo "Установите Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo -e "${GREEN}✅ Docker найден${NC}"

# Запуск PostgreSQL в Docker
echo -e "${YELLOW}📦 Запуск PostgreSQL в Docker...${NC}"
cd backend
docker-compose up -d

# Ожидание готовности PostgreSQL
echo -e "${YELLOW}⏳ Ожидание готовности PostgreSQL...${NC}"
sleep 5

for i in {1..30}; do
    if docker exec kids_motivation_db pg_isready -U postgres &> /dev/null; then
        echo -e "${GREEN}✅ PostgreSQL готов${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ PostgreSQL не запустился${NC}"
        exit 1
    fi
    sleep 1
done

# Создание миграций
echo -e "${YELLOW}🔄 Создание миграций базы данных...${NC}"
npx prisma migrate dev --name init || {
    echo -e "${YELLOW}Миграции уже существуют, пропускаем...${NC}"
}

echo -e "${GREEN}✅ База данных настроена${NC}"
echo ""

# Запуск Backend
echo -e "${YELLOW}🔧 Запуск Backend...${NC}"
npm run start:dev &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Ожидание запуска Backend
sleep 10

# Запуск Frontend
echo -e "${YELLOW}🌐 Запуск Frontend...${NC}"
cd ../web
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ ВСЕ ЗАПУЩЕНО!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "Backend:  http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo ""
echo "Откройте http://localhost:3001 в браузере"
echo ""
echo "Для остановки:"
echo "  docker-compose down (остановить базу данных)"
echo "  pkill -f 'nest start' (остановить backend)"
echo "  pkill -f 'vite' (остановить frontend)"
echo ""

wait
