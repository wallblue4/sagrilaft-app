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
    console.log('📡 ONU Response:', onuResponse.status, onuResponse.statusText);
    if (onuResponse.ok) {
      const xmlText = await onuResponse.text();
      console.log('📥 ONU descargado, parseando...');
      parseONUXML(xmlText);
    } else {
      console.error('❌ Error HTTP ONU:', onuResponse.status);
      addChip('ONU: archivo no encontrado');
    }
  } catch(err) {
    console.error('❌ Error cargando ONU:', err);
    addChip('Error: ONU no disponible');
  }

  try {
    console.log('🌐 Intentando cargar OFAC...');
    const ofacResponse = await fetch('./data/OFAC.csv');
    console.log('📡 OFAC Response:', ofacResponse.status, ofacResponse.statusText);
    if (ofacResponse.ok) {
      const csvText = await ofacResponse.text();
      console.log('📥 OFAC descargado, tamaño:', csvText.length);
      console.log('📄 OFAC primeras 500 chars:', csvText.substring(0, 500));
      
      // Detectar si tiene headers
      const firstLine = csvText.split('\n')[0];
      const hasHeaders = firstLine.toLowerCase().includes('name') || 
                        firstLine.toLowerCase().includes('sdn') ||
                        firstLine.toLowerCase().includes('entity');
      
      console.log('🔍 OFAC tiene headers:', hasHeaders);
      
      if (!hasHeaders) {
        // Parsear sin headers usando posiciones fijas
        parseOFACWithoutHeaders(csvText);
      } else {
        // Parsear con headers normal
        Papa.parse(csvText, { 
          header: true, 
          skipEmptyLines: true, 
          complete: res => {
            console.log('📊 Papa Parse resultado:', {
              data: res.data?.length || 0,
              errors: res.errors?.length || 0,
              meta: res.meta
            });
            parseOFAC(res.data || []);
          }
        });
      }
    } else {
      console.error('❌ Error HTTP OFAC:', ofacResponse.status);
      addChip('OFAC: archivo no encontrado');
    }
  } catch(err) {
    console.error('❌ Error cargando OFAC:', err);
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
// ===================== Parser ONU XML Súper Robusto =====================
function parseONUXML(xmlText) {
  console.log('📄 Parseando ONU XML, tamaño:', xmlText.length);
  
  try {
    // Intentar múltiples métodos de limpieza
    let cleanXML = xmlText;
    
    // Método 1: Limpiar caracteres de control
    cleanXML = cleanXML.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
    
    // Método 2: Escapar caracteres problemáticos
    cleanXML = cleanXML.replace(/&(?![a-zA-Z0-9#]{1,8};)/g, '&amp;');
    
    // Método 3: Remover caracteres Unicode problemáticos
    cleanXML = cleanXML.replace(/[\uFFFE\uFFFF]/g, '');
    
    console.log('🧹 XML limpiado, tamaño:', cleanXML.length);
    
    // Intentar parsear
    const dom = new DOMParser().parseFromString(cleanXML, 'application/xml');
    const err = dom.querySelector('parsererror');
    
    if (err) {
      console.warn('⚠️ Error en DOM Parser, usando método regex:', err.textContent);
      return parseONUWithRegex(xmlText);
    }
    
    return parseONUWithDOM(dom);
    
  } catch(e) {
    console.error('❌ Error general ONU:', e);
    console.log('🔄 Fallback a método regex...');
    return parseONUWithRegex(xmlText);
  }
}

function parseONUWithDOM(dom) {
  const items = [];
  const individuals = dom.querySelectorAll('INDIVIDUAL');
  const entities = dom.querySelectorAll('ENTITY');
  
  console.log(`🔍 ONU DOM: ${individuals.length} individuos, ${entities.length} entidades`);
  
  dom.querySelectorAll('INDIVIDUAL, ENTITY').forEach((node, index) => {
    try {
      const names = Array.from(node.querySelectorAll('NAME, FIRST_NAME, SECOND_NAME, THIRD_NAME, FOURTH_NAME'))
        .map(n => n.textContent?.trim()).filter(Boolean);
      
      const name = names.join(' ').trim();
      if (!name) return;
      
      const aka = Array.from(node.querySelectorAll('ALIAS_NAME, ALIAS'))
        .map(n => n.textContent?.trim()).filter(Boolean).join(' | ');
      
      const ref = node.querySelector('REFERENCE_NUMBER, DATAID, UNIQUE_ID')?.textContent?.trim() || '';
      
      const program = Array.from(node.querySelectorAll('UN_LIST_TYPE, LIST_TYPE'))
        .map(n => n.textContent?.trim()).filter(Boolean).join(' | ');
      
      items.push({ source: 'ONU', name, aka, program, ref });
      
      if (index < 3) console.log('➕ ONU DOM:', name);
    } catch (nodeError) {
      console.warn('⚠️ Error nodo ONU:', nodeError);
    }
  });
  
  store.ONU = items;
  store.loaded.ONU = true;
  updateSummary();
  console.log(`✅ ONU DOM: ${items.length} registros`);
  return items;
}

function parseONUWithRegex(xmlText) {
  console.log('🔄 Parseando ONU con regex...');
  const items = [];
  
  try {
    // Regex para extraer bloques INDIVIDUAL y ENTITY
    const blockRegex = /<(INDIVIDUAL|ENTITY)[^>]*>([\s\S]*?)<\/\1>/gi;
    const blocks = Array.from(xmlText.matchAll(blockRegex));
    
    console.log(`🔍 ONU Regex: encontrados ${blocks.length} bloques`);
    
    blocks.forEach((block, index) => {
      try {
        const content = block[2];
        
        // Extraer nombres
        const names = [];
        
        // Buscar diferentes tipos de nombres
        const namePatterns = [
          /<FIRST_NAME[^>]*>(.*?)<\/FIRST_NAME>/i,
          /<SECOND_NAME[^>]*>(.*?)<\/SECOND_NAME>/i,
          /<THIRD_NAME[^>]*>(.*?)<\/THIRD_NAME>/i,
          /<NAME[^>]*>(.*?)<\/NAME>/i
        ];
        
        namePatterns.forEach(pattern => {
          const match = content.match(pattern);
          if (match && match[1]?.trim()) {
            names.push(match[1].trim());
          }
        });
        
        const name = names.join(' ').trim();
        if (!name) return;
        
        // Extraer referencia
        const refMatch = content.match(/<REFERENCE_NUMBER[^>]*>(.*?)<\/REFERENCE_NUMBER>/i) ||
                        content.match(/<DATAID[^>]*>(.*?)<\/DATAID>/i);
        const ref = refMatch ? refMatch[1].trim() : '';
        
        // Extraer programa
        const programMatch = content.match(/<UN_LIST_TYPE[^>]*>(.*?)<\/UN_LIST_TYPE>/i);
        const program = programMatch ? programMatch[1].trim() : '';
        
        items.push({ source: 'ONU', name, aka: '', program, ref });
        
        if (index < 3) console.log('➕ ONU Regex:', name);
      } catch (blockError) {
        console.warn('⚠️ Error bloque ONU:', blockError);
      }
    });
    
    store.ONU = items;
    store.loaded.ONU = true;
    updateSummary();
    console.log(`✅ ONU Regex: ${items.length} registros`);
    return items;
    
  } catch (e) {
    console.error('❌ Error regex ONU:', e);
    addChip('Error: ONU no pudo procesarse');
    return [];
  }
}

function parseOFACWithoutHeaders(csvText) {
  console.log('📄 Parseando OFAC CSV sin headers...');
  const items = [];
  
  try {
    Papa.parse(csvText, {
      header: false, // Sin headers
      skipEmptyLines: true,
      complete: res => {
        console.log('📊 OFAC filas procesadas:', res.data?.length || 0);
        
        if (!res.data || res.data.length === 0) {
          console.warn('⚠️ OFAC: No hay datos');
          return;
        }
        
        // Log de estructura para entender formato
        console.log('🔍 OFAC primera fila:', res.data[0]);
        console.log('🔍 OFAC estructura detectada:', res.data[0]?.length, 'columnas');
        
        res.data.forEach((row, index) => {
          try {
            if (!row || row.length < 2) return;
            
            // Formato típico OFAC: [id, name, type, program, ...]
            // Basado en tu ejemplo: 9639,"HANIYA, Ismail Abdul Salah","individual","NS-PLC"
            
            let name = '';
            let program = '';
            let ref = '';
            let type = '';
            
            // Columna 0: ID/Reference
            if (row[0]) ref = row[0].toString().trim();
            
            // Columna 1: Name (más probable)
            if (row[1]) name = row[1].toString().trim().replace(/"/g, '');
            
            // Columna 2: Type
            if (row[2]) type = row[2].toString().trim().replace(/"/g, '');
            
            // Columna 3: Program
            if (row[3]) program = row[3].toString().trim().replace(/"/g, '');
            
            // Validar que tenemos datos mínimos
            if (!name || name === '-0-' || name.length < 2) return;
            
            items.push({ 
              source: 'OFAC', 
              name, 
              aka: '', 
              program: program || type, 
              ref 
            });
            
            if (index < 5) console.log(`➕ OFAC sin headers: ${name} (${program})`);
            
          } catch (rowError) {
            console.warn('⚠️ Error procesando fila OFAC:', rowError);
          }
        });
        
        store.OFAC = items;
        store.loaded.OFAC = true;
        updateSummary();
        console.log(`✅ OFAC sin headers: ${items.length} registros cargados`);
      },
      error: err => {
        console.error('❌ Error Papa Parse OFAC:', err);
        addChip('Error parseando OFAC CSV');
      }
    });
    
  } catch (e) {
    console.error('❌ Error general OFAC sin headers:', e);
    addChip('Error: OFAC no pudo procesarse');
  }
}



// ===================== Parser UE XML Súper Robusto =====================
function parseEUXML(xmlText) {
  console.log('📄 Parseando UE XML, tamaño:', xmlText.length);
  
  try {
    // Limpiar XML
    let cleanXML = xmlText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
      .replace(/&(?![a-zA-Z0-9#]{1,8};)/g, '&amp;')
      .replace(/[\uFFFE\uFFFF]/g, '');
    
    console.log('🧹 UE XML limpiado, tamaño:', cleanXML.length);
    
    const dom = new DOMParser().parseFromString(cleanXML, 'application/xml');
    const err = dom.querySelector('parsererror');
    
    if (err) {
      console.warn('⚠️ Error en DOM Parser UE, usando regex:', err.textContent);
      return parseEUWithRegex(xmlText);
    }
    
    return parseEUWithDOM(dom);
    
  } catch(e) {
    console.error('❌ Error general UE:', e);
    return parseEUWithRegex(xmlText);
  }
}

function parseEUWithDOM(dom) {
  const items = [];
  const entities = dom.querySelectorAll('sanctionEntity, entity, subject, person, organisation');
  
  console.log(`🔍 UE DOM: ${entities.length} entidades`);
  
  entities.forEach((node, index) => {
    try {
      // Buscar nombre en múltiples campos
      const nameSelectors = [
        'wholeName', 'name', 'formattedFullName', 'firstName', 'lastName',
        'organisationName', 'entityName', 'subjectName'
      ];
      
      let name = '';
      for (const selector of nameSelectors) {
        const nameNode = node.querySelector(selector);
        if (nameNode?.textContent?.trim()) {
          name = nameNode.textContent.trim();
          break;
        }
      }
      
      if (!name) name = node.getAttribute('name') || '';
      if (!name) return;
      
      // Buscar otros campos
      const aka = Array.from(node.querySelectorAll('nameAlias, alias'))
        .map(n => n.textContent?.trim()).filter(Boolean).join(' | ');
      
      const program = node.querySelector('programme')?.textContent?.trim() || '';
      const ref = node.querySelector('euReferenceNumber, logicalId')?.textContent?.trim() || 
                 node.getAttribute('euReferenceNumber') || '';
      
      items.push({ source: 'UE', name, aka, program, ref });
      
      if (index < 3) console.log('➕ UE DOM:', name);
    } catch (nodeError) {
      console.warn('⚠️ Error nodo UE:', nodeError);
    }
  });
  
  store.UE = items;
  store.loaded.UE = true;
  updateSummary();
  console.log(`✅ UE DOM: ${items.length} registros`);
  return items;
}

// ===================== Parser UE Regex Mejorado =====================
function parseEUWithRegex(xmlText) {
  console.log('🔄 Parseando UE con regex...');
  const items = [];
  
  try {
    // Intentar múltiples patrones de entidades
    const patterns = [
      /<sanctionEntity[^>]*>([\s\S]*?)<\/sanctionEntity>/gi,
      /<entity[^>]*>([\s\S]*?)<\/entity>/gi,
      /<subject[^>]*>([\s\S]*?)<\/subject>/gi,
      /<person[^>]*>([\s\S]*?)<\/person>/gi,
      /<organisation[^>]*>([\s\S]*?)<\/organisation>/gi
    ];
    
    let totalEntities = 0;
    
    patterns.forEach((pattern, patternIndex) => {
      const entities = Array.from(xmlText.matchAll(pattern));
      console.log(`🔍 UE Patrón ${patternIndex + 1}: ${entities.length} entidades`);
      totalEntities += entities.length;
      
      entities.forEach((entity, index) => {
        try {
          const content = entity[1];
          
          // Buscar nombre con múltiples patrones
          const namePatterns = [
            /<wholeName[^>]*>(.*?)<\/wholeName>/i,
            /<formattedFullName[^>]*>(.*?)<\/formattedFullName>/i,
            /<name[^>]*>(.*?)<\/name>/i,
            /<firstName[^>]*>(.*?)<\/firstName>/i,
            /<lastName[^>]*>(.*?)<\/lastName>/i,
            /<formattedFirstName[^>]*>(.*?)<\/formattedFirstName>/i,
            /<formattedLastName[^>]*>(.*?)<\/formattedLastName>/i
          ];
          
          let name = '';
          let foundNames = [];
          
          namePatterns.forEach(pattern => {
            const match = content.match(pattern);
            if (match && match[1]?.trim()) {
              foundNames.push(match[1].trim());
            }
          });
          
          // Combinar nombres encontrados
          if (foundNames.length > 0) {
            name = foundNames.join(' ').trim();
            // Limpiar nombre de caracteres problemáticos
            name = name.replace(/[^\w\s\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
          }
          
          if (!name) return;
          
          // Extraer otros campos
          const programMatch = content.match(/<programme[^>]*>(.*?)<\/programme>/i) ||
                              content.match(/<regulation[^>]*>(.*?)<\/regulation>/i) ||
                              content.match(/<regime[^>]*>(.*?)<\/regime>/i);
          const program = programMatch ? programMatch[1].trim() : '';
          
          const refMatch = content.match(/<euReferenceNumber[^>]*>(.*?)<\/euReferenceNumber>/i) ||
                          content.match(/<referenceNumber[^>]*>(.*?)<\/referenceNumber>/i) ||
                          content.match(/<logicalId[^>]*>(.*?)<\/logicalId>/i);
          const ref = refMatch ? refMatch[1].trim() : '';
          
          items.push({ source: 'UE', name, aka: '', program, ref });
          
          if (index < 3) console.log(`➕ UE Regex (patrón ${patternIndex + 1}):`, name);
        } catch (blockError) {
          console.warn('⚠️ Error bloque UE:', blockError);
        }
      });
    });
    
    console.log(`🔍 UE Total encontradas: ${totalEntities} entidades`);
    
    store.UE = items;
    store.loaded.UE = true;
    updateSummary();
    console.log(`✅ UE Regex: ${items.length} registros`);
    return items;
    
  } catch (e) {
    console.error('❌ Error regex UE:', e);
    addChip('Error: UE no pudo procesarse');
    return [];
  }
}

// ===================== Parser UE XML =====================
// function parseEUXML(xmlText) {
//   try {
//     const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
//     const err = dom.querySelector('parsererror');
//     if (err) throw new Error('XML inválido');
//     const items = [];
    
//     // Adaptarse a diferentes estructuras XML de la UE
//     const entities = dom.querySelectorAll('sanctionEntity, entity, subject, person, organisation');
    
//     entities.forEach(node => {
//       // Buscar nombres en diferentes campos posibles
//       const nameFields = [
//         'wholeName', 'name', 'nameAlias', 'firstName', 'lastName', 
//         'organisationName', 'entityName', 'subjectName'
//       ];
      
//       let name = '';
//       for (const field of nameFields) {
//         const nameNode = node.querySelector(field) || 
//                          node.querySelector(field.toLowerCase()) ||
//                          node.querySelector(field.toUpperCase());
//         if (nameNode && nameNode.textContent.trim()) {
//           name = nameNode.textContent.trim();
//           break;
//         }
//       }
      
//       // Si no encontramos nombre en subcampos, buscar en atributos
//       if (!name) {
//         name = node.getAttribute('name') || 
//                node.getAttribute('wholeName') || 
//                node.textContent?.trim() || '';
//       }
      
//       // Buscar alias/nombres alternativos
//       const aliasNodes = node.querySelectorAll('nameAlias, alias, aka, alternativeName');
//       const aka = Array.from(aliasNodes)
//         .map(n => n.textContent || n.getAttribute('name') || '')
//         .filter(Boolean)
//         .join(' | ');
      
//       // Buscar programa/régimen
//       const programNodes = node.querySelectorAll('programme, regime, regulation, sanctionsProgramme, remark');
//       const program = Array.from(programNodes)
//         .map(n => n.textContent || n.getAttribute('value') || '')
//         .filter(Boolean)
//         .join(' | ');
      
//       // Buscar referencia/ID
//       const refNodes = node.querySelectorAll('euReferenceNumber, referenceNumber, logicalId, euId, id');
//       const ref = refNodes.length > 0 ? 
//         (refNodes[0].textContent || refNodes[0].getAttribute('value') || '') :
//         (node.getAttribute('euReferenceNumber') || node.getAttribute('id') || '');
      
//       if (name) {
//         items.push({ 
//           source: 'UE', 
//           name, 
//           aka, 
//           program, 
//           ref 
//         });
//       }
//     });
    
//     store.UE = items; 
//     store.loaded.UE = true; 
//     updateSummary();
//     console.log(`UE: ${items.length} registros cargados desde XML`);
//   } catch(e) {
//     console.error('Error parseando UE XML:', e);
//     addChip('Error leyendo UE XML');
//   }
// }

// ===================== Parser OFAC Mejorado =====================
function parseOFAC(rows) {
  console.log(`📄 Parseando OFAC CSV, ${rows.length} filas`);
  const items = [];
  
  if (!rows || rows.length === 0) {
    console.warn('⚠️ OFAC: No hay filas para procesar');
    addChip('OFAC: archivo CSV vacío');
    return;
  }
  
  // Log de las primeras filas para debugging
  console.log('🔍 OFAC primeras 3 filas:', rows.slice(0, 3));
  
  // Detectar nombres de columnas
  const firstRow = rows[0];
  const possibleNameFields = Object.keys(firstRow).filter(key => 
    key.toLowerCase().includes('name') || 
    key.toLowerCase().includes('sdn')
  );
  
  console.log('🔍 OFAC campos de nombre detectados:', possibleNameFields);
  
  for (const r of rows) {
    try {
      // Buscar nombre en múltiples campos posibles
      const nameFields = [
        'name', 'sdnName', 'SDN_NAME', 'SDN Name', 'sdnName', 
        'Entity Name', 'entityName', 'fullName', 'lastName', 'firstName'
      ];
      
      let name = '';
      for (const field of nameFields) {
        if (r[field] && r[field].trim()) {
          name = r[field].trim();
          break;
        }
      }
      
      // Si no encontramos nombre, usar el primer campo que contenga algo
      if (!name) {
        for (const [key, value] of Object.entries(r)) {
          if (value && typeof value === 'string' && value.trim() && 
              key.toLowerCase().includes('name')) {
            name = value.trim();
            break;
          }
        }
      }
      
      if (!name) continue;
      
      // Buscar otros campos
      const akaFields = ['akaList', 'AKA', 'aka', 'AKA List', 'aliases', 'alias'];
      let aka = '';
      for (const field of akaFields) {
        if (r[field] && r[field].trim()) {
          aka = r[field].trim();
          break;
        }
      }
      
      const programFields = ['program', 'Program', 'programList', 'Program List', 'sanctions'];
      let program = '';
      for (const field of programFields) {
        if (r[field] && r[field].trim()) {
          program = r[field].trim();
          break;
        }
      }
      
      const refFields = ['uid', 'ent_num', 'ID', 'sdnId', 'id', 'uniqueID'];
      let ref = '';
      for (const field of refFields) {
        if (r[field] && r[field].toString().trim()) {
          ref = r[field].toString().trim();
          break;
        }
      }
      
      items.push({ source: 'OFAC', name, aka, program, ref });
      
    } catch (rowError) {
      console.warn('⚠️ Error procesando fila OFAC:', rowError);
    }
  }
  
  store.OFAC = items; 
  store.loaded.OFAC = true; 
  updateSummary();
  console.log(`✅ OFAC: ${items.length} registros cargados`);
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
