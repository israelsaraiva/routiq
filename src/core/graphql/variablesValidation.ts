export type VariablesValidation = { valid: true } | { valid: false; message: string };

export function validateVariables(text: string): VariablesValidation {
  if (text.trim() === '') {
    return { valid: true };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? { valid: true }
      : { valid: false, message: 'Variables must be a JSON object.' };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : String(error) };
  }
}
