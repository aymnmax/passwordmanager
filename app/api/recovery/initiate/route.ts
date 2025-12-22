import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // --- FIX: Initialize Supabase INSIDE the function ---
    // This prevents the "supabaseKey is required" error during build time.
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! 
    );
    // ----------------------------------------------------

    const { email, deviceToken, token } = await req.json();

    // 1. Find User ID
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    
    // Find the user with this email
    const targetUser = users.users.find(u => u.email === email);
    
    if (!targetUser) return NextResponse.json({ success: false, error: 'User not found' });

    // 2. Insert Request
    const { error: insertError } = await supabaseAdmin
      .from('recovery_requests')
      .insert({
        user_id: targetUser.id,
        token: token,
        device_token: deviceToken,
        status: 'pending'
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Recovery API Error:", err); // Helpful for debugging logs
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}