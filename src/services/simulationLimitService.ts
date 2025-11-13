import { prisma } from '../config/database';

/**
 * Check if user can create a simulation (strict limit enforcement)
 * Returns limit information including whether creation is allowed
 */
export async function checkSimulationLimit(userId: string): Promise<{
  canCreate: boolean
  remaining: number
  maxSimulations: number
  periodStartDate: Date
  periodEndDate: Date
  subscriptionTier: string
  totalSimulationsUsed: number
  error?: string
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true }
  });

  const subscriptionTier = user?.subscriptionTier || 'FREE';
  
  // Get active subscription to determine the billing period
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE'
    },
    orderBy: { createdAt: 'desc' }
  });

  // Determine the period start date (30-day cycle)
  // For FREE users: last 30 days rolling window
  // For paid users: use subscription billing period start (resets every 30 days)
  let periodStartDate: Date;
  if (subscriptionTier === 'FREE') {
    // FREE users: rolling 30-day window
    periodStartDate = new Date();
    periodStartDate.setDate(periodStartDate.getDate() - 30);
  } else if (activeSubscription?.currentPeriodStart) {
    // Paid users: use subscription billing period start
    periodStartDate = new Date(activeSubscription.currentPeriodStart);
  } else if (activeSubscription?.startDate) {
    // Fallback to subscription start date
    periodStartDate = new Date(activeSubscription.startDate);
    // Ensure it's within a 30-day window
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart > 30) {
      // Reset period start to be within last 30 days
      periodStartDate = new Date();
      periodStartDate.setDate(periodStartDate.getDate() - 30);
    }
  } else {
    // Default: last 30 days
    periodStartDate = new Date();
    periodStartDate.setDate(periodStartDate.getDate() - 30);
  }

  // Calculate period end date (30 days from period start)
  const periodEndDate = new Date(periodStartDate);
  periodEndDate.setDate(periodEndDate.getDate() + 30);

  // Get subscription plan for this tier to know the limit
  const activePlan = await prisma.subscriptionPlan.findFirst({
    where: {
      tier: subscriptionTier as any,
      isActive: true,
      billingCycle: activeSubscription?.billingCycle || 'monthly'
    },
    orderBy: { sortOrder: 'asc' }
  });

  // Log for debugging
  console.log('🔍 Simulation Limit Check:', {
    userId,
    subscriptionTier,
    activePlanFound: !!activePlan,
    planMaxSimulations: activePlan?.maxSimulations,
    billingCycle: activeSubscription?.billingCycle || 'monthly'
  });

  // Default limits if not set in plan (until admin configures)
  const getDefaultLimit = (tier: string): number => {
    switch (tier) {
      case 'FREE': return 5;
      case 'ESSENTIAL': return 25;
      case 'PREMIUM': return 40;
      case 'PRO': return 60;
      default: return 5;
    }
  };

  // Use admin-set limit if available, otherwise use default
  // IMPORTANT: If admin hasn't set maxSimulations (NULL), use default for tier
  // Only use -1/Infinity if admin explicitly set it to -1
  let maxSimulations: number;
  if (activePlan?.maxSimulations !== null && activePlan?.maxSimulations !== undefined) {
    // Admin has set a limit
    if (activePlan.maxSimulations === -1) {
      maxSimulations = Infinity; // Unlimited
      console.log('✅ Using admin-set UNLIMITED limit (-1)');
    } else {
      maxSimulations = activePlan.maxSimulations;
      console.log('✅ Using admin-set limit:', maxSimulations);
    }
  } else {
    // Plan exists but maxSimulations is NULL - use default for tier
    maxSimulations = getDefaultLimit(subscriptionTier);
    console.log('⚠️ Plan found but maxSimulations is NULL. Using default limit for tier:', subscriptionTier, '=', maxSimulations);
  }

  // Count ALL simulation types used within the current billing period (30-day cycle)
  // IMPORTANT: For voice simulations, only count sessions that have AIFeedback (valid sessions)
  const [testAttempts, voiceSimulationsWithFeedback, immigrationSimulations] = await Promise.all([
    prisma.testAttempt.count({
      where: {
        userId,
        createdAt: { gte: periodStartDate }
      }
    }),
    // Only count voice simulations that have AIFeedback (valid sessions)
    // Only count COMPLETED sessions with AI feedback - these are the only valid ones
    prisma.voiceSimulation.count({
      where: {
        userId,
        createdAt: { gte: periodStartDate },
        status: 'COMPLETED', // Only count completed simulations
        aiFeedbacks: {
          some: {} // Must have at least one AIFeedback
        }
      }
    }),
    // Only count COMPLETED immigration simulations (valid simulations)
    prisma.immigrationSimulation.count({
      where: {
        userId,
        createdAt: { gte: periodStartDate },
        status: 'COMPLETED'
      }
    })
  ]);

  const totalSimulationsUsed = testAttempts + voiceSimulationsWithFeedback + immigrationSimulations;
  const remaining = maxSimulations === Infinity ? Infinity : Math.max(0, maxSimulations - totalSimulationsUsed);
  const canCreate = maxSimulations === Infinity ? true : totalSimulationsUsed < maxSimulations;

  return {
    canCreate,
    remaining: remaining === Infinity ? -1 : remaining,
    // Return -1 only if truly unlimited (Infinity), otherwise return the actual number
    maxSimulations: maxSimulations === Infinity ? -1 : maxSimulations,
    periodStartDate,
    periodEndDate,
    subscriptionTier,
    totalSimulationsUsed,
    error: !canCreate 
      ? `You have reached your simulation limit. You have used ${totalSimulationsUsed} out of ${maxSimulations === Infinity ? 'unlimited' : maxSimulations} simulations for this billing period (${Math.ceil((periodEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining).`
      : undefined
  };
}

