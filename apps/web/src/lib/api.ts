import { supabase } from "./supabase";
import { createDemoEvent, demoSession, demoStore } from "./demo";

export const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (demoSession.value) return demoApiRequest<T>(path, init);
  const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const headers = new Headers(init.headers);
  if (init.body instanceof Blob) headers.set("Content-Type", init.body.type || "application/octet-stream");
  else if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (sessionData.session?.access_token) headers.set("Authorization", `Bearer ${sessionData.session.access_token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.error?.message || "No se pudo completar la solicitud.", response.status, payload?.error?.code);
  }
  return payload as T;
}

function demoApiRequest<T>(path: string, init: RequestInit): T {
  const method = init.method?.toUpperCase() || "GET";
  const body = init.body ? JSON.parse(String(init.body)) as Record<string, string> : {};
  if (path === "/api/v1/me" && method === "GET") {
    return { data: { id: "demo-owner", email: "demo@example.com", role: "superuser", planCode: "free", subscriptionStatus: "free", canManageGalas: true } } as T;
  }
  const eventRoot = "/api/v1/events";
  if (path === eventRoot && method === "GET") return { data: demoStore.events.map((event) => ({ ...event })) } as T;
  if (path === eventRoot && method === "POST") {
    if (demoStore.events.some((event) => event.slug === body.slug)) {
      throw new ApiError("Ese identificador ya está en uso.", 409, "slug_taken");
    }
    return { data: createDemoEvent(body as { name: string; slug: string; description: string; timezone: string }) } as T;
  }

  const match = path.match(/^\/api\/v1\/events\/([^/]+)$/);
  if (match) {
    const event = demoStore.events.find((item) => item.id === match[1]);
    if (!event) throw new ApiError("No encontramos esa gala.", 404, "event_not_found");
    if (method === "GET") return { data: { ...event } } as T;
    if (method === "PATCH") {
      if (demoStore.events.some((item) => item.id !== event.id && item.slug === body.slug)) {
        throw new ApiError("Ese identificador ya está en uso.", 409, "slug_taken");
      }
      Object.assign(event, body);
      return { data: { ...event } } as T;
    }
  }
  throw new ApiError("Esta acción todavía no está disponible en la demo.", 501, "demo_action_unavailable");
}
