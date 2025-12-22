import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function POST(req: Request) {
  try {
    const { type, to, data } = await req.json();

    let subject = '';
    let html = '';

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    if (type === 'recovery_request') {
      subject = '🚨 Security Recovery Request - Action Required';
      html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #d9534f;">Account Recovery Requested</h2>
          <p>Someone (hopefully you) requested to reset your <strong>Security Question & Authenticator</strong> because they were lost.</p>
          <p><strong>Device ID:</strong> ${data.deviceToken}</p>
          
          <div style="margin: 20px 0;">
            <p><strong>Was this you?</strong></p>
            <p>If YES, click Accept. For security, a <strong>24-hour lock</strong> will start before you can reset.</p>
            <a href="${SITE_URL}/auth/recovery?token=${data.token}&action=accept" style="background-color: #5bc0de; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">✅ Accept & Start Timer</a>
            
            <br/><br/>
            
            <p><strong>Was NOT you?</strong></p>
            <p>If NO, click Decline. We will <strong>blacklist this device</strong> immediately.</p>
            <a href="${SITE_URL}/auth/recovery?token=${data.token}&action=decline&device=${data.deviceToken}" style="background-color: #d9534f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">❌ Decline & Block Device</a>
          </div>
        </div>
      `;
    } 
    else if (type === 'login_success') {
      subject = '✅ New Login Detected';
      html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #5cb85c;">New Login Successful</h2>
          <p>Your account was accessed from <strong>${data.ip}</strong> on <strong>${data.device}</strong>.</p>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border: 1px solid #ffeeba; margin-top: 20px;">
            <p style="margin: 0; font-weight: bold; color: #856404;">⚠️ Not you?</p>
            <p style="margin: 5px 0;">If you did not sign in, click below to lock your account immediately.</p>
            <a href="${SITE_URL}/auth/kill-switch?uid=${data.userId}&token=${data.token}" style="background-color: #d9534f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">🛑 IT'S NOT ME (Kill Session)</a>
          </div>
        </div>
      `;
    }

    await transporter.sendMail({
      from: '"AymnSecureVault Security" <aliaymanwork@gmail.com>',
      to,
      subject,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}