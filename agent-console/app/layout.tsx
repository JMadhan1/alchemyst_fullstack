import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Console — Alchemyst AI',
  description: 'Real-time agent trace and chat console with protocol compliance monitoring',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>
        {children}
      </body>
    </html>
  );
}
