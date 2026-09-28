import type OpenAI from 'openai';
import { Role } from '../../../common/enums/role.enum.js';

/** The function-tool variant specifically — the union also covers custom tools. */
type Tool = OpenAI.Chat.Completions.ChatCompletionFunctionTool;

/**
 * The AI's entire reach into the system.
 *
 * Every tool is a read. There is no insert, update or delete tool anywhere,
 * so no prompt can cause a write — that is structural, not a matter of
 * instructing the model politely.
 *
 * Employee-scoped tools take NO employeeId parameter. The id is injected
 * from the verified session at execution time, so the model cannot choose
 * whose data it sees even if it tries.
 */

const fn = (
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Tool => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: { type: 'object', properties, required },
  },
});

// ── Employee-scoped: always "me" ──────────────────────────────────────

export const SELF_TOOLS: Tool[] = [
  fn(
    'get_my_profile',
    'Their profile: code, job title, department, joining date, length of service.',
  ),
  fn(
    'get_my_today_status',
    'Whether they have checked in today, at what time, and if today is a weekend or holiday.',
  ),
  fn(
    'get_my_team',
    'Colleagues in their department: name, job title, and whether off today.',
  ),
  fn(
    'get_my_leave_balance',
    'Their leave balance by type for this year: allocated, used, remaining.',
  ),
  fn(
    'get_my_leave_requests',
    'Their own leave requests, with status and any rejection note.',
    { status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] } },
  ),
  fn(
    'get_my_attendance',
    'Their attendance for one month:each day plus totals (percentage, late, absent, overtime).',
    {
      year: { type: 'integer', description: 'Defaults to the current year' },
      month: { type: 'integer', description: '1-12. Defaults to the current month' },
    },
  ),
  fn(
    'get_my_attendance_summary',
    'Their rolling 90-day attendance totals: percentage, present, late, absent, overtime.',
  ),
  fn(
    'get_my_dues',
    'What they owe the company: principal, paid, remaining, monthly installment.',
  ),
  fn(
    'get_my_payslips',
    'Their payslips with every component: basic, allowances, overtime, deductions, net.',
    { limit: { type: 'integer', description: 'How many recent payslips. Default 3' } },
  ),
];

// ── Shared: company policy and the calendar ───────────────────────────
// Everyone may read these. They describe how the company works rather than
// what any individual earns or did, so there is nothing to scope.

export const SHARED_TOOLS: Tool[] = [
  fn(
    'get_leave_policy',
    'The company leave types with their annual quota and whether each is paid ' +
      'or unpaid. This is company policy, not one person\'s balance. Use for ' +
      '"what leave types are there", "how many sick days do we get".',
  ),
  fn(
    'get_work_policy',
    'Working-hours policy: standard hours per day, start time, the grace ' +
      'period before an arrival counts as late, the overtime rate multiplier ' +
      'and which days are the weekend. Use for "what time should I start", ' +
      '"when am I marked late", "how is overtime calculated".',
  ),
  fn(
    'get_holidays',
    'Company holidays. Returns the date and name of each, and marks which are ' +
      'still upcoming. Use for "when is the next holiday", "what holidays are ' +
      'left this year".',
    { year: { type: 'integer', description: 'Defaults to the current year' } },
  ),
  fn(
    'get_who_is_off',
    'Who has approved leave during a date range, with the leave type and ' +
      'dates. Covers the whole range in one call. Use for "who is off next ' +
      'week", "is anyone on leave in December". Reasons are never returned.',
    {
      from: { type: 'string', description: 'YYYY-MM-DD. Defaults to today' },
      to: { type: 'string', description: 'YYYY-MM-DD. Defaults to 14 days ahead' },
    },
  ),
];

// ── HR-scoped: the organisation ───────────────────────────────────────

export const HR_TOOLS: Tool[] = [
  fn(
    'search_employees',
    'Find employees by name, department or employment status. Returns code, ' +
      'name, designation, department and joining date. Never returns salary.',
    {
      search: { type: 'string', description: 'Name or employee code' },
      department: { type: 'string' },
      status: { type: 'string', enum: ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'] },
    },
  ),
  fn(
    'get_attendance_overview',
    'Attendance totals for every active employee over a date range: ' +
      'percentage, late count, absences and overtime. Use for questions like ' +
      '"who is below 80% attendance" or "summarise this month\'s attendance".',
    {
      from: { type: 'string', description: 'YYYY-MM-DD. Defaults to 30 days ago' },
      to: { type: 'string', description: 'YYYY-MM-DD. Defaults to today' },
    },
  ),
  fn(
    'get_daily_register',
    'Who was present, late, absent or on leave on one specific date.',
    { date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today' } },
  ),
  fn(
    'get_pending_leave_requests',
    'Leave requests awaiting a decision from the person asking, with the ' +
      'requester, dates, day count and their remaining balance.',
  ),
  fn(
    'get_leave_balances_overview',
    'Leave balance for every active employee: allocated, used and remaining ' +
      'per leave type.',
  ),
  fn(
    'get_outstanding_dues',
    'Every active loan or advance across the organisation with remaining ' +
      'balances.',
  ),
  fn(
    'get_organisation_stats',
    'Headcount and shape of the organisation: total active employees, a ' +
      'breakdown by department, and how many are present, absent or on leave ' +
      'today. Use for "how many employees do we have", "how big is Sales".',
  ),
  fn(
    'get_payroll_summary',
    'Payroll runs with their month, status and totals: number of payslips, ' +
      'total net pay, total overtime and total deductions. Use for "what did ' +
      'payroll cost last month", "has September payroll been finalised".',
    { limit: { type: 'integer', description: 'How many recent runs. Default 3' } },
  ),
];

/**
 * An employee's request to the model physically does not contain the
 * organisation-wide tools. The model cannot call a tool it was never given —
 * this is a capability boundary, not a filter applied to the answer.
 */
export function toolsForRole(role: Role): Tool[] {
  const base = [...SELF_TOOLS, ...SHARED_TOOLS];
  return role === Role.EMPLOYEE ? base : [...base, ...HR_TOOLS];
}

export const SELF_TOOL_NAMES = new Set(SELF_TOOLS.map((t) => t.function.name));
export const SHARED_TOOL_NAMES = new Set(SHARED_TOOLS.map((t) => t.function.name));
export const HR_TOOL_NAMES = new Set(HR_TOOLS.map((t) => t.function.name));
