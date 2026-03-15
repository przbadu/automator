import { useCallback, useEffect, useState } from "react"

const MOBILE_BREAKPOINT = 768 // md breakpoint

function getIsMobile() {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
}

export function useSidebar() {
  const [open, setOpen] = useState(() => !getIsMobile())
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const onResize = () => {
      const mobile = getIsMobile()
      setIsMobile(mobile)
      // Auto-close sidebar when switching to mobile, auto-open on desktop
      setOpen(!mobile)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const toggle = useCallback(() => setOpen((prev) => !prev), [])
  const close = useCallback(() => setOpen(false), [])

  return { open, isMobile, toggle, close, setOpen }
}
