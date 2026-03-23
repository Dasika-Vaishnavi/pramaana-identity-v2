import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sha3_512 } from "@noble/hashes/sha3";
import { hkdf } from "@noble/hashes/hkdf";
import { createMlKem1024 } from "mlkem";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const startTime = performance.now();

    const { pii_input } = await req.json();
    if (!pii_input || typeof pii_input !== "string" || pii_input.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "pii_input is required and must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // PALC.Commit(PII, pp) — Pramaana Paper §3.1
    // ═══════════════════════════════════════════════════════════

    // Step 1: HASH — H(PII) via SHA3-512
    const t1 = performance.now();
    const piiBytes = new TextEncoder().encode(pii_input);
    const piiHash = sha3_512(piiBytes);
    const hashMs = performance.now() - t1;

    // Step 2: DERIVE SEED — HKDF-SHA3-512 (RFC 5869)
    const t2 = performance.now();
    const salt = new Uint8Array(64); // 0^512 as specified
    const info = new TextEncoder().encode("pramaana-v1");
    const seed = hkdf(sha3_512, piiHash, salt, info, 64); // 64-byte seed
    const hkdfMs = performance.now() - t2;

    // Step 3: KYBER-1024 deterministic KeyGen from seed
    const t3 = performance.now();
    const kem = await createMlKem1024();
    const [pk_idr, sk_idr] = kem.deriveKeyPair(seed);
    // pk_idr: 1568 bytes, sk_idr: 3168 bytes
    const keygenMs = performance.now() - t3;

    // Step 4: ENCRYPT — Encapsulate with public key
    const t4 = performance.now();
    const [ct, sharedSecret] = kem.encap(pk_idr);
    // ct: 1568 bytes
    const encryptMs = performance.now() - t4;

    // Step 5: BUILD COMMITMENT C and master identity Φ
    const C = new Uint8Array(pk_idr.length + ct.length);
    C.set(pk_idr, 0);
    C.set(ct, pk_idr.length);
    const phi = sha3_512(C); // Φ := H(C)

    const phi_hex = toHex(phi);
    const pk_hex = toHex(pk_idr);
    const sk_hex = toHex(sk_idr);
    const commitment_hex = toHex(C);

    // Step 6: CRYPTOGRAPHIC ERASURE
    // PII, piiHash, seed, sk_idr, sharedSecret are LOCAL ONLY.
    // Never stored server-side, logged, or persisted.
    // In production TEE (Intel TDX), these would be securely wiped via memset.

    const totalMs = performance.now() - startTime;

    // ═══════════════════════════════════════════════════════════
    // Step 7: SYBIL RESISTANCE — PALC.Verify (§3.2)
    // Deterministic KeyGen means same PII → same pk_idr.
    // We check pk_idr for Sybil detection (phi_hash varies due to randomized encap).
    // ═══════════════════════════════════════════════════════════

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingRows } = await supabase
      .from("commitments")
      .select("id")
      .eq("pk_idr", pk_hex)
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      return new Response(
        JSON.stringify({
          error: "PALC.Verify: Sybil attempt — identity collision detected. This PII has already been enrolled.",
          sybil_resistant: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // Step 8: ANONYMITY SET MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    const { data: currentSet } = await supabase
      .from("anonymity_sets")
      .select("set_id, current_count, capacity")
      .eq("status", "filling")
      .order("set_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    let setId: number;
    let setIndex: number;

    if (!currentSet) {
      // No filling set exists — create one
      const { data: newSet, error: newSetErr } = await supabase
        .from("anonymity_sets")
        .insert({ capacity: 16, status: "filling", current_count: 0 })
        .select("set_id")
        .single();
      if (newSetErr || !newSet) throw new Error("Failed to create anonymity set");
      setId = newSet.set_id;
      setIndex = 0;
    } else if (currentSet.current_count >= currentSet.capacity) {
      // Current set is full — mark ready, create new one
      await supabase
        .from("anonymity_sets")
        .update({ status: "ready" })
        .eq("set_id", currentSet.set_id);
      const { data: newSet, error: newSetErr } = await supabase
        .from("anonymity_sets")
        .insert({ capacity: 16, status: "filling", current_count: 0 })
        .select("set_id")
        .single();
      if (newSetErr || !newSet) throw new Error("Failed to create new anonymity set");
      setId = newSet.set_id;
      setIndex = 0;
    } else {
      setId = currentSet.set_id;
      setIndex = currentSet.current_count;
    }

    // Insert commitment
    const { error: commitError } = await supabase
      .from("commitments")
      .insert({
        set_id: setId,
        set_index: setIndex,
        phi_hash: phi_hex,
        commitment_c: commitment_hex,
        pk_idr: pk_hex,
        ct_size_bytes: ct.length,
      });

    if (commitError) {
      throw new Error(`Failed to insert commitment: ${commitError.message}`);
    }

    // Update anonymity set count
    const newCount = setIndex + 1;
    const newStatus = currentSet && newCount >= (currentSet.capacity ?? 16) ? "ready" : "filling";
    await supabase
      .from("anonymity_sets")
      .update({ current_count: newCount, status: newStatus })
      .eq("set_id", setId);

    // ═══════════════════════════════════════════════════════════
    // Step 9: INSERT enrollment log with per-step timings
    // ═══════════════════════════════════════════════════════════

    await supabase
      .from("enrollment_logs")
      .insert({
        phi_hash: phi_hex,
        palc_hash_ms: Math.round(hashMs * 1000) / 1000,
        palc_hkdf_ms: Math.round(hkdfMs * 1000) / 1000,
        palc_keygen_ms: Math.round(keygenMs * 1000) / 1000,
        palc_encrypt_ms: Math.round(encryptMs * 1000) / 1000,
        palc_total_ms: Math.round(totalMs * 100) / 100,
      });

    // ═══════════════════════════════════════════════════════════
    // Step 10: RETURN — No PII, no server-stored secrets
    // ═══════════════════════════════════════════════════════════

    return new Response(
      JSON.stringify({
        phi_hash: phi_hex,
        set_id: setId,
        set_index: setIndex,
        commitment_size_bytes: C.length,
        pk_size_bytes: pk_idr.length,
        ct_size_bytes: ct.length,
        kyber_variant: "ML-KEM-1024 (NIST FIPS 203)",
        kdf: "HKDF-SHA3-512 (RFC 5869)",
        hash: "SHA3-512",
        pii_retained: false,
        master_secret_key_local_only: sk_hex,
        WARNING: "Store this locally. Never share. Required for pseudonym generation.",
        palc_properties: {
          hiding: "MLWE assumption",
          binding: "SHA3-512 collision resistance",
          uniqueness: "Deterministic HKDF + Kyber KeyGen",
          one_wayness: "MLWE + HMAC-SHA3 PRF",
        },
        timing: {
          hash_ms: Math.round(hashMs * 1000) / 1000,
          hkdf_ms: Math.round(hkdfMs * 1000) / 1000,
          keygen_ms: Math.round(keygenMs * 1000) / 1000,
          encrypt_ms: Math.round(encryptMs * 1000) / 1000,
          total_ms: Math.round(totalMs * 100) / 100,
        },
        sybil_resistant: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
