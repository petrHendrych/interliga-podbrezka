import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ManualMatchError } from '@/lib/validation/manual-match';
import { saveManualMatch } from '@/lib/manual-match-actions';
import { ManualMatchForm, type ManualMatchFormTranslations } from './ManualMatchForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/manual-match-actions', () => ({
  saveManualMatch: vi.fn(),
}));

const errors: Record<ManualMatchError, string> = {
  unauthorized: 'Nemáte oprávnenie',
  invalidLeague: 'Neplatná súťaž',
  invalidDate: 'Neplatný dátum',
  noPlayers: 'Chýbajú hráči',
  duplicatePlayer: 'Hráč je dvakrát',
  invalidScore: 'Neplatný výkon',
  notFound: 'Zápas sa nenašiel',
  notManual: 'Zápas nie je manuálny',
  unknown: 'Neznáma chyba',
};

const translations: ManualMatchFormTranslations = {
  formTitleCreate: 'Nový zápas',
  formTitleEdit: 'Upraviť zápas',
  season: 'Sezóna',
  competition: 'Súťaž',
  date: 'Dátum',
  datePlaceholder: 'Vyberte dátum',
  opponent: 'Súper',
  opponentPlaceholder: 'Názov súpera',
  venue: 'Miesto',
  home: 'Doma',
  away: 'Vonku',
  opponentTotalScore: 'Skóre súpera',
  optional: 'nepovinné',
  players: 'Hráči',
  playersHint: 'Prázdne riadky sa ignorujú',
  player: 'Hráč',
  playerPlaceholder: 'Vyberte hráča',
  full: 'Plné',
  clean: 'Dorážka',
  total: 'Spolu',
  faults: 'Chyby',
  addPlayer: 'Pridať hráča',
  removePlayer: 'Odobrať hráča',
  teamTotal: 'Tím spolu',
  save: 'Uložiť',
  saving: 'Ukladá sa…',
  cancelEdit: 'Zrušiť',
  errors,
};

const seasons = [{
  id: 13,
  name: '2026/2027',
  leagues: [{ leagueId: 9013, name: 'Svetový pohár' }],
}];

const players = [
  { id: 'u1', name: 'Ján Novák' },
  { id: 'u2', name: 'Peter Kováč' },
];

function renderForm() {
  return render(
    <ManualMatchForm
      lang="sk"
      seasons={seasons}
      players={players}
      initial={null}
      translations={translations}
    />,
  );
}

function firstRowKey(): string {
  const input = screen.getAllByLabelText(translations.full)[0] as HTMLInputElement;
  return input.id.replace('-full', '');
}

beforeEach(() => {
  vi.mocked(saveManualMatch).mockReset();
});

describe('score arithmetic', () => {
  it('shows a row total of full plus clean', () => {
    renderForm();
    const key = firstRowKey();

    fireEvent.change(screen.getByLabelText<HTMLInputElement>(translations.full, {
      selector: `#${key}-full`,
    }), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(translations.clean, {
      selector: `#${key}-clean`,
    }), { target: { value: '210' } });

    expect(screen.getAllByText('610').length).toBeGreaterThan(0);
  });

  it('sums the team total across rows', () => {
    renderForm();
    const fullInputs = screen.getAllByLabelText<HTMLInputElement>(translations.full);

    fireEvent.change(fullInputs[0], { target: { value: '400' } });
    fireEvent.change(fullInputs[1], { target: { value: '350' } });

    expect(screen.getByText('750')).toBeInTheDocument();
  });

  it('treats a blank score as zero rather than NaN', () => {
    renderForm();
    fireEvent.change(screen.getAllByLabelText<HTMLInputElement>(translations.full)[0], {
      target: { value: '' },
    });

    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });
});

describe('rows', () => {
  it('starts with six slots and can add another', () => {
    renderForm();
    expect(screen.getAllByLabelText(translations.full)).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: translations.addPlayer }));
    expect(screen.getAllByLabelText(translations.full)).toHaveLength(7);
  });

  it('removes a row', () => {
    renderForm();
    fireEvent.click(screen.getAllByRole('button', { name: translations.removePlayer })[0]);

    expect(screen.getAllByLabelText(translations.full)).toHaveLength(5);
  });
});

describe('saving', () => {
  it('drops empty slots and sends numbers, not strings', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: true, matchId: 900_000_001 });
    renderForm();

    fireEvent.change(screen.getByLabelText(translations.opponent), {
      target: { value: 'Rakovice' },
    });
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(saveManualMatch).toHaveBeenCalledWith(
      expect.objectContaining({ opponent: 'Rakovice', players: [], seasonId: 13 }),
    ));
  });

  it('renders the localized error and keeps the form filled', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: false, error: 'duplicatePlayer' });
    renderForm();

    fireEvent.change(screen.getByLabelText(translations.opponent), {
      target: { value: 'Rakovice' },
    });
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    expect(await screen.findByText(errors.duplicatePlayer)).toBeInTheDocument();
    expect(screen.getByLabelText(translations.opponent)).toHaveValue('Rakovice');
  });
});
