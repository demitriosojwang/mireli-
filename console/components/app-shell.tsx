"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/*
 * The app shell, and the primary responsiveness demonstration.
 *
 * Layout strategy, small screen → large:
 *   < 640px   bottom tab bar, one column, full-width rows (thumb reach)
 *   ≥ 640px   wider gutters, two-column stat grid
 *   ≥ 1024px  persistent left sidebar replaces the tab bar; content centres
 *
 * The navigation is the SAME markup at every size — only the container's
 * `flex-direction` and the items' presentation change. That is what keeps the
 * two layouts from drifting apart.
 */

const NAV = [
  { href: "/compliance", label: "Compliance", short: "Compliance" },
  { href: "/offers", label: "Ride Offers", short: "Offers" },
  { href: "/register", label: "Register", short: "Register" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const nav = (
    <nav aria-label="Sections" className="flex w-full">
      {NAV.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition-colors",
              active ? "bg-[var(--mi-orange-soft)] text-[var(--mi-orange)]" : "text-[var(--mi-secondary)]",
              // Sidebar on large screens: label beside nothing, full width.
              "lg:rounded-lg lg:py-2.5"
            )}
          >
            <span className="text-[0.9375rem] font-semibold tracking-tight lg:text-[0.875rem]">
              {/* Short label on the bottom bar; full label in the sidebar. */}
              <span className="lg:hidden">{item.short}</span>
              <span className="hidden lg:inline">{item.label}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ── Mobile / tablet header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[var(--mi-separator)] bg-[rgba(242,242,247,0.82)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Mark />
          <div className="min-w-0">
            <h1 className="truncate text-[1.0625rem] font-bold tracking-tight">Mireli Compliance</h1>
            <p className="truncate text-[0.6875rem] text-[var(--mi-secondary)]">
              Driver review &amp; dispatch
            </p>
          </div>
        </div>
      </header>

      {/* ── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 border-r border-[var(--mi-separator)] bg-[var(--mi-surface)] p-4 lg:block">
        <div className="mb-6 flex items-center gap-3 px-1">
          <Mark />
          <div>
            <div className="text-[0.9375rem] font-bold tracking-tight">Mireli</div>
            <div className="text-[0.6875rem] text-[var(--mi-secondary)]">Compliance console</div>
          </div>
        </div>
        {nav}
        <p className="mt-6 px-1 text-[0.6875rem] leading-relaxed text-[var(--mi-tertiary)]">
          Every decision here is recorded against your name. There is no bulk
          approve and no auto-approval.
        </p>
      </aside>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <main className="flex-1 pb-28 lg:pb-10">{children}</main>

      {/* ── Bottom tab bar (mobile only) ──────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--mi-separator)] bg-[rgba(250,250,252,0.92)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto w-full max-w-2xl px-2 py-1.5">{nav}</div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--mi-navy)] text-[0.8125rem] font-black text-white"
    >
      M
    </span>
  );
}