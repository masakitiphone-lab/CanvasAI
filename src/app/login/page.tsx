import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Shield, Zap } from "lucide-react";
import { LoginButton } from "@/components/login-button";
import { getSessionUser } from "@/lib/supabase-server";

type LoginPageProps = {
  searchParams?: Promise<{
    authError?: string;
    authErrorDescription?: string;
  }>;
};

function getErrorMessage(authError?: string, authErrorDescription?: string) {
  if (authErrorDescription) {
    return authErrorDescription;
  }

  switch (authError) {
    case "callback_failed":
      return "Google authentication callback failed.";
    case "missing_config":
      return "Supabase public auth config is missing.";
    case "missing_code":
      return "No OAuth code was returned.";
    case "access_denied":
      return "Google sign-in was denied.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);

  if (user) {
    redirect("/");
  }

  const errorMessage = getErrorMessage(params?.authError, params?.authErrorDescription);

  return (
    <main className="login-screen">
      {/* Left: Hero visual panel */}
      <section className="login-visual-panel" aria-hidden="true">
        <img
          src="/login-hero.jpg"
          alt=""
          className="login-visual-panel__image"
          draggable={false}
        />
        <div className="login-visual-panel__overlay" />
        <div className="login-visual-panel__content">
          <div className="login-visual-panel__badge">
            <div className="login-visual-panel__badge-dot" />
            Visual AI Workspace
          </div>
          <h1 className="login-visual-panel__headline">
            Chat is a line.<br />Thinking is a graph.
          </h1>
          <p className="login-visual-panel__subtext">
            A node-based canvas where prompts, images, files, and research converge into one connected workspace.
          </p>
        </div>
      </section>

      {/* Right: Auth panel */}
      <section className="login-auth-panel">
        <div className="login-auth-panel__inner">
          {/* Top: Brand */}
          <div className="login-auth-panel__brand">
            <div className="login-auth-panel__brand-icon">
              <img src="/logo.png" alt="CanvasAI" className="size-full object-contain" />
            </div>
            <span className="login-auth-panel__brand-name">CanvasAI</span>
          </div>

          {/* Center: Sign-in form */}
          <div className="login-auth-panel__form">
            <div className="login-auth-panel__heading">
              <h2>Welcome back</h2>
              <p>Sign in to your workspace to continue where you left off.</p>
            </div>

            <div className="login-auth-panel__actions">
              <LoginButton />

              <div className="login-auth-panel__divider">
                <span>or</span>
              </div>

              <Link href="/auth/signout" prefetch={false} className="login-reset-link">
                Reset session
                <ArrowRight className="size-4" />
              </Link>
            </div>

            {errorMessage ? <p className="login-error">{errorMessage}</p> : null}
          </div>

          {/* Bottom: Trust signals */}
          <div className="login-auth-panel__footer">
            <div className="login-trust-item">
              <Shield className="size-4 shrink-0" />
              <span>Secured with Google OAuth 2.0</span>
            </div>
            <div className="login-trust-item">
              <Zap className="size-4 shrink-0" />
              <span>Instant access to your canvases</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
