import { MAX_POLL_OPTIONS, validatePollDraft } from "@hoppin/core";
import { Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { inputClass } from "../lib/forms";
import { Button } from "./ui/Button";

export interface PollFormProps {
  onSubmit: (question: string, multiple: boolean, options: string[]) => Promise<void>;
  onCancel: () => void;
}

/** Ask the group a question: the question, a few options, and whether people may pick more than one. */
export function PollForm({ onSubmit, onCancel }: PollFormProps) {
  const questionId = useId();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validatePollDraft(question, options);
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      await onSubmit(question.trim(), multiple, options.map((o) => o.trim()).filter(Boolean));
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={questionId} className="text-sm font-semibold">
          Question
        </label>
        <input id={questionId} placeholder="Which beach on Thursday?" maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} className={inputClass} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Options</legend>
        {options.map((option, index) => (
          <input
            key={index}
            aria-label={`Option ${index + 1}`}
            placeholder={`Option ${index + 1}`}
            maxLength={100}
            value={option}
            onChange={(e) => setOptions((current) => current.map((o, i) => (i === index ? e.target.value : o)))}
            className={inputClass}
          />
        ))}
        {options.length < MAX_POLL_OPTIONS && (
          <div>
            <Button variant="ghost" onClick={() => setOptions((current) => [...current, ""])}>
              <Plus aria-hidden="true" className="size-4" />
              Add option
            </Button>
          </div>
        )}
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
        People can pick more than one
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          Ask the group
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
