import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { LoginForm } from "@/components/auth/LoginForm"
import { SignUpForm } from "@/components/auth/SignUpForm"
import { ChatLayout } from "@/components/chat/ChatLayout"
import { SettingsPage } from "@/components/settings/SettingsPage"
import { DocumentsLayout } from "@/components/documents/DocumentsLayout"

type Route = "chat" | "settings" | "documents"

function getRouteFromHash(): Route {
  const hash = window.location.hash.replace("#", "")
  if (hash === "/settings") return "settings"
  if (hash === "/documents") return "documents"
  return "chat"
}

function AppShell({ user, onLogout }: { user: { id: string; email: string; created_at: string }; onLogout: () => void }) {
  const [route, setRoute] = useState<Route>(getRouteFromHash)

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const navigate = useCallback((target: Route) => {
    const hashMap: Record<Route, string> = { chat: "/", settings: "/settings", documents: "/documents" }
    window.location.hash = hashMap[target]
  }, [])

  if (route === "documents") {
    return (
      <DocumentsLayout
        onLogout={onLogout}
        userEmail={user.email}
        onNavigateToChat={() => navigate("chat")}
        onOpenSettings={() => navigate("settings")}
      />
    )
  }

  if (route === "settings") {
    return (
      <SettingsPage
        user={user}
        onLogout={onLogout}
        onNavigateToChat={() => navigate("chat")}
        onNavigateToDocuments={() => navigate("documents")}
      />
    )
  }

  return (
    <ChatLayout
      user={user}
      onLogout={onLogout}
      onOpenSettings={() => navigate("settings")}
      onOpenDocuments={() => navigate("documents")}
    />
  )
}

function App() {
  const { user, loading, login, signup, logout } = useAuth()
  const [authMode, setAuthMode] = useState<"login" | "signup">("login")

  return (
    <AuthGuard
      user={user}
      loading={loading}
      fallback={
        authMode === "login" ? (
          <LoginForm
            onLogin={login}
            onSwitchToSignUp={() => setAuthMode("signup")}
          />
        ) : (
          <SignUpForm
            onSignUp={signup}
            onSwitchToLogin={() => setAuthMode("login")}
          />
        )
      }
    >
      {user && <AppShell user={user} onLogout={logout} />}
    </AuthGuard>
  )
}

export default App
