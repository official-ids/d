// ===== public/auth.js =====
// Единая авторизация для всех продуктов MyBrowser
// Подключение: <script src="/auth.js"></script>

const SUPABASE_URL = 'https://qhmecfhqmdeouohrtplb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobWVjZmhxbWRlb3VvaHJ0cGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTcxMTAsImV4cCI6MjA5MjQzMzExMH0.nP3ZMLP31p_GuVsuAwHf2tZkLzww8gLQnwguKsAa53k';

const supabaseAuth = {
  // Регистрация нового пользователя
  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        options: {
          data: { role: 'user' }
        }
      })
    });
    return res.json();
  },

  // Вход в аккаунт
  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  // Выход из аккаунта
  async signOut() {
    const session = this.getSession();
    if (!session) return;
    
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`
      }
    });
    localStorage.removeItem('sb-session');
  },

  // Получить текущую сессию из localStorage
  getSession() {
    try {
      return JSON.parse(localStorage.getItem('sb-session'));
    } catch {
      return null;
    }
  },

  // Сохранить сессию в localStorage
  saveSession(session) {
    localStorage.setItem('sb-session', JSON.stringify(session));
  },

  // Получить данные текущего пользователя
  async getUser() {
    const session = this.getSession();
    if (!session) return null;
    
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`
      }
    });
    return res.ok ? await res.json() : null;
  },

  // Проверка: авторизован ли пользователь
  async isAuthenticated() {
    const user = await this.getUser();
    return !!user;
  }
};

// Экспорт в глобальную область (чтобы был доступен на всех страницах)
window.supabaseAuth = supabaseAuth;