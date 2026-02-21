import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, deviceName, userId, time } = await request.json();

    const freezeLink = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/freeze?user=${userId}`;

    const { data, error } = await resend.emails.send({
      from: 'AymnSecureVault Security <security@your-resend-domain.com>', // Update with your verified Resend domain
      to: email,
      subject: 'Security Alert: New Login Detected',
      html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
          <h2 style="color: #0f172a; margin-top: 0;">New Device Login</h2>
          <p style="color: #475569; font-size: 16px;">We noticed a successful login to your AymnSecureVault from a new device.</p>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; color: #334155;"><strong>Device:</strong> ${deviceName}</p>
            <p style="margin: 0; color: #334155;"><strong>Time:</strong> ${time}</p>
          </div>

          <p style="color: #475569; font-size: 14px;">If this was you, you can safely ignore this email.</p>
          
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="color: #dc2626; font-weight: bold; margin-bottom: 12px;">Wasn't you? Instantly lock your account to protect your data:</p>
            <a href="${freezeLink}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Freeze My Vault Immediately</a>
          </div>
        </div>
      `,
    });

    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ success: true, data });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}