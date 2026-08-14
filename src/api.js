import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(
  url && key && import.meta.env.VITE_SAFERIDE_API_URL,
);
export const supabase = configured ? createClient(url, key) : null;
export async function api(path, session, options = {}) {
  const response = await fetch(
    `${import.meta.env.VITE_SAFERIDE_API_URL}/admin/api${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers || {}),
      },
    },
  );
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || "Request failed");
  return body;
}
