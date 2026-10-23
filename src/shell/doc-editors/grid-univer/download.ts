/** Download names belong to the delivery format, not to the opening suffix. */
export function gridDownloadBaseName(title: string): string {
  return title.replace(/\.(?:xlsx|xlsm?|ods|csv|tsv)$/i, '').trim() || 'workbook';
}

export function gridDownloadFileName(title: string, extension: string): string {
  return `${gridDownloadBaseName(title)}.${extension}`;
}

export function gridDownloadFormatLabel(extension: string, tt: (text: string) => string): string {
  if (extension === 'xlsx') return tt('Excel 工作簿 (.xlsx)');
  if (extension === 'csv') return tt('当前工作表逗号分隔 (.csv)');
  if (extension === 'pdf') return tt('PDF 文件 (.pdf)');
  return extension.toUpperCase();
}
