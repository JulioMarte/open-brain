import type { ReactNode } from "react";
import { Inbox, Brain, Search, LayoutGrid } from "lucide-react";
import { UserButton } from "@clerk/clerk-react";

interface LayoutProps {
  children?: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

const navItems = [
  { id: "triage", label: "Triage", icon: Inbox },
  { id: "focus", label: "Focus", icon: Brain },
  { id: "entities", label: "Entities", icon: LayoutGrid },
  { id: "search", label: "Search", icon: Search },
];

export function Layout({ children, currentView, onNavigate }: LayoutProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">Open Brain</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full text-left ${
                currentView === id ? "bg-accent" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t">
          <UserButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
