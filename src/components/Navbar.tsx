import { useState } from "react";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Shield, Github, Menu, X, Bot, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/wallet-connect", label: "Wallet Scan", icon: Shield },
  { to: "/enroll", label: "Enroll" },
  { to: "/verify", label: "Verify" },
  { to: "/on-chain", label: "On-Chain" },
  { to: "/migrate", label: "BIP-360", icon: ArrowRightLeft },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/agent", label: "AI Agent", icon: Bot },
  { to: "/about", label: "About" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <Shield className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight text-foreground">Pramaana</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ to, label, icon: LinkIcon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeClassName="text-primary bg-primary/10"
            >
              {LinkIcon && <LinkIcon className="h-3.5 w-3.5" />}
              {label}
            </NavLink>
          ))}
          <a
            href="https://github.com/Dasika-Vaishnavi/pramaana-identity-v2"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>

        {/* Mobile toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-border/30 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeClassName="text-primary bg-primary/10"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </NavLink>
            ))}
            <a
              href="https://github.com/pramaana"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
