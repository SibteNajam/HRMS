'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, Briefcase, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  useGetPublicDepartmentsQuery,
  useLoginMutation,
  useRegisterMutation,
} from '@/store/api/endpoints/authApi';
import { useAppDispatch } from '@/store/hooks';
import { setSession } from '@/store/slices/authSlice';
import { getErrorMessage } from '@/lib/getErrorMessage';

const schema = z
  .object({
    firstName: z.string().min(2, 'At least 2 characters').max(50),
    lastName: z.string().min(2, 'At least 2 characters').max(50),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    designation: z.string().max(80).optional(),
    departmentId: z.string().optional(),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type Values = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: departments } = useGetPublicDepartmentsQuery();
  const [registerUser, { isLoading: creating }] = useRegisterMutation();
  const [login, { isLoading: signingIn }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    try {
      await registerUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        designation: values.designation || undefined,
        departmentId: values.departmentId ? Number(values.departmentId) : undefined,
      }).unwrap();

      // Sign straight in so the user lands on the dashboard rather than being
      // bounced to a login form they just filled the details into.
      const { user } = await login({
        email: values.email,
        password: values.password,
      }).unwrap();

      dispatch(setSession(user));
      toast.success('Account created', { description: `Welcome, ${user.name}.` });
      router.replace('/');
    } catch (err) {
      setError('root', { message: getErrorMessage(err) });
    }
  }

  const busy = creating || signingIn;

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

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First name"
          autoComplete="given-name"
          placeholder="Ahmed"
          icon={User}
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <Input
          label="Last name"
          autoComplete="family-name"
          placeholder="Raza"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>

      <Input
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        icon={Mail}
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Department"
          optional
          error={errors.departmentId?.message}
          {...register('departmentId')}
        >
          <option value="">Select…</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Input
          label="Job title"
          optional
          placeholder="Developer"
          icon={Briefcase}
          error={errors.designation?.message}
          {...register('designation')}
        />
      </div>

      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        icon={Lock}
        hint="At least 8 characters, with an uppercase letter and a number."
        error={errors.password?.message}
        {...register('password')}
      />

      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        icon={Lock}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={busy}
        className="mt-2"
      >
        {creating ? 'Creating account' : signingIn ? 'Signing in' : 'Create account'}
      </Button>
    </form>
  );
}
