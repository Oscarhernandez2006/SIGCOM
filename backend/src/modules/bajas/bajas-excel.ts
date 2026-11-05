import ExcelJS from 'exceljs';
import { Baja } from './entities/baja.entity';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const COLOR = {
  green: 'FF168A55',
  greenDark: 'FF126B43',
  greenTint: 'FFE8F5EE',
  red: 'FFD9555F',
  redTint: 'FFFFF0F0',
  blue: 'FF3975AD',
  blueTint: 'FFEDF4FB',
  amber: 'FFE5A12A',
  amberTint: 'FFFFF7E8',
  ink: 'FF1C2938',
  muted: 'FF718096',
  border: 'FFE3EAF0',
  background: 'FFF4F7FA',
  white: 'FFFFFFFF',
  stripe: 'FFF7F9FB',
};

const FONT = 'Arial';
const HELPER_ROWS = 1000;

function styleMergedCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  value: ExcelJS.CellValue,
  options: {
    font: Partial<ExcelJS.Font>;
    fill: string;
    alignment?: Partial<ExcelJS.Alignment>;
    numberFormat?: string;
  },
): void {
  if (startCol !== endCol) sheet.mergeCells(row, startCol, row, endCol);
  const cell = sheet.getCell(row, startCol);
  cell.value = value;
  cell.font = { name: FONT, ...options.font };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: options.fill },
  };
  cell.alignment = {
    vertical: 'middle',
    ...options.alignment,
  };
  if (options.numberFormat) cell.numFmt = options.numberFormat;

  for (let col = startCol; col <= endCol; col += 1) {
    sheet.getCell(row, col).border = {
      top: { style: 'thin', color: { argb: COLOR.border } },
      bottom: { style: 'thin', color: { argb: COLOR.border } },
      left: { style: 'thin', color: { argb: COLOR.border } },
      right: { style: 'thin', color: { argb: COLOR.border } },
    };
  }
}

function stylePanelTitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  title: string,
): void {
  styleMergedCell(sheet, row, startCol, endCol, title, {
    font: { bold: true, size: 12, color: { argb: COLOR.ink } },
    fill: COLOR.white,
    alignment: { horizontal: 'left', indent: 1 },
  });
  sheet.getRow(row).height = 29;
}

function styleColumnHeader(sheet: ExcelJS.Worksheet, row: number): void {
  sheet.getRow(row).height = 23;
  sheet.getRow(row).eachCell((cell) => {
    cell.font = {
      name: FONT,
      bold: true,
      size: 9,
      color: { argb: COLOR.muted },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR.background },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: COLOR.border } },
    };
  });
}

function formatFormulaRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  firstCol: number,
  lastCol: number,
  background = COLOR.white,
): void {
  sheet.getRow(row).height = 24;
  for (let col = firstCol; col <= lastCol; col += 1) {
    const cell = sheet.getCell(row, col);
    cell.font = { name: FONT, size: 10, color: { argb: COLOR.ink } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: background },
    };
    cell.alignment = { vertical: 'middle' };
    cell.border = {
      bottom: { style: 'hair', color: { argb: COLOR.border } },
    };
  }
}

function setDynamicUniqueHelpers(
  sheet: ExcelJS.Worksheet,
  firstRow: number,
  labelColumn: string,
  valueColumn: string,
  rankColumn: string,
  tableColumn: string,
  bajas: Baja[],
  getLabel: (baja: Baja) => string | null,
): void {
  sheet.getCell(`${labelColumn}1`).value = 'Elemento';
  sheet.getCell(`${valueColumn}1`).value = 'Valor';
  sheet.getCell(`${rankColumn}1`).value = 'Orden';
  const totalsByLabel = new Map<string, number>();
  for (const baja of bajas) {
    const label = getLabel(baja);
    if (label?.trim()) {
      totalsByLabel.set(
        label,
        (totalsByLabel.get(label) ?? 0) + Number(baja.kilos),
      );
    }
  }
  const labels = [...totalsByLabel.keys()];
  for (let offset = 0; offset < HELPER_ROWS; offset += 1) {
    const row = firstRow + offset;
    const previous = row - 1;
    const label = labels[offset];
    const value = label === undefined ? undefined : totalsByLabel.get(label);
    sheet.getCell(`${labelColumn}${row}`).value = {
      formula: `IFERROR(INDEX(RegistrosBajas[${tableColumn}],MATCH(0,INDEX(COUNTIF($${labelColumn}$1:${labelColumn}${previous},RegistrosBajas[${tableColumn}]),0,0),0)),"")`,
      result: label ?? '',
    };
    sheet.getCell(`${valueColumn}${row}`).value = {
      formula: `IF(${labelColumn}${row}="","",SUMIF(RegistrosBajas[${tableColumn}],${labelColumn}${row},RegistrosBajas[Kilos]))`,
      result: value ?? '',
    };
    sheet.getCell(`${rankColumn}${row}`).value = {
      formula: `IF(${labelColumn}${row}="","",${valueColumn}${row}+(${HELPER_ROWS + 1}-ROW())/1000000000)`,
      result:
        value === undefined ? '' : value + (HELPER_ROWS + 1 - row) / 1000000000,
    };
  }
}

function setDashboardHelperFormulas(
  sheet: ExcelJS.Worksheet,
  bajas: Baja[],
): void {
  setDynamicUniqueHelpers(
    sheet,
    2,
    'Y',
    'Z',
    'AA',
    'Producto',
    bajas,
    (baja) => baja.producto,
  );
  setDynamicUniqueHelpers(
    sheet,
    2,
    'AB',
    'AC',
    'AD',
    'Tipo de documento',
    bajas,
    (baja) => baja.tipoDocumento,
  );
  setDynamicUniqueHelpers(
    sheet,
    2,
    'AE',
    'AF',
    'AG',
    'Causal',
    bajas,
    (baja) => baja.causal,
  );
  for (const column of ['Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG']) {
    sheet.getColumn(column).hidden = true;
  }
}

function buildDashboard(sheet: ExcelJS.Worksheet, bajas: Baja[]): void {
  sheet.views = [{ state: 'normal', showGridLines: false, zoomScale: 95 }];
  sheet.properties.defaultRowHeight = 20;
  sheet.columns = [
    ...Array.from({ length: 23 }, (_, index) => ({
      width: index === 5 || index === 11 ? 3 : index === 17 ? 16 : 12,
    })),
    ...Array.from({ length: 9 }, () => ({ width: 12, hidden: true })),
  ];
  for (let row = 1; row <= 55; row += 1) {
    sheet.getRow(row).height = 21;
  }

  sheet.mergeCells('A1:W2');
  sheet.getCell('A1').value = 'SIGCOM  /  INFORME DE BAJAS';
  sheet.getCell('A1').font = {
    name: FONT,
    bold: true,
    size: 20,
    color: { argb: COLOR.white },
  };
  sheet.getCell('A1').alignment = {
    vertical: 'middle',
    horizontal: 'left',
    indent: 1,
  };
  sheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR.greenDark },
  };
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 22;
  sheet.mergeCells('A3:W3');
  sheet.getCell('A3').value =
    'Resumen ejecutivo de bajas y mermas · Los indicadores se recalculan al editar la tabla de Datos.';
  sheet.getCell('A3').font = {
    name: FONT,
    size: 10,
    color: { argb: COLOR.muted },
  };
  sheet.getCell('A3').alignment = { vertical: 'middle' };
  sheet.getRow(3).height = 25;

  const cards = [
    {
      cols: [1, 5],
      label: 'TOTAL BAJAS  ·  KG',
      formula: 'SUM(RegistrosBajas[Kilos])',
      format: '#,##0.00',
      fill: COLOR.greenTint,
      accent: COLOR.green,
    },
    {
      cols: [7, 11],
      label: 'DONACIONES',
      formula:
        'SUMIF(RegistrosBajas[Causal],"*DONACION*",RegistrosBajas[Kilos])',
      format: '#,##0.00',
      fill: COLOR.greenTint,
      accent: COLOR.green,
    },
    {
      cols: [13, 17],
      label: 'COSTO TOTAL',
      formula: 'SUM(RegistrosBajas[Costo])',
      format: '$ #,##0.00',
      fill: COLOR.redTint,
      accent: COLOR.red,
    },
    {
      cols: [18, 23],
      label: 'REGISTROS',
      formula: 'COUNTA(RegistrosBajas[Mes])',
      format: '#,##0',
      fill: COLOR.blueTint,
      accent: COLOR.blue,
    },
  ];
  for (const card of cards) {
    const [startCol, endCol] = card.cols;
    styleMergedCell(sheet, 5, startCol, endCol, card.label, {
      font: { bold: true, size: 9, color: { argb: COLOR.muted } },
      fill: card.fill,
      alignment: { horizontal: 'left', indent: 1 },
    });
    styleMergedCell(
      sheet,
      6,
      startCol,
      endCol,
      { formula: card.formula },
      {
        font: { bold: true, size: 20, color: { argb: card.accent } },
        fill: card.fill,
        alignment: { horizontal: 'left', indent: 1 },
        numberFormat: card.format,
      },
    );
    sheet.mergeCells(7, startCol, 7, endCol);
    sheet.getCell(7, startCol).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: card.fill },
    };
    sheet.getCell(7, startCol).border = {
      bottom: { style: 'thin', color: { argb: COLOR.border } },
      left: { style: 'thin', color: { argb: COLOR.border } },
      right: { style: 'thin', color: { argb: COLOR.border } },
    };
  }
  sheet.getRow(5).height = 26;
  sheet.getRow(6).height = 36;
  sheet.getRow(7).height = 8;

  stylePanelTitle(sheet, 9, 1, 5, 'Donaciones y otras bajas');
  stylePanelTitle(sheet, 9, 7, 13, 'Tendencia mensual');
  stylePanelTitle(sheet, 9, 15, 23, 'Productos con más bajas');
  stylePanelTitle(sheet, 17, 15, 23, 'Causales principales');

  const comparisonHeaders = [
    ['A10:B10', 'Categoría'],
    ['C10:C10', 'Reg.'],
    ['D10:D10', 'Kilos'],
    ['E10:E10', 'Distribución'],
  ];
  for (const [range, label] of comparisonHeaders) {
    const cell = sheet.getCell(range.split(':')[0]);
    cell.value = label;
  }
  styleColumnHeader(sheet, 10);

  const comparisonRows = [
    {
      row: 11,
      label: 'Donaciones',
      countFormula: 'COUNTIF(RegistrosBajas[Causal],"*DONACION*")',
      kilosFormula:
        'SUMIF(RegistrosBajas[Causal],"*DONACION*",RegistrosBajas[Kilos])',
      color: COLOR.green,
    },
    {
      row: 12,
      label: 'Otras bajas',
      countFormula:
        'COUNTA(RegistrosBajas[Mes])-COUNTIF(RegistrosBajas[Causal],"*DONACION*")',
      kilosFormula:
        'SUM(RegistrosBajas[Kilos])-SUMIF(RegistrosBajas[Causal],"*DONACION*",RegistrosBajas[Kilos])',
      color: COLOR.amber,
    },
  ];
  for (const [index, item] of comparisonRows.entries()) {
    formatFormulaRow(
      sheet,
      item.row,
      1,
      5,
      index % 2 === 0 ? COLOR.white : COLOR.stripe,
    );
    sheet.mergeCells(`A${item.row}:B${item.row}`);
    sheet.getCell(`A${item.row}`).value = item.label;
    sheet.getCell(`C${item.row}`).value = { formula: item.countFormula };
    sheet.getCell(`D${item.row}`).value = { formula: item.kilosFormula };
    sheet.getCell(`D${item.row}`).numFmt = '#,##0.00';
    sheet.getCell(`D${item.row}`).font = {
      name: FONT,
      bold: true,
      size: 10,
      color: { argb: COLOR.ink },
    };
    sheet.getCell(`E${item.row}`).value = {
      formula: `IFERROR(REPT("■",MAX(1,ROUND(D${item.row}/MAX($D$11:$D$12)*10,0))),"")`,
    };
    sheet.getCell(`E${item.row}`).font = {
      name: FONT,
      bold: true,
      color: { argb: item.color },
    };
  }
  sheet.mergeCells('A14:C14');
  sheet.getCell('A14').value = 'Costo de las donaciones';
  sheet.getCell('D14').value = {
    formula: 'SUMIF(RegistrosBajas[Causal],"*DONACION*",RegistrosBajas[Costo])',
  };
  sheet.getCell('D14').numFmt = '$ #,##0.00';
  sheet.getCell('A15').value = 'Costo de otras bajas';
  sheet.mergeCells('A15:C15');
  sheet.getCell('D15').value = {
    formula:
      'SUM(RegistrosBajas[Costo])-SUMIF(RegistrosBajas[Causal],"*DONACION*",RegistrosBajas[Costo])',
  };
  sheet.getCell('D15').numFmt = '$ #,##0.00';
  for (const row of [14, 15]) {
    sheet.mergeCells(`D${row}:E${row}`);
    sheet.getCell(`A${row}`).font = {
      name: FONT,
      size: 9,
      color: { argb: COLOR.muted },
    };
    sheet.getCell(`D${row}`).font = {
      name: FONT,
      bold: true,
      size: 9,
      color: { argb: COLOR.ink },
    };
    sheet.getRow(row).height = 21;
  }

  sheet.getCell('G10').value = 'Mes';
  sheet.getCell('H10').value = 'Kilos';
  sheet.mergeCells('I10:M10');
  sheet.getCell('I10').value = 'Tendencia';
  sheet.getCell('H10').alignment = {
    horizontal: 'right',
    vertical: 'middle',
  };
  sheet.getCell('I10').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  styleColumnHeader(sheet, 10);
  for (let index = 0; index < 12; index += 1) {
    const row = 11 + index;
    formatFormulaRow(
      sheet,
      row,
      7,
      13,
      index % 2 === 0 ? COLOR.white : COLOR.stripe,
    );
    sheet.getCell(`G${row}`).value = MONTHS[index];
    sheet.getCell(`H${row}`).value = {
      formula: `SUMIF(RegistrosBajas[Mes],G${row},RegistrosBajas[Kilos])`,
    };
    sheet.getCell(`H${row}`).numFmt = '#,##0.00';
    sheet.mergeCells(`I${row}:M${row}`);
    sheet.getCell(`I${row}`).value = {
      formula: `IFERROR(REPT("█",ROUND(H${row}/MAX($H$11:$H$22)*18,0)),"")`,
    };
    sheet.getCell(`I${row}`).font = {
      name: 'Arial',
      size: 11,
      color: { argb: COLOR.green },
    };
  }

  sheet.mergeCells('O10:Q10');
  sheet.getCell('O10').value = 'Producto';
  sheet.getCell('R10').value = 'Kilos';
  sheet.mergeCells('S10:W10');
  sheet.getCell('S10').value = 'Tendencia';
  sheet.getCell('R10').alignment = {
    horizontal: 'right',
    vertical: 'middle',
  };
  sheet.getCell('S10').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  styleColumnHeader(sheet, 10);
  for (let index = 0; index < 5; index += 1) {
    const row = 11 + index;
    formatFormulaRow(
      sheet,
      row,
      15,
      23,
      index % 2 === 0 ? COLOR.white : COLOR.stripe,
    );
    sheet.mergeCells(`O${row}:Q${row}`);
    sheet.getCell(`O${row}`).value = {
      formula: `IFERROR(INDEX($Y$2:$Y$${HELPER_ROWS + 1},MATCH(LARGE($AA$2:$AA$${HELPER_ROWS + 1},ROWS($O$11:O${row})),$AA$2:$AA$${HELPER_ROWS + 1},0)),"")`,
    };
    sheet.getCell(`R${row}`).value = {
      formula: `IF(O${row}="","",SUMIF(RegistrosBajas[Producto],O${row},RegistrosBajas[Kilos]))`,
    };
    sheet.getCell(`R${row}`).numFmt = '#,##0.00';
    sheet.getCell(`R${row}`).alignment = {
      horizontal: 'right',
      vertical: 'middle',
    };
    sheet.mergeCells(`S${row}:W${row}`);
    sheet.getCell(`S${row}`).value = {
      formula: `IFERROR(REPT("█",ROUND(R${row}/MAX($R$11:$R$15)*16,0)),"")`,
    };
    sheet.getCell(`S${row}`).font = {
      name: 'Arial',
      size: 10,
      color: { argb: COLOR.green },
    };
  }

  sheet.mergeCells('O18:Q18');
  sheet.getCell('O18').value = 'Causal';
  sheet.getCell('R18').value = 'Kilos';
  sheet.mergeCells('S18:W18');
  sheet.getCell('S18').value = 'Distribución';
  styleColumnHeader(sheet, 18);
  sheet.getCell('R18').alignment = {
    horizontal: 'right',
    vertical: 'middle',
  };
  sheet.getCell('S18').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  for (let index = 0; index < 5; index += 1) {
    const row = 19 + index;
    formatFormulaRow(
      sheet,
      row,
      15,
      23,
      index % 2 === 0 ? COLOR.white : COLOR.stripe,
    );
    sheet.mergeCells(`O${row}:Q${row}`);
    sheet.getCell(`O${row}`).value = {
      formula: `IFERROR(INDEX($AE$2:$AE$${HELPER_ROWS + 1},MATCH(LARGE($AG$2:$AG$${HELPER_ROWS + 1},ROWS($O$19:O${row})),$AG$2:$AG$${HELPER_ROWS + 1},0)),"")`,
    };
    sheet.getCell(`R${row}`).value = {
      formula: `IF(O${row}="","",SUMIF(RegistrosBajas[Causal],O${row},RegistrosBajas[Kilos]))`,
    };
    sheet.getCell(`R${row}`).numFmt = '#,##0.00';
    sheet.getCell(`R${row}`).alignment = {
      horizontal: 'right',
      vertical: 'middle',
    };
    sheet.mergeCells(`S${row}:W${row}`);
    sheet.getCell(`S${row}`).value = {
      formula: `IFERROR(REPT("█",ROUND(R${row}/MAX($R$19:$R$23)*16,0)),"")`,
    };
    sheet.getCell(`S${row}`).font = {
      name: 'Arial',
      size: 10,
      color: { argb: COLOR.amber },
    };
  }

  stylePanelTitle(sheet, 25, 1, 10, 'Registros por tipo de documento');
  stylePanelTitle(sheet, 25, 12, 23, 'Indicadores adicionales');
  sheet.mergeCells('A26:D26');
  sheet.getCell('A26').value = 'Tipo de documento';
  sheet.getCell('E26').value = 'Registros';
  sheet.getCell('G26').value = 'Kilos';
  sheet.mergeCells('H26:J26');
  sheet.getCell('H26').value = 'Costo';
  styleColumnHeader(sheet, 26);
  sheet.getCell('E26').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  sheet.getCell('F26').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  sheet.getCell('G26').alignment = {
    horizontal: 'right',
    vertical: 'middle',
  };
  for (let index = 0; index < 4; index += 1) {
    const row = 27 + index;
    formatFormulaRow(
      sheet,
      row,
      1,
      10,
      index % 2 === 0 ? COLOR.white : COLOR.stripe,
    );
    sheet.mergeCells(`A${row}:D${row}`);
    sheet.getCell(`A${row}`).value = {
      formula: `IFERROR(INDEX($AB$2:$AB$${HELPER_ROWS + 1},MATCH(LARGE($AD$2:$AD$${HELPER_ROWS + 1},ROWS($A$27:A${row})),$AD$2:$AD$${HELPER_ROWS + 1},0)),"")`,
    };
    sheet.getCell(`E${row}`).value = {
      formula: `IF(A${row}="","",COUNTIF(RegistrosBajas[Tipo de documento],A${row}))`,
    };
    sheet.getCell(`G${row}`).value = {
      formula: `IF(A${row}="","",SUMIF(RegistrosBajas[Tipo de documento],A${row},RegistrosBajas[Kilos]))`,
    };
    sheet.getCell(`G${row}`).numFmt = '#,##0.00';
    sheet.getCell(`G${row}`).alignment = {
      horizontal: 'right',
      vertical: 'middle',
    };
    sheet.mergeCells(`H${row}:J${row}`);
    sheet.getCell(`H${row}`).value = {
      formula: `IF(A${row}="","",SUMIF(RegistrosBajas[Tipo de documento],A${row},RegistrosBajas[Costo]))`,
    };
    sheet.getCell(`H${row}`).numFmt = '$ #,##0.00';
  }

  const indicators: Array<[number, string, string, string, string]> = [
    [
      27,
      'PÉRDIDA REGISTRADA',
      'SUM(RegistrosBajas[Pérdida])',
      '$ #,##0.00',
      COLOR.red,
    ],
    [
      29,
      'CAUSALES IDENTIFICADAS',
      `COUNTIF($AE$2:$AE$${HELPER_ROWS + 1},"?*")`,
      '#,##0',
      COLOR.blue,
    ],
    [
      31,
      'PROMEDIO DE KILOS POR REGISTRO',
      'IFERROR(AVERAGE(RegistrosBajas[Kilos]),0)',
      '#,##0.00 "kg"',
      COLOR.green,
    ],
  ];
  for (const [row, label, formula, numberFormat, accent] of indicators) {
    sheet.mergeCells(row, 12, row, 17);
    sheet.getCell(row, 12).value = label;
    sheet.getCell(row, 12).font = {
      name: FONT,
      bold: true,
      size: 9,
      color: { argb: COLOR.muted },
    };
    sheet.mergeCells(row, 18, row, 23);
    sheet.getCell(row, 18).value = { formula };
    sheet.getCell(row, 18).numFmt = numberFormat;
    sheet.getCell(row, 18).font = {
      name: FONT,
      bold: true,
      size: 13,
      color: { argb: accent },
    };
    sheet.getCell(row, 12).alignment = { vertical: 'middle' };
    sheet.getCell(row, 18).alignment = {
      horizontal: 'right',
      vertical: 'middle',
    };
    sheet.getRow(row).height = 28;
  }

  setDashboardHelperFormulas(sheet, bajas);
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.25,
      bottom: 0.25,
      header: 0,
      footer: 0,
    },
    printArea: 'A1:W35',
  };
}

function dataRow(baja: Baja): ExcelJS.CellValue[] {
  return [
    MONTHS[baja.mes - 1] ?? String(baja.mes),
    baja.fecha.slice(0, 10),
    baja.cod,
    baja.producto,
    baja.tipoDocumento,
    baja.numero,
    Number(baja.kilos),
    Number(baja.costoUnitario),
    Number(baja.costo),
    baja.perdida != null ? Number(baja.perdida) : null,
    baja.causal ?? '',
  ];
}

function styleDataTable(sheet: ExcelJS.Worksheet, bajas: Baja[]): void {
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  sheet.columns = [
    { header: 'Mes', key: 'mes', width: 17 },
    { header: 'Fecha', key: 'fecha', width: 16 },
    { header: 'Cód.', key: 'cod', width: 14 },
    { header: 'Producto', key: 'producto', width: 38 },
    { header: 'Tipo de documento', key: 'tipoDocumento', width: 24 },
    { header: 'Número', key: 'numero', width: 17 },
    { header: 'Kilos', key: 'kilos', width: 15 },
    { header: 'Costo unitario', key: 'costoUnitario', width: 19 },
    { header: 'Costo', key: 'costo', width: 20 },
    { header: 'Pérdida', key: 'perdida', width: 19 },
    { header: 'Causal', key: 'causal', width: 36 },
  ];

  sheet.addTable({
    name: 'RegistrosBajas',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium4',
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: [
      { name: 'Mes', filterButton: true },
      { name: 'Fecha', filterButton: true },
      { name: 'Cód.', filterButton: true },
      { name: 'Producto', filterButton: true },
      { name: 'Tipo de documento', filterButton: true },
      { name: 'Número', filterButton: true },
      { name: 'Kilos', filterButton: true },
      { name: 'Costo unitario', filterButton: true },
      { name: 'Costo', filterButton: true },
      { name: 'Pérdida', filterButton: true },
      { name: 'Causal', filterButton: true },
    ],
    rows:
      bajas.length > 0
        ? bajas.map(dataRow)
        : [['', '', '', '', '', '', null, null, null, null, '']],
  });
}

export async function buildBajasReportExcel(bajas: Baja[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIGCOM';
  workbook.subject = 'Informe de bajas';
  workbook.title = 'Informe de bajas';
  workbook.created = new Date();
  workbook.calcProperties = {
    fullCalcOnLoad: true,
  };

  const summary = workbook.addWorksheet('Resumen');
  buildDashboard(summary, bajas);

  const data = workbook.addWorksheet('Datos');
  styleDataTable(data, bajas);
  data.mergeCells('M1:Q3');
  data.getCell('M1').value =
    'AGREGA LOS NUEVOS REGISTROS EN LA SIGUIENTE FILA DE LA TABLA. El resumen se recalcula automáticamente.';
  data.getCell('M1').font = {
    name: FONT,
    bold: true,
    size: 11,
    color: { argb: COLOR.greenDark },
  };
  data.getCell('M1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR.greenTint },
  };
  data.getCell('M1').alignment = {
    vertical: 'middle',
    horizontal: 'left',
    wrapText: true,
    indent: 1,
  };

  const header = data.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = {
      name: FONT,
      bold: true,
      color: { argb: COLOR.white },
      size: 10,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR.greenDark },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: COLOR.green } },
    };
  });

  const firstDataRow = 2;
  const lastDataRow = bajaRowEnd(bajas.length);
  for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
    const row = data.getRow(rowNumber);
    row.height = 21;
    row.eachCell((cell) => {
      cell.font = {
        name: FONT,
        size: 10,
        color: { argb: COLOR.ink },
      };
      cell.alignment = { vertical: 'middle' };
      if (rowNumber % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLOR.stripe },
        };
      }
    });
    for (const col of [7, 8, 9, 10]) {
      row.getCell(col).numFmt = col === 7 ? '#,##0.00' : '$ #,##0.00';
      row.getCell(col).alignment = {
        horizontal: 'right',
        vertical: 'middle',
      };
    }
  }

  data.pageSetup.printTitlesRow = '1:1';
  data.pageSetup.printArea = `A1:K${lastDataRow}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function bajaRowEnd(recordCount: number): number {
  return Math.max(recordCount, 1) + 1;
}
