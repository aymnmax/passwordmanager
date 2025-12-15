import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json();

    // 1. Setup the Transporter (Gmail)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, 
      },
    });

    // 2. Send Email
    const info = await transporter.sendMail({
      from: `"Secure Vault" <${process.env.GMAIL_USER}>`, // Sender address
      to: to, // Receiver
      subject: subject,
      html: html,
    });

    return NextResponse.json({ success: true, messageId: info.messageId });

  } catch (error: any) {
    console.error("Email Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}