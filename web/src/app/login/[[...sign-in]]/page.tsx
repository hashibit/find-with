import { SignIn } from '@/lib/auth';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn
        redirectUrl="/dashboard"
        signUpUrl="/signup"
      />
    </div>
  );
}
