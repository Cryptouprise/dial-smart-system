interface ROICalculationInput {
  callsMade: number;
  durationMinutes: number;
  appointmentsSet: number;
  aiCost: number;
  callsPerRepPerDay?: number;
  hourlyWage?: number;
  supervisorWage?: number;
  repsPerSupervisor?: number;
  overheadMultiplier?: number;
  annualTurnoverRate?: number;
  trainingCostPerRep?: number;
  sickDaysPerMonthPerRep?: number;
}

export interface ROICalculation {
  // Immediate comparison
  aiCost: number;
  humanCost: number;
  savings: number;
  savingsPercent: number;
  
  // Time comparison
  aiTimeHours: number;
  humanTimeHours: number;
  timeSavingsPercent: number;
  
  // Team size
  repsNeeded: number;
  supervisorsNeeded: number;
  
  // Monthly projection
  monthlyAICost: number;
  monthlyHumanCost: number;
  monthlyCallsProjected: number;
  monthlyAppointmentsProjected: number;
  monthlySavings: number;
  annualSavings: number;
  
  // Hidden costs exposed
  monthlyTurnoverCost: number;
  monthlySickDayCost: number;
}

export function calculateROI(input: ROICalculationInput): ROICalculation {
  const {
    callsMade,
    durationMinutes,
    appointmentsSet,
    aiCost,
    callsPerRepPerDay = 100,
    hourlyWage = 15,
    supervisorWage = 25,
    repsPerSupervisor = 10,
    overheadMultiplier = 1.30,
    annualTurnoverRate = 0.35,
    trainingCostPerRep = 2000,
    sickDaysPerMonthPerRep = 0.5,
  } = input;

  // How many reps needed to do this in one day?
  const repsForOneDay = Math.ceil(callsMade / callsPerRepPerDay);
  
  // Daily human cost
  const hoursPerDay = 8;
  const repDailyCost = hoursPerDay * hourlyWage;
  const supervisorsNeeded = Math.ceil(repsForOneDay / repsPerSupervisor);
  const supervisorDailyCost = hoursPerDay * supervisorWage;
  
  const rawDailyCost = (repsForOneDay * repDailyCost) + (supervisorsNeeded * supervisorDailyCost);
  const totalDailyCost = rawDailyCost * overheadMultiplier;
  
  // Hidden costs
  const monthlyTurnoverCost = (repsForOneDay * annualTurnoverRate / 12) * trainingCostPerRep;
  const monthlySickDayCost = repsForOneDay * sickDaysPerMonthPerRep * repDailyCost;
  
  // Savings
  const humanCost = totalDailyCost;
  const savings = humanCost - aiCost;
  const savingsPercent = humanCost > 0 ? ((humanCost - aiCost) / humanCost) * 100 : 0;
  
  // Time comparison
  const humanHours = repsForOneDay * hoursPerDay;
  const aiHours = durationMinutes / 60;
  const timeSavingsPercent = humanHours > 0 ? ((humanHours - aiHours) / humanHours) * 100 : 0;
  
  // Monthly projection (20 working days)
  const monthlyAICost = aiCost * 20;
  const monthlyHumanCost = totalDailyCost * 20 + monthlyTurnoverCost + monthlySickDayCost;
  const monthlyCallsProjected = callsMade * 20;
  const monthlyAppointmentsProjected = appointmentsSet * 20;
  const monthlySavings = monthlyHumanCost - monthlyAICost;
  const annualSavings = monthlySavings * 12;
  
  return {
    aiCost,
    humanCost: Math.round(humanCost),
    savings: Math.round(savings),
    savingsPercent: Math.round(savingsPercent),
    aiTimeHours: Math.round(aiHours * 10) / 10,
    humanTimeHours: humanHours,
    timeSavingsPercent: Math.round(timeSavingsPercent),
    repsNeeded: repsForOneDay,
    supervisorsNeeded,
    monthlyAICost: Math.round(monthlyAICost),
    monthlyHumanCost: Math.round(monthlyHumanCost),
    monthlyCallsProjected,
    monthlyAppointmentsProjected,
    monthlySavings: Math.round(monthlySavings),
    annualSavings: Math.round(annualSavings),
    monthlyTurnoverCost: Math.round(monthlyTurnoverCost),
    monthlySickDayCost: Math.round(monthlySickDayCost),
  };
}
