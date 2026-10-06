"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "am" | "om";

export type TranslationDictionary = {
  // Navigation
  "nav.home": string;
  "nav.wallet": string;
  "nav.profile": string;
  "nav.admin": string;

  // Header & Global
  "header.refresh": string;
  "header.updating": string;
  "header.language": string;
  "common.free": string;
  "common.etb": string;
  "common.cancel": string;
  "common.save": string;
  "common.close": string;
  "common.loading": string;
  "common.copy": string;
  "common.copied": string;

  // Home Page
  "home.heroTitle": string;
  "home.heroSubtitle": string;
  "home.activeChallenges": string;
  "home.freeRounds": string;
  "home.allChallenges": string;
  "home.entry": string;
  "home.questions": string;
  "home.time": string;
  "home.players": string;
  "home.prizePool": string;
  "home.winnerGets": string;
  "home.join": string;
  "home.playNow": string;
  "home.viewResults": string;
  "home.full": string;
  "home.confirmed": string;
  "home.needPlayers": string;
  "home.spotsLeft": string;
  "home.nothingOpen": string;
  "home.checkBack": string;
  "home.live": string;
  "home.bigPrize": string;
  "home.pickPrize": string;
  "home.freeToEnter": string;
  "home.highestScoreWins": string;
  "home.mainChallenge": string;
  "home.readyForMore": string;
  "home.onTheClock": string;
  "home.takesPrize": string;
  "home.roundFull": string;
  "home.done": string;
  "home.resume": string;
  "home.play": string;
  "home.win": string;
  "home.seatsLeft": string;
  "home.recentResults": string;
  "home.recentResultsSubtitle": string;
  "home.completed": string;

  // Challenge Card & Actions
  "challenge.resumeQuestions": string;
  "challenge.startQuestions": string;
  "challenge.join": string;
  "challenge.notOpen": string;
  "challenge.completed": string;
  "challenge.closed": string;
  "challenge.openFromBot": string;
  "challenge.wonBy": string;
  "challenge.fullResults": string;
  "challenge.joinedSeatsLeft": string;
  "challenge.confirmedWith": string;
  "challenge.toConfirm": string;

  // Join Dialog
  "join.termsTitle": string;
  "join.termsIntro": string;
  "join.rule1": string;
  "join.rule2": string;
  "join.rule3Free": string;
  "join.rule3Paid": string;
  "join.agreeCheckbox": string;
  "join.confirmButton": string;
  "join.insufficientBalance": string;
  "join.depositNow": string;
  "join.notNow": string;
  "join.joining": string;
  "join.joinForEtb": string;
  "join.deductionAlertTitle": string;
  "join.deductionAlertDesc": string;
  "join.walletBalance": string;
  "join.balanceAfter": string;
  "join.agreeDeductionCheckbox": string;
  "join.payAndJoinButton": string;

  // Quiz Playing
  "quiz.questionOf": string;
  "quiz.secondsLeft": string;
  "quiz.next": string;
  "quiz.back": string;
  "quiz.finish": string;
  "quiz.submit": string;
  "quiz.submitting": string;
  "quiz.saving": string;
  "quiz.score": string;
  "quiz.timeUsed": string;
  "quiz.rank": string;
  "quiz.leaderboard": string;
  "quiz.backHome": string;
  "quiz.timeUp": string;
  "quiz.notJoined": string;
  "quiz.notJoinedDesc": string;
  "quiz.backToChallenge": string;

  // Leaderboard
  "leaderboard.title": string;
  "leaderboard.noFinishes": string;
  "leaderboard.finishedCount": string;
  "leaderboard.emptyDesc": string;
  "leaderboard.you": string;
  "leaderboard.yourScore": string;

  // Wallet
  "wallet.title": string;
  "wallet.balance": string;
  "wallet.pendingCashOut": string;
  "wallet.available": string;
  "wallet.paymentChecking": string;
  "wallet.deposit": string;
  "wallet.cashOut": string;
  "wallet.addMoney": string;
  "wallet.telebirrTitle": string;
  "wallet.telebirrStep1": string;
  "wallet.telebirrStep2": string;
  "wallet.telebirrStep3": string;
  "wallet.sendTo": string;
  "wallet.accountName": string;
  "wallet.accountNumber": string;
  "wallet.txnPlaceholder": string;
  "wallet.confirmDeposit": string;
  "wallet.withdrawTitle": string;
  "wallet.withdrawAmount": string;
  "wallet.withdrawPhone": string;
  "wallet.confirmWithdraw": string;
  "wallet.history": string;
  "wallet.noTransactions": string;
  "wallet.cashOutInfo": string;
  "wallet.amountSent": string;
  "wallet.amountToCashOut": string;

  // Profile
  "profile.title": string;
  "profile.language": string;
  "profile.telegramId": string;
  "profile.memberSince": string;
  "profile.noUsername": string;

  // Referral
  "referral.title": string;
  "referral.subtitle": string;
  "referral.rewardNote": string;
  "referral.invitedCount": string;
  "referral.totalEarned": string;
  "referral.shareLink": string;
  "referral.copyLink": string;
  "referral.yourCode": string;
  "referral.enterCode": string;
  "referral.applyCode": string;
  "referral.codePlaceholder": string;
  "referral.applying": string;
  "referral.noInvitesYet": string;
  "referral.rewarded": string;
  "referral.pending": string;
  "referral.invitedBy": string;

  // Daily Spin
  "nav.spin": string;
  "spin.title": string;
  "spin.subtitle": string;
  "spin.button": string;
  "spin.spinning": string;
  "spin.cooldownTitle": string;
  "spin.cooldownSubtitle": string;
  "spin.disabled": string;
  "spin.winTitle": string;
  "spin.tryAgain": string;
  "spin.claim": string;
  "spin.history": string;
  "spin.noHistory": string;
  "spin.bannerTitle": string;
  "spin.bannerSub": string;
  "spin.freeDaily": string;
};

const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    "nav.home": "Home",
    "nav.wallet": "Wallet",
    "nav.profile": "Profile",
    "nav.admin": "Admin",

    "header.refresh": "Refresh",
    "header.updating": "Updating",
    "header.language": "Language",
    "common.free": "Free",
    "common.etb": "ETB",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.close": "Close",
    "common.loading": "Loading...",
    "common.copy": "Copy",
    "common.copied": "Copied ✓",

    "home.heroTitle": "How sharp are you today?",
    "home.heroSubtitle": "Quick questions. Pick a prize and take your shot.",
    "home.activeChallenges": "Active Challenges",
    "home.freeRounds": "Free Play Rounds",
    "home.allChallenges": "All Competitions",
    "home.entry": "Entry",
    "home.questions": "Questions",
    "home.time": "Time",
    "home.players": "Players",
    "home.prizePool": "Prize pool",
    "home.winnerGets": "Winner gets",
    "home.join": "Join",
    "home.playNow": "Play now",
    "home.viewResults": "View results",
    "home.full": "Full",
    "home.confirmed": "Confirmed",
    "home.needPlayers": "players to confirm",
    "home.spotsLeft": "seats left",
    "home.nothingOpen": "Nothing is open right now",
    "home.checkBack": "A new round will show up here. Check again in a little while.",
    "home.live": "Live",
    "home.bigPrize": "Big prize",
    "home.pickPrize": "Pick your prize",
    "home.freeToEnter": "Free to enter. One winner.",
    "home.highestScoreWins": "Highest score wins. If scores tie, the faster player takes it.",
    "home.mainChallenge": "The main challenge",
    "home.readyForMore": "Ready for more? Use your winnings to play for the big prize.",
    "home.onTheClock": "on the clock",
    "home.takesPrize": "takes the prize",
    "home.roundFull": "Round full",
    "home.done": "Done",
    "home.resume": "Resume",
    "home.play": "Play",
    "home.win": "Win",
    "home.seatsLeft": "{left} of {total} seats left",
    "home.recentResults": "Recent Results & Winners",
    "home.recentResultsSubtitle": "Final scores and winners from concluded challenges",
    "home.completed": "Completed",

    "challenge.resumeQuestions": "Resume questions",
    "challenge.startQuestions": "Start questions",
    "challenge.join": "Join",
    "challenge.notOpen": "This challenge is not open",
    "challenge.completed": "Completed · Results Final",
    "challenge.closed": "This challenge has ended",
    "challenge.openFromBot": "Open Challenge from the bot to join.",
    "challenge.wonBy": "Won by {name}",
    "challenge.fullResults": "Full · results when everyone finishes",
    "challenge.joinedSeatsLeft": "{joined} of {needed} joined · {left} seats left",
    "challenge.confirmedWith": "Confirmed with {joined} players",
    "challenge.toConfirm": "{joined} of {needed} players to confirm",

    "join.termsTitle": "Terms",
    "join.termsIntro": "Please read and agree before entering:",
    "join.rule1": "One entry. You cannot join this challenge again.",
    "join.rule2": "{count} questions in {seconds} seconds. The clock starts immediately and cannot be paused.",
    "join.rule3Free": "Free round. Top score with fastest finish wins the prize.",
    "join.rule3Paid": "{fee} ETB entry fee will be deducted from your wallet upon entry. The prize pool confirms once minimum players join.",
    "join.agreeCheckbox": "I agree to these terms.",
    "join.confirmButton": "Accept & Join",
    "join.insufficientBalance": "Balance too low for entry fee. Add funds in your wallet.",
    "join.depositNow": "Add money",
    "join.notNow": "Not now",
    "join.joining": "Joining...",
    "join.joinForEtb": "Join for {fee} ETB",
    "join.deductionAlertTitle": "Fee Notice: {fee} ETB will be deducted",
    "join.deductionAlertDesc": "Joining this paid competition will deduct {fee} ETB entry fee directly from your wallet balance.",
    "join.walletBalance": "Your current balance",
    "join.balanceAfter": "Balance after deduction",
    "join.agreeDeductionCheckbox": "I agree to the terms and authorise deducting {fee} ETB from my wallet balance.",
    "join.payAndJoinButton": "Pay {fee} ETB & Join",

    "quiz.questionOf": "Question {current} / {total}",
    "quiz.secondsLeft": "{seconds}s left",
    "quiz.next": "Next",
    "quiz.back": "Back",
    "quiz.finish": "Finish",
    "quiz.submit": "Submit answers",
    "quiz.submitting": "Submitting...",
    "quiz.saving": "Saving...",
    "quiz.score": "Your score",
    "quiz.timeUsed": "Time elapsed",
    "quiz.rank": "Your rank",
    "quiz.leaderboard": "Leaderboard",
    "quiz.backHome": "Back to challenge",
    "quiz.timeUp": "Time is up! Submitting answers...",
    "quiz.notJoined": "Not joined",
    "quiz.notJoinedDesc": "Join this challenge and agree to the terms before the questions open.",
    "quiz.backToChallenge": "Back to challenge",

    "leaderboard.title": "Leaderboard",
    "leaderboard.noFinishes": "No finishes yet",
    "leaderboard.finishedCount": "{count} finished",
    "leaderboard.emptyDesc": "Scores land here as soon as a player finishes. Joining alone does not rank you.",
    "leaderboard.you": "You",
    "leaderboard.yourScore": "Your score",

    "wallet.title": "Wallet",
    "wallet.balance": "Balance",
    "wallet.pendingCashOut": "Pending cash out",
    "wallet.available": "Available",
    "wallet.paymentChecking": "A payment is being checked",
    "wallet.deposit": "Deposit",
    "wallet.cashOut": "Cash out",
    "wallet.addMoney": "Add money",
    "wallet.telebirrTitle": "Send money on Telebirr",
    "wallet.telebirrStep1": "Send money using your Telebirr app to the account below:",
    "wallet.telebirrStep2": "Enter the payment details",
    "wallet.telebirrStep3": "Confirm",
    "wallet.sendTo": "Send to",
    "wallet.accountName": "Name",
    "wallet.accountNumber": "Phone",
    "wallet.txnPlaceholder": "Paste SMS transaction number (e.g. 10 digits/letters)",
    "wallet.confirmDeposit": "Confirm payment",
    "wallet.withdrawTitle": "Cash out",
    "wallet.withdrawAmount": "Amount to cash out",
    "wallet.withdrawPhone": "Your Telebirr phone number",
    "wallet.confirmWithdraw": "Request cash out",
    "wallet.history": "Recent Transactions",
    "wallet.noTransactions": "No transactions yet.",
    "wallet.cashOutInfo": "You can cash out up to {amount} ETB. We send it to your Telebirr, usually within a day.",
    "wallet.amountSent": "Amount you sent",
    "wallet.amountToCashOut": "Amount to cash out",

    "profile.title": "Profile",
    "profile.language": "App Language / ቋንቋ / Afaan",
    "profile.telegramId": "Telegram id",
    "profile.memberSince": "Member since",
    "profile.noUsername": "No username",

    "referral.title": "Invite Friends & Earn",
    "referral.subtitle": "Get {amount} ETB for every new friend who joins and finishes their first challenge!",
    "referral.rewardNote": "Rewards are deposited straight into your wallet.",
    "referral.invitedCount": "Friends Invited",
    "referral.totalEarned": "Total Earned",
    "referral.shareLink": "Share on Telegram",
    "referral.copyLink": "Copy Invite Link",
    "referral.yourCode": "Your Invite Code",
    "referral.enterCode": "Have a referral code?",
    "referral.applyCode": "Apply Code",
    "referral.codePlaceholder": "Enter friend's code",
    "referral.applying": "Applying...",
    "referral.noInvitesYet": "No friends invited yet. Share your link to start earning!",
    "referral.rewarded": "{amount} ETB Earned ✓",
    "referral.pending": "Joined · Waiting for 1st play",
    "referral.invitedBy": "Invited by {name}",

    "nav.spin": "Spin & Win",
    "spin.title": "Daily Lucky Wheel",
    "spin.subtitle": "Spin once every day to win free ETB cash prizes credited right to your wallet!",
    "spin.button": "SPIN THE WHEEL",
    "spin.spinning": "Spinning...",
    "spin.cooldownTitle": "Next Spin in",
    "spin.cooldownSubtitle": "Come back when the timer expires for another free spin!",
    "spin.disabled": "Daily spin is temporarily disabled by admin.",
    "spin.winTitle": "Congratulations! 🎉",
    "spin.tryAgain": "Better Luck Next Time!",
    "spin.claim": "Great! Added to Wallet",
    "spin.history": "Your Recent Spins",
    "spin.noHistory": "No spins yet. Tap SPIN to try your luck!",
    "spin.bannerTitle": "Daily Lucky Spin!",
    "spin.bannerSub": "Spin once every 24h for a chance to win instant ETB prizes.",
    "spin.freeDaily": "Free Daily Spin",
  },

  am: {
    "nav.home": "መነሻ",
    "nav.wallet": "ቦርሳ",
    "nav.profile": "መገለጫ",
    "nav.admin": "አስተዳዳሪ",

    "header.refresh": "አድስ",
    "header.updating": "እያደሰ ነው",
    "header.language": "ቋንቋ",
    "common.free": "ነፃ",
    "common.etb": "ብር",
    "common.cancel": "ተመለስ",
    "common.save": "አስቀምጥ",
    "common.close": "ዝጋ",
    "common.loading": "እየጫነ ነው...",
    "common.copy": "ኮፒ",
    "common.copied": "ተገልብጧል ✓",

    "home.heroTitle": "ዛሬ ምን ያህል ዝግጁ ነዎት?",
    "home.heroSubtitle": "ፈጣን ጥያቄዎች። ሽልማት ይምረጡና ዕድልዎን ይሞክሩ።",
    "home.activeChallenges": "ንቁ ውድድሮች",
    "home.freeRounds": "ነፃ ዙሮች",
    "home.allChallenges": "ሁሉም ውድድሮች",
    "home.entry": "መግቢያ",
    "home.questions": "ጥያቄዎች",
    "home.time": "ጊዜ",
    "home.players": "ተወዳዳሪዎች",
    "home.prizePool": "የሽልማት ፈንድ",
    "home.winnerGets": "አሸናፊው የሚያገኘው",
    "home.join": "ተቀላቀል",
    "home.playNow": "አሁን ተጫወት",
    "home.viewResults": "ውጤት ይመልከቱ",
    "home.full": "ሞልቷል",
    "home.confirmed": "ተረጋግጧል",
    "home.needPlayers": "ተጫዋች ለማረጋገጥ",
    "home.spotsLeft": "ቦታዎች ቀርተዋል",
    "home.nothingOpen": "በአሁኑ ሰዓት ክፍት ውድድር የለም",
    "home.checkBack": "አዲስ ውድድር እዚህ ይለጠፋል። ጥቂት ቆይተው ይመልከቱ።",
    "home.live": "ቀጥታ",
    "home.bigPrize": "ትልቅ ሽልማት",
    "home.pickPrize": "ሽልማትዎን ይምረጡ",
    "home.freeToEnter": "መግቢያው ነፃ። አንድ አሸናፊ።",
    "home.highestScoreWins": "ከፍተኛ ውጤት ያመጣ ያሸንፋል። እኩል ከሆኑ ፈጣኑ ይወስዳል።",
    "home.mainChallenge": "ዋናው ውድድር",
    "home.readyForMore": "ተጨማሪ ይፈልጋሉ? ያሸነፉትን ተጠቅመው ለትልቁ ሽልማት ይወዳደሩ።",
    "home.onTheClock": "የተሰጠ ጊዜ",
    "home.takesPrize": "ሽልማቱን ይወስዳል",
    "home.roundFull": "ዙሩ ሞልቷል",
    "home.done": "ተጠናቋል",
    "home.resume": "ቀጥል",
    "home.play": "ተጫወት",
    "home.win": "አሸንፍ",
    "home.seatsLeft": "ከ{total} ውስጥ {left} ቦታዎች ቀርተዋል",
    "home.recentResults": "የቅርብ ጊዜ ውጤቶች እና አሸናፊዎች",
    "home.recentResultsSubtitle": "የተጠናቀቁ ፈተናዎች የመጨረሻ ውጤቶች እና አሸናፊዎች",
    "home.completed": "ተጠናቋል",

    "challenge.resumeQuestions": "ጥያቄዎቹን ቀጥል",
    "challenge.startQuestions": "ጥያቄዎቹን ጀምር",
    "challenge.join": "ተቀላቀል",
    "challenge.notOpen": "ይህ ውድድር አልተከፈተም",
    "challenge.completed": "ተጠናቋል · የመጨረሻ ውጤት",
    "challenge.closed": "ይህ ፈተና ተጠናቋል",
    "challenge.openFromBot": "ለመቀላቀል ውድድሩን ከቴሌግራም ቦቱ ይክፈቱ።",
    "challenge.wonBy": "በ{name} ተሸንፏል",
    "challenge.fullResults": "ሞልቷል · ሁሉም ሲጨርሱ ውጤት ይፋ ይሆናል",
    "challenge.joinedSeatsLeft": "{joined} ከ {needed} ገብተዋል · {left} ቦታዎች ቀርተዋል",
    "challenge.confirmedWith": "በ {joined} ተወዳዳሪዎች ተረጋግጧል",
    "challenge.toConfirm": "ለማረጋገጥ ከ {needed} ተጫዋቾች {joined} ተመዝግበዋል",

    "join.termsTitle": "ደንቦች",
    "join.termsIntro": "ውድድሩን ከመቀላቀልዎ በፊት ደንቦቹን ያንብቡ፡",
    "join.rule1": "በአንድ ውድድር አንድ ጊዜ ብቻ መሳተፍ ይቻላል።",
    "join.rule2": "{count} ጥያቄዎች በ {seconds} ሰከንዶች። የሰዓት ቆጣሪው ወዲያውኑ ይጀምራል፣ ማቆም አይቻልም።",
    "join.rule3Free": "ነፃ ዙር። በፈጣን ጊዜ ከፍተኛ ውጤት ያመጣ አሸናፊ ይሆናል።",
    "join.rule3Paid": "ሲቀላቀሉ {fee} ብር የመግቢያ ክፍያ ከዋሌትዎ ይቀነሳል። አስፈላጊው የተወዳዳሪ ቁጥር ሲሞላ ሽልማቱ ይረጋገጣል።",
    "join.agreeCheckbox": "ደንቦቹን አንብቤ ተስማምቻለሁ።",
    "join.confirmButton": "ተስማምቼ ልቀላቀል",
    "join.insufficientBalance": "የሂሳብዎ መጠን ለመግቢያ ክፍያ አይበቃም። ቦርሳዎ ውስጥ ገንዘብ ያስገቡ።",
    "join.depositNow": "ገንዘብ አስገባ",
    "join.notNow": "አሁን አይደለም",
    "join.joining": "እየተቀላቀለ ነው...",
    "join.joinForEtb": "በ{fee} ብር ተቀላቀል",
    "join.deductionAlertTitle": "የክፍያ ማስታወቂያ፡ {fee} ብር ከዋሌትዎ ይቀነሳል",
    "join.deductionAlertDesc": "ይህን ውድድር ሲቀላቀሉ {fee} ብር የመግቢያ ክፍያ ወዲያውኑ ከዋሌት ሂሳብዎ ይቀነሳል።",
    "join.walletBalance": "የአሁኑ የዋሌት ሂሳብዎ",
    "join.balanceAfter": "ከተቀላቀሉ በኋላ የሚቀረው ሂሳብ",
    "join.agreeDeductionCheckbox": "ውሉን ተስማምቻለሁ፤ {fee} ብር ከዋሌቴ እንዲቀነስ ፈቅጃለሁ።",
    "join.payAndJoinButton": "{fee} ብር ከፍለው ይግቡ",

    "quiz.questionOf": "ጥያቄ {current} / {total}",
    "quiz.secondsLeft": "{seconds} ሰከንድ ቀርቷል",
    "quiz.next": "ቀጣይ",
    "quiz.back": "ተመለስ",
    "quiz.finish": "ጨርስ",
    "quiz.submit": "መልስ አስገባ",
    "quiz.submitting": "እያስገባ ነው...",
    "quiz.saving": "እያስቀመጠ ነው...",
    "quiz.score": "የእርስዎ ውጤት",
    "quiz.timeUsed": "የፈጀው ጊዜ",
    "quiz.rank": "ደረጃዎ",
    "quiz.leaderboard": "የደረጃ ሰንጠረዥ",
    "quiz.backHome": "ወደ ውድድሩ ተመለስ",
    "quiz.timeUp": "ሰዓቱ አልቋል! መልሶች እየገቡ ነው...",
    "quiz.notJoined": "አልተቀላቀሉም",
    "quiz.notJoinedDesc": "ጥያቄዎቹ ከመከፈታቸው በፊት ውድድሩን ይቀላቀሉና ደንቦቹን ይቀበሉ።",
    "quiz.backToChallenge": "ወደ ውድድሩ ተመለስ",

    "leaderboard.title": "የደረጃ ሰንጠረዥ",
    "leaderboard.noFinishes": "እስካሁን ያጠናቀቀ የለም",
    "leaderboard.finishedCount": "{count} አጠናቀዋል",
    "leaderboard.emptyDesc": "አንድ ተጫዋች እንዳጠናቀቀ ውጤቱ እዚህ ይቀመጣል። በመቀላቀል ብቻ ደረጃ አይሰጥም።",
    "leaderboard.you": "እርስዎ",
    "leaderboard.yourScore": "የእርስዎ ውጤት",

    "wallet.title": "ቦርሳ",
    "wallet.balance": "ቀሪ ሂሳብ",
    "wallet.pendingCashOut": "በሂደት ላይ ያለ ክፍያ",
    "wallet.available": "ዝግጁ የሆነ",
    "wallet.paymentChecking": "ክፍያ እየተረጋገጠ ነው",
    "wallet.deposit": "ገንዘብ አስገባ",
    "wallet.cashOut": "ገንዘብ አውጣ",
    "wallet.addMoney": "ገንዘብ አስገባ",
    "wallet.telebirrTitle": "በቴሌብር ገንዘብ ያስተላልፉ",
    "wallet.telebirrStep1": "በቴሌብር መተግበሪያዎ ወደዚህ ሂሳብ ገንዘብ ያስተላልፉ፡",
    "wallet.telebirrStep2": "የክፍያውን ዝርዝር ያስገቡ",
    "wallet.telebirrStep3": "አረጋግጥ",
    "wallet.sendTo": "ላክ ወደ",
    "wallet.accountName": "የሂሳብ ስም",
    "wallet.accountNumber": "የስልክ ቁጥር",
    "wallet.txnPlaceholder": "ከቴሌብር የደረሰዎትን የግብይት ቁጥር (Txn) እዚህ ይለጥፉ",
    "wallet.confirmDeposit": "ክፍያውን አረጋግጥ",
    "wallet.withdrawTitle": "ገንዘብ አውጣ",
    "wallet.withdrawAmount": "የሚወጣው መጠን",
    "wallet.withdrawPhone": "የእርስዎ ቴሌብር ስልክ ቁጥር",
    "wallet.confirmWithdraw": "ገንዘብ ለማውጣት ጠይቅ",
    "wallet.history": "የቅርብ ጊዜ ግብይቶች",
    "wallet.noTransactions": "ምንም ግብይት አልተገኘም።",
    "wallet.cashOutInfo": "እስከ {amount} ብር ድረስ ማውጣት ይችላሉ። በቀን ውስጥ ወደ ቴሌብርዎ ይላካል።",
    "wallet.amountSent": "የላኩት መጠን",
    "wallet.amountToCashOut": "የሚወጣው መጠን",

    "profile.title": "መገለጫ",
    "profile.language": "የመተግበሪያው ቋንቋ / Language",
    "profile.telegramId": "የቴሌግራም መታወቂያ",
    "profile.memberSince": "የተመዘገቡበት ቀን",
    "profile.noUsername": "የተጠቃሚ ስም የለም",

    "referral.title": "ጓደኞችን ጋብዘው ያግኙ",
    "referral.subtitle": "በእርስዎ ግብዣ ተቀላቅሎ የመጀመሪያ ውድድሩን ለሚያጠናቅቅ ለእያንዳንዱ አዲስ ጓደኛ {amount} ብር ያግኙ!",
    "referral.rewardNote": "የግብዣ ጉርሻ በቀጥታ ወደ ቦርሳዎ ገቢ ይደረጋል።",
    "referral.invitedCount": "የተጋበዙ ጓደኞች",
    "referral.totalEarned": "አጠቃላይ ያገኙት",
    "referral.shareLink": "በቴሌግራም አጋራ",
    "referral.copyLink": "የግብዣ ሊንክ ኮፒ አድርግ",
    "referral.yourCode": "የእርስዎ የግብዣ ኮድ",
    "referral.enterCode": "የግብዣ ኮድ አለዎት?",
    "referral.applyCode": "ኮዱን ተጠቀም",
    "referral.codePlaceholder": "የጓደኛዎን ኮድ ያስገቡ",
    "referral.applying": "እየተረጋገጠ ነው...",
    "referral.noInvitesYet": "እስካሁን የተጋበዘ ጓደኛ የለም። ሊንክዎን በማጋራት ገቢ ማግኘት ይጀምሩ!",
    "referral.rewarded": "{amount} ብር ተከፍሏል ✓",
    "referral.pending": "ተቀላቅለዋል · የመጀመሪያ ውድድራቸውን በመጠበቅ ላይ",
    "referral.invitedBy": "በ {name} የተጋበዙ",

    "nav.spin": "እሽክርክሪት",
    "spin.title": "የዕለቱ የዕድል እሽክርክሪት",
    "spin.subtitle": "በየቀኑ አንድ ጊዜ በማሽከርከር የብር ሽልማቶችን በቀጥታ ወደ ቦርሳዎ ያሸንፉ!",
    "spin.button": "አሽከርክር",
    "spin.spinning": "እየተሽከረከረ ነው...",
    "spin.cooldownTitle": "ቀጣዩ እሽክርክሪት በ",
    "spin.cooldownSubtitle": "ቆጣሪው ሲያልቅ ለተጨማሪ ነፃ ዕድል ይመለሱ!",
    "spin.disabled": "የዕለቱ እሽክርክሪት ለጊዜው በአስተዳዳሪው ተዘግቷል።",
    "spin.winTitle": "እንኳን ደስ አዎት! 🎉",
    "spin.tryAgain": "ለቀጣይ መልካም ዕድል!",
    "spin.claim": "እሺ! ወደ ቦርሳዎ ገብቷል",
    "spin.history": "የቅርብ ጊዜ እሽክርክሪቶችዎ",
    "spin.noHistory": "እስካሁን ያላሽከረከሩት የለም። አሁን ዕድልዎን ይሞክሩ!",
    "spin.bannerTitle": "የዕለቱ ነፃ እሽክርክሪት!",
    "spin.bannerSub": "በየቀኑ አንድ ጊዜ ያሽከርክሩና ፈጣን የብር ሽልማት ያሸንፉ።",
    "spin.freeDaily": "ነፃ የዕለት እሽክርክሪት",
  },

  om: {
    "nav.home": "Mana",
    "nav.wallet": "Boorsaa",
    "nav.profile": "Profaayilii",
    "nav.admin": "Bulchaa",

    "header.refresh": "Haaromsi",
    "header.updating": "Haaromaa jira",
    "header.language": "Afaan",
    "common.free": "Tola",
    "common.etb": "ETB",
    "common.cancel": "Dhiisi",
    "common.save": "Olkaayi",
    "common.close": "Cufi",
    "common.loading": "Fe'aa jira...",
    "common.copy": "Waraabi",
    "common.copied": "Waraabameera ✓",

    "home.heroTitle": "Har'a hammam qophooftaniittu?",
    "home.heroSubtitle": "Gaaffilee ariifatoo. Badhaasa filadhuutii carraa kee yaali.",
    "home.activeChallenges": "Dorgommiilee Hojirra Jiran",
    "home.freeRounds": "Marsaalee Tolaa",
    "home.allChallenges": "Dorgommiilee Hundumaa",
    "home.entry": "Seensa",
    "home.questions": "Gaaffilee",
    "home.time": "Yeroo",
    "home.players": "Hirmaattota",
    "home.prizePool": "Kuusaa Badhaasaa",
    "home.winnerGets": "Mo'ataan kan argatu",
    "home.join": "Makami",
    "home.playNow": "Amma Taphadhu",
    "home.viewResults": "Bu'aa Ilaali",
    "home.full": "Guuteera",
    "home.confirmed": "Mirkanaa'eera",
    "home.needPlayers": "hirmaattota mirkaneessuuf",
    "home.spotsLeft": "teessoo hafe",
    "home.nothingOpen": "Yeroo ammaa dorgommiin baname hin jiru",
    "home.checkBack": "Marsaa haaraan asitti mul'ata. Yeroo muraasa booda deebi'aa ilaalaa.",
    "home.live": "Kallattiin",
    "home.bigPrize": "Badhaasa guddaa",
    "home.pickPrize": "Badhaasa kee filadhu",
    "home.freeToEnter": "Seensi tola. Injifataan tokko.",
    "home.highestScoreWins": "Qabxii olaanaan ni injifata. Qabxiin wal qixa yoo ta'e kan saffise fudhata.",
    "home.mainChallenge": "Dorgommii guddaa",
    "home.readyForMore": "Dabalataaf qophiidhaa? Qarshii mo'attaniin badhaasa guddaaf taphadhaa.",
    "home.onTheClock": "sa'aatii irratti",
    "home.takesPrize": "badhaasa fudhata",
    "home.roundFull": "Marsaan guuteera",
    "home.done": "Xumurameera",
    "home.resume": "Itti fufi",
    "home.play": "Taphadhu",
    "home.win": "Injifadhu",
    "home.seatsLeft": "Teessoo {total} keessaa {left} hafeera",
    "home.recentResults": "Bu'aawwan dhihoo fi mo'attoota",
    "home.recentResultsSubtitle": "Qaphxii dhumaa fi mo'attoota dorgommiiwwan xumuraman",
    "home.completed": "Xumurameera",

    "challenge.resumeQuestions": "Gaaffilee itti fufi",
    "challenge.startQuestions": "Gaaffilee jalqabi",
    "challenge.join": "Makami",
    "challenge.notOpen": "Dorgommiin kun hin banamne",
    "challenge.completed": "Xumurameera · Bu'aa dhumaa",
    "challenge.closed": "Dorgommiin kun xumurameera",
    "challenge.openFromBot": "Makamuuf dorgommii boottii Telegram irraa banaa.",
    "challenge.wonBy": "Kan injifate: {name}",
    "challenge.fullResults": "Guuteera · hundi yeroo xumuran bu'aan ni ba'a",
    "challenge.joinedSeatsLeft": "{needed} keessaa {joined} makamaniiru · {left} hafeera",
    "challenge.confirmedWith": "Hirmaattota {joined} wajjin mirkanaa'eera",
    "challenge.toConfirm": "Mirkaneessuuf hirmaattota {needed} keessaa {joined}",

    "join.termsTitle": "Dambii",
    "join.termsIntro": "Dorgommii seenuun dura dambii kana dubbisaa:",
    "join.rule1": "Dorgommii tokkoof carraa tokko qofa qabdu.",
    "join.rule2": "Gaaffilee {count} sekondii {seconds} keessatti. Sa'aatiin yeruma sana jalqaba, dhaabuu hin dandeessan.",
    "join.rule3Free": "Marsaa tolaa. Qabxii olaanaa fi saffisa qabu badhaasa injifata.",
    "join.rule3Paid": "Yeroo seentan kaffaltiin seenisaa {fee} ETB herrega keessan irraa ni hir'ifama. Hirmaattotni barbaachisan yoo guutan badhaasichi ni mirkanaa'a.",
    "join.agreeCheckbox": "Dambicha dubbisee irratti walii galeera.",
    "join.confirmButton": "Walii Galee Seeni",
    "join.insufficientBalance": "Qarshiin keessan seensaaf hin ga'u. Boorsaa keessanitti qarshii galchaa.",
    "join.depositNow": "Qarshii Galchi",
    "join.notNow": "Amma Miti",
    "join.joining": "Makkamaa jira...",
    "join.joinForEtb": "ETB {fee} dhaan makami",
    "join.deductionAlertTitle": "Beeksisa Kaffaltii: Qarshiin {fee} ETB ni hir'ifama",
    "join.deductionAlertDesc": "Dorgommii kana keessatti hirmaachuuf kaffaltiin seenisaa {fee} ETB battalumatti herrega boorsaa keessan irraa ni hir'ifama.",
    "join.walletBalance": "Herrega boorsaa ammaa",
    "join.balanceAfter": "Erga seentanii booda kan hafu",
    "join.agreeDeductionCheckbox": "Dambicha irratti walii galeera፤ {fee} ETB herrega koo irraa akka hir'ifamu heyyameera.",
    "join.payAndJoinButton": "{fee} ETB Kaffalii Seeni",

    "quiz.questionOf": "Gaaffii {current} / {total}",
    "quiz.secondsLeft": "{seconds}s hafe",
    "quiz.next": "Itti Aanu",
    "quiz.back": "Duubatti",
    "quiz.finish": "Xumuri",
    "quiz.submit": "Deebii Galchi",
    "quiz.submitting": "Galchaa jira...",
    "quiz.saving": "Olkaa'aa jira...",
    "quiz.score": "Qabxii Keessan",
    "quiz.timeUsed": "Yeroo Fudhatame",
    "quiz.rank": "Sadarkaa Keessan",
    "quiz.leaderboard": "Sadarkaa Hirmaattotaa",
    "quiz.backHome": "Gara dorgommiitti deebi'i",
    "quiz.timeUp": "Yeroon dhumateera! Deebiin galfamaa jira...",
    "quiz.notJoined": "Hin makamne",
    "quiz.notJoinedDesc": "Gaaffileen banamuun dura dorgommii kanatti makamaatii dambii fudhadhaa.",
    "quiz.backToChallenge": "Gara dorgommiitti deebi'i",

    "leaderboard.title": "Sadarkaa Hirmaattotaa",
    "leaderboard.noFinishes": "Hamma ammaatti kan xumure hin jiru",
    "leaderboard.finishedCount": "{count} xumuraniiru",
    "leaderboard.emptyDesc": "Akkuma hirmaataan xumureen qabxiin asitti olkaa'ama. Makamuun qofti sadarkaa hin kennu.",
    "leaderboard.you": "Isin",
    "leaderboard.yourScore": "Qabxii Keessan",

    "wallet.title": "Boorsaa",
    "wallet.balance": "Haftee Qarshii",
    "wallet.pendingCashOut": "Qarshii ba'uuf adeemsarra jiru",
    "wallet.available": "Qophii kan ta'e",
    "wallet.paymentChecking": "Kaffaltiin mirkanaa'aa jira",
    "wallet.deposit": "Qarshii Galchi",
    "wallet.cashOut": "Qarshii Baasi",
    "wallet.addMoney": "Qarshii Galchi",
    "wallet.telebirrTitle": "Telebirr dhaan Qarshii Galchaa",
    "wallet.telebirrStep1": "Appilikeeshinii Telebirr fayyadamuun gara herrega kanaatti ergaa:",
    "wallet.telebirrStep2": "Odeeffannoo kaffaltii galchaa",
    "wallet.telebirrStep3": "Mirkaneessi",
    "wallet.sendTo": "Gara",
    "wallet.accountName": "Maqaa Herregaa",
    "wallet.accountNumber": "Lakkoofsa Bilbilaa",
    "wallet.txnPlaceholder": "Lakkoofsa daldalaa (Txn) asitti galchaa",
    "wallet.confirmDeposit": "Kaffaltii Mirkaneessi",
    "wallet.withdrawTitle": "Qarshii Baasuu Gaafadhu",
    "wallet.withdrawAmount": "Hamma Qarshii Ba'u",
    "wallet.withdrawPhone": "Lakkoofsa Bilbila Telebirr",
    "wallet.confirmWithdraw": "Qarshii Baasuu Gaafadhu",
    "wallet.history": "Seenaa Daldalaa Dhihoo",
    "wallet.noTransactions": "Hojiin daldalaa hin jiru.",
    "wallet.cashOutInfo": "Hamma ETB {amount} baasuu dandeessu. Guyyaa tokko keessatti gara Telebirr keessaniitti ni ergama.",
    "wallet.amountSent": "Hamma ergitan",
    "wallet.amountToCashOut": "Hamma baasuuf jirtan",

    "profile.title": "Profaayilii",
    "profile.language": "Afaan Appii / Language",
    "profile.telegramId": "Eenyummaa Telegram",
    "profile.memberSince": "Guyyaa Miseensummaa",
    "profile.noUsername": "Maqaan fayyadamaa hin jiru",

    "referral.title": "Hiriyaa Afeeraa Badhaafamaa",
    "referral.subtitle": "Hiriyaa haaraa afeertanii dorgommii isaanii isa jalqabaa xumuraniif {amount} ETB argadhaa!",
    "referral.rewardNote": "Badhaasni kallattiin gara boorsaa keessaniitti ni galfama.",
    "referral.invitedCount": "Hiriyoota Afeeraman",
    "referral.totalEarned": "Ida'ama Argattan",
    "referral.shareLink": "Telegram irratti Qoodaa",
    "referral.copyLink": "Liinkii Afeerraa Waraabi",
    "referral.yourCode": "Koodii Afeerraa Keessan",
    "referral.enterCode": "Koodii afeerraa qabduu?",
    "referral.applyCode": "Koodii Galchaa",
    "referral.codePlaceholder": "Koodii hiriyaa keessanii galchaa",
    "referral.applying": "Galchaa jira...",
    "referral.noInvitesYet": "Hangi ammaatti hiriyaan afeerame hin jiru. Liinkii keessan qooduun argachuu jalqabaa!",
    "referral.rewarded": "{amount} ETB Argatameera ✓",
    "referral.pending": "Makamaniiru · Dorgommii jalqabaa eegaa jiru",
    "referral.invitedBy": "Kan afeerame: {name}",

    "nav.spin": "Naannessi",
    "spin.title": "Geengoo Carraa Guyyaa",
    "spin.subtitle": "Guyyaatti altokko naannessuun badhaasa qarshii kallattiin gara boorsaa keetti injiffadhu!",
    "spin.button": "GEENGOO NAANNESSI",
    "spin.spinning": "Naanna'aa jira...",
    "spin.cooldownTitle": "Naannessi itti aanu",
    "spin.cooldownSubtitle": "Sa'aatiin kun yeroo dhumatu carraa biraaf deebi'aa!",
    "spin.disabled": "Geengoon carraa yeroof bulchaan cufameera.",
    "spin.winTitle": "Baga Gammaddan! 🎉",
    "spin.tryAgain": "Yeroo itti aanu carraa gaarii!",
    "spin.claim": "Gaarii! Gara boorsaa galeera",
    "spin.history": "Naannessa dhihoo kee",
    "spin.noHistory": "Hanga ammaatti hin naannessine. Amma carraa kee yaali!",
    "spin.bannerTitle": "Geengoo Carraa Guyyaa!",
    "spin.bannerSub": "Sa'aatii 24 keessatti al tokko naannessuun qarshii yeroodhuma sana injiffadhu.",
    "spin.freeDaily": "Carraa Guyyaa Tolaa",
  },
};

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof TranslationDictionary, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "challenge.language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    try {
      // 1. Check URL query param (?lang=en|am|om) passed by bot
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get("lang") as Language | null;
      if (urlLang && (urlLang === "en" || urlLang === "am" || urlLang === "om")) {
        setLanguageState(urlLang);
        localStorage.setItem(STORAGE_KEY, urlLang);
        return;
      }

      // 2. Check saved localStorage
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved && (saved === "en" || saved === "am" || saved === "om")) {
        setLanguageState(saved);
        return;
      }

      // 3. Check Telegram WebApp user language_code if available
      const tgLang = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } })
        ?.Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.toLowerCase();
      if (tgLang === "am" || tgLang === "om") {
        setLanguageState(tgLang);
        localStorage.setItem(STORAGE_KEY, tgLang);
      }
    } catch {
      // LocalStorage access might fail in restricted WebViews
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore
    }
  }, []);

  const t = useCallback(
    (key: keyof TranslationDictionary, params?: Record<string, string | number>): string => {
      let text = TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? String(key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      text = text.replace(/\{amount\}/g, "1.00");
      return text;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return context;
}
