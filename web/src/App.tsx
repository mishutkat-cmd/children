import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { CircularProgress, Box } from '@mui/material'

// Auth pages — small, loaded eagerly
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Child pages — lazy loaded
const ChildDashboard = lazy(() => import('./pages/child/Dashboard'))
const ChildTasks = lazy(() => import('./pages/child/Tasks'))
const ChildChallenges = lazy(() => import('./pages/child/Challenges'))
const ChildWishlist = lazy(() => import('./pages/child/Wishlist'))
const ChildProfile = lazy(() => import('./pages/child/Profile'))
const ChildAchievements = lazy(() => import('./pages/child/Achievements'))

// Parent pages — lazy loaded
const ParentHome = lazy(() => import('./pages/parent/Home'))
const ParentTasks = lazy(() => import('./pages/parent/Tasks'))
const ParentConversion = lazy(() => import('./pages/parent/Conversion'))
const ParentSettings = lazy(() => import('./pages/parent/Settings'))
const ParentChildren = lazy(() => import('./pages/parent/Children'))
const ParentChallenges = lazy(() => import('./pages/parent/Challenges'))
const ParentBadges = lazy(() => import('./pages/parent/Badges'))
const ParentWishlist = lazy(() => import('./pages/parent/Wishlist'))
const ParentApprovals = lazy(() => import('./pages/parent/Approvals'))
const ChildBadges = lazy(() => import('./pages/parent/ChildBadges'))
const ParentReports = lazy(() => import('./pages/parent/Reports'))

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress />
    </Box>
  )
}

function PrivateRoute({ children, role }: { children: React.ReactNode; role?: 'PARENT' | 'CHILD' }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  if (role && user?.role !== role) {
    return <Navigate to={user?.role === 'PARENT' ? '/parent' : '/child'} replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/child" element={<PrivateRoute role="CHILD"><ChildDashboard /></PrivateRoute>} />
        <Route path="/child/tasks" element={<PrivateRoute role="CHILD"><ChildTasks /></PrivateRoute>} />
        <Route path="/child/challenges" element={<PrivateRoute role="CHILD"><ChildChallenges /></PrivateRoute>} />
        <Route path="/child/achievements" element={<PrivateRoute role="CHILD"><ChildAchievements /></PrivateRoute>} />
        <Route path="/child/wishlist" element={<PrivateRoute role="CHILD"><ChildWishlist /></PrivateRoute>} />
        <Route path="/child/profile" element={<PrivateRoute role="CHILD"><ChildProfile /></PrivateRoute>} />

        <Route path="/parent" element={<PrivateRoute role="PARENT"><ParentHome /></PrivateRoute>} />
        <Route path="/parent/tasks" element={<PrivateRoute role="PARENT"><ParentTasks /></PrivateRoute>} />
        <Route path="/parent/conversion" element={<PrivateRoute role="PARENT"><ParentConversion /></PrivateRoute>} />
        <Route path="/parent/settings" element={<PrivateRoute role="PARENT"><ParentSettings /></PrivateRoute>} />
        <Route path="/parent/children" element={<PrivateRoute role="PARENT"><ParentChildren /></PrivateRoute>} />
        <Route path="/parent/children/:childId/badges" element={<PrivateRoute role="PARENT"><ChildBadges /></PrivateRoute>} />
        <Route path="/parent/challenges" element={<PrivateRoute role="PARENT"><ParentChallenges /></PrivateRoute>} />
        <Route path="/parent/badges" element={<PrivateRoute role="PARENT"><ParentBadges /></PrivateRoute>} />
        <Route path="/parent/wishlist" element={<PrivateRoute role="PARENT"><ParentWishlist /></PrivateRoute>} />
        <Route path="/parent/approvals" element={<PrivateRoute role="PARENT"><ParentApprovals /></PrivateRoute>} />
        <Route path="/parent/reports" element={<PrivateRoute role="PARENT"><ParentReports /></PrivateRoute>} />

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
