import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/brand/Logo';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-page px-6 text-center">
      <LogoMark className="h-10 w-10 text-content-tertiary" />
      <div>
        <h1 className="font-display text-h1 text-content-primary">Page not found</h1>
        <p className="mt-2 max-w-[380px] text-body text-content-secondary">
          The page you are looking for does not exist or you no longer have
          access to it.
        </p>
      </div>
      <Link href="/">
        <Button variant="primary">Back to dashboard</Button>
      </Link>
    </div>
  );
}
