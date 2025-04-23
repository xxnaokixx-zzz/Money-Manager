import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bsnjmxzypumljbimdlwp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbmpteHp5cHVtbGpiaW1kbHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0MTM2NTYsImV4cCI6MjA2MDk4OTY1Nn0.aoebdDismCHglvXOJ2DNiBt1uQOzBHXppHJ0ouDgC1o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
}); 