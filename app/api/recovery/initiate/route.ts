import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. Check if Key exists in Environment
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("CRITICAL ERROR: SUPABASE_SERVICE_ROLE_KEY is missing.");
      return NextResponse.json({ success: false, error: "Server Error: Admin Key Missing" }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { email, deviceToken, token } = await req.json();

    // 2. Fetch Users (With Error Handling)
    const { data: userResult, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    // --- THIS IS THE FIX ---
    // If the key is wrong, userResult will be null. We must check for that.
    if (listError || !userResult || !userResult.users) {
      console.error("Supabase Admin Error:", listError);
      return NextResponse.json({ 
        success: false, 
        error: "Database Connection Failed. Check Service Role Key." 
      }, { status: 500 });
    }

    // 3. Find the User
    const targetUser = userResult.users.find((u: any) => u.email === email);
    
    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' });
    }

    // 4. Create Recovery Request
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
    console.error("Recovery API Crash:", err.message); 
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}