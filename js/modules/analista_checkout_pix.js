/**
 * Módulo: analista_checkout_pix.js
 * Modal e operações de checkout Pix em tempo real integrado ao financeiro.
 * Arquitetura Modular Pátio-CRM (< 350 linhas).
 */

async function abrirModalCheckoutPix(osId, valor, cliente) {
  let modalContainer = document.getElementById('modal-checkout-pix-overlay');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'modal-checkout-pix-overlay';
    document.body.appendChild(modalContainer);
  }

  modalContainer.innerHTML = `
    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px">
      <div style="background:#ffffff;border-radius:12px;padding:24px;max-width:460px;width:100%;box-shadow:0 10px 25px rgba(0,0,0,0.2);text-align:center">
        <div style="font-size:32px;margin-bottom:8px">⚡</div>
        <h3 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px">Checkout Pix em Tempo Real</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:16px">Gerando cobrança instantânea com TxID exclusivo...</p>
        <div class="carregando" style="margin:20px 0">Aguarde...</div>
      </div>
    </div>
  `;

  try {
    const resp = await fetch('/api/financeiro/pix/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ osId, valor, cliente })
    });
    const dados = await resp.json();

    if (!dados || !dados.success) {
      modalContainer.remove();
      if (typeof torrar === 'function') torrar(dados?.error || 'Erro ao gerar Pix.', 'erro');
      return;
    }

    const { txid, pixCopiaECola, valor: valorFinal } = dados;

    modalContainer.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.75);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px">
        <div style="background:#ffffff;border-radius:14px;padding:24px;max-width:480px;width:100%;box-shadow:0 12px 30px rgba(0,0,0,0.25);position:relative">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:22px">💠</span>
              <span style="font-size:16px;font-weight:700;color:#0f172a">Pagamento via Pix (OS #${osId})</span>
            </div>
            <button onclick="document.getElementById('modal-checkout-pix-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b">&times;</button>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px;text-align:center">
            <div style="font-size:12px;color:#64748b">VALOR A RECEBER</div>
            <div style="font-size:24px;font-weight:800;color:#16a34a">R$ ${Number(valorFinal || valor).toFixed(2)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;font-family:monospace">TxID: ${txid}</div>
          </div>

          <div style="margin-bottom:14px">
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Código Pix Copia e Cola:</label>
            <textarea id="pix-copia-cola-text" readonly style="width:100%;height:70px;font-size:11px;font-family:monospace;padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;resize:none">${pixCopiaECola}</textarea>
            <button class="btn btn-primario" onclick="navigator.clipboard.writeText(document.getElementById('pix-copia-cola-text').value);if(typeof torrar==='function')torrar('Código Pix copiado!','sucesso')" style="width:100%;margin-top:6px;height:34px;font-size:13px;font-weight:600">
              📋 Copiar Código Pix Copia e Cola
            </button>
          </div>

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:4px">Ambiente Homologado & Webhook Instantâneo:</div>
            <div style="font-size:11.5px;color:#1e3a8a;line-height:1.4">
              Ao receber a confirmação bancária, a OS e a Conta a Receber são liquidadas automaticamente.
            </div>
            <button class="btn btn-sucesso" data-act="simular-webhook-pix" data-txid="${txid}" data-os-id="${osId}" style="width:100%;margin-top:8px;height:38px;font-weight:700;font-size:13px">
              ⚡ Simular Confirmação Webhook Pix (Quitação Imediata)
            </button>
          </div>

          <div style="text-align:right">
            <button class="btn btn-neutro" onclick="document.getElementById('modal-checkout-pix-overlay').remove()">Fechar</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    modalContainer.remove();
    if (typeof torrar === 'function') torrar('Erro de rede ao gerar cobrança Pix.', 'erro');
  }
}

if (typeof window !== 'undefined') {
  window.abrirModalCheckoutPix = abrirModalCheckoutPix;
}
if (typeof globalThis !== 'undefined') {
  globalThis.abrirModalCheckoutPix = abrirModalCheckoutPix;
}

