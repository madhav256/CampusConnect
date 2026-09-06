import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

const initialForm = {
  email: "",
  password: "",
};

const demoUserEmail = import.meta.env.VITE_DEMO_USER_EMAIL || "";
const demoUserPassword = import.meta.env.VITE_DEMO_USER_PASSWORD || "";
const isDemoConfigured = Boolean(demoUserEmail && demoUserPassword);

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLoginForm(form) {
  const errors = {};

  if (!form.email.trim()) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!form.password) {
    errors.password = "Password is required.";
  }

  return errors;
}

export default function Login() {
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("error");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || "/dashboard";

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [name]: "" }));
    setFeedback("");
    setFeedbackType("error");
  };

  const handleDemoLogin = async () => {
    if (!isDemoConfigured) {
      setFeedbackType("error");
      setFeedback(
        "Demo credentials are not configured in your environment. Please set VITE_DEMO_USER_EMAIL and VITE_DEMO_USER_PASSWORD in your .env.local file."
      );
      return;
    }

    setIsDemoSubmitting(true);
    setFeedback("");

    try {
      await login({
        email: demoUserEmail.trim(),
        password: demoUserPassword,
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFeedbackType("error");
      setFeedback(`Demo login failed: ${error.message}`);
    } finally {
      setIsDemoSubmitting(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    const validationErrors = validateLoginForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("");

    try {
      await login({
        email: form.email.trim(),
        password: form.password,
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFeedbackType("error");
      setFeedback(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = form.email.trim();

    if (!email) {
      setErrors({ email: "Enter your email before requesting a reset link." });
      return;
    }

    if (!isValidEmail(email)) {
      setErrors({ email: "Enter a valid email address." });
      return;
    }

    setIsResetting(true);
    setFeedback("");

    try {
      await resetPassword(email);
      setFeedbackType("success");
      setFeedback("Password reset email sent. Check your inbox.");
    } catch (error) {
      setFeedbackType("error");
      setFeedback(error.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-paper text-ink py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta-600 text-white shadow-xs">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-serif text-2xl font-bold tracking-tight text-ink">
            Sign in to CampusConnect
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            The university student network
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Card className="p-8 shadow-xs">
          <form onSubmit={handleLogin} className="space-y-4">
            {feedback && (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  feedbackType === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {feedback}
              </div>
            )}

            <Input
              id="login-email"
              type="email"
              name="email"
              label="Email"
              placeholder="student@university.edu"
              value={form.email}
              onChange={handleChange}
              error={errors.email}
              required
            />

            <Input
              id="login-password"
              type="password"
              name="password"
              label="Password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              error={errors.password}
              required
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                loadingText="Signing in..."
                className="w-full py-2.5"
              >
                Sign In
              </Button>
            </div>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isResetting}
                className="text-xs font-medium text-terracotta-700 transition hover:text-terracotta-800 disabled:cursor-not-allowed disabled:text-stone-400 focus:outline-none focus-visible:underline"
              >
                {isResetting ? "Sending reset link..." : "Forgot your password?"}
              </button>
            </div>
          </form>

          {/* Quick Demo Access for Recruiters & Evaluators */}
          <div className="mt-6 border-t border-border-warm pt-5">
            <div className="rounded-2xl border border-terracotta-200/90 bg-terracotta-50/60 p-4 text-center">
              <div className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-terracotta-800">
                <Sparkles className="h-3.5 w-3.5 text-terracotta-600" aria-hidden="true" />
                <span>Recruiter & Evaluator Access</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                Explore CampusConnect as senior architecture student <strong className="font-semibold text-ink">Alex Rivera</strong> with pre-seeded campus activity, peers, and connections.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={handleDemoLogin}
                loading={isDemoSubmitting}
                loadingText="Entering demo..."
                className="mt-3.5 w-full border-terracotta-300/80 bg-white/90 text-xs font-medium text-terracotta-800 shadow-2xs transition hover:bg-white hover:border-terracotta-400"
              >
                Explore as Demo Student (Alex Rivera)
              </Button>
            </div>
          </div>

          <div className="mt-6 border-t border-border-warm pt-5 text-center text-sm text-ink-muted">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              className="font-semibold text-terracotta-700 transition hover:text-terracotta-800"
            >
              Create account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

