alter table public.events
  add column if not exists theme_primary_color text not null default '#c70d96'
    check (theme_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists theme_secondary_color text not null default '#e98cdb'
    check (theme_secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists theme_font_family text not null default 'DM Sans'
    check (theme_font_family in ('DM Sans', 'Manrope', 'Arial', 'Georgia', 'system-ui'));
