import {
  multiVariableText,
  text,
  barcodes,
  image,
  svg,
  line,
  table,
  rectangle,
  ellipse,
  dateTime,
  date,
  time,
  select,
  checkbox,
  radioGroup,
  embeddedPdfPage,
} from '@pdfme/schemas';
import { GlobalWorkerOptions } from 'pdfjs-dist';
// @ts-expect-error Vite ?url import of worker asset
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Pre-configure pdfjs worker so that the lazy initializer in
// `embeddedPdfPage` (which dynamically imports `pdf.worker.entry.js`,
// a CJS-style file that does not work under Vite dev) is skipped.
if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl as string;
}

export const getPlugins = () => {
  return {
    Text: text,
    'Multi-Variable Text': multiVariableText,
    Table: table,
    Line: line,
    Rectangle: rectangle,
    Ellipse: ellipse,
    Image: image,
    SVG: svg,
    QR: barcodes.qrcode,
    DateTime: dateTime,
    Date: date,
    Time: time,
    Select: select,
    Checkbox: checkbox,
    RadioGroup: radioGroup,
    'PDF Page': embeddedPdfPage,
    EAN13: barcodes.ean13,
    Code128: barcodes.code128,
  };
};
