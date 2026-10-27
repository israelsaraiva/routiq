export interface Author {
  name: string;
  email: string;
}

const AUTHOR_STRING_PATTERN = /^([^<(]*?)\s*(?:<([^>]*)>)?\s*(?:\([^)]*\))?$/;

export function parseAuthor(value: unknown): Author {
  if (typeof value === 'string') {
    const match = AUTHOR_STRING_PATTERN.exec(value.trim());
    return { name: match?.[1] ?? '', email: match?.[2] ?? '' };
  }
  const fields = (typeof value === 'object' && value !== null ? value : {}) as { name?: unknown; email?: unknown };
  return { name: typeof fields.name === 'string' ? fields.name : '', email: typeof fields.email === 'string' ? fields.email : '' };
}

export function feedbackMailto(author: Author, productName: string, version: string): string | undefined {
  if (!author.email) {
    return undefined;
  }
  const subject = encodeURIComponent(`${productName} ${version} feedback`);
  return `mailto:${author.email}?subject=${subject}`;
}
