/**
 * DOM test for the bounty-core <VerificationBadge />. The verification logic is
 * mocked (covered separately in ens-verify.test.ts); here we pin that each state
 * renders the right UI — most importantly that the verified badge shows the exact
 * "Verified human · Sybil-resistant ✓" string and exposes no Φ, and that the
 * registry-down path degrades to "registry check unavailable" showing the record.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VerificationBadge } from "@/components/VerificationBadge";
import { verifyEns } from "@/lib/ens-verify";

vi.mock("@/lib/ens-verify", () => ({
  verifyEns: vi.fn(),
  PRAMAANA_PHI_RECORD: "pramaana.phi",
}));

const mockVerify = vi.mocked(verifyEns);

// A distinctive Φ so the truncated record is unambiguous in assertions.
const PHI = "0x" + "1234567890abcdef".repeat(4); // 64 hex chars

beforeEach(() => {
  vi.clearAllMocks();
});

function verifyName(name: string) {
  fireEvent.change(screen.getByPlaceholderText("alice.eth"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: /verify/i }));
}

describe("<VerificationBadge />", () => {
  it("renders the verified badge on a match, without exposing Φ", async () => {
    mockVerify.mockResolvedValue({ status: "verified", name: "alice.eth" });

    render(<VerificationBadge />);
    verifyName("alice.eth");

    expect(await screen.findByText(/Verified human · Sybil-resistant ✓/)).toBeTruthy();
    // privacy: no on-chain hash / Φ value is rendered on the verified badge
    expect(screen.queryByText(/0x[0-9a-f]{8}/i)).toBeNull();
    expect(mockVerify).toHaveBeenCalledWith("alice.eth");
  });

  it("degrades gracefully and shows the record when the registry is down", async () => {
    mockVerify.mockResolvedValue({
      status: "registry-unavailable",
      name: "bob.eth",
      phi: PHI,
      error: "down",
    });

    render(<VerificationBadge />);
    verifyName("bob.eth");

    expect(await screen.findByText(/registry check unavailable/i)).toBeTruthy();
    expect(screen.getByText(/0x12345678/)).toBeTruthy(); // truncated record is shown
  });

  it("shows a clear state when the name has no pramaana.phi record", async () => {
    mockVerify.mockResolvedValue({ status: "no-record", name: "nobody.eth" });

    render(<VerificationBadge />);
    verifyName("nobody.eth");

    expect(await screen.findByText(/No Pramaana identity/i)).toBeTruthy();
  });

  it("does not call verify for an empty input", () => {
    render(<VerificationBadge />);
    // The button is disabled with no input; clicking is a no-op.
    expect(screen.getByRole("button", { name: /verify/i }).hasAttribute("disabled")).toBe(true);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
