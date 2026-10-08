/** Palabras de un nombre normalizado (mayúsculas, sin tildes ni espacios dobles). */
function nameWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Palabras iguales, una prefijo de la otra o con un solo error de digitación. */
function similarWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) {
    return Math.min(a.length, b.length) >= 3;
  }
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) {
    return false;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * El ERP de Inversiones (Carnes Frías) solo trae el nombre del vendedor
 * ("APELLIDOS NOMBRES"): se cruza con el de la app por palabras.
 */
export function sameSellerName(appName: string, erpName: string): boolean {
  const app = nameWords(appName);
  const erp = nameWords(erpName);
  return app.length > 0 && app.every((w) => erp.some((e) => similarWord(w, e)));
}
