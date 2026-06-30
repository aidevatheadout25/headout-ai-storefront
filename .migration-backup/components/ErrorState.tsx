import { Icon } from "@/components/Icon";
import { Button } from "@/components/Button";

type ErrorStateProps = {
  title: string;
  message: string;
  onRetry: () => void;
};

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon">
        <Icon name="info-circle" size={24} />
      </div>
      <h3 className="error-state__title t-heading-sm">{title}</h3>
      <p className="error-state__message t-para-md">{message}</p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
