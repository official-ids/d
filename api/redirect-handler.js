// api/redirect-handler.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const slug = url.pathname.split('/').pop(); // Извлекаем slug из /URL/{slug}

  if (!slug || slug.length < 3) {
    return new Response('Not Found', { status: 404 });
  }

  // Ищем редирект
  const { data, error } = await supabase
    .from('url_redirects')
    .select('target_url, is_active')
    .eq('slug', slug.toLowerCase())
    .maybeSingle();

  if (error || !data || !data.is_active) {
    // Если не найдено — показываем 404 или редиректим на главную
    return Response.redirect('https://redicts-tau.vercel.app/404', 302);
  }

  // Увеличиваем счётчик кликов (асинхронно, не ждём)
  supabase
    .from('url_redirects')
    .update({ clicks: data.clicks + 1 })
    .eq('slug', slug.toLowerCase());

  // Редирект на целевой URL
  return Response.redirect(data.target_url, 302);
}