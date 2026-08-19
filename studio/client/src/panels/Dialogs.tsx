import { useEffect, useRef, useState } from "preact/hooks";
import { confirmRequest, promptRequest, type PromptRequest } from "../lib/dialogs.ts";

/**
 * Keyed on the request id by its parent, so each new prompt mounts a fresh
 * component. Seeding the field from an effect instead would leave a window
 * where the previous value is still on screen and anything typed into it is
 * overwritten when the effect finally runs.
 */
function TextPrompt({ request }: { request: PromptRequest }) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(request.initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Selected, so a suggested slug can be typed straight over.
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = (event: Event) => {
    event.preventDefault();
    const problem = request.validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    request.resolve(value);
  };

  return (
    <div class="overlay" onClick={() => request.resolve(null)}>
      <form class="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{request.title}</h2>
        <label>
          <span>{request.label}</span>
          <input
            ref={input}
            value={value}
            onInput={(e) => {
              setValue((e.target as HTMLInputElement).value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Escape" && request.resolve(null)}
          />
        </label>
        {error && <p class="dialog-error">{error}</p>}
        <div class="dialog-actions">
          <button type="button" class="btn" onClick={() => request.resolve(null)}>
            Cancel
          </button>
          <button type="submit" class="btn btn--primary">
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function Confirm() {
  const request = confirmRequest.value;
  if (!request) return null;

  return (
    <div class="overlay" onClick={() => request.resolve(false)}>
      <div class="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{request.title}</h2>
        <p>{request.message}</p>

        {request.detail.length > 0 && (
          <ul class="dialog-detail">
            {request.detail.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        <div class="dialog-actions">
          <button type="button" class="btn" onClick={() => request.resolve(false)}>
            Cancel
          </button>
          <button
            type="button"
            class={`btn ${request.danger ? "btn--danger" : "btn--primary"}`}
            onClick={() => request.resolve(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const prompt = promptRequest.value;

  return (
    <>
      {prompt && <TextPrompt key={prompt.id} request={prompt} />}
      <Confirm />
    </>
  );
}
