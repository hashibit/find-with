import { SignUp } from '@/lib/auth';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignUp
        redirectUrl="/dashboard"
        signInUrl="/login"
      />
    </div>
  );
}
