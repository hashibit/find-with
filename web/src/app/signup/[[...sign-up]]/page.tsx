import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignUp
        appearance={{
          elements: {
            formButtonPrimary: 'bg-brand-600 hover:bg-brand-700',
          },
        }}
        redirectUrl="/dashboard"
        signInUrl="/login"
      />
    </div>
  );
}
