import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Create a SUPABASE ADMIN Client (Service Role Key required for searching users)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // You need to add this to .env.local
);

export async function POST(req: Request) {
  try {
    const { email, deviceToken, token } = await req.json();

    // 1. Find User ID
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    // Note: listUsers is paginated. For small apps, this finds them. 
    // Ideally use: supabaseAdmin.rpc('get_user_id_by_email', {email}) if created.
    
    // Simpler hack for this context:
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}