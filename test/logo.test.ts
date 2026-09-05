import { describe, it, expect } from 'vitest';
import { logoResponse, logoPngResponse, LOGO_SVG, serverIcons } from '../src/logo';

describe('圖示資源', () => {
  it('PNG 帶 CORS 標頭 —— 少了它網頁版 client 取不到圖示', async () => {
    const response = logoPngResponse();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('SVG 也帶 CORS 標頭', () => {
    const response = logoResponse();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('PNG 內容開頭是真正的 PNG magic bytes —— 規範要求 client 以此驗證', async () => {
    const bytes = new Uint8Array(await logoPngResponse().arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('SVG 有 viewBox —— 原始檔沒有，缺了會無法等比縮放', () => {
    expect(LOGO_SVG).toContain('viewBox="0 0 512 512"');
  });

  it('serverIcons 把 PNG 排在 SVG 前面，且都是絕對網址', () => {
    const icons = serverIcons('https://example.workers.dev');
    expect(icons[0].mimeType).toBe('image/png');
    expect(icons[0].src).toBe('https://example.workers.dev/logo-192.png');
    expect(icons[1].src.startsWith('https://')).toBe(true);
  });
});
