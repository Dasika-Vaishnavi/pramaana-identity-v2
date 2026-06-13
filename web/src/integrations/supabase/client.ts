/**
 * Supabase compatibility shim for the unified Pramaana repo.
 *
 * V2's pages call supabase.functions.invoke("edge-function-name", { body })
 * to talk to 15 Supabase Edge Functions. In the unified repo, those Edge
 * Functions are replaced by the V3 Rust backend (tee-server + voprf-vault).
 *
 * This shim intercepts those calls and routes them to the V3 app server's
 * REST API, preserving V2's page code with minimal changes.
 *
 * Crypto-spine safety: this is a pure routing layer. All crypto runs in V3's
 * Rust backend. This shim never touches key material or PII — it forwards
 * JSON payloads over localhost HTTP.
 */

const PRAMAANA_API = import.meta.env.VITE_PRAMAANA_API_URL || 'http://127.0.0.1:8080';

/**
 * Route map: V2 Edge Function name → V3 API endpoint.
 * Functions not in this map return a stub response indicating the feature
 * is now handled by the V3 crypto spine.
 */
const ROUTE_MAP: Record<string, string> = {
  'palc-enroll': '/api/enroll',
  'register-on-chain': '/api/enroll',  // registration is part of enrollment in V3
  'asc-prove': '/api/claim',
  'asc-verify': '/api/state',
  'verify-zk-proof': '/api/state',
  'authenticate': '/api/state',
  'demo-sign-challenge': '/api/state',
  'sybil-check': '/api/state',
  'analyze-wallet': '/api/state',
  'analyze-transaction': '/api/state',
  'analyze-contract': '/api/state',
  'bind-wallet': '/api/state',
  'multichain-register': '/api/state',
  'zk-membership-proof': '/api/claim',
  'pramaana-agent': '/api/state',
};

interface InvokeResult {
  data: any;
  error: null | { message: string };
}

class SupabaseCompatFunctions {
  async invoke(functionName: string, options?: { body?: any }): Promise<InvokeResult> {
    const route = ROUTE_MAP[functionName];

    if (!route) {
      console.warn(`[pramaana-shim] Unknown edge function: ${functionName}, returning stub`);
      return {
        data: { status: 'stub', message: `${functionName} is replaced by V3 crypto spine` },
        error: null,
      };
    }

    try {
      const res = await fetch(`${PRAMAANA_API}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        return { data: null, error: { message: `${functionName} → ${route}: ${res.status} ${text}` } };
      }

      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      // Backend not running — return graceful error so the UI still loads
      console.warn(`[pramaana-shim] Backend not reachable for ${functionName}:`, err.message);
      return {
        data: null,
        error: { message: `Backend not running. Start with: make demo (${err.message})` },
      };
    }
  }
}

class SupabaseCompatChannel {
  on(_event: string, _filter: any, _callback: any) { return this; }
  subscribe() { return this; }
}

/**
 * Drop-in replacement for the Supabase client.
 * V2 pages import { supabase } from "@/integrations/supabase/client"
 * and call supabase.functions.invoke() — this object provides that interface.
 */
export const supabase = {
  functions: new SupabaseCompatFunctions(),
  channel: (_name: string) => new SupabaseCompatChannel(),
  removeChannel: (_channel: any) => {},
};