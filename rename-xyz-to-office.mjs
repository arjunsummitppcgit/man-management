// One-time script: sign in and rename location XYZ → OFFICE
// Run with: node rename-xyz-to-office.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://awbdhkamnpvxmjyiqbpc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3YmRoa2FtbnB2eG1qeWlxYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzA5MzksImV4cCI6MjA5NTYwNjkzOX0.4nhkNffGWIZYvVaoY9YlctrmbpWdTV8yIiFBlripbdQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── EDIT THESE ──────────────────────────────────────────────
const EMAIL    = 'your-email@example.com';   // <-- replace
const PASSWORD = 'your-password';            // <-- replace
// ────────────────────────────────────────────────────────────

async function main() {
  // Sign in to satisfy RLS
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInError) {
    console.error('Sign-in failed:', signInError.message);
    process.exit(1);
  }
  console.log('✅ Signed in successfully.');

  // Fetch all locations
  const { data: locations, error: fetchError } = await supabase
    .from('locations')
    .select('id, name, code, sort_order')
    .order('sort_order');

  if (fetchError) {
    console.error('Error fetching locations:', fetchError.message);
    process.exit(1);
  }

  console.log('Current locations:');
  locations.forEach(l => console.log(`  [${l.sort_order}] ${l.name} (${l.code}) — id: ${l.id}`));

  const xyz = locations.find(l => l.name === 'XYZ');
  if (!xyz) {
    console.log('\n⚠️  No location named "XYZ" found. Check the names above and update this script.');
    process.exit(0);
  }

  console.log(`\nFound XYZ with id: ${xyz.id}. Renaming to OFFICE...`);

  const { data: updated, error: updateError } = await supabase
    .from('locations')
    .update({ name: 'OFFICE', code: 'office' })
    .eq('id', xyz.id)
    .select();

  if (updateError) {
    console.error('Error updating:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Successfully renamed XYZ → OFFICE:', JSON.stringify(updated, null, 2));
  await supabase.auth.signOut();
}

main();
