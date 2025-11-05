import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseBrowserClient: SupabaseClient | null = null

export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  )
}

export function createBrowserClient() {
  // Return existing client if already created (singleton pattern)
  if (supabaseBrowserClient) {
    return supabaseBrowserClient
  }

  // Create new client only if one doesn't exist
  supabaseBrowserClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  )

  return supabaseBrowserClient
}
