import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'U-net Perks Example',
  description: 'Example unlisted U-net miniapp and browser login integration.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
