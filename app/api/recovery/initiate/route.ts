import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. Check if Key exists
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Environment Variables.");
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { email, deviceToken, token } = await req.json();

    // 2. Safely Fetch Users
    const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    // --- FIX: Check for errors immediately ---
    if (listError || !userList) {
      console.error("Supabase Admin Error:", listError);
      return NextResponse.json({ success: false, error: "Database Connection Failed (Check Service Role Key)" }, { status: 500 });
    }

    // 3. Find User
    const targetUser = userList.users.find((u: any) => u.email === email);
    
    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' });
    }

    // 4. Insert Request
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
    console.error("Recovery API Error:", err.message); 
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}