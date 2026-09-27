/** Shared with the backend. Keep these in step with the Prisma schema. */

export type Role = 'EMPLOYEE' | 'HR' | 'ADMIN';

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED';

export type AttendanceStatus =
  | 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY';

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type PayrollRunStatus = 'DRAFT' | 'FINALISED';

export type DueType = 'LOAN' | 'ADVANCE' | 'EQUIPMENT' | 'OTHER';
export type DueStatus = 'ACTIVE' | 'CLEARED' | 'WAIVED';

export type NotificationType =
  | 'LEAVE' | 'PAYROLL' | 'DUES' | 'ATTENDANCE' | 'SYSTEM';

export interface SessionUser {
  sub: number;
  employeeId: number | null;
  email: string;
  role: Role;
  name: string;
}

export interface Department {
  id: number;
  name: string;
}

export interface Employee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  designation: string;
  joiningDate: string;
  employmentStatus: EmploymentStatus;
  baseSalary: string;
  department: Department;
}

export interface Me {
  id: number;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  employee: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    designation: string;
    joiningDate: string;
    phone: string | null;
    department: Department;
  } | null;
}

export interface Attendance {
  id: number;
  employeeId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  attendancePercentage: number;
  presentDays: number;
  lateCount: number;
  absentDays: number;
  overtimeHours: number;
  workingDays: number;
}

export interface LeaveType {
  id: number;
  name: string;
  annualQuota: number;
  isPaid: boolean;
}

export interface LeaveBalance {
  id: number;
  leaveType: LeaveType;
  year: number;
  allocated: number;
  used: number;
  /** Derived server-side: allocated − used. Never stored. */
  remaining: number;
}

export interface LeaveRequest {
  id: number;
  employee: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'employeeCode'> & {
    department: Department;
    designation: string;
    /** Drives who is allowed to approve this request. */
    user: { role: Role } | null;
  };
  reviewer: {
    id: number;
    email: string;
    role: Role;
    employee: { firstName: string; lastName: string } | null;
  } | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  /** Present on the approvals queue only — everything needed to decide. */
  decision?: DecisionContext;
}

export type FlagLevel = 'info' | 'warning' | 'danger';

export interface DecisionFlag {
  code: string;
  level: FlagLevel;
  label: string;
  detail: string;
}

/**
 * Computed by the rules engine, never by the model — a flag must be
 * reproducible and defensible in a conversation with the employee.
 */
export interface DecisionContext {
  attendance: {
    windowDays: number;
    percentage: number;
    previousPercentage: number | null;
    presentDays: number;
    lateCount: number;
    absentDays: number;
    onLeaveDays: number;
    workingDays: number;
  };
  balance: {
    allocated: number;
    used: number;
    remaining: number;
    afterApproval: number;
  };
  history: {
    daysTakenThisYear: number;
    requestsThisYear: number;
    rejectedThisYear: number;
    tenureMonths: number;
  };
  coverage: {
    departmentSize: number;
    othersOffInRange: number;
    othersOffNames: string[];
  };
  flags: DecisionFlag[];
}

export interface Payslip {
  id: number;
  employeeId: number;
  baseSalary: string;
  allowances: string;
  overtimeAmount: string;
  unpaidLeaveDeduction: string;
  otherDeductions: string;
  duesDeduction: string;
  bonus: string;
  netSalary: string;
  payrollRun: { id: number; month: number; year: number; status: PayrollRunStatus };
}

export interface Due {
  id: number;
  type: DueType;
  description: string;
  principalAmount: string;
  monthlyInstallment: string;
  status: DueStatus;
  issuedOn: string;
  /** Derived server-side from SUM(payments). Never stored. */
  paidAmount: string;
  remainingAmount: string;
}

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiError {
  statusCode: number;
  message: string;
  errors?: Record<string, string[]>;
  path: string;
  timestamp: string;
}
