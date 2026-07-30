/// <reference types="vite/client" />

/**
 * Явна типізація змінних оточення. Без неї vite/client віддає їх як any,
 * і помилка в назві змінної помітна лише в рантаймі порожнім екраном.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
