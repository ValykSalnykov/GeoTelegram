import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ tasks: [] });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error fetching tasks:', error);
      return NextResponse.json({ tasks: [] });
    }

    return NextResponse.json({ tasks: data ?? [] });
  } catch (err: any) {
    console.error('Error fetching locations:', err);
    return NextResponse.json({ tasks: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const task = await req.json();
    const supabase = createServerSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ success: true, persisted: false });
    }

    const { error } = await supabase.from('tasks').upsert(task, {
      onConflict: 'id',
    });

    if (error) {
      console.error('Supabase error saving task:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, persisted: true });
  } catch (err: any) {
    console.error('Error saving task:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
