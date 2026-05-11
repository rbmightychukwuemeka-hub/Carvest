import { HttpError } from 'wasp/server'

export const getDashboardData = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }

  const userId = context.user.id

  const user = await context.entities.User.findUnique({
    where: { id: userId },
    select: {
      walletBalance: true,
      welcomeBonus: true,
      lastCheckin: true
    }
  })

  if (!user) { throw new HttpError(404, 'User not found') }

  const maturedInvestments = await context.entities.Investment.findMany({
    where: {
      userId,
      status: 'matured'
    },
    select: {
      amount: true,
      expectedPayout: true
    }
  })

  let totalReturn = 0
  for (const inv of maturedInvestments) {
    const profit = (inv.expectedPayout || 0) - (inv.amount || 0)
    totalReturn += profit
  }

  const activeInvestments = await context.entities.Investment.findMany({
    where: {
      userId,
      status: 'active'
    },
    orderBy: { startDate: 'desc' },
    take: 5,
    select: {
      id: true,
      amount: true,
      expectedPayout: true,
      startDate: true,
      endDate: true,
      plan: {
        select: {
          id: true,
          name: true,
          carName: true,
          imageUrl: true
        }
      }
    }
  })

  const now = Date.now()
  const MS_PER_DAY = 24 * 60 * 60 * 1000

  const activeInvestmentsFormatted = activeInvestments.map(inv => {
    const endTs = inv.endDate ? new Date(inv.endDate).getTime() : null
    let daysLeft = null
    if (endTs !== null) {
      daysLeft = Math.max(0, Math.ceil((endTs - now) / MS_PER_DAY))
    }

    return {
      id: inv.id,
      planId: inv.plan?.id ?? null,
      planName: inv.plan?.name ?? null,
      carName: inv.plan?.carName ?? null,
      imageUrl: inv.plan?.imageUrl ?? null,
      amount: inv.amount,
      expectedPayout: inv.expectedPayout,
      startDate: inv.startDate ? new Date(inv.startDate).toISOString() : null,
      endDate: inv.endDate ? new Date(inv.endDate).toISOString() : null,
      daysLeft
    }
  })

  const lastCheckin = user.lastCheckin ? new Date(user.lastCheckin) : null
  let isCheckinAvailable = true
  let nextCheckinAt = null
  if (lastCheckin) {
    const nextAvailableTs = lastCheckin.getTime() + MS_PER_DAY
    isCheckinAvailable = now >= nextAvailableTs
    nextCheckinAt = new Date(nextAvailableTs).toISOString()
  }

  return {
    walletBalance: user.walletBalance,
    welcomeBonus: user.welcomeBonus,
    totalReturn,
    lastCheckin: lastCheckin ? lastCheckin.toISOString() : null,
    isCheckinAvailable,
    nextCheckinAt: isCheckinAvailable ? null : nextCheckinAt,
    activeInvestments: activeInvestmentsFormatted
  }
}

export const getInvestmentPlans = async (arg, context) => {
  const { category, duration } = arg || {};
  const take = typeof arg?.take === 'number' ? arg.take : (Number.parseInt(String(arg?.take ?? 12), 10) || 12);
  const skip = typeof arg?.skip === 'number' ? arg.skip : (Number.parseInt(String(arg?.skip ?? 0), 10) || 0);

  const where = {}

  if (category && String(category).toLowerCase() !== 'all') {
    where.category = String(category)
  }

  if (duration) {
    const dur = String(duration).toLowerCase()
    if (dur === 'short') {
      where.durationDays = { lte: 30 }
    } else if (dur === 'medium') {
      where.durationDays = { gte: 31, lte: 90 }
    } else if (dur === 'long') {
      where.durationDays = { gte: 91 }
    }
  }

  if (!context?.user || context.user.role !== 'admin') {
    where.isActive = true
  }

  const items = await context.entities.InvestmentPlan.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  })

  const total = await context.entities.InvestmentPlan.count({ where })

  return { items, total }
}

export const getMyInvestments = async (arg, context) => {
  const { status, page = 1, pageSize = 10 } = arg || {}
  if (!context.user) { throw new HttpError(401) }

  const parsedPage = Math.max(1, Number(page) || 1)
  const parsedPageSize = Math.min(50, Math.max(1, Number(pageSize) || 10))

  const where = { userId: context.user.id }

  if (status !== undefined && status !== null && String(status).trim() !== "") {
    const s = String(status).toLowerCase()
    const allowed = ["active", "matured", "cancelled"]
    if (!allowed.includes(s)) {
      throw new HttpError(400, "Invalid status filter. Allowed: active, matured, cancelled")
    }
    where.status = s
  }

  const total = await context.entities.Investment.count({ where })

  const items = await context.entities.Investment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (parsedPage - 1) * parsedPageSize,
    take: parsedPageSize,
    select: {
      id: true,
      amount: true,
      expectedPayout: true,
      startDate: true,
      endDate: true,
      status: true,
      createdAt: true,
      plan: {
        select: {
          id: true,
          name: true,
          carName: true,
          imageUrl: true,
          durationDays: true,
          roiPercent: true
        }
      }
    }
  })

  return {
    items,
    total,
    page: parsedPage,
    pageSize: parsedPageSize,
    totalPages: Math.ceil(total / parsedPageSize)
  }
}

export const getProfileData = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }

  const userId = context.user.id

  const user = await context.entities.User.findUnique({
    where: { id: userId },
    select: {
      phoneNumber: true,
      fullName: true,
      referralCode: true
    }
  })

  if (!user) { throw new HttpError(404, 'User not found') }

  const totalReferredUsers = await context.entities.Referral.count({
    where: { referrerId: userId }
  })

  const earningsAgg = await context.entities.Referral.aggregate({
    _sum: { bonusAmount: true },
    where: { referrerId: userId }
  })

  const totalReferralEarnings = earningsAgg._sum?.bonusAmount || 0

  const bank = await context.entities.UserBank.findUnique({
    where: { userId },
    select: {
      accountName: true,
      accountNumber: true,
      bankName: true
    }
  })

  return {
    phoneNumber: user.phoneNumber,
    fullName: user.fullName,
    referralCode: user.referralCode,
    totalReferredUsers,
    totalReferralEarnings,
    bank: bank || null
  }
}

export const getTransactions = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }

  const page = Math.max(1, Number(arg?.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(arg?.pageSize) || 20))

  const where = { userId: context.user.id }
  if (arg?.type) { where.type = arg.type }
  if (arg?.status) { where.status = arg.status }

  const total = await context.entities.Transaction.count({ where })

  const transactions = await context.entities.Transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      type: true,
      amount: true,
      method: true,
      status: true,
      proofUrl: true,
      txHash: true,
      adminNote: true,
      createdAt: true
    }
  })

  return {
    transactions,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  }
}

export const getDepositMethods = async (arg, context) => {
  // This query is public - it returns configured deposit methods for client display.
  const methods = await context.entities.DepositMethod.findMany({
    select: {
      id: true,
      methodName: true,
      isEnabled: true,
      accountName: true,
      accountNumber: true,
      bankName: true,
      btcAddress: true,
      usdtAddress: true,
      ethAddress: true
    }
  })

  const result = {
    selar: null,
    direct_bank: null,
    crypto: null
  }

  for (const m of methods) {
    const name = (m.methodName || "").toString().trim().toLowerCase()
    let key = null

    if (name.includes('selar')) {
      key = 'selar'
    } else if (name.includes('crypto') || name.includes('btc') || name.includes('usdt') || name.includes('eth')) {
      key = 'crypto'
    } else if (name.includes('bank') || name.includes('direct')) {
      key = 'direct_bank'
    } else if (['selar', 'direct_bank', 'crypto'].includes(name)) {
      key = name
    }

    if (key && !result[key]) {
      result[key] = {
        id: m.id,
        methodName: m.methodName,
        isEnabled: !!m.isEnabled,
        accountName: m.accountName ?? null,
        accountNumber: m.accountNumber ?? null,
        bankName: m.bankName ?? null,
        btcAddress: m.btcAddress ?? null,
        usdtAddress: m.usdtAddress ?? null,
        ethAddress: m.ethAddress ?? null
      }
    }
  }

  return result
}

export const getSettingsPublic = async (arg, context) => {
  // This query is public: return public-facing settings used by the client (About Us, support links, and basic limits/bonuses).
  const settings = await context.entities.Settings.findFirst({
    select: {
      aboutUs: true,
      supportTelegramUrl: true,
      supportWhatsappUrl: true,
      supportCustomerUrl: true,
      registrationBonus: true,
      dailyCheckinBonus: true,
      referralPercent: true,
      minDeposit: true,
      minWithdrawal: true
    }
  })

  if (!settings) {
    // Return sensible defaults matching expected app defaults so clients always get a predictable shape.
    return {
      aboutUs: "",
      supportTelegramUrl: null,
      supportWhatsappUrl: null,
      supportCustomerUrl: null,
      registrationBonus: 500,
      dailyCheckinBonus: 50,
      referralPercent: 10,
      minDeposit: 1000,
      minWithdrawal: 1000
    }
  }

  return settings
}

export const adminGetDashboardStats = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const totalUsers = await context.entities.User.count()

  const depositAgg = await context.entities.Transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: 'deposit',
      status: { in: ['approved', 'completed'] }
    }
  })

  const withdrawalAgg = await context.entities.Transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: 'withdrawal',
      status: { in: ['approved', 'completed'] }
    }
  })

  const totalDeposits = depositAgg && depositAgg._sum && depositAgg._sum.amount ? Number(depositAgg._sum.amount) : 0
  const totalWithdrawals = withdrawalAgg && withdrawalAgg._sum && withdrawalAgg._sum.amount ? Number(withdrawalAgg._sum.amount) : 0

  const activeInvestmentsCount = await context.entities.Investment.count({
    where: { status: 'active' }
  })

  const recentTransactions = await context.entities.Transaction.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      amount: true,
      type: true,
      method: true,
      status: true,
      proofUrl: true,
      txHash: true,
      adminNote: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true
        }
      }
    }
  })

  return {
    totalUsers,
    totalDeposits,
    totalWithdrawals,
    activeInvestmentsCount,
    recentTransactions
  }
}

export const adminGetPendingDeposits = async (arg, context) => {
  // Require authenticated admin
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  // Fetch pending deposit transactions with related user info
  const pendingDeposits = await context.entities.Transaction.findMany({
    where: {
      type: 'deposit',
      status: 'pending'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      proofUrl: true,
      txHash: true,
      adminNote: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          phoneNumber: true,
          fullName: true,
          walletBalance: true,
          referralCode: true
        }
      }
    }
  })

  return pendingDeposits
}

export const adminGetUsers = async (arg, context) => {
  // Admin-only query: search users by phone/fullName/referralCode with pagination
  if (!context.user) {
    throw new HttpError(401)
  }
  if (context.user.role !== 'admin') {
    throw new HttpError(403)
  }

  const q = (arg && arg.q) ? String(arg.q).trim() : ''
  const page = Math.max(Number(arg && arg.page) || 1, 1)
  const pageSize = Math.min(Math.max(Number(arg && arg.pageSize) || 20, 1), 100)

  const where = {}
  if (q) {
    // Search in phoneNumber, fullName, referralCode (case-insensitive)
    where.OR = [
      { phoneNumber: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
      { referralCode: { contains: q, mode: 'insensitive' } }
    ]
  }

  const total = await context.entities.User.count({ where })

  const users = await context.entities.User.findMany({
    where,
    select: {
      id: true,
      phoneNumber: true,
      fullName: true,
      referralCode: true,
      walletBalance: true,
      role: true,
      isBanned: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize
  })

  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0

  return {
    users,
    page,
    pageSize,
    total,
    totalPages
  }
}

export const adminGetUserDetails = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== "admin") { throw new HttpError(403) }

  const id = arg?.id
  const userId = Number(id)
  if (!userId) { throw new HttpError(400, "Invalid user id") }

  const user = await context.entities.User.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phoneNumber: true,
      fullName: true,
      walletBalance: true,
      welcomeBonus: true,
      referralCode: true,
      referredById: true,
      lastCheckin: true,
      role: true,
      isBanned: true,
      createdAt: true
    }
  })

  if (!user) {
    throw new HttpError(404, `No user with id ${userId}`)
  }

  const bank = await context.entities.UserBank.findUnique({
    where: { userId: userId },
    select: {
      id: true,
      accountName: true,
      accountNumber: true,
      bankName: true,
      userId: true
    }
  })

  const investments = await context.entities.Investment.findMany({
    where: { userId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
          carName: true,
          imageUrl: true,
          roiPercent: true,
          durationDays: true,
          category: true
        }
      }
    }
  })

  const transactions = await context.entities.Transaction.findMany({
    where: { userId: userId },
    orderBy: { createdAt: 'desc' }
  })

  return { user, bank, investments, transactions }
}

export const adminGetInvestments = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const page = Math.max(1, parseInt(String(arg?.page ?? '1'), 10))
  const pageSize = Math.max(1, Math.min(100, parseInt(String(arg?.pageSize ?? '20'), 10)))

  const where = {}

  if (arg?.status) {
    where.status = arg.status
  }

  if (arg?.planId !== undefined && arg?.planId !== null && arg.planId !== '') {
    where.planId = Number(arg.planId)
  }

  if (arg?.userId !== undefined && arg?.userId !== null && arg.userId !== '') {
    where.userId = Number(arg.userId)
  }

  const total = await context.entities.Investment.count({ where })

  const items = await context.entities.Investment.findMany({
    where,
    include: {
      plan: {
        select: {
          id: true,
          name: true,
          carName: true,
          imageUrl: true,
          minAmount: true,
          maxAmount: true,
          roiPercent: true,
          durationDays: true,
          category: true,
          isActive: true,
          createdAt: true
        }
      },
      user: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          walletBalance: true,
          referralCode: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize
  })

  return {
    items,
    total,
    page,
    pageSize
  }
}

export const adminGetSettings = async (arg, context) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'admin') { throw new HttpError(403) }

  const settings = await context.entities.Settings.findFirst()
  if (!settings) { throw new HttpError(404, 'Settings not found') }

  return settings
}

export const adminGetDepositMethods = async (arg, context) => {
  if (!context.user) { throw new HttpError(401, 'Not authenticated') }
  if (context.user.role !== 'admin') { throw new HttpError(403, 'Admin access required') }

  const methods = await context.entities.DepositMethod.findMany({
    orderBy: { id: 'asc' }
  })

  return methods
}
