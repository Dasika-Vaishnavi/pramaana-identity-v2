/**
 * Locks the unified data-layer contract (see docs/WIRING_MAP.md):
 *  - supabase.from(...) no longer throws and returns empty-but-valid shapes
 *  - functions.invoke("palc-enroll") delegates to PramaanaClient and normalizes
 *    the backend's { phi, timing, set_id, set_index, ... } into the
 *    { phi_hash, timing, set_id, set_index } shape pages read
 *  - unknown / stubbed functions return gracefully (never throw)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("supabase.from query builder", () => {
  it("resolves a head/count select to count 0 without throwing", async () => {
    const { count, error } = await supabase
      .from("commitments")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("resolves a list select (.order/.limit) to an empty array", async () => {
    const { data, error } = await supabase
      .from("enrollment_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("resolves .eq(...).maybeSingle() to a null row (not_found, no throw)", async () => {
    const { data, error } = await supabase
      .from("commitments")
      .select("created_at")
      .eq("phi_hash", "deadbeef")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("supports .then() chaining used by some pages", async () => {
    const seen = await new Promise((resolve) => {
      supabase.from("service_providers").select("*").then(({ data }) => resolve(data));
    });
    expect(seen).toEqual([]);
  });
});

describe("functions.invoke normalization", () => {
  it("maps backend { phi } -> { phi_hash } and surfaces timing for palc-enroll", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        // Full EnrollResult shape the backend returns since W2 (timing + real
        // on-chain registration coords). The shim reads r.timing.total_ms and
        // the on-chain fields, so the mock MUST carry them (see pramaana-client.ts).
        JSON.stringify({
          phi: "0xabc",
          phiShort: "0xab…c",
          alreadyEnrolled: false,
          timing: { total_ms: 12 },
          setId: 1,
          setIndex: 0,
          txHash: "0xfeed",
          blockNumber: 4,
          explorerUrl: null,
          biometricMatch: { performed: true, passed: true, kind: "sim" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { data, error } = await supabase.functions.invoke("palc-enroll", {
      body: { pii_input: "x|y|z|w" },
    });

    expect(error).toBeNull();
    expect(data.phi_hash).toBe("0xabc");
    expect(typeof data.timing.total_ms).toBe("number");
    expect(data.pk_size_bytes).toBe(1568);
    // W2 on-chain registration coords surface through the normalization.
    expect(data.set_id).toBe(1);
    expect(data.set_index).toBe(0);
    // C3: the non-biometric match fact flows through (no biometric bytes).
    expect(data.biometric_match).toEqual({ performed: true, passed: true, kind: "sim" });
    expect(data.error).toBeUndefined();
  });

  it("surfaces a Sybil error when the backend reports alreadyEnrolled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        // alreadyEnrolled re-enroll (dedup hit): same full EnrollResult shape,
        // with the PRIOR registration's coords recovered (no second mint).
        JSON.stringify({
          phi: "0xabc",
          phiShort: "0xab…c",
          alreadyEnrolled: true,
          timing: { total_ms: 9 },
          setId: 1,
          setIndex: 0,
          txHash: "0xfeed",
          blockNumber: 4,
          explorerUrl: null,
          biometricMatch: { performed: true, passed: true, kind: "sim" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { data } = await supabase.functions.invoke("palc-enroll", { body: {} });
    expect(data.sybil_resistant).toBe(true);
    expect(String(data.error)).toContain("Sybil");
  });

  it("returns a graceful error when the backend is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const { data, error } = await supabase.functions.invoke("palc-enroll", { body: {} });
    expect(data).toBeNull();
    expect(error?.message).toContain("Backend not running");
  });

  it("returns a stub for an unknown function instead of throwing", async () => {
    const { data, error } = await supabase.functions.invoke("totally-unknown-fn", { body: {} });
    expect(error).toBeNull();
    expect(data.status).toBe("stub");
  });

  it("shapes zk-membership-proof so nested page reads don't crash", async () => {
    const { data } = await supabase.functions.invoke("zk-membership-proof", {
      body: { sp_identifier: "demo.example" },
    });
    expect(Array.isArray(data.proof.merkle_path)).toBe(true);
    expect(data.public_inputs.sp_identifier).toBe("demo.example");
  });
});

describe("channel no-ops", () => {
  it("channel().on().subscribe() and removeChannel() do not throw", () => {
    const ch = supabase.channel("x").on("postgres_changes", {}, () => {}).subscribe();
    expect(() => supabase.removeChannel(ch)).not.toThrow();
  });
});
