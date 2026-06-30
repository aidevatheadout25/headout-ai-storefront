import { useSearch } from "wouter";
import { Button } from "@/components/Button";
import { useAuthContext } from "@/lib/auth-context";

export default function LandingPage() {
  const { login } = useAuthContext();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const authError = params.get("auth_error");

  return (
    <div className="landing">
      <div className="landing__card">
        <div className="landing__brand">
          <img
            src="/design-system/assets/logo/headout.svg"
            alt="Headout"
            width={110}
            height={28}
          />
          <span className="landing__product-name t-subheading-rg">
            AI Storefront
          </span>
        </div>

        <div className="landing__body">
          <h1 className="landing__heading t-display-sm">
            Your internal AI tool directory
          </h1>
          <p className="landing__desc t-para-lg">
            Describe a task and the concierge will find the internal AI tool
            that already does it — apps, skills, docs, MCPs, plugins, and more.
            Sign in with your Headout account to get started.
          </p>

          {authError === "domain" && (
            <div className="landing__error" role="alert">
              <p className="t-para-sm">
                Only <strong>@headout.com</strong> accounts can access this
                tool. Please sign in with your Headout Google account.
              </p>
            </div>
          )}

          <Button onClick={login} size="rg">
            Sign in with Headout
          </Button>
        </div>
      </div>
    </div>
  );
}
