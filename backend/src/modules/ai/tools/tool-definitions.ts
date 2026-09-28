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
    'get_my_leave_balance',
    'Leave balance of the person asking, broken down by leave type, for the ' +
      'current year: allocated, used and remaining days. Use for any question ' +
      'about how much leave they have left.',
  ),
  fn(
    'get_my_leave_requests',
    'The leave requests the person asking has submitted, with status ' +
      '(pending, approved, rejected) and the reviewer note if rejected.',
    { status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] } },
  ),
  fn(
    'get_my_attendance',
    'Attendance for the person asking over a month: each day with status, ' +
      'check-in and check-out, plus totals for attendance percentage, late ' +
      'arrivals, absences and overtime.',
    {
      year: { type: 'integer', description: 'Defaults to the current year' },
      month: { type: 'integer', description: '1-12. Defaults to the current month' },
    },
  ),
  fn(
    'get_my_attendance_summary',
    'Rolling 90-day attendance summary for the person asking: percentage, ' +
      'present days, late count, absences and overtime minutes.',
  ),
  fn(
    'get_my_dues',
    'Loans, advances and other amounts the person asking owes the company, ' +
      'with principal, amount paid, remaining balance and monthly installment.',
  ),
  fn(
    'get_my_payslips',
    'Payslips issued to the person asking, with every component: basic, ' +
      'allowances, overtime, deductions, dues recovered, bonus and net salary.',
    { limit: { type: 'integer', description: 'How many recent payslips. Default 3' } },
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
];

/**
 * An employee's request to the model physically does not contain the
 * organisation-wide tools. The model cannot call a tool it was never given —
 * this is a capability boundary, not a filter applied to the answer.
 */
export function toolsForRole(role: Role): Tool[] {
  return role === Role.EMPLOYEE ? SELF_TOOLS : [...SELF_TOOLS, ...HR_TOOLS];
}

export const SELF_TOOL_NAMES = new Set(SELF_TOOLS.map((t) => t.function.name));
export const HR_TOOL_NAMES = new Set(HR_TOOLS.map((t) => t.function.name));
