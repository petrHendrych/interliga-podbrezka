---
name: translations
description: Guidelines for internationalization (i18n), locale management, and UI string extraction.
trigger: "user asks about translations, adding new languages, localizing components, or modifying locale files"
---

# Translation Skill


This skill guides Junie in maintaining the internationalization (i18n) system of the Interliga Podbrezová project.

## Overview
The project supports 4 languages:
- **Slovak (`sk`)** - Default
- **Czech (`cs`)**
- **Hungarian (`hu`)**
- **Serbian (`sr`)**

All translations are stored in `locales/*.json` and are type-safe.

## Guidelines for Junie

### 1. Identifying Strings
- Scan new or modified files for hardcoded strings.
- Pay attention to labels, placeholders, titles, and error messages.
- Ignore technical strings (URLs, IDs, environment variable names unless they are shown to the user).

### 2. Extracting and Naming Keys
- Create unique, descriptive keys for strings.
- Nest keys within logical sections (e.g., `home`, `playerDetail`, `common`).
- Use `camelCase` for keys.

### 3. Tone and Language
- **Informal/Non-formal**: Use informal language across all 4 locales.
  - SK: "Ahoj" instead of "Dobrý deň".
  - CS: Informal verbs and greetings.
  - HU: Informal greetings and instructions.
  - SR: Informal tone suitable for a sports team environment.

### 4. Update Process
Whenever a new translation key is added:
1. Update `locales/sk.json` (the source of truth for types).
2. Update `locales/cs.json`, `locales/hu.json`, and `locales/sr.json`.
3. If necessary, run `pnpm type-check` to verify that the keys are recognized.
4. Pass the dictionary or specific strings to components as needed.

### 5. Interpolation
When a translation string contains variables, use the `{variableName}` syntax in the JSON files and the `interpolate` helper function in the components. This keeps the JSX clean and ensures correct word order in all languages.

**JSON Example:**
```json
{
  "playerDetail": {
    "bonuses": "Bonusy: {amount} €"
  }
}
```

**Component Example:**
```tsx
import { interpolate } from '@/lib/i18n/dictionaries';

// ... inside component
<p>{interpolate(dict.playerDetail.bonuses, { amount: balance.totalBonuses })}</p>
```

### 6. Synchronization Checklist
- [ ] Added key to `sk.json`.
- [ ] Added key to `cs.json`.
- [ ] Added key to `hu.json`.
- [ ] Added key to `sr.json`.
- [ ] Verified that the key matches exactly across all files.
- [ ] Updated component to use the new key via `getDictionary`.
- [ ] Used `interpolate` for strings with variables.

## Code Example
To use a dictionary in a Server Component:
```tsx
import { getDictionary } from '@/lib/i18n/dictionaries';
import { Locale } from '@/lib/i18n/config';

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  
  return <h1>{dict.home.title}</h1>;
}
```
