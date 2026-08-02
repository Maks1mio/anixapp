export type ProfileSocialPages = {
  vk_page?: string | null;
  tg_page?: string | null;
  inst_page?: string | null;
  tt_page?: string | null;
  discord_page?: string | null;
};

export type ProfileSocialLink = {
  id: 'vk' | 'tg' | 'inst' | 'tt' | 'discord';
  label: string;
  value: string;
  href?: string;
  copy?: boolean;
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSocialPages(raw: ProfileSocialPages | Record<string, unknown> | null | undefined): ProfileSocialPages {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    vk_page: clean(r.vk_page ?? r.vkPage),
    tg_page: clean(r.tg_page ?? r.tgPage),
    inst_page: clean(r.inst_page ?? r.instPage),
    tt_page: clean(r.tt_page ?? r.ttPage),
    discord_page: clean(r.discord_page ?? r.discordPage),
  };
}

export function hasProfileSocial(pages: ProfileSocialPages | Record<string, unknown> | null | undefined): boolean {
  const p = normalizeSocialPages(pages);
  return !!(p.vk_page || p.tg_page || p.inst_page || p.tt_page || p.discord_page);
}

export function listSocialLinks(pages: ProfileSocialPages | Record<string, unknown> | null | undefined): ProfileSocialLink[] {
  const p = normalizeSocialPages(pages);
  const out: ProfileSocialLink[] = [];
  if (p.vk_page) {
    out.push({ id: 'vk', label: 'ВКонтакте', value: p.vk_page, href: `https://vk.com/${p.vk_page}` });
  }
  if (p.tg_page) {
    out.push({ id: 'tg', label: 'Telegram', value: p.tg_page, href: `https://t.me/${p.tg_page}` });
  }
  if (p.discord_page) {
    out.push({ id: 'discord', label: 'Discord', value: p.discord_page, copy: true });
  }
  if (p.inst_page) {
    out.push({ id: 'inst', label: 'Instagram', value: p.inst_page, href: `https://instagram.com/${p.inst_page}` });
  }
  if (p.tt_page) {
    out.push({ id: 'tt', label: 'TikTok', value: p.tt_page, href: `https://tiktok.com/@${p.tt_page}` });
  }
  return out;
}

/** Иконки как в Anixart (ic_vk / ic_telegram / …). */
export const SOCIAL_ICONS: Record<ProfileSocialLink['id'], string> = {
  vk: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#0077ff" d="M12.8 17.8c-6.4 0-10-4.4-10.1-11.6h3.2c.1 5.3 2.5 7.6 4.3 8.1V6.2h3v4.6c1.8-.2 3.8-2.3 4.4-4.6h3C20.1 9 18 11.1 16.5 12c1.5.7 3.9 2.5 4.8 5.8H18c-.7-2.2-2.5-3.9-4.8-4.2v4.2H12.8z"/></svg>`,
  tg: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#0088cc" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3l-4.1-1.3c-.88-.25-.89-.86.2-1.3L19.81 4.54c.73-.33 1.43.18 1.15 1.3L18.24 18.65c-.19.91-.74 1.13-1.5.71l-4.14-3.06-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#5865F2" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
  inst: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#e1306c" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4A5.8 5.8 0 0 1 16.2 22H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2M7.6 4A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8A3.6 3.6 0 0 0 20 16.4V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`,
  tt: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.7-.22-1.5-.18-2.15.21-.7.4-1.2 1.1-1.35 1.88-.18.94.16 1.96.9 2.54.69.55 1.71.69 2.53.37.8-.29 1.36-.98 1.5-1.8.08-.55.07-4.91.07-8.49z"/></svg>`,
};

export async function openSocialLink(link: ProfileSocialLink): Promise<'copied' | 'opened' | 'error'> {
  if (link.copy) {
    try {
      await navigator.clipboard.writeText(link.value);
      return 'copied';
    } catch {
      return 'error';
    }
  }
  if (link.href) {
    window.electron?.openExternal?.(link.href);
    return 'opened';
  }
  return 'error';
}
