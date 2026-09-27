import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

const ROUNDS = 12;
const WEEKEND = [0, 6];

function isWorkingDay(d: Date) {
  return !WEEKEND.includes(d.getDay());
}

function at(date: Date, hh: number, mm: number) {
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  return d;
}

async function main() {
  console.log('Seeding Cadre…');

  // ── Departments ──────────────────────────────────────────────────────
  const deptNames = ['Engineering', 'Human Resources', 'Sales', 'Finance', 'Operations'];
  await prisma.department.createMany({
    data: deptNames.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const departments = await prisma.department.findMany();
  const dept = (n: string) => departments.find((d) => d.name === n)!;

  // ── Leave types ──────────────────────────────────────────────────────
  await prisma.leaveType.createMany({
    data: [
      { name: 'Annual', annualQuota: 14, isPaid: true },
      { name: 'Sick', annualQuota: 10, isPaid: true },
      { name: 'Casual', annualQuota: 6, isPaid: true },
      { name: 'Unpaid', annualQuota: 0, isPaid: false },
    ],
    skipDuplicates: true,
  });
  const leaveTypes = await prisma.leaveType.findMany();

  // ── People ───────────────────────────────────────────────────────────
  const people = [
    { first: 'Aisha',  last: 'Malik',   dept: 'Human Resources', role: 'HR' as const,
      title: 'HR Manager',        salary: 95_000, code: 'EMP-0001' },
    { first: 'Ahmed',  last: 'Raza',    dept: 'Engineering', role: 'EMPLOYEE' as const,
      title: 'Senior Developer',  salary: 120_000, code: 'EMP-0002' },
    { first: 'Sara',   last: 'Khan',    dept: 'Engineering', role: 'EMPLOYEE' as const,
      title: 'Frontend Developer', salary: 85_000, code: 'EMP-0003' },
    { first: 'Bilal',  last: 'Hussain', dept: 'Sales', role: 'EMPLOYEE' as const,
      title: 'Account Executive', salary: 70_000, code: 'EMP-0004' },
    { first: 'Fatima', last: 'Sheikh',  dept: 'Finance', role: 'EMPLOYEE' as const,
      title: 'Financial Analyst', salary: 78_000, code: 'EMP-0005' },
    { first: 'Usman',  last: 'Tariq',   dept: 'Operations', role: 'EMPLOYEE' as const,
      title: 'Operations Lead',   salary: 88_000, code: 'EMP-0006' },
  ];

  const year = new Date().getFullYear();
  const employees: { id: number; code: string }[] = [];

  for (const p of people) {
    const email = `${p.first.toLowerCase()}@cadre.local`;
    const employee = await prisma.employee.upsert({
      where: { employeeCode: p.code },
      update: {},
      create: {
        employeeCode: p.code,
        firstName: p.first,
        lastName: p.last,
        email,
        phone: '+92 300 0000000',
        departmentId: dept(p.dept).id,
        designation: p.title,
        joiningDate: new Date(`${year - 2}-04-01`),
        baseSalary: p.salary,
        user: {
          create: {
            email,
            passwordHash: await bcrypt.hash(
              p.role === 'HR' ? 'Hr@12345' : 'Emp@12345',
              ROUNDS,
            ),
            role: p.role,
          },
        },
        leaveBalances: {
          create: leaveTypes.map((lt) => ({
            leaveTypeId: lt.id,
            year,
            allocated: lt.annualQuota,
            used: 0,
          })),
        },
      },
    });
    employees.push({ id: employee.id, code: p.code });
  }

  // System administrator — no employee record.
  await prisma.user.upsert({
    where: { email: 'admin@cadre.local' },
    update: {},
    create: {
      email: 'admin@cadre.local',
      passwordHash: await bcrypt.hash('Admin@123', ROUNDS),
      role: 'ADMIN',
    },
  });

  // ── 60 days of attendance ────────────────────────────────────────────
  // Reports and every AI analytics feature have nothing to display without
  // this, and you cannot demo them.
  const rows: {
    employeeId: number; date: Date; checkIn: Date | null;
    checkOut: Date | null; status: 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY';
  }[] = [];

  for (const emp of employees) {
    for (let back = 60; back >= 1; back--) {
      const date = new Date();
      date.setDate(date.getDate() - back);
      date.setHours(0, 0, 0, 0);
      if (!isWorkingDay(date)) continue;

      const roll = Math.random();
      // Bilal is the deliberately struggling employee, so the anomaly rules
      // and the AI briefing have something real to find.
      const struggling = emp.code === 'EMP-0004';
      const absentChance = struggling ? 0.14 : 0.04;
      const lateChance = struggling ? 0.3 : 0.1;

      if (roll < absentChance) {
        rows.push({ employeeId: emp.id, date, checkIn: null, checkOut: null, status: 'ABSENT' });
      } else if (roll < absentChance + lateChance) {
        rows.push({
          employeeId: emp.id, date,
          checkIn: at(date, 9, 20 + Math.floor(Math.random() * 40)),
          checkOut: at(date, 18, 0),
          status: 'LATE',
        });
      } else {
        rows.push({
          employeeId: emp.id, date,
          checkIn: at(date, 8, 45 + Math.floor(Math.random() * 12)),
          checkOut: at(date, 17, 30 + Math.floor(Math.random() * 60)),
          status: 'PRESENT',
        });
      }
    }
  }
  await prisma.attendance.createMany({ data: rows, skipDuplicates: true });

  // ── A pending leave request, so the approvals queue is not empty ──────
  const ahmed = employees.find((e) => e.code === 'EMP-0002')!;
  const annual = leaveTypes.find((l) => l.name === 'Annual')!;
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);

  const existing = await prisma.leaveRequest.findFirst({
    where: { employeeId: ahmed.id, status: 'PENDING' },
  });
  if (!existing) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: ahmed.id,
        leaveTypeId: annual.id,
        startDate: start,
        endDate: end,
        days: 5,
        reason: 'Family wedding in Lahore, travelling the day before.',
        status: 'PENDING',
      },
    });
  }

  // ── An active loan, so dues and payroll recovery are demonstrable ─────
  const sara = employees.find((e) => e.code === 'EMP-0003')!;
  const hasDue = await prisma.due.findFirst({ where: { employeeId: sara.id } });
  if (!hasDue) {
    await prisma.due.create({
      data: {
        employeeId: sara.id,
        type: 'EQUIPMENT',
        description: 'Company laptop — repayment over 10 months',
        principalAmount: 40_000,
        monthlyInstallment: 4_000,
        issuedOn: new Date(`${year}-03-12`),
      },
    });
  }

  console.log(`
Seed complete.

  ADMIN     admin@cadre.local   Admin@123
  HR        aisha@cadre.local   Hr@12345
  EMPLOYEE  ahmed@cadre.local   Emp@12345

  ${employees.length} employees · ${rows.length} attendance rows
  Change these passwords before any public demo.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
