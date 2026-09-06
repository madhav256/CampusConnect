import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Section from "../components/layout/Section";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import Avatar from "../components/ui/Avatar";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";

import { useAuth } from "../hooks/useAuth";
import { useUserProfile } from "../hooks/useUserProfile";

const emptyForm = {
  displayName: "",
  bio: "",
  department: "",
  year: "",
  skills: "",
  socialLinks: {
    github: "",
    linkedin: "",
    portfolio: "",
    website: "",
  },
};

function profileToForm(profile) {
  return {
    displayName: profile?.displayName || "",
    bio: profile?.bio || "",
    department: profile?.department || "",
    year: profile?.year || "",
    skills: Array.isArray(profile?.skills) ? profile.skills.join(", ") : "",
    socialLinks: {
      github: profile?.socialLinks?.github || "",
      linkedin: profile?.socialLinks?.linkedin || "",
      portfolio: profile?.socialLinks?.portfolio || "",
      website: profile?.socialLinks?.website || "",
    },
  };
}

function normalizeUrl(value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function getProfileUpdates(form) {
  return {
    displayName: form.displayName.trim(),
    bio: form.bio.trim(),
    department: form.department.trim(),
    year: form.year.trim(),
    skills: form.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean),
    socialLinks: {
      github: normalizeUrl(form.socialLinks.github),
      linkedin: normalizeUrl(form.socialLinks.linkedin),
      portfolio: normalizeUrl(form.socialLinks.portfolio),
      website: normalizeUrl(form.socialLinks.website),
    },
  };
}

function validateProfileForm(form) {
  const errors = {};

  if (!form.displayName.trim()) {
    errors.displayName = "Display name is required.";
  }

  if (form.bio.length > 280) {
    errors.bio = "Bio must be 280 characters or fewer.";
  }

  return errors;
}

function getVisibleLinks(socialLinks = {}) {
  return Object.entries(socialLinks).filter(([, value]) => Boolean(value));
}

export default function Profile() {
  const { user } = useAuth();
  const { profile, loading, error, saveProfile } = useUserProfile(user?.uid);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("success");
  const [isSaving, setIsSaving] = useState(false);

  const visibleLinks = useMemo(
    () => getVisibleLinks(profile?.socialLinks),
    [profile?.socialLinks],
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFeedback("");
    setErrors((currentErrors) => ({ ...currentErrors, [name]: "" }));

    if (name.startsWith("socialLinks.")) {
      const linkName = name.split(".")[1];
      setForm((currentForm) => ({
        ...currentForm,
        socialLinks: {
          ...currentForm.socialLinks,
          [linkName]: value,
        },
      }));
      return;
    }

    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handleCancel = () => {
    setForm(profileToForm(profile));
    setErrors({});
    setFeedback("");
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    setForm(profileToForm(profile));
    setErrors({});
    setFeedback("");
    setIsEditing(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = validateProfileForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      await saveProfile(getProfileUpdates(form));
      setFeedbackType("success");
      setFeedback("Profile updated successfully.");
      setIsEditing(false);
    } catch (saveError) {
      setFeedbackType("error");
      setFeedback(saveError.message || "Unable to update your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <PageContainer>
          <div className="space-y-6">
            <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
              <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
            </div>
          </div>
        </PageContainer>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <PageContainer>
          <Card className="mx-auto max-w-2xl text-center">
            <h1 className="text-2xl font-semibold text-slate-950">Profile unavailable</h1>
            <p className="mt-2 text-slate-600">
              {error || "Your profile document could not be found."}
            </p>
            <Link
              to="/dashboard"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Back to dashboard
            </Link>
          </Card>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <Navbar />
      <PageContainer>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-950">My Profile</h1>
            <Button variant="outline" onClick={handleStartEditing}>
              Edit profile
            </Button>
          </div>

        {feedback && (
          <p
            className={`rounded-xl border p-3 text-sm ${
              feedbackType === "success"
                ? "border-green-100 bg-green-50 text-green-700"
                : "border-red-100 bg-red-50 text-red-700"
            }`}
          >
            {feedback}
          </p>
        )}

        <Card className="overflow-hidden p-0">
          <div className="h-28 bg-indigo-600" />
          <div className="px-6 pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Avatar name={profile.displayName} photoURL={profile.photoURL} size="xl" />
                <div>
                  <h1 className="text-3xl font-bold text-slate-950">{profile.displayName}</h1>
                  <p className="mt-1 text-slate-500">{profile.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                  {profile.department}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {profile.year}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <Section title="About" subtitle="Your academic profile and introduction.">
              {isEditing ? (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <Input
                    id="displayName"
                    name="displayName"
                    label="Display name"
                    required
                    value={form.displayName}
                    onChange={handleChange}
                    error={errors.displayName}
                  />
                  <Textarea
                    id="bio"
                    name="bio"
                    label="Bio"
                    value={form.bio}
                    onChange={handleChange}
                    error={errors.bio}
                    helperText={`${form.bio.length}/280 characters`}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="department"
                      name="department"
                      label="Department"
                      placeholder="Computer Science"
                      value={form.department}
                      onChange={handleChange}
                    />
                    <Input
                      id="year"
                      name="year"
                      label="Academic year"
                      placeholder="Second year"
                      value={form.year}
                      onChange={handleChange}
                    />
                  </div>
                  <Input
                    id="skills"
                    name="skills"
                    label="Skills"
                    placeholder="React, Firebase, UI Design"
                    value={form.skills}
                    onChange={handleChange}
                    helperText="Separate skills with commas."
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="github"
                      name="socialLinks.github"
                      label="GitHub"
                      value={form.socialLinks.github}
                      onChange={handleChange}
                    />
                    <Input
                      id="linkedin"
                      name="socialLinks.linkedin"
                      label="LinkedIn"
                      value={form.socialLinks.linkedin}
                      onChange={handleChange}
                    />
                    <Input
                      id="portfolio"
                      name="socialLinks.portfolio"
                      label="Portfolio"
                      value={form.socialLinks.portfolio}
                      onChange={handleChange}
                    />
                    <Input
                      id="website"
                      name="socialLinks.website"
                      label="Website"
                      value={form.socialLinks.website}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="submit" loading={isSaving}>
                      Save profile
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-slate-700">
                  {profile.bio || "Add a short bio to help classmates get to know you."}
                </p>
              )}
            </Section>
          </Card>

          <div className="space-y-6">
            <Card>
              <Section title="Skills">
                {profile.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No skills added yet.</p>
                )}
              </Section>
            </Card>

            <Card>
              <Section title="Social links">
                {visibleLinks.length > 0 ? (
                  <div className="space-y-3">
                    {visibleLinks.map(([label, value]) => (
                      <a
                        key={label}
                        href={value}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-slate-50"
                      >
                        {label.charAt(0).toUpperCase() + label.slice(1)}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No social links added yet.</p>
                )}
              </Section>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  </div>
);
}

