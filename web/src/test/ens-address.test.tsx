/**
 * DOM test for <EnsAddress />. The useEns hook is mocked so we control resolution
 * without a network or QueryClient: a resolved name renders the name; an
 * unresolved address falls back to its truncated 0x… form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnsAddress, truncateAddress } from "@/components/EnsAddress";
import { useEns } from "@/hooks/use-ens";

vi.mock("@/hooks/use-ens", () => ({ useEns: vi.fn() }));

const mockUseEns = vi.mocked(useEns);
const ADDR = "0x1234567890123456789012345678901234567890";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<EnsAddress />", () => {
  it("falls back to the truncated address when no name resolves", () => {
    mockUseEns.mockReturnValue({ data: undefined } as ReturnType<typeof useEns>);

    render(<EnsAddress address={ADDR} />);

    expect(truncateAddress(ADDR)).toBe("0x1234…7890");
    expect(screen.getByText("0x1234…7890")).toBeTruthy();
  });

  it("shows the primary ENS name when one resolves", () => {
    mockUseEns.mockReturnValue({
      data: {
        query: ADDR,
        name: "alice.eth",
        address: ADDR,
        avatar: "https://img.example/a.png",
        records: {},
      },
    } as ReturnType<typeof useEns>);

    render(<EnsAddress address={ADDR} />);

    expect(screen.getByText("alice.eth")).toBeTruthy();
    // the full address stays inspectable on hover (title) rather than shown inline
    expect(screen.getByText("alice.eth").getAttribute("title")).toBe(ADDR);
  });
});
