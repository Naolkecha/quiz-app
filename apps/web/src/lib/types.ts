export type User = {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  created_at: string;
  is_admin: boolean;
  is_owner: boolean;
};

export type TodayChallenge = {
  id: string;
  title: string;
  description: string;
  status: string;
  entry_fee_etb: string;
  minimum_participants: number;
  participant_count: number;
  current_prize_etb: string;
  is_confirmed: boolean;
  starts_at: string | null;
  question_count: number;
  duration_seconds: number;
  extra_prize_per_participant_etb: string;
  is_free: boolean;
  max_participants: number | null;
  spots_left: number | null;
  winner_name: string | null;
  category?: string | null;
};

export type PlayChoice = {
  id: string;
  label: string;
};

export type PlayQuestion = {
  id: string;
  position: number;
  prompt: string;
  choices: PlayChoice[];
};

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  score: number;
  elapsed_ms: number;
};

export type ChallengeEntry = {
  challenge_id: string;
  joined: true;
  terms_version: string;
  joined_at: string;
};

export type WalletTransaction = {
  id: string;
  entry_type:
    | "deposit"
    | "withdrawal_hold"
    | "withdrawal_release"
    | "prize"
    | "entry_fee"
    | "adjustment"
    | "referral"
    | "daily_spin";
  amount_etb: string;
  balance_after_etb: string;
  description: string;
  created_at: string;
};

export type MoneyOrder = {
  id: string;
  kind: "deposit" | "withdrawal";
  status: "pending" | "succeeded" | "failed" | "cancelled";
  provider: "telebirr";
  amount_etb: string;
  phone_number: string | null;
  transaction_number: string | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
};

export type Wallet = {
  balance_etb: string;
  pending_withdrawals_etb: string;
  available_etb: string;
  currency: "ETB";
  deposit_mode: "verify_et" | "local_stub" | "credentials_required";
  deposits_enabled: boolean;
  withdrawals_enabled: boolean;
  settlement_account: string | null;
  settlement_account_name: string | null;
  transactions: WalletTransaction[];
  orders: MoneyOrder[];
};

export type PaymentAccount = {
  holder_name: string;
  account_number: string;
};

export type AdminWithdrawal = MoneyOrder & {
  user_id: string;
  player_name: string;
  telegram_username: string | null;
  telegram_id: number;
  balance_etb: string;
};

export type AdminTransaction = {
  id: string;
  entry_type:
    | "deposit"
    | "withdrawal_hold"
    | "withdrawal_release"
    | "prize"
    | "entry_fee"
    | "adjustment"
    | "referral";
  amount_etb: string;
  balance_after_etb: string;
  description: string;
  created_at: string;
  user_id: string;
  player_name: string;
  telegram_username: string | null;
};

export type AdminMember = {
  username: string;
  role: "owner" | "admin";
  created_at: string;
};

export type AdminOverview = {
  role: "owner" | "admin";
  players: number;
  players_today: number;
  open_challenges: number;
  pending_cash_outs: number;
  pending_cash_out_etb: string;
  deposits_today_etb: string;
  entry_fees_today_etb: string;
  prizes_today_etb: string;
};

export type AttemptView = {
  attempt_id: string;
  status: "in_progress" | "finished";
  started_at: string;
  server_now: string;
  duration_seconds: number;
  question_count: number;
  questions: PlayQuestion[] | null;
  score: number | null;
  elapsed_ms: number | null;
  rank: number | null;
  leaderboard: LeaderboardEntry[];
};

export type AuthResponse = {
  session_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
};

export type AdminChallenge = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "registration" | "ready" | "live" | "completed" | "cancelled";
  entry_fee_etb: string;
  minimum_participants: number;
  base_prize_etb: string;
  extra_prize_per_participant_etb: string;
  question_count: number;
  duration_seconds: number;
  max_participants: number | null;
  participant_count: number;
  created_at: string;
  starts_at: string | null;
  category?: string | null;
};

export type AdminPlayer = {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  is_blocked: boolean;
  created_at: string;
  balance_etb: string;
};

export type ChoiceInput = {
  label: string;
  is_correct: boolean;
};

export type QuestionInput = {
  prompt: string;
  choices: ChoiceInput[];
};

export type AdminChoice = {
  id: string;
  position: number;
  label: string;
  is_correct: boolean;
};

export type AdminQuestion = {
  id: string;
  position: number;
  prompt: string;
  choices: AdminChoice[];
};

export type CreateChallengeBody = {
  title: string;
  description: string;
  entry_fee_etb: string;
  minimum_participants: number;
  base_prize_etb: string;
  extra_prize_per_participant_etb: string;
  question_count: number;
  duration_seconds: number;
  max_participants: number | null;
  category?: string | null;
  status?: string;
  notify_users?: boolean;
  questions?: QuestionInput[];
};

export type NotifyChallengeResponse = {
  challenge_id: string;
  sent: number;
  failed: number;
  total: number;
};

export type FinanceSummary = {
  total_user_balances_etb: string;
  total_deposits_all_time_etb: string;
  total_withdrawals_paid_all_time_etb: string;
  total_adjustments_all_time_etb?: string;
  pending_withdrawals_etb: string;
  pending_withdrawals_count: number;
  total_entry_fees_all_time_etb: string;
  total_prizes_paid_all_time_etb: string;
  net_platform_profit_etb: string;
  deposits_today_etb: string;
  entry_fees_today_etb: string;
  prizes_today_etb: string;
  withdrawals_paid_today_etb: string;
  telebirr_account_name: string;
  telebirr_account_number: string;
};

export type AdminDeposit = {
  id: string;
  user_id: string;
  player_name: string;
  telegram_username: string | null;
  telegram_id: number;
  amount_etb: string;
  transaction_number: string | null;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  balance_etb: string;
};

export type AdjustBalanceBody = {
  user_id: string;
  amount_etb: string;
  direction: "credit" | "debit";
  reason: string;
};

export type AdjustBalanceResult = {
  user_id: string;
  player_name: string;
  telegram_username: string | null;
  balance_etb: string;
  amount_etb: string;
  direction: string;
  reason: string;
  transaction_id: string;
  created_at: string;
};

export type ReferralItem = {
  id: string;
  referred_name: string;
  referred_username: string | null;
  reward_amount_etb: string;
  is_rewarded: boolean;
  created_at: string;
  rewarded_at: string | null;
};

export type ReferralSummary = {
  referral_code: string;
  telegram_bot_url: string;
  mini_app_url: string;
  reward_per_referral_etb: string;
  total_referrals: number;
  rewarded_referrals: number;
  total_earned_etb: string;
  referred_by: string | null;
  recent_referrals: ReferralItem[];
};

export type ApplyReferralResponse = {
  status: string;
  message: string;
  referrer_name: string;
};

export type ReferralConfig = {
  reward_amount_etb: string;
  updated_at: string | null;
};

export type AdminReferralOverview = {
  reward_amount_etb: string;
  total_referrals: number;
  rewarded_referrals: number;
  total_payout_etb: string;
};

export type SpinSegment = {
  id: number;
  label: string;
  amount_etb: string;
  weight: number;
  color?: string | null;
};

export type SpinStatus = {
  is_enabled: boolean;
  can_spin: boolean;
  cooldown_hours: number;
  seconds_remaining: number;
  next_spin_at: string | null;
  segments: SpinSegment[];
  last_spin_at: string | null;
};

export type SpinResult = {
  spin_id: string;
  segment_index: number;
  segment_label: string;
  prize_amount_etb: string;
  balance_after_etb: string;
  next_spin_at: string;
};

export type SpinHistoryItem = {
  id: string;
  segment_label: string;
  prize_amount_etb: string;
  created_at: string;
};

export type AdminSpinOverview = {
  is_enabled: boolean;
  cooldown_hours: number;
  total_spins: number;
  spins_today: number;
  total_payout_etb: string;
  segments: SpinSegment[];
};

export type DuelChoiceView = {
  id: string;
  label: string;
};

export type DuelQuestionView = {
  id: string;
  prompt: string;
  choices: DuelChoiceView[];
};

export type DuelPlayerView = {
  id: string;
  first_name: string;
  username: string | null;
};

export type DuelView = {
  id: string;
  creator: DuelPlayerView;
  opponent: DuelPlayerView | null;
  winner: DuelPlayerView | null;
  stake_etb: string;
  prize_etb: string;
  platform_fee_etb: string;
  category: string;
  status: "waiting_opponent" | "completed" | "cancelled" | "expired";
  invited_username?: string | null;
  invited_usernames?: string[];
  is_public: boolean;
  questions: DuelQuestionView[];
  creator_score: number | null;
  creator_time_seconds: string | null;
  opponent_score: number | null;
  opponent_time_seconds: string | null;
  is_tie: boolean;
  created_at: string;
  expires_at: string;
  settled_at: string | null;
  my_role: "creator" | "opponent" | "spectator" | null;
  has_played: boolean;
};

export type CreateDuelBody = {
  stake_etb: number;
  category: string;
  invited_username?: string;
  invited_usernames?: string[];
  is_public?: boolean;
};

export type DuelAnswerInput = {
  question_id: string;
  selected_choice_id: string;
};

export type SubmitDuelPlayBody = {
  answers: DuelAnswerInput[];
  time_seconds: number;
};

export type DuelCategory = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  question_count: number;
};

export type AdminQuestionCategory = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  is_active: boolean;
  question_count: number;
  created_at: string;
};

export type CreateCategoryBody = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
};

export type UpdateCategoryBody = {
  name?: string;
  icon?: string;
  description?: string;
  is_active?: boolean;
};

export type AdminBankChoice = {
  id?: string;
  position?: number;
  label: string;
  is_correct: boolean;
};

export type AdminBankQuestion = {
  id: string;
  category: string;
  prompt: string;
  created_at: string;
  choices: AdminBankChoice[];
};

export type CreateBankQuestionBody = {
  category: string;
  prompt: string;
  choices: { label: string; is_correct: boolean }[];
};


