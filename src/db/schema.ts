import {
  pgTable, bigserial, bigint, text, numeric, timestamp, date,
  integer, boolean, pgEnum, uniqueIndex, index,
} from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const accountType = pgEnum('account_type', [
  'cash', 'bank', 'credit', 'ewallet', 'savings', 'invest',
])

/**
 * Phan loai chi tieu theo goc do suc khoe tai chinh - KHONG phai theo
 * chu de. Day la cot quan trong nhat cua toan bo he thong: no cho phep
 * tinh ty le tiet kiem thuc va so thang quy khan cap song duoc.
 *
 *  essential - khong cat duoc: nha, dien nuoc, an co ban, thuoc, hoc phi
 *  flexible  - cat duoc khi can: an ngoai, giai tri, mua sam, du lich
 *  saving    - khong phai chi tieu, la chuyen tien sang tuong lai
 */
export const categoryKind = pgEnum('category_kind', ['essential', 'flexible', 'saving'])

export const txType = pgEnum('tx_type', ['expense', 'income', 'transfer'])

/** Nguon nhap lieu - de do kenh nao dung nhieu va de sua sai hang loat */
export const txSource = pgEnum('tx_source', [
  'text', 'photo', 'voice', 'import', 'manual', 'recurring',
])

export const goalStatus = pgEnum('goal_status', ['active', 'reached', 'paused', 'abandoned'])

export const assetKind = pgEnum('asset_kind', [
  'cash', 'savings', 'stock', 'fund', 'gold', 'crypto', 'realestate', 'other',
])

/* ------------------------------------------------------------------ *
 * Nguoi dung
 * ------------------------------------------------------------------ */

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  displayName: text('display_name'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  currency: text('currency').notNull().default('VND'),

  /** Thu nhap thang khai bao - mau so cho ty le tiet kiem */
  monthlyIncome: numeric('monthly_income', { precision: 15, scale: 2 }),

  /** Bao cao dinh ky: gio gui (0-23, gio dia phuong) */
  digestHour: integer('digest_hour').notNull().default(20),
  weeklyDigestDow: integer('weekly_digest_dow').notNull().default(0), // 0 = Chu nhat

  /**
   * Ngay da gui bao cao gan nhat, theo lich dia phuong cua nguoi dung.
   *
   * Cron cua Vercel la "co gang gui": co the bo sot mot lan chay, va
   * cung co the goi mot lan chay hai lan. Cot nay bien viec gui bao cao
   * thanh viec lam duoc phep lap lai ma khong gay hai - da gui hom nay
   * thi lan goi thu hai khong lam gi, va neu hom qua bi sot thi hom nay
   * van gui binh thuong.
   */
  lastDigestOn: date('last_digest_on'),

  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------------------------------------------------ *
 * Vi / tai khoan
 * ------------------------------------------------------------------ */

export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: accountType('type').notNull().default('cash'),

  /**
   * So du hien tai. Luu numeric - khong bao gio dung float cho tien.
   * Voi the tin dung, so am nghia la dang no.
   */
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull().default('0'),

  /** Han muc the tin dung, null neu khong phai the */
  creditLimit: numeric('credit_limit', { precision: 15, scale: 2 }),

  isDefault: boolean('is_default').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('accounts_user_idx').on(t.userId)])

/* ------------------------------------------------------------------ *
 * Danh muc
 * ------------------------------------------------------------------ */

export const categories = pgTable('categories', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  parentId: bigint('parent_id', { mode: 'number' }),
  kind: categoryKind('kind').notNull().default('flexible'),
  isIncome: boolean('is_income').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isArchived: boolean('is_archived').notNull().default(false),
}, (t) => [
  uniqueIndex('categories_user_name_idx').on(t.userId, t.name),
  index('categories_user_idx').on(t.userId),
])

/**
 * Bo nho phan loai - trai tim cua kien truc "khong ton tien AI".
 *
 * Moi lan ban xac nhan mot giao dich, tu khoa duoc ghi vao day. Lan sau
 * go dung tu do, bot khop tuc thi voi chi phi 0d, khong can goi AI.
 * hitCount dung de uu tien khi mot tu khop nhieu danh muc.
 */
export const keywordMap = pgTable('keyword_map', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Da chuan hoa: chu thuong, bo dau, bo khoang trang thua */
  keyword: text('keyword').notNull(),
  categoryId: bigint('category_id', { mode: 'number' }).notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  accountId: bigint('account_id', { mode: 'number' }),
  hitCount: integer('hit_count').notNull().default(1),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('keyword_user_kw_idx').on(t.userId, t.keyword)])

/* ------------------------------------------------------------------ *
 * Giao dich
 * ------------------------------------------------------------------ */

export const transactions = pgTable('transactions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: txType('type').notNull(),

  /** Luon duong. Chieu tien do cot `type` quyet dinh. */
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),

  accountId: bigint('account_id', { mode: 'number' }).references(() => accounts.id),
  /** Chi dung khi type = 'transfer' */
  toAccountId: bigint('to_account_id', { mode: 'number' }).references(() => accounts.id),
  categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id),

  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

  source: txSource('source').notNull().default('text'),
  /** Cau goc ban da go/noi - de do lai khi parser sai */
  rawInput: text('raw_input'),
  /** true neu danh muc do luat hoac AI doan, chua duoc ban xac nhan */
  isAutoCategorized: boolean('is_auto_categorized').notNull().default(false),

  /** Van tay chong trung khi import sao ke (hash ngay + so tien + noi dung) */
  dedupeHash: text('dedupe_hash'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tx_user_time_idx').on(t.userId, t.occurredAt),
  index('tx_user_cat_idx').on(t.userId, t.categoryId),
  uniqueIndex('tx_dedupe_idx').on(t.userId, t.dedupeHash),
])

/* ------------------------------------------------------------------ *
 * Ngan sach / muc tieu / no
 * ------------------------------------------------------------------ */

export const budgets = pgTable('budgets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: bigint('category_id', { mode: 'number' }).notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  /** Ngay dau thang, vd 2026-09-01 */
  month: date('month').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  /** Nguong da canh bao (0 / 80 / 100) - tranh nhac lai nhieu lan */
  alertedAt: integer('alerted_at').notNull().default(0),
}, (t) => [uniqueIndex('budget_user_cat_month_idx').on(t.userId, t.categoryId, t.month)])

export const goals = pgTable('goals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: numeric('target_amount', { precision: 15, scale: 2 }).notNull(),
  currentAmount: numeric('current_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  targetDate: date('target_date'),
  /** Quy khan cap danh dau rieng vi no dung dau thu tu uu tien tien */
  isEmergencyFund: boolean('is_emergency_fund').notNull().default(false),
  status: goalStatus('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('goals_user_idx').on(t.userId)])

export const debts = pgTable('debts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  principal: numeric('principal', { precision: 15, scale: 2 }).notNull(),
  outstanding: numeric('outstanding', { precision: 15, scale: 2 }).notNull(),
  /** Lai suat %/nam. Quyet dinh thu tu uu tien tra no. */
  annualRate: numeric('annual_rate', { precision: 6, scale: 3 }).notNull().default('0'),
  minPayment: numeric('min_payment', { precision: 15, scale: 2 }),
  dueDay: integer('due_day'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('debts_user_idx').on(t.userId)])

/* ------------------------------------------------------------------ *
 * Tich san (giai doan 5)
 * ------------------------------------------------------------------ */

export const assets = pgTable('assets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: assetKind('kind').notNull(),
  /** Ma chung khoan / ma quy, null voi tai san khong niem yet */
  ticker: text('ticker'),
  quantity: numeric('quantity', { precision: 20, scale: 8 }),
  costBasis: numeric('cost_basis', { precision: 15, scale: 2 }),
  isArchived: boolean('is_archived').notNull().default(false),
}, (t) => [index('assets_user_idx').on(t.userId)])

export const assetSnapshots = pgTable('asset_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  assetId: bigint('asset_id', { mode: 'number' }).notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  takenOn: date('taken_on').notNull(),
  value: numeric('value', { precision: 15, scale: 2 }).notNull(),
}, (t) => [uniqueIndex('snapshot_asset_date_idx').on(t.assetId, t.takenOn)])

/* ------------------------------------------------------------------ *
 * Nhan dinh da sinh - de bot khong lap lai loi khuyen cu
 * ------------------------------------------------------------------ */

export const insights = pgTable('insights', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Ma luat da kich hoat, vd 'savings_rate_low', 'ef_below_3m' */
  ruleCode: text('rule_code').notNull(),
  severity: integer('severity').notNull().default(1), // 1 thong tin, 2 luu y, 3 canh bao
  body: text('body').notNull(),
  /** Anh chup so lieu luc sinh nhan dinh, de doi chieu ve sau */
  metrics: text('metrics'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('insights_user_rule_idx').on(t.userId, t.ruleCode, t.createdAt)])

/* ------------------------------------------------------------------ *
 * Trang thai dang cho (vd: bot vua hoi "xep vao muc nao?")
 * ------------------------------------------------------------------ */

export const pendingActions = pgTable('pending_actions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: text('payload').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('pending_user_idx').on(t.userId)])

/* ------------------------------------------------------------------ *
 * Anh chup gia tri tai san rong theo thoi gian
 *
 * Tinh duoc tu du lieu hien tai bat cu luc nao, nhung KHONG dung lai
 * duoc qua khu: so du vi va gia tri tai san chi luu trang thai hien tai,
 * khong luu lich su. Nen phai chup dinh ky va cat rieng - day la thu duy
 * nhat cho biet ban dang di len hay di xuong.
 * ------------------------------------------------------------------ */

export const netWorthSnapshots = pgTable('net_worth_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  takenOn: date('taken_on').notNull(),

  /** Tien mat + ngan hang + tiet kiem + vi dien tu */
  liquid: numeric('liquid', { precision: 15, scale: 2 }).notNull(),
  /** Tai san dau tu: co phieu, quy, vang, crypto, bat dong san... */
  invested: numeric('invested', { precision: 15, scale: 2 }).notNull(),
  /** Tong du no */
  debt: numeric('debt', { precision: 15, scale: 2 }).notNull(),
  /** liquid + invested - debt */
  total: numeric('total', { precision: 15, scale: 2 }).notNull(),
}, (t) => [uniqueIndex('nw_user_date_idx').on(t.userId, t.takenOn)])
