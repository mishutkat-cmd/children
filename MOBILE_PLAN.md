# 📱 MOBILE_PLAN.md — Конвертация Children в React Native

> **Инструкция для Claude Code:** Читай этот файл в начале КАЖДОЙ сессии.
> После завершения сессии обновляй статусы задач ниже.
> НЕ начинай новую задачу пока предыдущая не помечена ✅

---

## 🏗️ Архитектура проекта

**Веб (существующий):**
- Frontend: React + Vite + TypeScript + Material UI
- Backend: NestJS (Node.js) + Prisma + SQLite/PostgreSQL
- Auth: Firebase Authentication
- Хранилище: Firebase Storage

**Мобильное (создаём):**
- Фреймворк: React Native + Expo
- Навигация: React Navigation v6
- UI: React Native Paper (аналог MUI) + кастомные компоненты
- Auth: Firebase Authentication (тот же)
- API: тот же NestJS backend
- Папка: `/mobile` в корне проекта

---

## 🎨 Дизайн-система (переносим точно)

```
Цвета (из theme.ts):
  primary:    #007AFF  (Apple Blue)
  secondary:  #5856D6  (Purple)
  success:    #34C759  (Green)
  warning:    #FF9500  (Orange)
  error:      #FF3B30  (Red)
  bg:         #F5F5F7  (Light Gray)
  paper:      #FFFFFF
  text:       #1D1D1F
  textSecond: #86868B

Шрифт: SF Pro Display (iOS системный)
Border radius: 12-16px
Стиль: Apple минимализм 2022
Тени: мягкие (0 2px 8px rgba(0,0,0,0.06))
```

---

## 👥 Роли пользователей

- **PARENT** — родитель, управляет задачами и наградами
- **CHILD** — ребёнок, выполняет задачи и получает награды

---

## 📋 Все экраны проекта

### Auth (общие)
- [ ] LoginScreen
- [ ] RegisterScreen

### Child (экраны ребёнка)
- [ ] ChildDashboard — главная ребёнка
- [ ] ChildTasks — список задач
- [ ] ChildChallenges — челленджи
- [ ] ChildAchievements — достижения
- [ ] ChildWishlist — список желаний
- [ ] ChildProfile — профиль
- [ ] CharacterSelection — выбор персонажа
- [ ] ChildGoals — цели
- [ ] ChildHistory — история

### Parent (экраны родителя)
- [ ] ParentHome — главная родителя
- [ ] ParentTasks — управление задачами
- [ ] ParentChildren — список детей
- [ ] ParentRewards — награды
- [ ] ParentBadges — бейджи
- [ ] ParentChallenges — челленджи
- [ ] ParentWishlist — список желаний
- [ ] ParentApprovals — подтверждения
- [ ] ParentConversion — конвертация
- [ ] ParentSettings — настройки
- [ ] ParentAnalytics — аналитика

---

## 🗂️ Сессии работы

---

### СЕССИЯ 1 — Инициализация проекта ✅
**Статус:** ✅ ЗАВЕРШЕНА

**Задача:** Создать базовую структуру React Native проекта

**Команды:**
```bash
cd /Users/mishashubin/Desktop/Work/Children
npx create-expo-app mobile --template blank-typescript
cd mobile
npx expo install react-native-paper react-native-safe-area-context react-native-screens
npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack @react-navigation/native-stack
npx expo install expo-status-bar expo-font
npx expo install @react-native-firebase/app @react-native-firebase/auth
npm install axios zustand
```

**Создать файлы:**
- `mobile/src/theme/colors.ts` — цвета из дизайн-системы выше
- `mobile/src/theme/typography.ts` — типография
- `mobile/src/theme/index.ts` — экспорт темы
- `mobile/src/navigation/AppNavigator.tsx` — главная навигация
- `mobile/src/navigation/AuthNavigator.tsx` — навигация авторизации
- `mobile/src/navigation/ChildNavigator.tsx` — таб-навигация ребёнка
- `mobile/src/navigation/ParentNavigator.tsx` — таб-навигация родителя
- `mobile/src/store/authStore.ts` — Zustand стор (скопировать логику из ../frontend/src/store/authStore.ts)
- `mobile/src/lib/api.ts` — API клиент (скопировать из ../frontend/src/lib/api.ts)
- `mobile/src/lib/firebase.ts` — Firebase конфиг

**Результат сессии:** Проект запускается `npx expo start`, показывает заглушку

---

### СЕССИЯ 2 — Auth экраны ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 1 ✅

**Задача:** Создать LoginScreen и RegisterScreen

**Источники для копирования:**
- `../frontend/src/pages/auth/LoginPage.tsx`
- `../frontend/src/pages/auth/RegisterPage.tsx`

**Требования к дизайну:**
- Сохранить Apple-стиль (белый фон, синие кнопки #007AFF)
- Поля ввода с border-radius 8, border #D2D2D7
- Кнопки с border-radius 8, высота 50px
- Логотип/название приложения сверху
- SafeAreaView + KeyboardAvoidingView

**Создать файлы:**
- `mobile/src/screens/auth/LoginScreen.tsx`
- `mobile/src/screens/auth/RegisterScreen.tsx`
- `mobile/src/components/ui/Button.tsx` — переиспользуемая кнопка
- `mobile/src/components/ui/Input.tsx` — переиспользуемый input

**Результат сессии:** Можно войти и зарегистрироваться через Firebase

---

### СЕССИЯ 3 — Child Dashboard ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 2 ✅

**Задача:** Главный экран ребёнка

**Источник:** `../frontend/src/pages/child/Dashboard.tsx`

**Требования:**
- Приветствие с именем и аватаром
- Карточка с балансом (энергия/очки)
- Карточки активных задач (TaskCard)
- Pull-to-refresh
- Bottom tab навигация (5 вкладок: Главная, Задачи, Достижения, Желания, Профиль)

**Создать файлы:**
- `mobile/src/screens/child/DashboardScreen.tsx`
- `mobile/src/components/child/TaskCard.tsx`
- `mobile/src/components/child/BalanceCard.tsx`
- `mobile/src/hooks/useTasks.ts` (из ../frontend/src/hooks/useTasks.ts)

---

### СЕССИЯ 4 — Child Tasks ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 3 ✅

**Источник:** `../frontend/src/pages/child/Tasks.tsx`

**Создать файлы:**
- `mobile/src/screens/child/TasksScreen.tsx`
- `mobile/src/components/child/TaskListItem.tsx`

---

### СЕССИЯ 5 — Child Achievements + Wishlist ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 4 ✅

**Источники:**
- `../frontend/src/pages/child/Achievements.tsx`
- `../frontend/src/pages/child/Wishlist.tsx`

**Создать файлы:**
- `mobile/src/screens/child/AchievementsScreen.tsx`
- `mobile/src/screens/child/WishlistScreen.tsx`
- `mobile/src/components/child/BadgeCard.tsx`
- `mobile/src/components/child/WishCard.tsx`

---

### СЕССИЯ 6 — Child Profile + Challenges ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 5 ✅

**Источники:**
- `../frontend/src/pages/child/Profile.tsx`
- `../frontend/src/pages/child/Challenges.tsx`
- `../frontend/src/pages/child/CharacterSelection.tsx`

**Создать файлы:**
- `mobile/src/screens/child/ProfileScreen.tsx`
- `mobile/src/screens/child/ChallengesScreen.tsx`
- `mobile/src/screens/child/CharacterSelectionScreen.tsx`

---

### СЕССИЯ 7 — Parent Home + Children ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 6 ✅

**Задача:** Начало родительской части

**Источники:**
- `../frontend/src/pages/parent/Home.tsx`
- `../frontend/src/pages/parent/Children.tsx`

**Bottom tabs родителя:** Главная, Задачи, Дети, Подтверждения, Настройки

**Создать файлы:**
- `mobile/src/screens/parent/HomeScreen.tsx`
- `mobile/src/screens/parent/ChildrenScreen.tsx`
- `mobile/src/components/parent/ChildCard.tsx`
- `mobile/src/navigation/ParentNavigator.tsx` (обновить)

---

### СЕССИЯ 8 — Parent Tasks + Rewards ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 7 ✅

**Источники:**
- `../frontend/src/pages/parent/Tasks.tsx`
- `../frontend/src/pages/parent/Rewards.tsx`

**Создать файлы:**
- `mobile/src/screens/parent/TasksScreen.tsx`
- `mobile/src/screens/parent/RewardsScreen.tsx`
- `mobile/src/components/parent/ParentTaskCard.tsx`
- `mobile/src/components/parent/RewardCard.tsx`

---

### СЕССИЯ 9 — Parent Approvals + Badges ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 8 ✅

**Источники:**
- `../frontend/src/pages/parent/Approvals.tsx`
- `../frontend/src/pages/parent/Badges.tsx`

**Создать файлы:**
- `mobile/src/screens/parent/ApprovalsScreen.tsx`
- `mobile/src/screens/parent/BadgesScreen.tsx`

---

### СЕССИЯ 10 — Parent Settings + Analytics ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 9 ✅

**Источники:**
- `../frontend/src/pages/parent/Settings.tsx`
- `../frontend/src/pages/parent/Analytics.tsx`

**Создать файлы:**
- `mobile/src/screens/parent/SettingsScreen.tsx`
- `mobile/src/screens/parent/AnalyticsScreen.tsx`

---

### СЕССИЯ 11 — Анимации и полировка ✅
**Статус:** ✅ ЗАВЕРШЕНА
**Зависит от:** Сессия 10 ✅

**Задача:** Добавить анимации из веб-версии

**Источники для вдохновения:**
- `../frontend/src/components/PointsAnimation.tsx`
- `../frontend/src/components/Celebration.tsx`
- `../frontend/src/components/EnergyFlyAnimation.tsx`

**Инструменты:** `react-native-reanimated`, `react-native-lottie`

---

### СЕССИЯ 12 — Подготовка к App Store ✅
**Статус:** ✅ ЗАВЕРШЕНА (конфигурация готова, физическая сборка остаётся за пользователем)
**Зависит от:** Сессия 11 ✅

**Задача:**
- Настроить `app.json` (название, иконка, splash screen)
- `eas build --platform ios`
- Проверить все permissions (camera, notifications)
- Тест на симуляторе iOS

---

## 🔧 Правила для Claude Code

1. **Каждая сессия = одна задача** из списка выше
2. **Начинай сессию** словами: "Читаю MOBILE_PLAN.md... Текущая задача: Сессия X"
3. **Копируй логику** из веб-версии, не изобретай заново
4. **Сохраняй дизайн** — цвета, радиусы, тени точно из дизайн-системы выше
5. **После завершения** сессии обнови статус с ⬜ на ✅
6. **Не трогай** папку `frontend/` — только читаешь оттуда

---

## 📁 Структура мобильного проекта

```
mobile/
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   ├── child/
│   │   └── parent/
│   ├── components/
│   │   ├── ui/          # общие: Button, Input, Card
│   │   ├── child/       # компоненты ребёнка
│   │   └── parent/      # компоненты родителя
│   ├── navigation/
│   ├── hooks/           # копия из frontend/src/hooks/
│   ├── store/           # Zustand (копия authStore)
│   ├── lib/             # api.ts, firebase.ts
│   └── theme/           # colors, typography
├── assets/
├── app.json
└── App.tsx
```

---

*Документ создан автоматически на основе анализа проекта Children*
*Последнее обновление: 2026-04-09*
