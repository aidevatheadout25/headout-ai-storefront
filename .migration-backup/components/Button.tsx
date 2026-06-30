import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "tertiary" | "secondary" | "white" | "destructive";
type ButtonSize = "sm" | "rg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

type ButtonLinkProps = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
  external?: boolean;
};

function classes(variant: ButtonVariant, size: ButtonSize, extra?: string) {
  return ["btn", `btn--${variant}`, `btn--${size}`, extra].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "rg",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button type="button" className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "rg",
  children,
  className,
  external,
}: ButtonLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        className={classes(variant, size, className)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}
