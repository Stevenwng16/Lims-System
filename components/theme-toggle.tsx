"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Render both icons and let CSS pick, so server and client markup match. */}
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
