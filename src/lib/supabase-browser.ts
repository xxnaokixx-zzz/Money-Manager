import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// メモリストレージの実装
class MemoryStorage {
  private store: { [key: string]: string } = {};

  getItem(key: string) {
    return this.store[key] || null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value;
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

// ストレージの初期化
const storage = (typeof window !== 'undefined' && window.localStorage)
  ? window.localStorage
  : new MemoryStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: {
      getItem: (key) => {
        try {
          const item = storage.getItem(key);
          return item ? JSON.parse(item) : null;
        } catch (error) {
          console.error('Error reading from storage:', error);
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, JSON.stringify(value));
        } catch (error) {
          console.error('Error writing to storage:', error);
        }
      },
      removeItem: (key) => {
        try {
          storage.removeItem(key);
        } catch (error) {
          console.error('Error removing from storage:', error);
        }
      }
    }
  }
})

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

    // ユーザー情報を更新
    const { error: updateError } = await supabase
      .from('users')
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