'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { acceptInvite, getInvite } from '@/lib/api/invites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(2, 'Ingresá tu nombre'),
  phone: z.string().min(6, 'Ingresá un teléfono válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export default function InvitePage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inviteQuery = useQuery({ queryKey: ['invite', token], queryFn: () => getInvite(token), retry: false });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      acceptInvite(token, { ...values, email: values.email || undefined }),
    onSuccess: (res) => {
      queryClient.setQueryData(['auth', 'me'], res.user);
      router.replace('/');
    },
    onError: () => setErrorMessage('Algo salió mal. Intentá de nuevo.'),
  });

  if (inviteQuery.isLoading) {
    return null;
  }

  if (inviteQuery.isError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <p>Esta invitación venció o ya fue usada. Pedile al admin que te reenvíe el link.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Unirte a {inviteQuery.data?.tenantName}</h1>
      <p className="text-sm text-muted-foreground">Rol: {inviteQuery.data?.role}</p>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" type="tel" {...register('phone')} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" {...register('password')} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email (opcional, para recuperar tu contraseña)</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
    </main>
  );
}
