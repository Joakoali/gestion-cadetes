import { InstallBanner } from '@/components/install-banner';

export default function CadeteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InstallBanner />
      {children}
    </>
  );
}
