/**
 * HTTP client for the enrollment TEE T (crates/enrollment-tee `http-server`).
 * Implements C's side of §2: Gate 0 FIRST — verify the attested handshake
 * before any PII leaves the client.
 */

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { verifyReportDataBinding, verifySimQuote } from "./attestation.js";

export interface CaptureFrame {
  width: number;
  height: number;
  /** Raw RGB8 pixels, base64. */
  rgbBase64: string;
}

export interface LivenessCapture {
  frames: CaptureFrame[];
  capturedAtMs: number;
}

/** The public, NON-BIOMETRIC face-match fact (no frame/photo/embedding bytes). */
export interface BiometricFact {
  performed: boolean;
  passed: boolean;
  /** "sim" | "arcface-scrfd". */
  kind: string;
}

export interface TeeEnrollment {
  /** Φ, hex (128 chars — SHA3-512). */
  phi: string;
  dedupTag: string;
  alreadyEnrolled: boolean;
  /** sk_IdR — received ONCE over the attested channel; caller owns wiping. */
  skIdr: Uint8Array;
  /** The attested "a live-face ↔ reference-photo match was performed and passed". */
  biometric: BiometricFact;
}

export class TeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeeError";
  }
}

/** A failed live-face match (§2 step 5): enrollment was REFUSED — no Φ minted.
 *  Carries the {performed:true, passed:false, kind} fact so the UI can render a
 *  clean REJECT rather than a generic error. No biometric bytes. */
export class FaceMismatchError extends TeeError {
  constructor(
    readonly biometric: BiometricFact,
    message: string,
  ) {
    super(message);
    this.name = "FaceMismatchError";
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      /* non-JSON error body */
    }
    throw new TeeError(`${url}: ${res.status} ${detail}`);
  }
  return JSON.parse(text) as T;
}

export class TeeClient {
  constructor(
    readonly baseUrl: string,
    private readonly allowedMeasurements?: Uint8Array[],
  ) {}

  /**
   * Gate 0 (§2 step 1): attested handshake. Generates the client nonce,
   * verifies the quote against the appraisal policy AND the report_data
   * binding to (nonce, ephemeral_pubkey). Throws (sending nothing further)
   * on any failure. Returns the liveness challenge T issued.
   */
  async handshake(): Promise<{ livenessNonce: string }> {
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const res = await postJson<{
      quote: string;
      ephemeral_pubkey: string;
      liveness_nonce: string;
    }>(`${this.baseUrl}/handshake`, { nonce: bytesToHex(nonce) });

    const verified = verifySimQuote(hexToBytes(res.quote), this.allowedMeasurements);
    verifyReportDataBinding(verified, nonce, hexToBytes(res.ephemeral_pubkey));
    return { livenessNonce: res.liveness_nonce };
  }

  /**
   * §2 step 4: send QR + capture (and an optional DEMO reference photo) over
   * the (attested) channel. Throws {@link FaceMismatchError} on a refused match
   * (no Φ minted), {@link TeeError} on any other failure.
   */
  async enroll(
    qrNumeric: string,
    capture: LivenessCapture,
    livenessNonce: string,
    demoReference?: CaptureFrame,
  ): Promise<TeeEnrollment> {
    const url = `${this.baseUrl}/enroll`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        liveness_nonce: livenessNonce,
        qr_numeric: qrNumeric,
        capture: {
          frames: capture.frames.map((f) => ({
            width: f.width,
            height: f.height,
            rgb_b64: f.rgbBase64,
          })),
          nonce_echo: livenessNonce,
          captured_at_ms: capture.capturedAtMs,
        },
        ...(demoReference
          ? {
              demo_reference: {
                width: demoReference.width,
                height: demoReference.height,
                rgb_b64: demoReference.rgbBase64,
              },
            }
          : {}),
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let body: { error?: string; biometric?: BiometricFact } = {};
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 403 && body.biometric && body.biometric.passed === false) {
        throw new FaceMismatchError(body.biometric, body.error ?? "live face did not match");
      }
      throw new TeeError(`${url}: ${res.status} ${body.error ?? text}`);
    }
    const ok = JSON.parse(text) as {
      phi: string;
      dedup_tag: string;
      already_enrolled: boolean;
      sk_idr: string;
      biometric: BiometricFact;
    };
    return {
      phi: ok.phi,
      dedupTag: ok.dedup_tag,
      alreadyEnrolled: ok.already_enrolled,
      skIdr: hexToBytes(ok.sk_idr),
      biometric: ok.biometric,
    };
  }

  /** SIM-ONLY: synthetic signed QR + matching capture frames for demos. */
  async fixture(): Promise<{ qrNumeric: string; frames: CaptureFrame[] }> {
    const res = await fetch(`${this.baseUrl}/fixture`);
    if (!res.ok) {
      throw new TeeError(`${this.baseUrl}/fixture: ${res.status}`);
    }
    const body = (await res.json()) as {
      qr_numeric: string;
      frames: { width: number; height: number; rgb_b64: string }[];
    };
    return {
      qrNumeric: body.qr_numeric,
      frames: body.frames.map((f) => ({
        width: f.width,
        height: f.height,
        rgbBase64: f.rgb_b64,
      })),
    };
  }
}
