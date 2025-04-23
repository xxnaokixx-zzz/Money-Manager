import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bsnjmxzypumljbimdlwp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbmpteHp5cHVtbGpiaW1kbHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0MTM2NTYsImV4cCI6MjA2MDk4OTY1Nn0.aoebdDismCHglvXOJ2DNiBt1uQOzBHXppHJ0ouDgC1o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const uploadAvatar = async (userId: string, file: File) => {
  try {
    // ファイル名を生成
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // ストレージにアップロード
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    // アップロードした画像のURLを取得
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // プロフィールを更新
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    return publicUrl;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    throw error;
  }
}; 