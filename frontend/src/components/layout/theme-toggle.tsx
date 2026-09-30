"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { SegmentedControl } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { IconHint } from "@/components/ui/tooltip";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

function useMountedTheme() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  return { theme: mounted ? (theme ?? "system") : "system", resolvedTheme, setTheme, mounted };
}

export function ThemeSegmented({ className }: { className?: string }) {
  const { theme, setTheme, mounted } = useMountedTheme();
  return (
    <SegmentedControl
      label="Colour theme"
      value={mounted ? theme : "system"}
      onValueChange={setTheme}
      options={OPTIONS}
      className={className}
    />
  );
}

export function ThemeToggle({ variant = "rail" }: { variant?: "rail" | "bar" }) {
  const { resolvedTheme, setTheme, mounted } = useMountedTheme();
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <IconHint label={isDark ? "Switch to light theme" : "Switch to dark theme"} side="right">
      <Button
        variant={variant === "rail" ? "rail" : "ghost"}
        size="iconSm"
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </IconHint>
  );
}
