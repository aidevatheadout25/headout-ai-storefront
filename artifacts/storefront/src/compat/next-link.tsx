import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { useLocation } from "wouter";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  prefetch?: boolean;
};

function isExternal(href: string): boolean {
  return /^[a-z]+:\/\//i.test(href) || href.startsWith("//") || href.startsWith("mailto:") || href.startsWith("tel:");
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, replace, prefetch: _prefetch, children, target, ...rest },
  ref,
) {
  const [, navigate] = useLocation();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== "_self")
    ) {
      return;
    }
    if (isExternal(href)) return;
    event.preventDefault();
    navigate(href, { replace });
  }

  return (
    <a ref={ref} href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export default Link;
