/* eslint-disable no-console */
// import { Resend } from 'resend';

// const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(email: string, token: string) {
  console.log('Password reset email functionality is currently disabled', { email, token });
  return null;
  /*
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    try {
      const { data, error } = await resend.emails.send({
        from: 'Interliga Podbrezova <onboarding@resend.dev>',
        to: email,
        subject: 'Reset your password',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Reset your password</h1>
            <p>You requested a password reset for your Interliga Podbrezova account.</p>
            <p>
              Click the button below to reset your password. This link will expire in 15 minutes.
            </p>
            <div style="margin: 32px 0;">
              <a
                href="${resetLink}"
                style="background-color: #000; color: #fff; padding: 12px 24px;
                text-decoration: none; border-radius: 4px; display: inline-block;"
              >
                Reset Password
              </a>
            </div>
            <p>If you did not request this, you can safely ignore this email.</p>
            <hr style="margin: 32px 0; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #666;">If the button doesn't work,
              copy and paste this link into your browser:</p>
            <p style="font-size: 12px; color: #666;">${resetLink}</p>
          </div>
        `,
      });

      if (error) {
        console.error('Resend error:', error);
        throw new Error('Failed to send password reset email');
      }

      return data;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
    */
}
