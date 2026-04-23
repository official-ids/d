// api/redirect.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { method } = req;

  // Получаем токен из заголовка
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Проверяем пользователя
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (method === 'POST') {
    // Создать редирект
    const { slug, targetUrl } = await req.json();
    
    // Валидация
    if (!slug || !targetUrl) {
      return new Response(JSON.stringify({ error: 'slug и targetUrl обязательны' }), { status: 400 });
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      return new Response(JSON.stringify({ error: 'targetUrl должен быть валидным URL' }), { status: 400 });
    }
    if (!/^[a-z0-9_-]{3,50}$/i.test(slug)) {
      return new Response(JSON.stringify({ error: 'slug: 3-50 символов, только a-z, 0-9, _, -' }), { status: 400 });
    }

    const { data, error } = await supabase
      .from('url_redirects')
      .insert({ user_id: user.id, slug: slug.toLowerCase(), target_url: targetUrl })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return new Response(JSON.stringify({ error: 'Этот slug уже занят' }), { status: 409 });
      }
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (method === 'GET') {
    // Получить список редиректов пользователя
    const { data, error } = await supabase
      .from('url_redirects')
      .select('id, slug, target_url, clicks, created_at, is_active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (method === 'DELETE') {
    // Удалить редирект
    const { slug } = await req.json();
    if (!slug) return new Response(JSON.stringify({ error: 'slug обязателен' }), { status: 400 });

    const { error } = await supabase
      .from('url_redirects')
      .delete()
      .eq('user_id', user.id)
      .eq('slug', slug.toLowerCase());

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (method === 'PATCH') {
    // Обновить редирект
    const { slug, targetUrl, isActive } = await req.json();
    if (!slug) return new Response(JSON.stringify({ error: 'slug обязателен' }), { status: 400 });

    const updates = {};
    if (targetUrl) updates.target_url = targetUrl;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await supabase
      .from('url_redirects')
      .update(updates)
      .eq('user_id', user.id)
      .eq('slug', slug.toLowerCase())
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method not allowed', { status: 405 });
}