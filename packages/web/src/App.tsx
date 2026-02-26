import { Routes, Route, Navigate } from "react-router-dom"
import { NewGame } from "./pages/NewGame.tsx"
import { Game }    from "./pages/Game.tsx"

export function App() {
  return (
    <Routes>
      <Route path="/"           element={<NewGame />} />
      <Route path="/game/:id"   element={<Game />} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  )
}
