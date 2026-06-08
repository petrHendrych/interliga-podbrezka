---
sessionId: session-260609-000133-snhi
---

# Requirements

### Overview & Goals
Implement a robust, type-safe internationalization (i18n) system for the project supporting 4 languages (SK, CS, HU, SR) and create a Junie skill to automate the preparation and addition of translation strings.

### Scope
- **In Scope**:
    - i18n infrastructure (routing, dictionary loading, type definitions).
    - Initial translation files for Slovak, Czech, Hungarian, and Serbian.
    - Proxy updates for locale-based redirection.
    - Custom Junie skill for translation maintenance.
- **Out of Scope**:
    - Translation of external content (DB records, emails) unless explicitly requested later.
    - Automated machine translation integration (the skill will guide the agent to provide translations).

### Functional Requirements
- Default language: Slovak (`sk`).
- Supported languages: Czech (`cs`), Hungarian (`hu`), Serbian (`sr`).
- URL routing: `/[lang]/path` (e.g., `/sk/dashboard`).
- Tone: Informal/Non-formal across all languages.
- Type Safety: All translation keys must be validated by TypeScript.

# Technical Design

### Current Implementation
The project currently has hardcoded English strings in some metadata and layouts, with no centralized i18n mechanism. Routing is flat under the `app/` directory.

### Key Decisions
- **Custom i18n over Library**: As requested, we will use a lightweight custom implementation following Next.js 16 recommendations for App Router i18n. This avoids unnecessary dependencies and keeps the bundle small.
- **URL-based Routing**: We will use the `[lang]` dynamic segment pattern. This provides the best support for Server Components and SSR.
- **Single Source of Truth for Types**: `sk.json` will be the base for TypeScript type definitions, ensuring that all translations follow the same structure.

### Proposed Changes

#### File Structure
```
.junie/
  └── skills/
      └── translations/
          └── SKILL.md          <-- New Junie Skill
locales/
  ├── sk.json                   <-- Base translations (informal)
  ├── cs.json
  ├── hu.json
  └── sr.json
lib/
  └── i18n/
      ├── config.ts             <-- Locales config
      ├── dictionaries.ts       <-- Loading logic
      └── types.ts              <-- Translation types
app/
  └── [lang]/                   <-- Moved routes
      ├── layout.tsx
      └── page.tsx
```

#### Proxy (proxy.ts)
Update `proxy.ts` to check for locale prefixes in the pathname. If missing, it will determine the best locale (via headers or cookies) and redirect to `/[locale]/pathname`.

#### Junie Skill Logic
The skill will instruct Junie to:
1. Scan for hardcoded strings in new features.
2. Generate unique keys.
3. Update all 4 JSON files in `locales/`.
4. Use informal language (e.g., "Ahoj" instead of "Dobrý deň").
5. Verify type safety by checking if keys match across all files.

### Architecture Diagram
```mermaid
graph TD
  User[User Request] --> Proxy[Proxy /proxy.ts]
  Proxy -- No Locale --> Redirect[Redirect to /sk/...]
  Proxy -- With Locale --> AppRouter[Next.js App Router]
  AppRouter --> Page[Page [lang]]
  Page --> GetDict[getDictionary lang]
  GetDict --> JSON[(locales/*.json)]
  JSON --> Render[Rendered HTML with Translations]
```

# Testing

### Validation Approach
- **Manual Verification**: Verify that visiting `/`, `/sk`, `/cs`, etc., correctly renders the respective content.
- **Type Checking**: Run `pnpm type-check` to ensure all translation keys used in the code exist in the `Dictionary` type.
- **Skill Test**: Ask Junie to add a new translation string using the new skill and verify it updates all 4 files correctly.

### Key Scenarios
- Visit root `/`: Should redirect to `/sk/`.
- Change locale in URL to `/cs/`: Should show Czech translations.
- Missing translation key: TypeScript should report an error during build.

# Delivery Steps

### ✓ Step 1: Setup i18n foundation and locale files
Initialize the directory structure and create base translation files.

- Create `locales/` directory with `sk.json`, `cs.json`, `hu.json`, and `sr.json`.
- Add initial common translation strings (informal tone) for basic UI elements (e.g., buttons, navigation).
- Create `lib/i18n/config.ts` to define the 4 supported locales and set Slovak as the default.

### * Step 2: Implement dictionary loading and type-safe helpers
Provide the logic to load translations and ensure type safety.

- Create `lib/i18n/dictionaries.ts` for dynamic dictionary loading using Server Components' dynamic imports.
- Define a `Dictionary` type in `lib/i18n/types.ts` automatically derived from the Slovak source of truth.
- Implement a `getDictionary` helper function to be used in pages and layouts.

### ✓ Step 3: Restructure App routing and Proxy
Enable URL-based localization by restructuring the app directory and updating the Proxy.

- Move existing routes and layouts from `app/` to `app/[lang]/`.
- Update the Root Layout to accept and use the `lang` parameter.
- Modify `proxy.ts` (Proxy) to detect the locale from headers/cookies or redirect to `/sk` if no locale is present in the URL.

### ✓ Step 4: Create the Junie Translation Skill
Enable autonomous maintenance of translations with a dedicated Junie skill.

- Create `.junie/skills/translations/SKILL.md` with instructions for identifying and extracting strings.
- Add specific rules for maintaining an informal tone (non-formal language) in all 4 locales.
- Include a synchronization checklist to ensure all 4 JSON files are updated simultaneously when adding new keys.