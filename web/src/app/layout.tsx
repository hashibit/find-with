import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata = {
  title: 'FindWith — AI Job Search Companion',
  description: 'Your AI career coach that helps you find, tailor, and land the right job.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-white text-gray-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
