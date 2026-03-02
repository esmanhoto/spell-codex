import { Routes, Route, Navigate } from "react-router-dom"
import { NewGame } from "./pages/NewGame.tsx"
import { Game }    from "./pages/Game.tsx"
import { Login } from "./pages/Login.tsx"
import { useAuth } from "./auth.tsx"

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isLoading, isAuthenticated } = useAuth()
  if (isLoading) return <div className="page"><p>Loading...</p></div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function LoginRoute() {
  const { isLoading, isAuthenticated } = useAuth()
  if (isLoading) return <div className="page"><p>Loading...</p></div>
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Login />
}

export function App() {
  return (
    <Routes>
      <Route path="/login"      element={<LoginRoute />} />
      <Route path="/"           element={<RequireAuth><NewGame /></RequireAuth>} />
      <Route path="/game/:id"   element={<RequireAuth><Game /></RequireAuth>} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  )
}
