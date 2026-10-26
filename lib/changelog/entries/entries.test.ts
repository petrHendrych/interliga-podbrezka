import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n/config';
import { CHANGELOG_AUDIENCES, CHANGELOG_TYPES } from '../types';
import { CHANGELOG_ENTRIES } from '.';

const ENTRY_FILE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/;
const PLACEHOLDER = /\b(?:todo|tbd|fixme|lorem)\b|…|\.\.\./i;

const files = readdirSync(import.meta.dirname).filter((name) => ENTRY_FILE.test(name));
const fileIds = files.map((name) => path.basename(name, '.ts'));

describe('changelog entries', () => {
  it('registers every entry file in the index, and nothing else', () => {
    expect(CHANGELOG_ENTRIES.map((entry) => entry.id).sort()).toEqual([...fileIds].sort());
  });

  it('keeps every other file in the directory out of the way', () => {
    const others = readdirSync(import.meta.dirname)
      .filter((name) => !ENTRY_FILE.test(name))
      .sort();
    expect(others).toEqual(['entries.test.ts', 'index.ts']);
  });

  it('has unique ids', () => {
    const ids = CHANGELOG_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(CHANGELOG_ENTRIES.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    it('has a valid type and audience', () => {
      expect(CHANGELOG_TYPES).toContain(entry.type);
      expect(CHANGELOG_AUDIENCES).toContain(entry.audience);
    });

    it.each(i18n.locales)('has a finished %s text', (locale) => {
      const text = entry.text[locale].trim();
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(PLACEHOLDER);
    });
  });
});
