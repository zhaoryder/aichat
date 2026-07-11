import './styles/globals.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { Layout } from './components/layout/Layout'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import { HomePage } from './pages/HomePage'
import { ChatPage } from './pages/ChatPage'
import { ForumPage } from './pages/ForumPage'
import { ForumTopicPage } from './pages/ForumTopicPage'
import { AgentsSquarePage } from './pages/AgentsSquarePage'
import { CreateAgentPage } from './pages/CreateAgentPage'
import { EditAgentPage } from './pages/EditAgentPage'
import { StudioPage } from './pages/StudioPage'
import { ScriptStudioPage } from './pages/studio/ScriptStudioPage'
import { VideoStudioPage } from './pages/studio/VideoStudioPage'
import { ImageStudioPage } from './pages/studio/ImageStudioPage'
import { ArticleStudioPage } from './pages/studio/ArticleStudioPage'
import { GameStudioPage } from './pages/studio/GameStudioPage'
import { VoiceStudioPage } from './pages/studio/VoiceStudioPage'
import { ProfilePage } from './pages/ProfilePage'
import { SharePage } from './pages/SharePage'
import { AdminPage } from './pages/AdminPage'

// 应用根组件：AuthProvider 包裹在 BrowserRouter 外层
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 带主布局的页面 */}
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/chat/:agentId"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route path="/agents" element={<AgentsSquarePage />} />
            <Route
              path="/agents/create"
              element={
                <ProtectedRoute>
                  <CreateAgentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents/:id/edit"
              element={
                <ProtectedRoute>
                  <EditAgentPage />
                </ProtectedRoute>
              }
            />
            <Route path="/forum" element={<ForumPage />} />
            <Route path="/forum/topic/:id" element={<ForumTopicPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route
              path="/studio/script"
              element={
                <ProtectedRoute>
                  <ScriptStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/video"
              element={
                <ProtectedRoute>
                  <VideoStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/image"
              element={
                <ProtectedRoute>
                  <ImageStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/article"
              element={
                <ProtectedRoute>
                  <ArticleStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/game"
              element={
                <ProtectedRoute>
                  <GameStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/voice"
              element={
                <ProtectedRoute>
                  <VoiceStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute admin>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* 独立页面（不带主布局） */}
          <Route path="/share/:slug" element={<SharePage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
