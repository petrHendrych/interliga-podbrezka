import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
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
  incompletePositions: 'Vyplň všetkých 6 pozícií',
  tooManySubstitutions: 'Najviac 2 striedania',
  substitutionNotAllowed: 'Striedanie až od sezóny 2026/2027',
  invalidThrowNumber: 'Neplatný hod striedania',
  duplicatePlayer: 'Hráč je dvakrát',
  invalidScore: 'Neplatný výkon',
  invalidMatchPoints: 'Neplatné body',
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
  teamMatchPoints: 'Naše body',
  opponentMatchPoints: 'Body súpera',
  optional: 'nepovinné',
  players: 'Hráči',
  playersHint: 'Vždy 6 pozícií',
  playerPlaceholder: 'Vyberte hráča',
  full: 'Plné',
  clean: 'Dorážka',
  total: 'Spolu',
  faults: 'Chyby',
  position: '{n}. pozícia',
  addSubstitution: 'Striedanie hráča',
  substitute: 'Striedajúci hráč',
  fromThrow: 'Od hodu',
  fromThrowHint: '61 = od polovice',
  removeSubstitution: 'Zrušiť striedanie',
  positionTotal: 'Pozícia spolu',
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

function renderForm(props: Partial<ComponentProps<typeof ManualMatchForm>> = {}) {
  return render(
    <ManualMatchForm
      lang="sk"
      seasons={seasons}
      players={players}
      initial={null}
      translations={translations}
      {...props}
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

describe('positions', () => {
  it('always shows six position cards and no way to add a seventh', () => {
    renderForm();
    expect(screen.getAllByRole('region', { name: /pozícia/ })).toHaveLength(6);
    expect(screen.getAllByLabelText(translations.full)).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Pridať hráča/ })).not.toBeInTheDocument();
  });
});

describe('substitutions', () => {
  function substituteButtons() {
    return screen.queryAllByRole('button', { name: translations.addSubstitution });
  }

  it('offers a substitution in every card from season 13', () => {
    renderForm();
    expect(substituteButtons()).toHaveLength(6);
  });

  it('offers none before season 13', () => {
    renderForm({ seasons: [{ ...seasons[0], id: 12, name: '2025/2026' }] });
    expect(substituteButtons()).toHaveLength(0);
  });

  it('opens a substitute section with its own throw and results in the same card', () => {
    renderForm();
    fireEvent.click(substituteButtons()[1]);

    const card = screen.getByRole('region', { name: '2. pozícia' });
    expect(within(card).getByLabelText(translations.fromThrow)).toHaveValue(null);
    expect(within(card).getAllByLabelText(translations.full)).toHaveLength(2);
    expect(within(card).getByText(translations.substitute)).toBeInTheDocument();
  });

  it('lets the substitute be substituted again, then hides the button in every card', () => {
    renderForm();
    fireEvent.click(substituteButtons()[0]);

    const card = screen.getByRole('region', { name: '1. pozícia' });
    expect(within(card).getByRole('button', { name: translations.addSubstitution }))
      .toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: translations.addSubstitution }));
    expect(within(card).getAllByLabelText(translations.fromThrow)).toHaveLength(2);
    expect(substituteButtons()).toHaveLength(0);
  });

  it('hides the button once two cards hold a substitution each', () => {
    renderForm();
    fireEvent.click(substituteButtons()[0]);
    fireEvent.click(substituteButtons()[1]);
    expect(substituteButtons()).toHaveLength(0);
  });

  it('removes a substitute together with the one who replaced them', () => {
    renderForm();
    fireEvent.click(substituteButtons()[0]);
    const card = screen.getByRole('region', { name: '1. pozícia' });
    fireEvent.click(within(card).getByRole('button', { name: translations.addSubstitution }));

    fireEvent.click(within(card).getAllByRole('button', { name: translations.removeSubstitution })[0]);
    expect(within(card).queryByLabelText(translations.fromThrow)).not.toBeInTheDocument();
    expect(substituteButtons()).toHaveLength(6);
  });

  it('shows the position total as the sum of both players', () => {
    renderForm();
    fireEvent.click(substituteButtons()[0]);
    const card = screen.getByRole('region', { name: '1. pozícia' });
    const [starterFull, subFull] = within(card).getAllByLabelText(translations.full);

    fireEvent.change(starterFull, { target: { value: '380' } });
    fireEvent.change(subFull, { target: { value: '345' } });

    expect(within(card).getByText(`${translations.positionTotal}:`, { exact: false }))
      .toBeInTheDocument();
    expect(within(card).getByText('725')).toBeInTheDocument();
  });

  it('renders a saved chain when editing', () => {
    renderForm({
      initial: {
        externalId: 900_000_002,
        date: '2026-09-12',
        seasonId: 13,
        leagueId: 9013,
        opponent: 'Rakovice',
        isHome: true,
        opponentTotalScore: null,
        teamMatchPoints: null,
        opponentMatchPoints: null,
        positions: [{
          starter: {
            userId: 'u1', name: 'Ján Novák', full: 250, clean: 120, faults: 1,
          },
          substitutions: [{
            userId: 'u2', name: 'Peter Kováč', full: 120, clean: 60, faults: 0, fromThrow: 61,
          }],
        }],
      },
    });

    const card = screen.getByRole('region', { name: '1. pozícia' });
    expect(within(card).getByLabelText(translations.fromThrow)).toHaveValue(61);
    expect(within(card).getByText('Peter Kováč')).toBeInTheDocument();
    expect(within(card).getByText('550')).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /pozícia/ })).toHaveLength(6);
  });
});

describe('saving', () => {
  it('sends all six positions, with numbers rather than strings', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: true, matchId: 900_000_001 });
    renderForm();

    fireEvent.change(screen.getByLabelText(translations.opponent), {
      target: { value: 'Rakovice' },
    });
    fireEvent.change(screen.getAllByLabelText(translations.full)[0], {
      target: { value: '400' },
    });
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(saveManualMatch).toHaveBeenCalledOnce());
    const sent = vi.mocked(saveManualMatch).mock.calls[0][0];
    expect(sent).toMatchObject({ opponent: 'Rakovice', seasonId: 13 });
    expect(sent.positions).toHaveLength(6);
    expect(sent.positions[0]).toEqual({
      starter: {
        userId: '', full: 400, clean: 0, faults: 0,
      },
      substitutions: [],
    });
  });

  it('sends a substitute with its throw number', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: true, matchId: 900_000_001 });
    renderForm();

    fireEvent.click(screen.getAllByRole('button', { name: translations.addSubstitution })[2]);
    const card = screen.getByRole('region', { name: '3. pozícia' });
    fireEvent.change(within(card).getByLabelText(translations.fromThrow), {
      target: { value: '61' },
    });
    fireEvent.change(within(card).getAllByLabelText(translations.faults)[1], {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(saveManualMatch).toHaveBeenCalledOnce());
    expect(vi.mocked(saveManualMatch).mock.calls[0][0].positions[2].substitutions).toEqual([{
      userId: '', full: 0, clean: 0, faults: 2, fromThrow: 61,
    }]);
  });

  it('renders the incomplete-positions error', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: false, error: 'incompletePositions' });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    expect(await screen.findByText(errors.incompletePositions)).toBeInTheDocument();
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

  it('sends half match points as numbers', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: true, matchId: 900_000_001 });
    renderForm();

    fireEvent.change(screen.getByLabelText(/Naše body/), { target: { value: '4.5' } });
    fireEvent.change(screen.getByLabelText(/Body súpera/), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(saveManualMatch).toHaveBeenCalledWith(
      expect.objectContaining({ teamMatchPoints: 4.5, opponentMatchPoints: 3.5 }),
    ));
  });

  it('sends empty match points as null', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: true, matchId: 900_000_001 });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(saveManualMatch).toHaveBeenCalledWith(
      expect.objectContaining({ teamMatchPoints: null, opponentMatchPoints: null }),
    ));
  });

  it('renders the match-point error and keeps the entered points', async () => {
    vi.mocked(saveManualMatch).mockResolvedValue({ success: false, error: 'invalidMatchPoints' });
    renderForm();

    fireEvent.change(screen.getByLabelText(/Naše body/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    expect(await screen.findByText(errors.invalidMatchPoints)).toBeInTheDocument();
    expect(screen.getByLabelText(/Naše body/)).toHaveValue(2);
  });
});
