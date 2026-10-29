/* =====================================================================
   PÁTIO CRM — MOTOR CAMALEÃO (WHITE-LABEL DYNAMIC THEME EXTRACTOR)
   Extrai paleta harmônica da logo corporativa e aplica em tempo real
   ===================================================================== */

(function () {
  'use strict';

  // Converte RGB para HSL
  function rgbParaHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  // Converte HSL para Hex
  function hslParaHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    const toHex = x => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Aplica o conjunto de variáveis CSS no DOM e sincroniza com o backend
  function aplicarTemaCamaleao(paleta, sincronizarServidor = true) {
    if (!paleta || !paleta.primary) return;
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', paleta.primary);
    root.style.setProperty('--brand-primary-hover', paleta.primaryHover || paleta.primary);
    root.style.setProperty('--brand-primary-light', paleta.primaryLight || '#eff6ff');
    root.style.setProperty('--brand-accent', paleta.accent || '#f59e0b');

    // Mapeamento retrocompatível
    root.style.setProperty('--petroleo', paleta.primary);
    root.style.setProperty('--petroleo-hover', paleta.primaryHover || paleta.primary);
    root.style.setProperty('--petroleo-fraco', paleta.primaryLight || '#eff6ff');

    try {
      localStorage.setItem('patio_brand_theme', JSON.stringify(paleta));
    } catch (_) {}

    if (typeof S !== 'undefined' && S && S.cfg) {
      S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
      S.cfg.identidadeVisual.paleta = paleta;
    }

    if (sincronizarServidor && typeof fetch === 'function') {
      try {
        fetch('/api/tenant/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paleta)
        }).catch(() => {});
      } catch (_) {}
    }
  }

  // Restaura o tema salvo no localStorage ou configuração
  function restaurarTemaSalvo() {
    try {
      const salvo = localStorage.getItem('patio_brand_theme');
      if (salvo) {
        const paleta = JSON.parse(salvo);
        aplicarTemaCamaleao(paleta, false);
      }
    } catch (_) {}

    if (typeof S !== 'undefined' && S && S.cfg && S.cfg.identidadeVisual && S.cfg.identidadeVisual.paleta) {
      aplicarTemaCamaleao(S.cfg.identidadeVisual.paleta, false);
      return S.cfg.identidadeVisual.paleta;
    }

    // Busca tema corporativo do tenant no backend para garantir sincronização entre navegadores
    if (typeof fetch === 'function') {
      fetch('/api/tenant/theme')
        .then(r => r.json())
        .then(d => {
          if (d && d.success && d.theme) {
            aplicarTemaCamaleao(d.theme, false);
          }
        })
        .catch(() => {});
    }

    // Default Corporativo Azul Royal / Âmbar
    const def = {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      primaryLight: '#eff6ff',
      accent: '#f59e0b'
    };
    aplicarTemaCamaleao(def, false);
    return def;
  }

  // Reseta para o tema padrão original
  function resetarTemaPadrao() {
    const padrao = {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      primaryLight: '#eff6ff',
      accent: '#f59e0b'
    };
    aplicarTemaCamaleao(padrao);
    try { localStorage.removeItem('patio_brand_theme'); } catch (_) {}
    if (typeof torrar === 'function') torrar('Paleta padrão restaurada com sucesso!');
    if (typeof render === 'function') render();
    return padrao;
  }

  // Extrai as cores dominantes da logo via Canvas
  function extrairCoresDaLogo(fonteImagem, callback) {
    if (!fonteImagem) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        const buckets = {};

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          // Descarta transparência, brancos, pretos e cinzas lavados
          if (a < 128) continue;
          if (r > 235 && g > 235 && b > 235) continue;
          if (r < 30 && g < 30 && b < 30) continue;
          if (Math.max(r, g, b) - Math.min(r, g, b) < 24) continue;

          const [h, s, l] = rgbParaHsl(r, g, b);
          // Agrupa matiz em blocos de 15 graus
          const bucketH = Math.round(h / 15) * 15;
          const chave = `${bucketH}`;

          if (!buckets[chave]) {
            buckets[chave] = { count: 0, sumH: 0, sumS: 0, sumL: 0 };
          }
          buckets[chave].count++;
          buckets[chave].sumH += h;
          buckets[chave].sumS += s;
          buckets[chave].sumL += l;
        }

        const ordenados = Object.values(buckets).sort((a, b) => b.count - a.count);

        if (ordenados.length === 0) {
          if (typeof callback === 'function') callback(null);
          return;
        }

        // Cor Primária: matiz mais frequente com saturação fortalecida
        const prim = ordenados[0];
        const hPrim = Math.round(prim.sumH / prim.count);
        const sPrim = Math.max(65, Math.min(95, Math.round(prim.sumS / prim.count)));
        const lPrim = Math.max(42, Math.min(52, Math.round(prim.sumL / prim.count)));

        const hexPrimary = hslParaHex(hPrim, sPrim, lPrim);
        const hexHover = hslParaHex(hPrim, sPrim, Math.max(30, lPrim - 10));
        const hexLight = hslParaHex(hPrim, 30, 96);

        // Cor Secundária (Accent): segundo matiz mais distinto
        let hexAccent = '#f59e0b';
        for (let j = 1; j < ordenados.length; j++) {
          const candid = ordenados[j];
          const hCand = Math.round(candid.sumH / candid.count);
          if (Math.abs(hCand - hPrim) > 40) {
            const sCand = Math.max(70, Math.min(95, Math.round(candid.sumS / candid.count)));
            const lCand = Math.max(45, Math.min(55, Math.round(candid.sumL / candid.count)));
            hexAccent = hslParaHex(hCand, sCand, lCand);
            break;
          }
        }

        const paleta = {
          primary: hexPrimary,
          primaryHover: hexHover,
          primaryLight: hexLight,
          accent: hexAccent
        };

        aplicarTemaCamaleao(paleta);
        if (typeof callback === 'function') callback(paleta);
      } catch (err) {
        console.warn('[BrandTheme] Erro ao extrair cores da logo:', err);
        if (typeof callback === 'function') callback(null);
      }
    };
    img.src = fonteImagem;
  }

  // Executa restauração imediata do tema
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restaurarTemaSalvo);
    } else {
      restaurarTemaSalvo();
    }
  }

  // Exportação no escopo global
  if (typeof window !== 'undefined') {
    window.BrandTheme = {
      aplicarTemaCamaleao,
      restaurarTemaSalvo,
      resetarTemaPadrao,
      extrairCoresDaLogo
    };
  }
})();
