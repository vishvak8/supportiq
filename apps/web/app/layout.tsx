import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'SupportIQ · Customer support, connected',
  description: 'A private workspace for your support requests.',
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
