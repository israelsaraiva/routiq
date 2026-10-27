import { randomUUID } from 'crypto';

export type IdGenerator = () => string;

export const generateId: IdGenerator = () => randomUUID();
