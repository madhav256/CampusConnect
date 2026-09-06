import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

const initialForm = {
  name: "",
  email: "",
  password: "",
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRegisterForm(form) {
  const errors = {};

  if (!form.name.trim()) {
    errors.name = "Full name is required.";
  }

  if (!form.email.trim()) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (form.password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  return errors;
}

export default function Register() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [name]: "" }));
    setFeedback("");
  };

  const handleRegister = async (event) => {
    event.preventDefault();

    const validationErrors = validateRegisterForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("");

    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setIsSubmitting(false);
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
            Join CampusConnect
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Create your account and discover classmates
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Card className="p-8 shadow-xs">
          <form onSubmit={handleRegister} className="space-y-4">
            {feedback && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {feedback}
              </div>
            )}

            <Input
              id="register-name"
              type="text"
              name="name"
              label="Full Name"
              placeholder="Jane Doe"
              value={form.name}
              onChange={handleChange}
              error={errors.name}
              required
            />

            <Input
              id="register-email"
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
              id="register-password"
              type="password"
              name="password"
              label="Password"
              placeholder="At least 6 characters"
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
                loadingText="Creating account..."
                className="w-full py-2.5"
              >
                Create Account
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-border-warm pt-5 text-center text-sm text-ink-muted">
            Already have an account?{" "}
            <Link
              to="/"
              className="font-semibold text-terracotta-700 transition hover:text-terracotta-800"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

