'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLoginMutation } from '@/store/api/endpoints/authApi';
import { useAppDispatch } from '@/store/hooks';
import { setSession } from '@/store/slices/authSlice';
import { getErrorMessage } from '@/lib/getErrorMessage';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    try {
      // .unwrap() so a failed request throws. Without it the promise resolves
      // even on a 401 and the redirect fires on a failed login.
      const { user } = await login(values).unwrap();
      dispatch(setSession(user));
      router.replace('/');
    } catch (err) {
      // A login failure belongs above the form, not in a toast that
      // auto-dismisses before the user has read it.
      setError('root', { message: getErrorMessage(err) });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {errors.root && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-3"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <p className="text-body-sm text-danger">{errors.root.message}</p>
        </div>
      )}

      <Input
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        icon={Mail}
        error={errors.email?.message}
        {...register('email')}
      />

      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        icon={Lock}
        error={errors.password?.message}
        {...register('password')}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={isLoading}
        className="mt-2"
      >
        Sign in
      </Button>

    </form>
  );
}
