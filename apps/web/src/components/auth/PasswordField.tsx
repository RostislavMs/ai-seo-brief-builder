import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "../ui/Icon";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
}

/**
 * Поле пароля з перемикачем видимості.
 *
 * Показ пароля — не прикраса: на телефоні помилка в довгому паролі
 * інакше не діагностується взагалі, і користувач просто йде.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  minLength,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          className="input pr-11"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          {...(minLength ? { minLength } : {})}
          required
        />

        <button
          type="button"
          onClick={() => setVisible((previous) => !previous)}
          aria-label={visible ? "Приховати пароль" : "Показати пароль"}
          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2
            place-items-center rounded-inset text-subtle
            transition-colors duration-150 ease-out hover:text-fg"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {hint && <p className="text-2xs leading-relaxed text-subtle">{hint}</p>}
    </div>
  );
}
