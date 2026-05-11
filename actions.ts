import { HttpError } from 'wasp/server'

export const claimDailyCheckin = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const settings = await context.entities.Settings.findFirst();
  if (!settings) { throw new HttpError(500, "Settings not found") }

  const bonus = settings.dailyCheckinBonus ?? 0;

  const user = await context.entities.User.findUnique({
    where: { id: context.user.id }
  });
  if (!user) { throw new HttpError(404, "User not found") }

  const now = new Date();
  if (user.lastCheckin) {
    const last = new Date(user.lastCheckin);
    const diffMs = now.getTime() - last.getTime();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    if (diffMs < twentyFourHoursMs) {
      throw new HttpError(400, "Daily check-in already claimed. Please try again later.")
    }
  }

  const updatedUser = await context.entities.User.update({
    where: { id: context.user.id },
    data: {
      walletBalance: { increment: bonus },
      lastCheckin: now
    }
  });

  return updatedUser;
}

export const createInvestment = async ({ planId, amount }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const prisma = context.entities

  // Load user
  const user = await prisma.User.findUnique({ where: { id: context.user.id } })
  if (!user) { throw new HttpError(404, 'User not found') }

  // Load plan
  const plan = await prisma.InvestmentPlan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) { throw new HttpError(400, 'Investment plan is not available') }

  const investAmount = Number(amount)
  if (!Number.isFinite(investAmount) || !Number.isInteger(investAmount) || investAmount <= 0) {
    throw new HttpError(400, 'Invalid investment amount')
  }

  if (investAmount < plan.minAmount || investAmount > plan.maxAmount) {
    throw new HttpError(400, `Amount must be between ${plan.minAmount} and ${plan.maxAmount}`)
  }

  if (user.walletBalance < investAmount) {
    throw new HttpError(400, 'Insufficient wallet balance')
  }

  // Compute expected payout. roiPercent is assumed to apply for the full duration of the plan.
  const expectedPayout = Math.floor(investAmount + (investAmount * Number(plan.roiPercent) / 100))

  const startDate = new Date()
  const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)

  // Perform atomic transaction: deduct user balance and create investment
  const createdInvestment = await prisma.$transaction(async (tx) => {
    // Deduct from wallet
    await tx.User.update({
      where: { id: user.id },
      data: { walletBalance: user.walletBalance - investAmount }
    })

    // Create investment
    const inv = await tx.Investment.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amount: investAmount,
        expectedPayout,
        startDate,
        endDate,
        status: 'active'
      }
    })

    return inv
  })

  return createdInvestment
}

export const requestDeposit = async (args, context) => {
  const { amount, method, proofUrl, txHash } = args || {};

  // Auth check
  if (!context.user) { throw new HttpError(401) }

  // Basic validation
  if (amount === undefined || amount === null) {
    throw new HttpError(400, "Amount is required")
  }
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
    throw new HttpError(400, "Amount must be a positive integer")
  }

  // Load settings
  const settings = await context.entities.Settings.findFirst();
  if (!settings) {
    throw new HttpError(500, "Application settings not configured")
  }

  if (numericAmount < settings.minDeposit) {
    throw new HttpError(400, `Minimum deposit amount is ${settings.minDeposit}`)
  }

  // Accept only supported method keys and map to admin-configured method names
  const METHOD_NAME_MAP = {
    direct_bank: "Direct Bank",
    crypto: "Crypto",
    selar: "Selar"
  };
  if (!method || typeof method !== 'string' || !METHOD_NAME_MAP[method]) {
    throw new HttpError(400, "Invalid deposit method")
  }
  const depositMethodName = METHOD_NAME_MAP[method];

  // Ensure the deposit method exists and is enabled
  const depositMethod = await context.entities.DepositMethod.findUnique({
    where: { methodName: depositMethodName }
  });
  if (!depositMethod || !depositMethod.isEnabled) {
    throw new HttpError(400, "Selected deposit method is not available")
  }

  // Create pending transaction
  const createdTx = await context.entities.Transaction.create({
    data: {
      userId: context.user.id,
      type: "deposit",
      amount: numericAmount,
      method: method,
      status: "pending",
      proofUrl: proofUrl ?? null,
      txHash: txHash ?? null
    }
  });

  // Async admin notification (stub). Fire-and-forget.
  const notifyAdmin = async (transaction) => {
    try {
      // In real app: send email / slack / telegram / push notification to admin
      // This is a non-blocking stub for now.
      console.log("[notifyAdmin] New deposit requested:", {
        id: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        method: transaction.method
      });
    } catch (e) {
      console.error("Failed to notify admin (stub)", e);
    }
  };
  notifyAdmin(createdTx).catch((e) => console.error(e));

  return createdTx;
}

export const requestWithdrawal = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const userId = context.user.id

  // Re-fetch user to get latest balances
  const user = await context.entities.User.findUnique({ where: { id: userId } })
  if (!user) { throw new HttpError(404, 'User not found') }

  const settings = await context.entities.Settings.findFirst()
  const minWithdrawal = settings && typeof settings.minWithdrawal === 'number' ? settings.minWithdrawal : 1000

  const amount = typeof args.amount === 'number' ? args.amount : parseInt(args.amount, 10)
  if (!amount || isNaN(amount) || amount <= 0) {
    throw new HttpError(400, 'Invalid withdrawal amount')
  }

  if (amount < minWithdrawal) {
    throw new HttpError(400, `Minimum withdrawal amount is ${minWithdrawal}`)
  }

  // Check if user has any active investments
  const activeInvestmentsCount = await context.entities.Investment.count({ where: { userId: userId, status: 'active' } })

  // Determine withdrawable funds. If user has no active investments, welcomeBonus is not withdrawable.
  let maxWithdrawable = user.walletBalance || 0
  if (activeInvestmentsCount === 0) {
    const welcomeBonus = user.welcomeBonus || 0
    maxWithdrawable = (user.walletBalance || 0) - welcomeBonus
  }

  if (maxWithdrawable < 0) {
    maxWithdrawable = 0
  }

  if (amount > maxWithdrawable) {
    throw new HttpError(400, 'Insufficient withdrawable funds')
  }

  // Create a pending withdrawal transaction. Actual debit happens on admin approval.
  const tx = await context.entities.Transaction.create({
    data: {
      userId,
      type: 'withdrawal',
      amount,
      method: args.method ?? 'bank',
      status: 'pending',
      proofUrl: args.proofUrl ?? null,
      txHash: args.txHash ?? null,
      adminNote: null
    }
  })

  return tx
}

export const updateBankDetails = async ({ accountName, accountNumber, bankName }, context) => {
  if (!context.user) { throw new HttpError(401) }

  if (!accountName || !accountNumber || !bankName) {
    throw new HttpError(400, "accountName, accountNumber and bankName are required")
  }

  const userId = context.user.id

  try {
    const bank = await context.entities.UserBank.upsert({
      where: { userId },
      create: { userId, accountName, accountNumber, bankName },
      update: { accountName, accountNumber, bankName }
    })

    return bank
  } catch (err) {
    console.error('Failed to upsert bank details for user', userId, err)
    throw new HttpError(500, 'Failed to update bank details')
  }
}

export const completeOnboarding = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const { fullName, phoneNumber, referralCode } = args || {}
  const userId = context.user.id

  const user = await context.entities.User.findUnique({ where: { id: userId } })
  if (!user) { throw new HttpError(404, 'User not found') }

  if (phoneNumber) {
    const existingPhoneUser = await context.entities.User.findUnique({ where: { phoneNumber } })
    if (existingPhoneUser && existingPhoneUser.id !== userId) {
      throw new HttpError(400, 'Phone number already in use')
    }
  }

  // Generate a unique referral code if user doesn't have one
  let finalReferralCode = user.referralCode
  if (!finalReferralCode) {
    const generateCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let s = ''
      for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
      return s
    }
    let tries = 0
    while (!finalReferralCode) {
      const candidate = generateCode()
      const exists = await context.entities.User.findFirst({ where: { referralCode: candidate } })
      if (!exists) { finalReferralCode = candidate; break }
      tries++
      if (tries >= 10) {
        finalReferralCode = candidate + Date.now().toString().slice(-4)
        break
      }
    }
  }

  // Ensure welcomeBonus matches settings.registrationBonus
  const settings = await context.entities.Settings.findFirst({})
  const registrationBonus = settings && typeof settings.registrationBonus !== 'undefined' ? settings.registrationBonus : 500
  const currentWelcome = typeof user.welcomeBonus === 'number' ? user.welcomeBonus : 0
  const welcomeBonusDiff = registrationBonus - currentWelcome

  const updateData = {
    fullName: fullName ?? user.fullName,
    phoneNumber: phoneNumber ?? user.phoneNumber,
    referralCode: finalReferralCode,
    welcomeBonus: registrationBonus
  }

  if (welcomeBonusDiff !== 0) {
    // Adjust walletBalance so wallet reflects the correct welcome bonus amount
    updateData.walletBalance = { increment: welcomeBonusDiff }
  }

  // Apply referral if a valid code is provided and user has not already been referred
  let createdReferral = null
  if (referralCode) {
    const referrer = await context.entities.User.findUnique({ where: { referralCode } })
    if (referrer && referrer.id !== userId && !user.referredById) {
      updateData.referredById = referrer.id
      createdReferral = await context.entities.Referral.create({
        data: {
          referrerId: referrer.id,
          referredId: userId,
          bonusAmount: 0,
          status: 'pending'
        }
      })
    }
  }

  const updatedUser = await context.entities.User.update({
    where: { id: userId },
    data: updateData
  })

  return { user: updatedUser, referral: createdReferral }
}

export const adminApproveDeposit = async ({ transactionId }, context) => {
  const { user } = context;
  if (!user) { throw new HttpError(401); }
  if (user.role !== 'admin') { throw new HttpError(403); }

  const tx = await context.entities.Transaction.findUnique({ where: { id: transactionId } });
  if (!tx) { throw new HttpError(404); }
  if (tx.status === 'approved') { throw new HttpError(400, 'Transaction is already approved'); }
  if (tx.type !== 'deposit') { throw new HttpError(400, 'Only deposit transactions can be approved'); }

  const targetUser = await context.entities.User.findUnique({ where: { id: tx.userId } });
  if (!targetUser) { throw new HttpError(404); }

  const approvedCount = await context.entities.Transaction.count({ where: { userId: targetUser.id, type: 'deposit', status: 'approved' } });

  const ops = [];
  // Approve the deposit transaction
  ops.push(
    context.entities.Transaction.update({ where: { id: tx.id }, data: { status: 'approved' } })
  );
  // Credit user's wallet balance
  ops.push(
    context.entities.User.update({ where: { id: targetUser.id }, data: { walletBalance: targetUser.walletBalance + tx.amount } })
  );

  // If this is the user's first approved deposit and they were referred, credit referrer
  if (approvedCount === 0 && targetUser.referredById) {
    const referralRecord = await context.entities.Referral.findFirst({ where: { referredId: targetUser.id, status: 'pending' } });
    if (referralRecord) {
      const referrer = await context.entities.User.findUnique({ where: { id: referralRecord.referrerId } });
      const settings = await context.entities.Settings.findFirst();
      const referralPercent = settings && typeof settings.referralPercent === 'number'
        ? settings.referralPercent
        : (settings && settings.referralPercent ? Number(settings.referralPercent) : 0);

      const bonusAmount = Math.floor((tx.amount * (referralPercent || 0)) / 100);

      if (referrer && bonusAmount > 0) {
        // Credit referrer's wallet
        ops.push(
          context.entities.User.update({ where: { id: referrer.id }, data: { walletBalance: referrer.walletBalance + bonusAmount } })
        );
        // Mark referral as credited and set bonus amount
        ops.push(
          context.entities.Referral.update({ where: { id: referralRecord.id }, data: { status: 'credited', bonusAmount } })
        );
        // Optionally create a referral bonus transaction for the referrer
        ops.push(
          context.entities.Transaction.create({ data: { userId: referrer.id, type: 'referral_bonus', amount: bonusAmount, method: 'referral', status: 'approved' } })
        );
      } else {
        // Even if bonus is zero or referrer not found, mark referral to avoid duplicate processing
        ops.push(
          context.entities.Referral.update({ where: { id: referralRecord.id }, data: { status: 'credited', bonusAmount: bonusAmount } })
        );
      }
    }
  }

  const results = await context.entities.$transaction(ops);
  // Return the updated transaction (first result)
  return results[0];
}

export const adminRejectDeposit = async ({ transactionId, adminNote }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== "admin") { throw new HttpError(403) }

  const transaction = await context.entities.Transaction.findUnique({
    where: { id: transactionId }
  })
  if (!transaction) { throw new HttpError(404, "Transaction not found") }

  if (transaction.type !== "deposit" || transaction.status !== "pending") {
    throw new HttpError(400, "Only pending deposit transactions can be rejected")
  }

  const updated = await context.entities.Transaction.update({
    where: { id: transactionId },
    data: {
      status: "rejected",
      adminNote: adminNote ?? null
    }
  })

  return updated
}

export const adminApproveWithdrawal = async ({ transactionId }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const tx = await context.entities.Transaction.findUnique({
    where: { id: transactionId }
  })
  if (!tx) { throw new HttpError(404, 'Transaction not found') }

  if (tx.type !== 'withdrawal') { throw new HttpError(400, 'Transaction is not a withdrawal') }
  if (tx.status !== 'pending') { throw new HttpError(400, 'Transaction is not pending') }

  const user = await context.entities.User.findUnique({
    where: { id: tx.userId }
  })
  if (!user) { throw new HttpError(404, 'User not found') }

  const userBalance = Number(user.walletBalance)
  const amount = Number(tx.amount)
  if (isNaN(userBalance) || isNaN(amount)) { throw new HttpError(500, 'Invalid numeric values for balances') }

  if (userBalance < amount) { throw new HttpError(400, 'Insufficient wallet balance') }

  // Debit the user's wallet
  await context.entities.User.update({
    where: { id: user.id },
    data: { walletBalance: userBalance - amount }
  })

  // Mark transaction as approved
  const updatedTx = await context.entities.Transaction.update({
    where: { id: transactionId },
    data: { status: 'approved' }
  })

  return updatedTx
}

export const adminRejectWithdrawal = async ({ transactionId, adminNote }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== "admin") { throw new HttpError(403) }

  const transaction = await context.entities.Transaction.findUnique({
    where: { id: transactionId }
  })

  if (!transaction) { throw new HttpError(404, "Transaction not found") }

  // Ensure this is a withdrawal and currently pending
  if (transaction.type !== "withdrawal") { throw new HttpError(400, "Transaction is not a withdrawal") }
  if (transaction.status !== "pending") { throw new HttpError(400, "Only pending transactions can be rejected") }

  const data = { status: "rejected" }
  if (adminNote !== undefined) { data.adminNote = adminNote }

  const updated = await context.entities.Transaction.update({
    where: { id: transactionId },
    data
  })

  return updated
}

export const adminCreatePlan = async (args, context) => {
  // Require authenticated admin
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== "admin") { throw new HttpError(403) }

  const {
    name,
    carName,
    imageUrl,
    minAmount,
    maxAmount,
    roiPercent,
    durationDays,
    category,
    isActive
  } = args || {};

  // Basic validation
  if (!name || !carName || minAmount == null || maxAmount == null || roiPercent == null || durationDays == null || !category) {
    throw new HttpError(400, "Missing required fields for creating an investment plan.");
  }

  const minAmt = Number(minAmount);
  const maxAmt = Number(maxAmount);
  const roi = Number(roiPercent);
  const duration = Number(durationDays);

  if (!Number.isFinite(minAmt) || !Number.isFinite(maxAmt) || minAmt < 0 || maxAmt < minAmt) {
    throw new HttpError(400, "Invalid minAmount / maxAmount values.");
  }
  if (!Number.isFinite(roi) || roi < 0) {
    throw new HttpError(400, "Invalid roiPercent.");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new HttpError(400, "Invalid durationDays.");
  }

  const plan = await context.entities.InvestmentPlan.create({
    data: {
      name: String(name),
      carName: String(carName),
      imageUrl: imageUrl ? String(imageUrl) : null,
      minAmount: Math.floor(minAmt),
      maxAmount: Math.floor(maxAmt),
      roiPercent: roi,
      durationDays: Math.floor(duration),
      category: String(category),
      isActive: Boolean(isActive)
    }
  });

  return plan;
}

export const adminUpdatePlan = async (args, context) => {
  if (!context.user) { throw new HttpError(401); }
  if (context.user.role !== "admin") { throw new HttpError(403); }

  const planId = args.id;
  const existingPlan = await context.entities.InvestmentPlan.findUnique({
    where: { id: planId }
  });
  if (!existingPlan) { throw new HttpError(404, "Investment plan not found"); }

  const data = {};
  if (args.name !== undefined) data.name = args.name;
  if (args.carName !== undefined) data.carName = args.carName;
  if (args.imageUrl !== undefined) data.imageUrl = args.imageUrl;
  if (args.minAmount !== undefined) data.minAmount = Number(args.minAmount);
  if (args.maxAmount !== undefined) data.maxAmount = Number(args.maxAmount);
  if (args.roiPercent !== undefined) data.roiPercent = Number(args.roiPercent);
  if (args.durationDays !== undefined) data.durationDays = Number(args.durationDays);
  if (args.category !== undefined) data.category = args.category;
  if (args.isActive !== undefined) data.isActive = Boolean(args.isActive);

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, "No valid fields provided for update");
  }

  const updatedPlan = await context.entities.InvestmentPlan.update({
    where: { id: planId },
    data
  });

  return updatedPlan;
}

export const adminTogglePlanActive = async ({ planId, isActive }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  if (typeof planId !== 'number') { throw new HttpError(400, 'planId must be a number') }
  if (typeof isActive !== 'boolean') { throw new HttpError(400, 'isActive must be a boolean') }

  const plan = await context.entities.InvestmentPlan.findUnique({
    where: { id: planId }
  })
  if (!plan) { throw new HttpError(404, 'Investment plan not found') }

  const updatedPlan = await context.entities.InvestmentPlan.update({
    where: { id: planId },
    data: { isActive }
  })

  return updatedPlan
}

export const adminDeletePlan = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const plan = await context.entities.InvestmentPlan.findUnique({
    where: { id }
  })
  if (!plan) { throw new HttpError(404, 'Investment plan not found') }

  const investmentsCount = await context.entities.Investment.count({
    where: { planId: id }
  })
  if (investmentsCount > 0) {
    throw new HttpError(400, 'Cannot delete investment plan with existing investments')
  }

  const deletedPlan = await context.entities.InvestmentPlan.delete({
    where: { id }
  })

  return deletedPlan
}

export const adminMarkInvestmentMatured = async ({ investmentId }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== "admin") { throw new HttpError(403) }

  if (investmentId === undefined || investmentId === null) {
    throw new HttpError(400, "investmentId is required")
  }

  const investment = await context.entities.Investment.findUnique({
    where: { id: investmentId }
  })
  if (!investment) {
    throw new HttpError(404, "Investment not found")
  }

  if (investment.status === "matured") {
    throw new HttpError(400, "Investment is already matured")
  }
  if (investment.status !== "active") {
    throw new HttpError(400, "Only active investments can be marked as matured")
  }

  const user = await context.entities.User.findUnique({
    where: { id: investment.userId }
  })
  if (!user) {
    throw new HttpError(404, "User for this investment not found")
  }

  const newWalletBalance = (user.walletBalance ?? 0) + investment.expectedPayout

  const [updatedUser, updatedInvestment] = await context.entities.$transaction([
    context.entities.User.update({
      where: { id: user.id },
      data: { walletBalance: newWalletBalance }
    }),
    context.entities.Investment.update({
      where: { id: investmentId },
      data: { status: "matured" }
    })
  ])

  return { user: updatedUser, investment: updatedInvestment }
}

export const adminCancelInvestment = async ({ investmentId }, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const investment = await context.entities.Investment.findUnique({
    where: { id: investmentId }
  })
  if (!investment) { throw new HttpError(404, 'Investment not found') }
  if (investment.status !== 'active') { throw new HttpError(400, 'Only active investments can be cancelled') }

  const user = await context.entities.User.findUnique({
    where: { id: investment.userId }
  })
  if (!user) { throw new HttpError(404, 'User for investment not found') }

  // Mark the investment as cancelled
  await context.entities.Investment.update({
    where: { id: investmentId },
    data: { status: 'cancelled' }
  })

  // Refund the investment amount back to the user's wallet balance
  await context.entities.User.update({
    where: { id: user.id },
    data: { walletBalance: { increment: investment.amount } }
  })

  return { success: true, investmentId }
}

export const adminUpdateDepositMethod = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  if (!args || !args.methodName) {
    throw new HttpError(400, 'methodName is required')
  }

  // Support both slug keys and display names. Normalize to display names used elsewhere.
  const METHOD_DISPLAY_MAP = {
    selar: 'Selar',
    direct_bank: 'Direct Bank',
    crypto: 'Crypto'
  }

  const raw = String(args.methodName).trim()
  const keyLower = raw.toLowerCase()
  const methodName = METHOD_DISPLAY_MAP[keyLower] || // slug -> display
    Object.values(METHOD_DISPLAY_MAP).find(v => v.toLowerCase() === keyLower) || // display passed in any case
    raw // fallback to raw

  const allowedDisplayNames = Object.values(METHOD_DISPLAY_MAP)
  if (!allowedDisplayNames.includes(methodName)) {
    throw new HttpError(400, 'Invalid deposit method')
  }

  const updateData = {}
  if (typeof args.isEnabled === 'boolean') { updateData.isEnabled = args.isEnabled }
  if (args.accountName !== undefined) { updateData.accountName = args.accountName }
  if (args.accountNumber !== undefined) { updateData.accountNumber = args.accountNumber }
  if (args.bankName !== undefined) { updateData.bankName = args.bankName }
  if (args.btcAddress !== undefined) { updateData.btcAddress = args.btcAddress }
  if (args.usdtAddress !== undefined) { updateData.usdtAddress = args.usdtAddress }
  if (args.ethAddress !== undefined) { updateData.ethAddress = args.ethAddress }

  const createData = { methodName }
  if (typeof args.isEnabled === 'boolean') { createData.isEnabled = args.isEnabled }
  if (args.accountName !== undefined) { createData.accountName = args.accountName }
  if (args.accountNumber !== undefined) { createData.accountNumber = args.accountNumber }
  if (args.bankName !== undefined) { createData.bankName = args.bankName }
  if (args.btcAddress !== undefined) { createData.btcAddress = args.btcAddress }
  if (args.usdtAddress !== undefined) { createData.usdtAddress = args.usdtAddress }
  if (args.ethAddress !== undefined) { createData.ethAddress = args.ethAddress }

  const depositMethod = await context.entities.DepositMethod.upsert({
    where: { methodName },
    update: updateData,
    create: createData
  })

  return depositMethod
}

export const adminUpdateSettings = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== "admin") { throw new HttpError(403) }

  const allowedFields = [
    "registrationBonus",
    "dailyCheckinBonus",
    "referralPercent",
    "minDeposit",
    "minWithdrawal",
    "aboutUs",
    "supportTelegramUrl",
    "supportWhatsappUrl",
    "supportCustomerUrl"
  ]

  const data = {}
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined) {
      data[key] = args[key]
    }
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, "No valid settings fields provided to update")
  }

  // Try to find existing settings row. If none exists, create one.
  let settings = await context.entities.Settings.findFirst()
  if (settings) {
    settings = await context.entities.Settings.update({
      where: { id: settings.id },
      data
    })
  } else {
    settings = await context.entities.Settings.create({
      data
    })
  }

  return settings
}

export const adminUpdateUser = async (args, context) => {
  const {
    userId,
    fullName,
    phoneNumber,
    role,
    isBanned,
    walletAdjustment,
    adminNote
  } = args;

  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const user = await context.entities.User.findUnique({ where: { id: userId } });
  if (!user) { throw new HttpError(404, 'User not found') }

  if (phoneNumber !== undefined && phoneNumber !== null) {
    const existing = await context.entities.User.findUnique({ where: { phoneNumber } });
    if (existing && existing.id !== userId) {
      throw new HttpError(400, 'Phone number already in use')
    }
  }

  const updateData = {};
  if (fullName !== undefined) updateData.fullName = fullName;
  if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
  if (role !== undefined) updateData.role = role;
  if (isBanned !== undefined) updateData.isBanned = isBanned;

  if (walletAdjustment !== undefined && walletAdjustment !== 0) {
    const adjustment = Number(walletAdjustment);
    if (!Number.isInteger(adjustment)) {
      throw new HttpError(400, 'walletAdjustment must be an integer')
    }

    const newBalance = user.walletBalance + adjustment;
    if (newBalance < 0) {
      throw new HttpError(400, 'Resulting wallet balance cannot be negative')
    }

    // Create an audit Transaction record for this admin adjustment
    await context.entities.Transaction.create({
      data: {
        userId,
        type: 'admin_adjustment',
        amount: adjustment,
        method: 'admin',
        status: 'completed',
        adminNote: adminNote || null
      }
    });

    updateData.walletBalance = newBalance;
  }

  const updatedUser = await context.entities.User.update({
    where: { id: userId },
    data: updateData
  });

  return updatedUser;
}
