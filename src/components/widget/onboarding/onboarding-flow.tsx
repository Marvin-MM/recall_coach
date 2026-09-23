"use client";

import { X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  coachLimits,
  EXPERIENCE_LEVELS,
  LEARNING_FORMATS,
  LEARNING_VERBOSITY,
} from "@/config/coach";
import { ApiError, api } from "@/lib/api-client";
import { type OnboardingInput, onboardingSchema } from "@/lib/schemas/api";
import type { OnboardingStep } from "../state";

type Draft = {
  targetRole: string;
  company: string;
  level: (typeof EXPERIENCE_LEVELS)[number] | "";
  interviewDate: string;
  focusAreas: string[];
  format: (typeof LEARNING_FORMATS)[number] | "";
  verbosity: (typeof LEARNING_VERBOSITY)[number] | "";
  consent: boolean;
};

const EMPTY: Draft = {
  targetRole: "",
  company: "",
  level: "",
  interviewDate: "",
  focusAreas: [],
  format: "",
  verbosity: "",
  consent: false,
};

const FOCUS_SUGGESTIONS = [
  "STAR answers with a clear result",
  "System design failure modes",
  "Quantifying impact",
  "Concise answers",
  "Product sense",
  "SQL and data modelling",
];

const LEVEL_LABELS: Record<(typeof EXPERIENCE_LEVELS)[number], string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  "staff+": "Staff+",
};

const FORMAT_LABELS: Record<(typeof LEARNING_FORMATS)[number], { label: string; hint: string }> = {
  "examples-first": { label: "Examples first", hint: "Show me a model answer, then explain." },
  "theory-first": { label: "Theory first", hint: "Give me the framework, then an example." },
  socratic: { label: "Ask me questions", hint: "Guide me to the fix myself." },
};

const VERBOSITY_LABELS: Record<(typeof LEARNING_VERBOSITY)[number], string> = {
  concise: "Concise",
  detailed: "Detailed",
};

function toInput(d: Draft): OnboardingInput {
  return {
    targetRole: d.targetRole,
    company: d.company,
    level: d.level as (typeof EXPERIENCE_LEVELS)[number],
    interviewDate: d.interviewDate,
    focusAreas: d.focusAreas,
    learningStyle: {
      format: d.format as (typeof LEARNING_FORMATS)[number],
      verbosity: d.verbosity as (typeof LEARNING_VERBOSITY)[number],
    },
    consent: d.consent as true,
  };
}

const STEP_FIELDS: Record<OnboardingStep, readonly string[]> = {
  1: ["targetRole", "company", "level"],
  2: ["interviewDate", "focusAreas"],
  3: ["learningStyle", "consent"],
};

/** Field errors for the fields that belong to `step` (shared Zod schema). */
function stepErrors(d: Draft, step: OnboardingStep): Record<string, string> {
  const parsed = onboardingSchema.safeParse(toInput(d));
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const top = String(issue.path[0] ?? "");
    if (!STEP_FIELDS[step].includes(top)) continue;
    const key = issue.path.join(".");
    if (!errors[key]) {
      errors[key] =
        top === "level" || top === "learningStyle"
          ? "Choose one option."
          : top === "consent"
            ? "Please confirm to continue."
            : issue.message === "Invalid input"
              ? "Please check this field."
              : issue.message;
    }
  }
  return errors;
}

export function OnboardingFlow({
  step,
  onStep,
  onDone,
}: {
  step: OnboardingStep;
  onStep: (step: OnboardingStep) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusInput, setFocusInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function go(next: OnboardingStep) {
    onStep(next);
    setErrors({});
    // Move focus to the new step's heading for keyboard/screen-reader users.
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function addFocus(area: string) {
    const value = area.trim().slice(0, coachLimits.maxFocusAreaChars);
    if (!value || draft.focusAreas.length >= coachLimits.maxFocusAreas) return;
    if (draft.focusAreas.some((a) => a.toLowerCase() === value.toLowerCase())) return;
    set("focusAreas", [...draft.focusAreas, value]);
    setFocusInput("");
  }

  async function next() {
    const errs = stepErrors(draft, step);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (step < 3) return go((step + 1) as OnboardingStep);
    setSubmitting(true);
    try {
      const res = await api.onboard(toInput(draft));
      toast.success(`Saving your profile to Walrus (${res.savedJobs} memories)…`);
      onDone();
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : "Couldn't save. Please retry." });
    } finally {
      setSubmitting(false);
    }
  }

  const err = (key: string) =>
    errors[key] ? (
      <p id={`${id}-${key}-err`} className="text-xs text-destructive">
        {errors[key]}
      </p>
    ) : null;
  const describedBy = (key: string) => (errors[key] ? `${id}-${key}-err` : undefined);

  const titles: Record<OnboardingStep, string> = {
    1: "What are you preparing for?",
    2: "When, and what to focus on?",
    3: "How do you like to learn?",
  };

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        void next();
      }}
      noValidate
    >
      <div className="space-y-2 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground" id={`${id}-progress`}>
          Step <span className="font-mono">{step}</span> of <span className="font-mono">3</span>
        </p>
        <Progress value={(step / 3) * 100} aria-labelledby={`${id}-progress`} className="h-1" />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <h3 ref={headingRef} tabIndex={-1} className="text-lg font-medium outline-none">
          {titles[step]}
        </h3>

        {step === 1 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-role`}>Target role</Label>
              <Input
                id={`${id}-role`}
                value={draft.targetRole}
                onChange={(e) => set("targetRole", e.target.value)}
                placeholder="e.g. Backend engineer"
                maxLength={coachLimits.maxTargetRoleChars}
                autoComplete="organization-title"
                aria-invalid={Boolean(errors.targetRole)}
                aria-describedby={describedBy("targetRole")}
                required
              />
              {err("targetRole")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-company`}>
                Company <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`${id}-company`}
                value={draft.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="e.g. Stripe"
                maxLength={coachLimits.maxCompanyChars}
                autoComplete="organization"
              />
            </div>
            <fieldset className="space-y-2" aria-describedby={describedBy("level")}>
              <legend className="mb-1.5 font-medium">Level</legend>
              <RadioGroup
                value={draft.level}
                onValueChange={(v) => set("level", v as Draft["level"])}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {EXPERIENCE_LEVELS.map((level) => (
                  <Label
                    key={level}
                    htmlFor={`${id}-level-${level}`}
                    className="flex min-h-10 cursor-pointer items-center gap-2 border border-border bg-card px-3 font-normal has-[[data-state=checked]]:border-ring"
                  >
                    <RadioGroupItem id={`${id}-level-${level}`} value={level} />
                    {LEVEL_LABELS[level]}
                  </Label>
                ))}
              </RadioGroup>
              {err("level")}
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-date`}>
                Interview date <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`${id}-date`}
                type="date"
                value={draft.interviewDate}
                onChange={(e) => set("interviewDate", e.target.value)}
                aria-invalid={Boolean(errors.interviewDate)}
                aria-describedby={describedBy("interviewDate")}
                className="w-48"
              />
              {err("interviewDate")}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-focus`}>
                Focus areas{" "}
                <span className="text-muted-foreground">(up to {coachLimits.maxFocusAreas})</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${id}-focus`}
                  value={focusInput}
                  onChange={(e) => setFocusInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFocus(focusInput);
                    }
                  }}
                  placeholder="Type and press Enter"
                  maxLength={coachLimits.maxFocusAreaChars}
                  disabled={draft.focusAreas.length >= coachLimits.maxFocusAreas}
                />
                <Button type="button" variant="outline" onClick={() => addFocus(focusInput)}>
                  Add
                </Button>
              </div>
              {draft.focusAreas.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Chosen focus areas">
                  {draft.focusAreas.map((area) => (
                    <li
                      key={area}
                      className="inline-flex items-center gap-1 bg-accent py-0.5 pr-0.5 pl-2 text-xs text-accent-foreground"
                    >
                      {area}
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center hover:text-destructive"
                        onClick={() =>
                          set(
                            "focusAreas",
                            draft.focusAreas.filter((a) => a !== area),
                          )
                        }
                        aria-label={`Remove ${area}`}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-1.5">
                {FOCUS_SUGGESTIONS.filter((s) => !draft.focusAreas.includes(s)).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => addFocus(s)}
                    disabled={draft.focusAreas.length >= coachLimits.maxFocusAreas}
                  >
                    + {s}
                  </Button>
                ))}
              </div>
              {err("focusAreas")}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 font-medium">Explanations</legend>
              <RadioGroup
                value={draft.format}
                onValueChange={(v) => set("format", v as Draft["format"])}
                className="space-y-2"
              >
                {LEARNING_FORMATS.map((f) => (
                  <Label
                    key={f}
                    htmlFor={`${id}-format-${f}`}
                    className="flex cursor-pointer items-start gap-2 border border-border bg-card p-3 font-normal has-[[data-state=checked]]:border-ring"
                  >
                    <RadioGroupItem id={`${id}-format-${f}`} value={f} className="mt-0.5" />
                    <span>
                      <span className="block font-medium">{FORMAT_LABELS[f].label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {FORMAT_LABELS[f].hint}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {err("learningStyle.format")}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 font-medium">Feedback length</legend>
              <RadioGroup
                value={draft.verbosity}
                onValueChange={(v) => set("verbosity", v as Draft["verbosity"])}
                className="grid grid-cols-2 gap-2"
              >
                {LEARNING_VERBOSITY.map((v) => (
                  <Label
                    key={v}
                    htmlFor={`${id}-verbosity-${v}`}
                    className="flex min-h-10 cursor-pointer items-center gap-2 border border-border bg-card px-3 font-normal has-[[data-state=checked]]:border-ring"
                  >
                    <RadioGroupItem id={`${id}-verbosity-${v}`} value={v} />
                    {VERBOSITY_LABELS[v]}
                  </Label>
                ))}
              </RadioGroup>
              {err("learningStyle.verbosity")}
            </fieldset>

            <div className="space-y-2 border border-border bg-card p-3">
              <p className="font-medium">Before I start remembering</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                <li>
                  Notes about your practice (mistakes, strengths, goals) are encrypted and stored on
                  Walrus, a public decentralized storage network. Only this coach can decrypt them.
                </li>
                <li>
                  There's no delete button in Recall yet, so skip anything you wouldn't want kept.
                </li>
                <li>
                  Conversation transcripts are not stored by us. Don't share passwords or other
                  people's personal details.
                </li>
              </ul>
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id={`${id}-consent`}
                  checked={draft.consent}
                  onCheckedChange={(v) => set("consent", v === true)}
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={describedBy("consent")}
                />
                <Label htmlFor={`${id}-consent`} className="font-normal leading-snug">
                  I understand and agree to store coaching memories on Walrus.
                </Label>
              </div>
              {err("consent")}
            </div>
          </>
        )}

        {errors.form && (
          <p role="alert" className="text-destructive">
            {errors.form}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        {step > 1 && (
          <Button type="button" variant="ghost" onClick={() => go((step - 1) as OnboardingStep)}>
            Back
          </Button>
        )}
        <Button type="submit" className="ml-auto" disabled={submitting}>
          {step < 3 ? "Continue" : submitting ? "Saving…" : "Save and start"}
        </Button>
      </div>
    </form>
  );
}
