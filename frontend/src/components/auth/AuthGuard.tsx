import type { ReactNode } from "react"
import type { User } from "@/types"

interface AuthGuardProps {
  user: User | null
  loading: boolean
  children: ReactNode
  fallback: ReactNode
}

export function AuthGuard({ user, loading, children, fallback }: AuthGuardProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return user ? <>{children}</> : <>{fallback}</>
}
