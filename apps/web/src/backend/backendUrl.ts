/**
 * The backend's absolute origin, or undefined for same-origin requests.
 * Production sets VITE_BACKEND_URL because the frontend (Vercel) and the backend (Render)
 * are different origins. Local dev leaves it unset and relies on Vite's dev-server proxy,
 * which makes `/api` and `/ws` same-origin.
 */
export function backendUrl(): string | undefined {
  return import.meta.env.VITE_BACKEND_URL as string | undefined
}
