/**
 * Finance · Payroll demo data. There is no payroll repository in the DAL, so
 * the roster + pay-period entries live here as a module-local model persisted
 * through dal.settings under FINANCE_PAYROLL_KEY. Pay rates are integer cents
 * per hour so the money math stays in the integer-cents domain like the rest
 * of the app (src/lib/money.ts).
 */
export const FINANCE_PAYROLL_KEY = "finance.payroll";

export interface PayrollStaff {
  id: string;
  name: string;
  role: string;
  /** Pay rate in integer cents per hour. */
  rateCentsPerHour: number;
  /** Hours logged this pay period (may include a fractional half hour). */
  hours: number;
}

export interface PayrollState {
  periodLabel: string;
  staff: PayrollStaff[];
}

export const DEFAULT_PAYROLL: PayrollState = {
  periodLabel: "Current pay period",
  staff: [
    { id: "pr-1", name: "Marcus Hill", role: "Pitmaster", rateCentsPerHour: 2600, hours: 80 },
    { id: "pr-2", name: "Dana Ruiz", role: "Kitchen Lead", rateCentsPerHour: 2100, hours: 76 },
    { id: "pr-3", name: "Tyrell Banks", role: "Line Cook", rateCentsPerHour: 1700, hours: 72 },
    { id: "pr-4", name: "Sofia Marin", role: "Catering Captain", rateCentsPerHour: 2300, hours: 64 },
    { id: "pr-5", name: "Jordan Lee", role: "Counter / FOH", rateCentsPerHour: 1500, hours: 68 },
  ],
};

/** Gross pay for one staffer in integer cents (rounded half up). */
export function payrollGrossCents(s: PayrollStaff): number {
  return Math.round(s.rateCentsPerHour * s.hours);
}
