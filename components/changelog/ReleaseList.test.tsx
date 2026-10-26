import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseList } from '@/components/changelog/ReleaseList';
import type { Locale } from '@/lib/i18n/config';
import type { ReleaseView } from '@/lib/changelog/types';
import cs from '@/locales/cs.json';
import hu from '@/locales/hu.json';
import sk from '@/locales/sk.json';
import sr from '@/locales/sr.json';

const RELEASE: ReleaseView = {
  id: 1,
  version: '1.42.180',
  releasedAt: '2026-10-26T10:00:00.000Z',
  groups: [{ type: 'fix', items: ['Oprava'] }],
};

describe('ReleaseList', () => {
  it.each([
    ['sk', sk.changelog, 'Verzia 1.42.180 · 26. 10. 2026'],
    ['cs', cs.changelog, 'Verze 1.42.180 · 26. 10. 2026'],
    ['hu', hu.changelog, '1.42.180 verzió · 2026. 10. 26.'],
    ['sr', sr.changelog, 'Verzija 1.42.180 · 26. 10. 2026.'],
  ] as [Locale, typeof sk.changelog, string][])('formats the %s release header', (lang, t, header) => {
    render(<ReleaseList releases={[RELEASE]} lang={lang} translations={t} />);
    expect(screen.getByRole('heading', { name: header })).toBeInTheDocument();
  });

  it('shows only the groups the release has', () => {
    render(<ReleaseList releases={[RELEASE]} lang="sk" translations={sk.changelog} />);

    expect(screen.getByRole('heading', { name: 'Opravy' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Novinky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vylepšenia' })).not.toBeInTheDocument();
  });
});
