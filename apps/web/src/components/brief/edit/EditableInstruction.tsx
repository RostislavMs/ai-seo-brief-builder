import { Instruction, INSTRUCTION_CLASS } from "../../ui/Instruction";
import type { BriefPath } from "../../../lib/briefEdit";
import { useBriefEdit } from "./BriefEditContext";
import { RevertMark } from "./Controls";
import { EditableText } from "./Editable";

interface EditableInstructionProps {
  path: BriefPath;
  text: string | undefined;
  /** Чия це інструкція — «розділу», «блоку». Для підказки й скрінрідера. */
  scope: string;
}

/**
 * Інструкція для райтера, яку можна виправити.
 *
 * У режимі перегляду віддає той самий `Instruction`, що й до появи правки, —
 * не «схожий», а буквально його: інструкції показуються не лише в ТЗ, а й
 * у звіті порівняння та за публічним посиланням, і розійтися ці два вигляди
 * не мають права.
 *
 * У режимі правки видима завжди, навіть порожня. Інакше в щойно доданому
 * розділі інструкції не було б звідки взятися: показувати нічого, а отже
 * й клікнути нема куди.
 */
export function EditableInstruction({
  path,
  text,
  scope,
}: EditableInstructionProps) {
  const edit = useBriefEdit();

  if (!edit.editable) return <Instruction text={text} />;

  const label = `інструкція ${scope}`;

  return (
    // Кнопка повернення поряд, а не після абзацу: інструкція — блок на всю
    // ширину, і кнопка за нею поїхала б на власний рядок.
    <div className="flex items-start gap-1">
      <EditableText
        as="p"
        path={path}
        value={text ?? ""}
        className={`${INSTRUCTION_CLASS} min-w-0 flex-1`}
        lang="en"
        copy="em"
        label={label}
        placeholder="Instruction for the writer, in English"
        revert={false}
      />
      <RevertMark path={path} label={label} />
    </div>
  );
}
