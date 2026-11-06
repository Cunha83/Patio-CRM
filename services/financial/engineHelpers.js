'use strict';

const FUSO_HORARIO_PADRAO = 'America/Sao_Paulo';

const formatadorISOSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_HORARIO_PADRAO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const formatadorBRSP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO_PADRAO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const formatadorHoraSP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO_PADRAO,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function obterAgoraSP(date = new Date()) {
  let d = date;
  if (!d) d = new Date();
  else if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
      const [ano, mes, dia] = d.trim().split('-').map(Number);
      d = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    } else {
      d = new Date(d);
    }
  } else if (typeof d === 'number') {
    d = new Date(d);
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();

  return {
    dataISO: formatadorISOSP.format(d),
    dataBR: formatadorBRSP.format(d),
    horaBR: formatadorHoraSP.format(d),
    dataObj: d
  };
}

function formatarMoeda(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMoedaCurta(val) {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1000000) {
    return 'R$ ' + (n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  }
  if (Math.abs(n) >= 1000) {
    return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  }
  return formatarMoeda(n);
}

function dataISO(d) {
  if (!d) return formatadorISOSP.format(new Date());
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return formatadorISOSP.format(parsed);
    return trimmed.slice(0, 10);
  }
  if (typeof d === 'number') {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return formatadorISOSP.format(dt);
  }
  if (d instanceof Date && !isNaN(d.getTime())) return formatadorISOSP.format(d);
  return formatadorISOSP.format(new Date());
}

function addDias(dStr, dias) {
  const base = dataISO(dStr);
  const [ano, mes, dia] = base.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + Number(dias), 12, 0, 0));
  return formatadorISOSP.format(d);
}

function diasEntre(d1, d2) {
  const iso1 = dataISO(d1);
  const iso2 = dataISO(d2);
  const [y1, m1, day1] = iso1.split('-').map(Number);
  const [y2, m2, day2] = iso2.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, day1);
  const t2 = Date.UTC(y2, m2 - 1, day2);
  return Math.round((t2 - t1) / 864e5);
}

function formatarDataBR(dStr) {
  if (!dStr) return '';
  const iso = dataISO(dStr);
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return dStr;
}

function formatarDataBRFull(dStr) {
  if (!dStr) return '';
  const iso = dataISO(dStr);
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dStr;
}

function obterIntervaloFiltro(filtro, dataRef = null, customDe = null, customAte = null) {
  const ref = dataISO(dataRef);
  const dataRefObj = new Date(ref + 'T12:00:00');

  let de = ref;
  let ate = ref;

  switch (filtro) {
    case 'hoje':
      de = ref;
      ate = ref;
      break;
    case '7d':
      de = addDias(ref, -6);
      ate = ref;
      break;
    case '15d':
      de = addDias(ref, -14);
      ate = ref;
      break;
    case '30d':
      de = addDias(ref, -29);
      ate = ref;
      break;
    case 'mes': {
      const ano = dataRefObj.getFullYear();
      const mes = String(dataRefObj.getMonth() + 1).padStart(2, '0');
      de = `${ano}-${mes}-01`;
      const ultimoDia = new Date(ano, dataRefObj.getMonth() + 1, 0).getDate();
      ate = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
      break;
    }
    case 'mes_anterior': {
      const dataAnt = new Date(dataRefObj.getFullYear(), dataRefObj.getMonth() - 1, 1);
      const ano = dataAnt.getFullYear();
      const mes = String(dataAnt.getMonth() + 1).padStart(2, '0');
      de = `${ano}-${mes}-01`;
      const ultimoDia = new Date(ano, dataAnt.getMonth() + 1, 0).getDate();
      ate = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
      break;
    }
    case 'personalizado':
    case 'custom':
      de = customDe ? dataISO(customDe) : addDias(ref, -29);
      ate = customAte ? dataISO(customAte) : ref;
      break;
    default:
      de = addDias(ref, -29);
      ate = ref;
      break;
  }

  return { de, ate, ref, filtro };
}

module.exports = {
  FUSO_HORARIO_PADRAO,
  obterAgoraSP,
  formatarMoeda,
  formatarMoedaCurta,
  dataISO,
  addDias,
  diasEntre,
  formatarDataBR,
  formatarDataBRFull,
  obterIntervaloFiltro
};
