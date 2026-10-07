import type {
  AdminChallenge,
  AdminDeposit,
  AdminMember,
  AdminOverview,
  AdminPlayer,
  AdminQuestion,
  AdminTransaction,
  AdminWithdrawal,
  AdjustBalanceBody,
  AdjustBalanceResult,
  ApplyReferralResponse,
  AttemptView,
  AuthResponse,
  ChallengeEntry,
  CreateChallengeBody,
  FinanceSummary,
  LeaderboardEntry,
  MoneyOrder,
  NotifyChallengeResponse,
  PaymentAccount,
  QuestionInput,
  ReferralConfig,
  AdminReferralOverview,
  ReferralSummary,
  SpinHistoryItem,
  SpinResult,
  SpinSegment,
  SpinStatus,
  AdminSpinOverview,
  TodayChallenge,
  User,
  Wallet,
  CreateDuelBody,
  DuelView,
  SubmitDuelPlayBody,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  readonly title: string;
  readonly code: string | null;

  constructor(message: string, { title, code = null }: { title?: string; code?: string | null } = {}) {
    super(message);
    this.name = "ApiError";
    this.title = title ?? "Something went wrong";
    this.code = code;
  }
}

const FRIENDLY: Record<string, { title: string; message: string }> = {
  session_invalid: {
    title: "Please reopen the app",
    message: "Your session ended. Close Challenge and open it again from the bot.",
  },
  already_spun: {
    title: "Already spun",
    message: "You have already used your daily spin. Check back when the countdown finishes!",
  },
  spin_disabled: {
    title: "Daily Spin unavailable",
    message: "Daily spin is temporarily unavailable. Please check back later.",
  },
  user_blocked: {
    title: "Account unavailable",
    message: "This account cannot use Challenge. Contact support if you think this is a mistake.",
  },
  init_data_invalid: {
    title: "Please reopen the app",
    message: "We could not confirm your Telegram account. Open Challenge again from the bot.",
  },
  init_data_expired: {
    title: "Please reopen the app",
    message: "This session is too old. Open Challenge again from the bot.",
  },
  init_data_missing: {
    title: "Open from Telegram",
    message: "Open Challenge from the Telegram bot to continue.",
  },
  not_found: {
    title: "Not found",
    message: "This item is no longer available.",
  },
  challenge_closed: {
    title: "Challenge closed",
    message: "This challenge is no longer open.",
  },
  challenge_not_joined: {
    title: "Join first",
    message: "Join this challenge and accept the terms before starting.",
  },
  questions_missing: {
    title: "Not ready yet",
    message: "Questions for this challenge are not ready yet. Try again shortly.",
  },
  no_questions: {
    title: "Questions required",
    message: "Add questions to this challenge before making it ready or live.",
  },
  invalid_choices: {
    title: "Check question answers",
    message: "Each question must have between 2 and 6 choices, and exactly 1 correct answer.",
  },
  duplicate_answer: {
    title: "Already answered",
    message: "You already answered that question.",
  },
  answer_invalid: {
    title: "Answer not saved",
    message: "That answer could not be saved. Go back to the challenge and try again.",
  },
  deposit_too_small: {
    title: "Amount too small",
    message: "The smallest deposit is 10 ETB.",
  },
  withdrawal_too_small: {
    title: "Amount too small",
    message: "The smallest cash out is 100 ETB.",
  },
  payment_not_found: {
    title: "Payment not found",
    message:
      "We could not find this transaction on Telebirr. Check the number in your SMS and try again. Nothing was saved.",
  },
  entry_fee_insufficient: {
    title: "Add money to join",
    message: "Your balance is too low for this entry fee. Add money in your wallet, then join.",
  },
  withdrawal_not_pending: {
    title: "Already handled",
    message: "This cash out was already completed or cancelled.",
  },
  admin_unauthorized: {
    title: "Please reopen the app",
    message: "Open Challenge from the bot with your admin Telegram account.",
  },
  admin_only: {
    title: "Admins only",
    message: "This page is only for Challenge admins.",
  },
  owner_only: {
    title: "Main admin only",
    message: "Only @jiillicha can add or remove admins.",
  },
  admin_exists: {
    title: "Already an admin",
    message: "That username is already on the admin list.",
  },
  cannot_remove_owner: {
    title: "Cannot remove",
    message: "The main admin cannot be removed.",
  },
  invalid_username: {
    title: "Check the username",
    message: "Enter a Telegram username like @jiillicha.",
  },
  admin_cannot_play: {
    title: "Admins don't play",
    message: "Admin accounts manage Challenge and cannot join challenges.",
  },
  challenge_full: {
    title: "Round is full",
    message: "All seats are taken. A new free round opens as soon as this one ends.",
  },
  insufficient_balance: {
    title: "Not enough balance",
    message: "Your balance is lower than this amount.",
  },
  transaction_already_used: {
    title: "Already used",
    message: "This transaction number was already submitted. Each payment can be used once.",
  },
  invalid_transaction_number: {
    title: "Check the number",
    message: "Copy the transaction number exactly as it appears in your Telebirr SMS.",
  },
  verification_failed: {
    title: "Could not check payment",
    message: "Telebirr could not be reached right now. Wait a moment and try again.",
  },
  verify_et_unavailable: {
    title: "Deposits paused",
    message: "Adding money is unavailable right now. Please try again later.",
  },
  idempotency_key_reused: {
    title: "Please try again",
    message: "That request was interrupted. Submit it once more.",
  },
};

async function toApiError(response: Response): Promise<ApiError> {
  let code: string | null = null;
  let serverMessage: string | null = null;
  let validation = false;
  try {
    const body = (await response.json()) as {
      detail?: { code?: string; message?: string } | { msg?: string }[];
    };
    if (Array.isArray(body.detail)) {
      validation = true;
      serverMessage = body.detail[0]?.msg?.replace(/^Value error, /, "") ?? null;
    } else if (body.detail) {
      code = body.detail.code ?? null;
      serverMessage = body.detail.message ?? null;
    }
  } catch {
    // The body was not JSON.
  }

  const known = code ? FRIENDLY[code] : undefined;
  if (known) {
    return new ApiError(known.message, { title: known.title, code });
  }
  if (validation) {
    return new ApiError(serverMessage ?? "Check the details you entered and try again.", {
      title: "Check your details",
      code: "validation",
    });
  }
  if (response.status === 429) {
    return new ApiError("Too many tries in a short time. Wait a moment and try again.", {
      title: "Slow down",
      code,
    });
  }
  if (response.status >= 500) {
    return new ApiError("Our server had a problem. Please try again in a moment.", {
      title: "Server problem",
      code,
    });
  }
  return new ApiError(serverMessage ?? "That did not work. Please try again.", { code });
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Check your internet connection and try again.", {
      title: "No connection",
      code: "network",
    });
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

async function optional<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await send(path, init);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

export function loginWithTelegram(initData: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

export function loginDevelopment(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/dev", { method: "POST" });
}

export function currentUser(sessionToken: string): Promise<User> {
  return request<User>("/api/auth/me", {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export function listChallenges(category?: string): Promise<TodayChallenge[]> {
  const query = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
  return request<TodayChallenge[]>(`/api/challenges${query}`);
}

export function listRecentResults(): Promise<TodayChallenge[]> {
  return request<TodayChallenge[]>("/api/challenges/recent-results");
}

export function getChallenge(challengeId: string): Promise<TodayChallenge | null> {
  return optional<TodayChallenge>(`/api/challenges/${challengeId}`);
}

export function todayChallenge(): Promise<TodayChallenge | null> {
  return optional<TodayChallenge>("/api/challenges/today");
}

function bearer(sessionToken: string): HeadersInit {
  return { Authorization: `Bearer ${sessionToken}` };
}

export function joinChallenge(
  challengeId: string,
  sessionToken: string,
): Promise<ChallengeEntry> {
  return request<ChallengeEntry>(`/api/challenges/${challengeId}/join`, {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({ accepted_terms: true }),
  });
}

export function myChallengeEntry(
  challengeId: string,
  sessionToken: string,
): Promise<ChallengeEntry | null> {
  return optional<ChallengeEntry>(`/api/challenges/${challengeId}/entry`, {
    headers: bearer(sessionToken),
  });
}

export function startAttempt(challengeId: string, sessionToken: string): Promise<AttemptView> {
  return request<AttemptView>(`/api/challenges/${challengeId}/play`, {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function finishAttempt(
  challengeId: string,
  sessionToken: string,
  answers: { question_id: string; choice_id: string }[],
): Promise<AttemptView> {
  return request<AttemptView>(`/api/challenges/${challengeId}/finish`, {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({ answers }),
  });
}

export function myAttempt(
  challengeId: string,
  sessionToken: string,
): Promise<AttemptView | null> {
  return optional<AttemptView>(`/api/challenges/${challengeId}/attempt`, {
    headers: bearer(sessionToken),
  });
}

export function challengeLeaderboard(challengeId: string): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(`/api/challenges/${challengeId}/leaderboard`);
}

export function getWallet(sessionToken: string): Promise<Wallet> {
  return request<Wallet>("/api/wallet", { headers: bearer(sessionToken) });
}

export function depositToWallet(
  sessionToken: string,
  amountEtb: string,
  transactionNumber: string,
  idempotencyKey: string,
): Promise<MoneyOrder> {
  return request<MoneyOrder>("/api/wallet/deposits", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({
      amount_etb: amountEtb,
      transaction_number: transactionNumber,
      idempotency_key: idempotencyKey,
    }),
  });
}

export function getAdminOverview(sessionToken: string): Promise<AdminOverview> {
  return request<AdminOverview>("/api/admin/overview", { headers: bearer(sessionToken) });
}

export function listAdminTransactions(
  sessionToken: string,
  entryType:
    | "all"
    | "deposit"
    | "entry_fee"
    | "prize"
    | "withdrawal_hold"
    | "withdrawal_release"
    | "adjustment"
    | "referral" = "all",
): Promise<AdminTransaction[]> {
  return request<AdminTransaction[]>(`/api/admin/transactions?entry_type=${entryType}`, {
    headers: bearer(sessionToken),
  });
}

export function listAdmins(sessionToken: string): Promise<AdminMember[]> {
  return request<AdminMember[]>("/api/admin/admins", { headers: bearer(sessionToken) });
}

export function addAdmin(sessionToken: string, username: string): Promise<AdminMember> {
  return request<AdminMember>("/api/admin/admins", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({ username }),
  });
}

export async function removeAdmin(sessionToken: string, username: string): Promise<void> {
  const response = await send(`/api/admin/admins/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: bearer(sessionToken),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export function getPaymentAccount(sessionToken: string): Promise<PaymentAccount> {
  return request<PaymentAccount>("/api/wallet/admin/payment-account", {
    headers: bearer(sessionToken),
  });
}

export function updatePaymentAccount(
  sessionToken: string,
  holderName: string,
  accountNumber: string,
): Promise<PaymentAccount> {
  return request<PaymentAccount>("/api/wallet/admin/payment-account", {
    method: "PUT",
    headers: bearer(sessionToken),
    body: JSON.stringify({ holder_name: holderName, account_number: accountNumber }),
  });
}

export function listAdminWithdrawals(
  sessionToken: string,
  status: "pending" | "succeeded" | "cancelled",
): Promise<AdminWithdrawal[]> {
  return request<AdminWithdrawal[]>(`/api/wallet/admin/withdrawals?status=${status}`, {
    headers: bearer(sessionToken),
  });
}

export function completeAdminWithdrawal(
  sessionToken: string,
  orderId: string,
): Promise<MoneyOrder> {
  return request<MoneyOrder>(`/api/wallet/admin/withdrawals/${orderId}/complete`, {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function rejectAdminWithdrawal(
  sessionToken: string,
  orderId: string,
  reason: string,
): Promise<MoneyOrder> {
  return request<MoneyOrder>(`/api/wallet/admin/withdrawals/${orderId}/reject`, {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({ reason: reason.trim() || null }),
  });
}

export function withdrawFromWallet(
  sessionToken: string,
  amountEtb: string,
  phoneNumber: string,
  idempotencyKey: string,
): Promise<MoneyOrder> {
  return request<MoneyOrder>("/api/wallet/withdrawals", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({
      amount_etb: amountEtb,
      phone_number: phoneNumber,
      idempotency_key: idempotencyKey,
    }),
  });
}

export const devAuthEnabled = process.env.NEXT_PUBLIC_APP_ENV === "development";

export function listAdminChallenges(sessionToken: string): Promise<AdminChallenge[]> {
  return request<AdminChallenge[]>("/api/admin/challenges", { headers: bearer(sessionToken) });
}

export function createAdminChallenge(
  sessionToken: string,
  body: CreateChallengeBody,
): Promise<AdminChallenge> {
  return request<AdminChallenge>("/api/admin/challenges", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify(body),
  });
}

export function updateAdminChallengeStatus(
  sessionToken: string,
  id: string,
  status: string,
  notifyUsers: boolean = false,
): Promise<AdminChallenge> {
  return request<AdminChallenge>(`/api/admin/challenges/${id}/status`, {
    method: "PATCH",
    headers: bearer(sessionToken),
    body: JSON.stringify({ status, notify_users: notifyUsers }),
  });
}

export function notifyAdminChallenge(
  sessionToken: string,
  id: string,
): Promise<NotifyChallengeResponse> {
  return request<NotifyChallengeResponse>(`/api/admin/challenges/${id}/notify`, {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function listAdminPlayers(
  sessionToken: string,
  search?: string,
): Promise<AdminPlayer[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<AdminPlayer[]>(`/api/admin/players${query}`, { headers: bearer(sessionToken) });
}

export function blockAdminPlayer(sessionToken: string, userId: string): Promise<AdminPlayer> {
  return request<AdminPlayer>(`/api/admin/players/${userId}/block`, {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function unblockAdminPlayer(sessionToken: string, userId: string): Promise<AdminPlayer> {
  return request<AdminPlayer>(`/api/admin/players/${userId}/unblock`, {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function listChallengeQuestions(
  sessionToken: string,
  challengeId: string,
): Promise<AdminQuestion[]> {
  return request<AdminQuestion[]>(`/api/admin/challenges/${challengeId}/questions`, {
    headers: bearer(sessionToken),
  });
}

export function importChallengeQuestions(
  sessionToken: string,
  challengeId: string,
  questions: QuestionInput[],
): Promise<{ status: string; question_count: number; message: string }> {
  return request<{ status: string; question_count: number; message: string }>(
    `/api/admin/challenges/${challengeId}/questions`,
    {
      method: "POST",
      headers: bearer(sessionToken),
      body: JSON.stringify({ questions }),
    },
  );
}

export function deleteAdminChallenge(
  sessionToken: string,
  challengeId: string,
): Promise<void> {
  return request<void>(`/api/admin/challenges/${challengeId}`, {
    method: "DELETE",
    headers: bearer(sessionToken),
  });
}

export function getFinanceSummary(sessionToken: string): Promise<FinanceSummary> {
  return request<FinanceSummary>("/api/admin/finance/summary", {
    headers: bearer(sessionToken),
  });
}

export function adjustPlayerBalance(
  sessionToken: string,
  body: AdjustBalanceBody,
): Promise<AdjustBalanceResult> {
  return request<AdjustBalanceResult>("/api/admin/finance/adjust", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify(body),
  });
}

export function listAdminDeposits(
  sessionToken: string,
  status: "all" | "pending" | "succeeded" | "failed" = "all",
): Promise<AdminDeposit[]> {
  return request<AdminDeposit[]>(`/api/admin/finance/deposits?status=${status}`, {
    headers: bearer(sessionToken),
  });
}

export function approveAdminDeposit(
  sessionToken: string,
  orderId: string,
): Promise<AdminDeposit> {
  return request<AdminDeposit>(`/api/admin/finance/deposits/${orderId}/approve`, {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function getMyReferrals(sessionToken: string): Promise<ReferralSummary> {
  return request<ReferralSummary>("/api/referrals/me", {
    headers: bearer(sessionToken),
  });
}

export function applyReferralCode(
  code: string,
  sessionToken: string,
): Promise<ApplyReferralResponse> {
  return request<ApplyReferralResponse>("/api/referrals/apply", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify({ code }),
  });
}

export function getAdminReferralConfig(sessionToken: string): Promise<ReferralConfig> {
  return request<ReferralConfig>("/api/admin/referrals/config", {
    headers: bearer(sessionToken),
  });
}

export function updateAdminReferralConfig(
  sessionToken: string,
  rewardAmountEtb: string | number,
): Promise<ReferralConfig> {
  return request<ReferralConfig>("/api/admin/referrals/config", {
    method: "PUT",
    headers: bearer(sessionToken),
    body: JSON.stringify({ reward_amount_etb: String(rewardAmountEtb) }),
  });
}

export function getAdminReferralOverview(
  sessionToken: string,
): Promise<AdminReferralOverview> {
  return request<AdminReferralOverview>("/api/admin/referrals/overview", {
    headers: bearer(sessionToken),
  });
}

export function getSpinStatus(sessionToken: string): Promise<SpinStatus> {
  return request<SpinStatus>("/api/spin/status", {
    headers: bearer(sessionToken),
  });
}

export function executeSpin(sessionToken: string): Promise<SpinResult> {
  return request<SpinResult>("/api/spin", {
    method: "POST",
    headers: bearer(sessionToken),
  });
}

export function getSpinHistory(sessionToken: string): Promise<SpinHistoryItem[]> {
  return request<SpinHistoryItem[]>("/api/spin/history", {
    headers: bearer(sessionToken),
  });
}

export function getAdminSpinOverview(sessionToken: string): Promise<AdminSpinOverview> {
  return request<AdminSpinOverview>("/api/admin/spin", {
    headers: bearer(sessionToken),
  });
}

export function updateAdminSpinConfig(
  sessionToken: string,
  payload: {
    is_enabled: boolean;
    cooldown_hours: number;
    segments: SpinSegment[];
  },
): Promise<AdminSpinOverview> {
  return request<AdminSpinOverview>("/api/admin/spin", {
    method: "PUT",
    headers: bearer(sessionToken),
    body: JSON.stringify(payload),
  });
}

export function createDuel(body: CreateDuelBody, sessionToken: string): Promise<DuelView> {
  return request<DuelView>("/api/duels", {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify(body),
  });
}

export function listOpenDuels(sessionToken?: string): Promise<DuelView[]> {
  return request<DuelView[]>("/api/duels", {
    headers: sessionToken ? bearer(sessionToken) : undefined,
  });
}

export function listMyDuels(sessionToken: string): Promise<DuelView[]> {
  return request<DuelView[]>("/api/duels/my", {
    headers: bearer(sessionToken),
  });
}

export function getDuel(duelId: string, sessionToken?: string | null): Promise<DuelView> {
  return request<DuelView>(`/api/duels/${duelId}`, {
    headers: sessionToken ? bearer(sessionToken) : undefined,
  });
}

export function playCreatorDuel(
  duelId: string,
  body: SubmitDuelPlayBody,
  sessionToken: string,
): Promise<DuelView> {
  return request<DuelView>(`/api/duels/${duelId}/play-creator`, {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify(body),
  });
}

export function playOpponentDuel(
  duelId: string,
  body: SubmitDuelPlayBody,
  sessionToken: string,
): Promise<DuelView> {
  return request<DuelView>(`/api/duels/${duelId}/play-opponent`, {
    method: "POST",
    headers: bearer(sessionToken),
    body: JSON.stringify(body),
  });
}


