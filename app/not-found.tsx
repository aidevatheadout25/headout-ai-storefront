import { ButtonLink } from "@/components/Button";

export default function NotFound() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title t-display-xs">Page not found</h1>
      <p className="empty-state__desc t-para-md">
        That tool or page doesn&apos;t exist in the registry.
      </p>
      <ButtonLink href="/" variant="primary">
        Back to home
      </ButtonLink>
    </div>
  );
}
