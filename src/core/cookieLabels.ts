import { Cookie } from './cookies';

export interface CookieLabel {
  title: string;
  detail: string;
}

export function describeCookie(cookie: Cookie): CookieLabel {
  const flags = [cookie.secure ? 'Secure' : '', cookie.expiresAt === undefined ? 'session' : `expires ${new Date(cookie.expiresAt).toISOString()}`];
  return {
    title: `${cookie.name}=${cookie.value}`,
    detail: `${cookie.domain}${cookie.path} ${flags.filter(Boolean).join(', ')}`,
  };
}
