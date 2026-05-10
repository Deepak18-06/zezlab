"use client";

import { useState, FormEvent } from "react";

interface CaptureFormProps {
  /** Shown above the form */
  headline?: string;
  /** Source tag sent with the submission */
  source?: string;
}

interface FormState {
  status: "idle" | "submitting" | "success" | "error";
  message?: string;
}

export default function CaptureForm({
  headline = "Get in touch",
  source,
}: CaptureFormProps) {
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ status: "submitting" });

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    // Pull UTM params from the current URL
    const params = new URLSearchParams(window.location.search);
    const utm = {
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      utmContent: params.get("utm_content") ?? undefined,
      utmTerm: params.get("utm_term") ?? undefined,
    };

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          ...utm,
          source,
          referrer: document.referrer || undefined,
          page: window.location.pathname,
        }),
      });

      if (!res.ok) throw new Error("Network error");
      setState({ status: "success" });
      form.reset();
    } catch {
      setState({ status: "error", message: "Something went wrong. Please try again." });
    }
  }

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <p className="text-lg font-medium text-green-800">You&apos;re on the list!</p>
        <p className="mt-1 text-sm text-green-600">We&apos;ll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      {headline && (
        <h2 className="mb-6 text-2xl font-semibold text-gray-900">{headline}</h2>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" autoComplete="given-name" />
          <Field label="Last name" name="lastName" autoComplete="family-name" />
        </div>

        <Field
          label="Work email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />

        <Field label="Company" name="company" autoComplete="organization" />
        <Field label="Job title" name="jobTitle" autoComplete="organization-title" />

        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={state.status === "submitting"}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
        >
          {state.status === "submitting" ? "Submitting…" : "Get started"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
