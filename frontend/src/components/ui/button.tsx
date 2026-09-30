"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white shadow-[0_1px_2px_rgba(22,25,29,0.16)] hover:bg-accent-hover",
        secondary:
          "border border-line-strong bg-surface text-ink shadow-[0_1px_1px_rgba(22,25,29,0.03)] hover:bg-surface-sunken",
        subtle: "bg-surface-sunken text-ink hover:bg-line",
        ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
        danger:
          "border border-critical-line bg-critical-soft text-critical hover:bg-critical hover:text-white",
        rail: "text-rail-muted hover:bg-rail-raised hover:text-rail-ink",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-2.5 text-[13px] [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        iconSm: "size-8 [&_svg]:size-4",
        iconXs: "size-6 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
