/**
 * EnsAddress — render an Ethereum address as its primary ENS name + avatar when
 * one resolves (live mainnet reverse resolution via the useEns hook), gracefully
 * falling back to the truncated 0x… address when it doesn't.
 *
 * Real reads only: the name and avatar come from chain; nothing is hard-coded.
 * (Reverse resolution happens on mainnet, so e.g. a Sepolia-only contract address
 * simply falls back to its truncated form — the intended graceful behaviour.)
 */
import { useEns } from "@/hooks/use-ens";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** 0x1234…abcd — the canonical short form for an un-named address. */
export function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

interface EnsAddressProps {
  /** The 0x address to display. */
  address: string;
  /** Render the ENS avatar chip when one resolves (default true). */
  showAvatar?: boolean;
  /** Extra classes for the label text. */
  className?: string;
  /** Extra classes for the avatar chip. */
  avatarClassName?: string;
}

/**
 * Inline address label. While resolving, shows the truncated address (no flash);
 * on success shows the primary ENS name (with avatar if published); the full
 * address is kept on `title` so it stays inspectable on hover.
 */
export function EnsAddress({
  address,
  showAvatar = true,
  className,
  avatarClassName,
}: EnsAddressProps) {
  const { data } = useEns(address);
  const name = data?.name ?? null;
  const avatar = data?.avatar ?? null;
  const label = name ?? truncateAddress(address);

  return (
    <span className="inline-flex items-center gap-1.5">
      {showAvatar && avatar && (
        <Avatar className={cn("h-4 w-4", avatarClassName)}>
          <AvatarImage src={avatar} alt={name ?? address} />
          <AvatarFallback className="text-[8px] uppercase">
            {label.replace(/^0x/, "").slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      )}
      <span className={cn("font-mono", className)} title={name ? address : undefined}>
        {label}
      </span>
    </span>
  );
}
