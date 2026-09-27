'use client';

import { CalendarCheck, CalendarDays, CheckCheck, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAppSelector } from '@/store/hooks';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user)!;
  const isHr = user.role === 'HR' || user.role === 'ADMIN';

  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={today}
        actions={
          isHr ? (
            <Button variant="primary" icon={Wallet}>Run Payroll</Button>
          ) : (
            <Button variant="primary" icon={CalendarCheck}>Check In</Button>
          )
        }
      />

      {/* Four stats, not eight. A dashboard of twelve numbers gets scanned as
          decoration; four gets read. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isHr ? (
          <>
            <StatCard label="Present today" value="—" icon={CalendarCheck} />
            <StatCard label="On leave today" value="—" icon={CalendarDays} />
            <StatCard label="Pending approvals" value="—" icon={CheckCheck} />
            <StatCard label="This month's payroll" value="—" icon={Wallet} />
          </>
        ) : (
          <>
            <StatCard label="Attendance rate" value="—" icon={CalendarCheck} />
            <StatCard label="Leave remaining" value="—" icon={CalendarDays} />
            <StatCard label="Next payday" value="—" icon={Wallet} />
            <StatCard label="Outstanding dues" value="—" icon={CheckCheck} />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Attendance trend</CardTitle>
              <CardSubtitle>Last six months</CardSubtitle>
            </div>
          </CardHeader>
          <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-line-default">
            <p className="text-body-sm text-content-tertiary">
              Connect the database to see live data
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardSubtitle>Actions waiting on you</CardSubtitle>
            </div>
            <Badge tone="brand" small>0</Badge>
          </CardHeader>
          <p className="text-body-sm text-content-secondary">
            Nothing outstanding.
          </p>
        </Card>
      </div>
    </>
  );
}
