// Pure presentation: drive the demo's JSON API and render state. All crypto
// (enrollment, Semaphore proofs, on-chain spends) runs server-side in the SDK.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

const enrollBtn = $("#enrollBtn");
const enrollOut = $("#enrollOut");
const worldBtn = $("#worldBtn");
const worldOut = $("#worldOut");
const resetBtn = $("#resetBtn");
const claims = {}; // service -> record

let enrolled = false;
// Represents the unique human behind this browser session. In stub mode it is a
// random id; in live mode each claim carries a real World ID proof instead.
let worldHumanId = null;
let worldMode = "stub";

function serviceCard(service) {
  return $(`.service[data-service="${service}"]`);
}

// Claims require BOTH a Pramaana enrollment AND a World ID proof-of-human.
function updateClaimButtons() {
  const ready = enrolled && worldHumanId !== null;
  $$(".claimBtn").forEach((b) => (b.disabled = !ready));
}

// --- World ID proof-of-human -------------------------------------------------
// Hex SHA-256 of a string (browser SubtleCrypto), used in stub mode to derive a
// per-(human, service) nullifier — mirroring World ID's per-action namespacing.
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Build the World ID proof for a service. Stub mode synthesises a labelled stub
// token; live mode runs IDKit against the signed challenge from the backend.
async function worldProofFor(service) {
  const challenge = await api("GET", `/api/worldid/challenge?service=${encodeURIComponent(service)}`);
  if (challenge.mode === "stub") {
    const nullifier_hash = "0x" + (await sha256Hex(`${worldHumanId}:${service}`)).slice(0, 64);
    return { stub: true, credential_type: "proof_of_human", nullifier_hash, action: challenge.action };
  }
  // Live mode: load IDKit from CDN and run the proof-of-human flow. Requires
  // real APP_ID/ACTION in app/.env (see app/.env.example).
  const { IDKit } = await import("https://esm.sh/@worldcoin/idkit-core@4");
  const handle = IDKit.request({
    app_id: challenge.app_id,
    action: challenge.action,
    rp_context: challenge.rp_context,
  }).preset("proof_of_human");
  const completion = await handle.pollUntilCompletion();
  return completion.result;
}

worldBtn.addEventListener("click", async () => {
  worldBtn.disabled = true;
  worldBtn.textContent = "Verifying…";
  try {
    const s = await api("GET", "/api/state");
    worldMode = s.worldId?.mode ?? "stub";
    if (worldMode === "stub") {
      // A fresh random "human" for this session.
      worldHumanId = crypto.randomUUID();
    } else {
      // Live mode resolves a real proof per claim; flag readiness here.
      worldHumanId = "live";
    }
    worldOut.classList.remove("hidden");
    worldOut.innerHTML =
      `<span class="pill ok">Proof-of-human ready${worldMode === "stub" ? " (stub)" : ""}</span>` +
      `<div class="kv muted">Each claim is verified in the backend before any nullifier is spent.</div>`;
    worldBtn.textContent = "Human verified ✓";
    updateClaimButtons();
  } catch (e) {
    worldBtn.disabled = false;
    worldBtn.textContent = "Verify with World ID";
    worldOut.classList.remove("hidden");
    worldOut.innerHTML = `<span class="pill block">Error: ${e.message}</span>`;
  }
});

enrollBtn.addEventListener("click", async () => {
  enrollBtn.disabled = true;
  enrollBtn.textContent = "Enrolling…";
  try {
    const r = await api("POST", "/api/enroll");
    enrollOut.classList.remove("hidden");
    enrollOut.innerHTML =
      `<span class="pill ok">Sybil-unique identity minted</span>` +
      `<div class="kv">Φ = <b class="mono">${r.phiShort}</b>` +
      (r.alreadyEnrolled ? ` <span class="muted">(existing — dedup returned the same Φ)</span>` : ``) +
      `</div>`;
    enrolled = true;
    updateClaimButtons();
    enrollBtn.textContent = "Enrolled ✓";
  } catch (e) {
    enrollBtn.disabled = false;
    enrollBtn.textContent = "Enroll inside the TEE";
    enrollOut.classList.remove("hidden");
    enrollOut.innerHTML = `<span class="pill block">Error: ${e.message}</span>`;
  }
});

$$(".claimBtn").forEach((btn) => {
  const card = btn.closest(".service");
  const service = card.dataset.service;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Claiming…";
    try {
      const worldIdProof = await worldProofFor(service);
      const r = await api("POST", "/api/claim", { service, worldIdProof });
      claims[service] = r;
      renderClaim(service, r);
    } catch (e) {
      $(".claimOut", card).innerHTML = `<span class="pill block">Error: ${e.message}</span>`;
    } finally {
      btn.textContent = "Claim again";
      btn.disabled = false;
    }
    renderCorrelation();
  });
});

function renderClaim(service, r) {
  const card = serviceCard(service);
  const pill =
    r.status === "claimed"
      ? `<span class="pill ok">Claimed ✓</span>`
      : `<span class="pill block">Blocked — already claimed (nullifier spent)</span>`;
  $(".claimOut", card).innerHTML =
    `${pill}<div class="kv">nullifier = <b class="mono">${shorten(r.nullifier)}</b></div>`;
}

function renderCorrelation() {
  const a = claims["airdrop-alpha"];
  const b = claims["airdrop-beta"];
  const box = $("#correlation");
  if (!a || !b) {
    box.className = "muted";
    box.textContent = "Claim both airdrops to compare their nullifiers.";
    return;
  }
  const linked = a.nullifier === b.nullifier;
  box.className = "verdict good";
  box.innerHTML =
    `<div class="kv">Alpha nullifier: <b class="mono">${shorten(a.nullifier)}</b></div>` +
    `<div class="kv">Beta&nbsp; nullifier: <b class="mono">${shorten(b.nullifier)}</b></div>` +
    (linked
      ? `<div class="kv"><span class="pill block">Correlated</span></div>`
      : `<div class="kv"><span class="pill ok">No derivable link</span> ` +
        `the two airdrops see unrelated values and cannot tell it is the same human.</div>` +
        `<div class="kv muted">nullifier = H(secret, serviceId); only the group-wide Merkle root is shared, ` +
        `and every member shares it.</div>`);
}

resetBtn.addEventListener("click", async () => {
  await api("POST", "/api/reset");
  location.reload();
});

function shorten(hex) {
  return hex.length > 22 ? `${hex.slice(0, 12)}…${hex.slice(-8)}` : hex;
}

// Restore state on reload.
(async () => {
  try {
    const s = await api("GET", "/api/state");
    worldMode = s.worldId?.mode ?? "stub";
    if (s.enrollment) {
      enrolled = true;
      enrollBtn.disabled = true;
      enrollBtn.textContent = "Enrolled ✓";
      enrollOut.classList.remove("hidden");
      enrollOut.innerHTML =
        `<span class="pill ok">Sybil-unique identity minted</span>` +
        `<div class="kv">Φ = <b class="mono">${s.enrollment.phiShort}</b></div>`;
    }
    // World ID proof-of-human is session-only (not persisted) — re-verify after
    // a reload before claiming.
    updateClaimButtons();
    for (const [service, record] of Object.entries(s.claims ?? {})) {
      claims[service] = record;
      renderClaim(service, record);
    }
    renderCorrelation();
  } catch {
    /* fresh load */
  }
})();
