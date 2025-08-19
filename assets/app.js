// ===================== Utilidades =====================
const statusChips = document.getElementById('chipStatus');
const summary = document.getElementById('summary');
const tBody = document.querySelector('#tbl tbody');
const fmt = (s) => (s||'').toString();

function slugify(str) {
  return fmt(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;
  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[bn][an];
}

function simScore(a, b) {
  a = slugify(a); b = slugify(b);
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return Math.round(100 * (1 - d / Math.max(a.length, b.length)));
}

function tokenIncludes(needle, hay) {
  const n = slugify(needle).split(' ');
  const h = slugify(hay);
  return n.every(tok => h.includes(tok));
}

function addChip(text) {
  const s = document.createElement('span');
  s.className = 'chip';
  s.textContent = text;
  statusChips.appendChild(s);
}

function resetChips() { statusChips.innerHTML = ''; }

function addRow(item) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><span class="pill source-${item.source}">${item.source}</span></td>
    <td>${escapeHtml(item.name||'')}</td>
    <td>${escapeHtml(item.aka||'')}</td>
    <td>${escapeHtml(item.program||'')}</td>
    <td>${escapeHtml(item.ref||'')}</td>
    <td class="score">${item.matchTxt}</td>
  `;
  tBody.appendChild(tr);
}

function clearTable() { tBody.innerHTML = ''; summary.innerHTML = ''; }

function escapeHtml(str) {
  return fmt(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

// ===================== Almacenamiento en memoria =====================
const store = {
  ONU: [],
  OFAC: [],
  UE: [],
  loaded: { ONU:false, OFAC:false, UE:false }
};

function updateSummary() {
  summary.innerHTML = '';
  const total = store.ONU.length + store.OFAC.length + store.UE.length;
  const chips = [
    `ONU: ${store.ONU.length}`,
    `OFAC: ${store.OFAC.length}`,
    `UE: ${store.UE.length}`,
    `Total registros: ${total}`
  ];
  chips.forEach(c => { 
    const s = document.createElement('span'); 
    s.className='chip'; 
    s.textContent=c; 
    summary.appendChild(s); 
  });
}

// ===================== Pre-carga de datos =====================
async function preloadData() {
  resetChips();
  addChip('Cargando listas...');
  
  try {
    const onuResponse = await fetch('./data/consolidated.xml');
    if (onuResponse.ok) {
      const xmlText = await onuResponse.text();
      parseONUXML(xmlText);
    } else {
      addChip('ONU: archivo no encontrado');
    }
  } catch(err) {
    addChip('Error: ONU no disponible');
  }

  try {
    const ofacResponse = await fetch('./data/OFAC.csv');
    if (ofacResponse.ok) {
      const csvText = await ofacResponse.text();
      Papa.parse(csvText, { 
        header: true, 
        skipEmptyLines: true, 
        complete: res => parseOFAC(res.data) 
      });
    } else {
      addChip('OFAC: archivo no encontrado');
    }
  } catch(err) {
    addChip('Error: OFAC no disponible');
  }

  try {
    // Intentar cargar UE como XML primero
    const ueResponse = await fetch('./data/eu_sanctions.xml');
    if (ueResponse.ok) {
      const xmlText = await ueResponse.text();
      parseEUXML(xmlText);  // Usar nuevo parser XML
    } else {
      // Fallback a CSV si XML no existe
      const ueCsvResponse = await fetch('./data/eu_sanctions.csv');
      if (ueCsvResponse.ok) {
        const csvText = await ueCsvResponse.text();
        Papa.parse(csvText, { 
          header: true, 
          skipEmptyLines: true, 
          complete: res => parseEU(res.data) 
        });
      } else {
        addChip('UE: archivo no encontrado');
      }
    }
  } catch(err) {
    addChip('Error: UE no disponible');
  }

  updateSummary();
  
  // Mensaje final
  setTimeout(() => {
    const total = store.ONU.length + store.OFAC.length + store.UE.length;
    if (total > 0) {
      resetChips();
      addChip(`Listas cargadas: ${total} registros totales`);
    } else {
      resetChips();
      addChip('⚠️ No se cargaron archivos de datos');
    }
  }, 1000);
}

// ===================== Parsers =====================
function parseONUXML(xmlText) {
  try {
    const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
    const err = dom.querySelector('parsererror');
    if (err) throw new Error('XML inválido');
    const items = [];
    
    dom.querySelectorAll('INDIVIDUAL, ENTITY').forEach(node => {
      const names = Array.from(node.querySelectorAll('NAME, FIRST_NAME, SECOND_NAME, THIRD_NAME, FOURTH_NAME, NAME_ORIGINAL_SCRIPT'))
        .map(n => n.textContent).filter(Boolean);
      const aka = Array.from(node.querySelectorAll('ALIAS_NAME, ALIAS')).map(n => n.textContent).filter(Boolean).join(' | ');
      const ref = node.querySelector('REFERENCE_NUMBER, DATAID, UNIQUE_ID');
      const program = Array.from(node.querySelectorAll('UN_LIST_TYPE, LIST_TYPE, COMMENTS1, REMARKS'))
        .map(n => n.textContent).filter(Boolean).join(' | ');
      const name = names.join(' ').trim();
      if (name) items.push({ source:'ONU', name, aka, program, ref: ref? ref.textContent : '' });
    });
    
    store.ONU = items; 
    store.loaded.ONU = true; 
    updateSummary();
    console.log(`ONU: ${items.length} registros cargados`);
  } catch(e) {
    console.error('Error parseando ONU:', e);
    addChip('Error leyendo ONU');
  }
}


// ===================== Parser UE XML =====================
function parseEUXML(xmlText) {
  try {
    const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
    const err = dom.querySelector('parsererror');
    if (err) throw new Error('XML inválido');
    const items = [];
    
    // Adaptarse a diferentes estructuras XML de la UE
    const entities = dom.querySelectorAll('sanctionEntity, entity, subject, person, organisation');
    
    entities.forEach(node => {
      // Buscar nombres en diferentes campos posibles
      const nameFields = [
        'wholeName', 'name', 'nameAlias', 'firstName', 'lastName', 
        'organisationName', 'entityName', 'subjectName'
      ];
      
      let name = '';
      for (const field of nameFields) {
        const nameNode = node.querySelector(field) || 
                         node.querySelector(field.toLowerCase()) ||
                         node.querySelector(field.toUpperCase());
        if (nameNode && nameNode.textContent.trim()) {
          name = nameNode.textContent.trim();
          break;
        }
      }
      
      // Si no encontramos nombre en subcampos, buscar en atributos
      if (!name) {
        name = node.getAttribute('name') || 
               node.getAttribute('wholeName') || 
               node.textContent?.trim() || '';
      }
      
      // Buscar alias/nombres alternativos
      const aliasNodes = node.querySelectorAll('nameAlias, alias, aka, alternativeName');
      const aka = Array.from(aliasNodes)
        .map(n => n.textContent || n.getAttribute('name') || '')
        .filter(Boolean)
        .join(' | ');
      
      // Buscar programa/régimen
      const programNodes = node.querySelectorAll('programme, regime, regulation, sanctionsProgramme, remark');
      const program = Array.from(programNodes)
        .map(n => n.textContent || n.getAttribute('value') || '')
        .filter(Boolean)
        .join(' | ');
      
      // Buscar referencia/ID
      const refNodes = node.querySelectorAll('euReferenceNumber, referenceNumber, logicalId, euId, id');
      const ref = refNodes.length > 0 ? 
        (refNodes[0].textContent || refNodes[0].getAttribute('value') || '') :
        (node.getAttribute('euReferenceNumber') || node.getAttribute('id') || '');
      
      if (name) {
        items.push({ 
          source: 'UE', 
          name, 
          aka, 
          program, 
          ref 
        });
      }
    });
    
    store.UE = items; 
    store.loaded.UE = true; 
    updateSummary();
    console.log(`UE: ${items.length} registros cargados desde XML`);
  } catch(e) {
    console.error('Error parseando UE XML:', e);
    addChip('Error leyendo UE XML');
  }
}

function parseOFAC(rows) {
  const items = [];
  for (const r of rows) {
    const name = r.name || r.sdnName || r.SDN_NAME || r['SDN Name'] || r['sdnName'] || r['Entity Name'] || r['name'];
    const aka = r['akaList'] || r['AKA'] || r['aka'] || r['AKA List'] || r['akaList.sdnEntry.aka'] || '';
    const program = r.program || r['Program'] || r['programList'] || r['Program List'] || '';
    const ref = r['uid'] || r['ent_num'] || r['ID'] || r['sdnId'] || '';
    if (name) items.push({ source:'OFAC', name, aka, program, ref });
  }
  store.OFAC = items; 
  store.loaded.OFAC = true; 
  updateSummary();
  console.log(`OFAC: ${items.length} registros cargados`);
}

function parseEU(rows) {
  const items = [];
  for (const r of rows) {
    const name = r.name || r['Name'] || r['Whole Name'] || r['NAME'] || r['logicalId'] || r['subject'] || '';
    const aka = r['Alias'] || r['alias'] || r['Alias Type'] || r['Name Alias'] || '';
    const program = r['Regime'] || r['Programme'] || r['Regulation'] || r['Remark'] || r['reason'] || '';
    const ref = r['EU.IdentificationNumber'] || r['Number'] || r['Reference Number'] || r['Group ID'] || '';
    if (name) items.push({ source:'UE', name, aka, program, ref });
  }
  store.UE = items; 
  store.loaded.UE = true; 
  updateSummary();
  console.log(`UE: ${items.length} registros cargados`);
}

// ===================== Búsqueda =====================
const btnSearch = document.getElementById('btnSearch');
const btnClear = document.getElementById('btnClear');

btnClear.addEventListener('click', () => {
  document.getElementById('inpDoc').value = '';
  document.getElementById('inpName').value = '';
  document.getElementById('inpLast').value = '';
  clearTable();
});

btnSearch.addEventListener('click', () => {
  clearTable(); 
  const doc = document.getElementById('inpDoc').value.trim();
  const name = document.getElementById('inpName').value.trim();
  const last = document.getElementById('inpLast').value.trim();
  const mode = document.getElementById('selMode').value;
  const queryName = (name + ' ' + last).trim();

  if (!queryName && !doc) {
    resetChips();
    addChip('Ingresa al menos un nombre o documento');
    return;
  }

  const sources = [store.ONU, store.OFAC, store.UE];
  const all = sources.flat();

  let results = [];
  for (const it of all) {
    let score = 0; let matchTxt = '';

    if (queryName) {
      if (mode === 'strict') {
        if (slugify(it.name) === slugify(queryName)) { 
          score = 100; matchTxt = 'Coincidencia exacta por nombre'; 
        }
      } else if (mode === 'smart') {
        if (tokenIncludes(queryName, it.name) || tokenIncludes(it.name, queryName)) {
          score = 95; matchTxt = 'Incluye todos los tokens';
        } else {
          const s = simScore(queryName, it.name);
          if (s >= 85) { score = s; matchTxt = `Similitud ${s}%` }
        }
      } else if (mode === 'fuzzy') {
        const s = simScore(queryName, it.name); 
        score = s; matchTxt = `Similitud ${s}%`;
      }
    }

    if (doc) {
      const inAka = slugify(it.aka).includes(slugify(doc));
      const inRef = slugify(it.ref).includes(slugify(doc));
      if (inAka || inRef) {
        score = Math.max(score, 97);
        matchTxt = (matchTxt? matchTxt+' + ' : '') + 'posible ID en alias/ref';
      }
    }

    if (score >= 85) {
      results.push({ ...it, score, matchTxt });
    }
  }

  results.sort((a,b) => b.score - a.score);
  
  resetChips();
  if (results.length === 0) {
    addChip('Sin coincidencias relevantes (≥85). Revisa modo de búsqueda.');
  } else {
    results.slice(0, 300).forEach(addRow);
    addChip(`Coincidencias: ${results.length}`);
  }
});

// ===================== Inicialización =====================
document.addEventListener('DOMContentLoaded', preloadData);
