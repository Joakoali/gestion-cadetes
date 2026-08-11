'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  phone: z.string().min(6, 'Ingresá un teléfono válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => login(values.phone, values.password),
    onSuccess: (res) => {
      queryClient.setQueryData(['auth', 'me'], res.user);
      router.replace('/');
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : 'Ocurrió un error, probá de nuevo.');
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" type="tel" {...registerField('phone')} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" {...registerField('password')} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/registro" className="underline">
          Crear cuenta
        </Link>
        <Link href="/forgot-password" className="underline">
          Olvidé mi contraseña
        </Link>
      </div>
    </main>
  );
}
