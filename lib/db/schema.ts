import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  numeric,
  jsonb,
  serial,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  isApproved: boolean('is_approved').default(false),
  externalPlayerId: bigint('external_player_id', { mode: 'number' }).unique(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_users_external_id').on(table.externalPlayerId),
]);

export const matches = pgTable('matches', {
  externalId: bigint('external_id', { mode: 'number' }).primaryKey(),
  date: timestamp('date', { withTimezone: true }),
  opponent: text('opponent'),
  isHome: boolean('is_home'),
  location: text('location'),
  teamTotalScore: integer('team_total_score'),
  opponentTotalScore: integer('opponent_total_score'),
  seasonId: integer('season_id'),
  leagueName: text('league_name'),
  round: integer('round'),
  leagueId: integer('league_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const matchPlayerResults = pgTable('match_player_results', {
  matchId: bigint('match_id', { mode: 'number' }).references(() => matches.externalId),
  userId: uuid('user_id').references(() => users.id),
  full: integer('full'),
  clean: integer('clean'),
  total: integer('total'),
  avg: numeric('avg'),
  faults: integer('faults'),
  specialFaultsCount: integer('special_faults_count').default(0),
  fullFaultsCount: integer('full_faults_count').default(0),
  secondToLastFaultsCount: integer('second_to_last_faults_count').default(0),
  isWorstPlayer: boolean('is_worst_player').default(false),
  isUnder600: boolean('is_under_600').default(false),
  calculatedFine: numeric('calculated_fine').default('0'),
  bonusReceived: numeric('bonus_received').default('0'),
  isPaid: boolean('is_paid').default(false),
  isBonusPaid: boolean('is_bonus_paid').default(false),
  teamId: integer('team_id'),
}, (table) => [
  primaryKey({ columns: [table.matchId, table.userId] }),
]);

export const trainerPayments = pgTable('trainer_payments', {
  id: serial('id').primaryKey(),
  matchId: bigint('match_id', { mode: 'number' }).references(() => matches.externalId),
  userId: uuid('user_id').references(() => users.id),
  conditionType: text('condition_type').notNull(),
  amount: numeric('amount').notNull(),
  isPaid: boolean('is_paid').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_trainer_payments_match_user_condition').on(table.matchId, table.userId, table.conditionType),
]);

export const faultlessStreaks = pgTable('faultless_streaks', {
  userId: uuid('user_id').references(() => users.id).primaryKey(),
  currentStreak: integer('current_streak').default(0),
  lastUpdatedMatchId: bigint('last_updated_match_id', { mode: 'number' }).references(() => matches.externalId),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const scrapedData = pgTable('scraped_data', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  externalId: bigint('external_id', { mode: 'number' }),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_scraped_data_unique_type_id').on(table.type, table.externalId),
]);

export const scrapedSnapshots = pgTable('scraped_snapshots', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  externalId: bigint('external_id', { mode: 'number' }).notNull(),
  data: jsonb('data').notNull(),
  scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow(),
});

export const systemStatus = pgTable('system_status', {
  name: text('name').primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Match = InferSelectModel<typeof matches>;
export type NewMatch = InferInsertModel<typeof matches>;
export type MatchPlayerResult = InferSelectModel<typeof matchPlayerResults>;
export type NewMatchPlayerResult = InferInsertModel<typeof matchPlayerResults>;
export type TrainerPayment = InferSelectModel<typeof trainerPayments>;
export type NewTrainerPayment = InferInsertModel<typeof trainerPayments>;
export type FaultlessStreak = InferSelectModel<typeof faultlessStreaks>;
export type NewFaultlessStreak = InferInsertModel<typeof faultlessStreaks>;
export type ScrapedData = InferSelectModel<typeof scrapedData>;
export type NewScrapedData = InferInsertModel<typeof scrapedData>;
export type ScrapedSnapshot = InferSelectModel<typeof scrapedSnapshots>;
export type NewScrapedSnapshot = InferInsertModel<typeof scrapedSnapshots>;
export type SystemStatus = InferSelectModel<typeof systemStatus>;
export type NewSystemStatus = InferInsertModel<typeof systemStatus>;
export type PasswordResetToken = InferSelectModel<typeof passwordResetTokens>;
export type NewPasswordResetToken = InferInsertModel<typeof passwordResetTokens>;
