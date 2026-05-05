import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFStream,
  PDFRef,
  PDFNumber,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  drawObject,
} from '@pdfme/pdf-lib';

// Why: 国产电子发票常把盖章存为 /Subtype /Stamp 的 annotation。pdf-lib 的
// embedPdf+drawPage 内部把页面打包成 Form XObject，规范禁止 Form XObject
// 包含 annotations，于是盖章丢失。预处理把 stamp annotation 的外观流
// (/AP /N) 烘焙进页面 content stream，然后 embedPdf 就能矢量无损保留盖章。

type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

// PDF 行向量约定下 p * A * B 的等价矩阵 C = A * B
function mulMat(A: Mat, B: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = A;
  const [a2, b2, c2, d2, e2, f2] = B;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function readNumberArray(arr: PDFArray, count: number): number[] | null {
  if (arr.size() < count) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = arr.lookup(i);
    if (!(v instanceof PDFNumber)) return null;
    out.push(v.asNumber());
  }
  return out;
}

// 计算把 appearance stream 渲染到 annotation /Rect 区域所需的 cm 矩阵。
// 参考 PDF 1.7 规范 12.5.5：先把 BBox 经 Matrix 变换得到外接矩形，再线性
// 映射到 /Rect。Form XObject 的 Matrix 由 Do 自动应用，所以 cm 不重复包含。
function computeStampCm(rect: number[], bbox: number[], matrix: Mat): Mat | null {
  const [llx, lly, urx, ury] = rect;
  const [bx0, by0, bx1, by1] = bbox;
  const corners: [number, number][] = [
    applyMat(matrix, bx0, by0),
    applyMat(matrix, bx1, by0),
    applyMat(matrix, bx1, by1),
    applyMat(matrix, bx0, by1),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const transformedW = maxX - minX;
  const transformedH = maxY - minY;
  const rectW = urx - llx;
  const rectH = ury - lly;
  if (transformedW <= 0 || transformedH <= 0 || rectW <= 0 || rectH <= 0) return null;
  const sx = rectW / transformedW;
  const sy = rectH / transformedH;
  const tNegMin: Mat = [1, 0, 0, 1, -minX, -minY];
  const scale: Mat = [sx, 0, 0, sy, 0, 0];
  const tRect: Mat = [1, 0, 0, 1, llx, lly];
  return mulMat(mulMat(tNegMin, scale), tRect);
}

export async function flattenStampAnnotations(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const STAMP = PDFName.of('Stamp');
  const SUBTYPE = PDFName.of('Subtype');
  const RECT = PDFName.of('Rect');
  const AP = PDFName.of('AP');
  const N = PDFName.of('N');
  const BBOX = PDFName.of('BBox');
  const MATRIX = PDFName.of('Matrix');
  const ANNOTS = PDFName.of('Annots');

  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;

    const remaining: PDFRef[] = [];
    const flattened: { cm: Mat; xObjectRef: PDFRef }[] = [];

    const size = annots.size();
    for (let i = 0; i < size; i++) {
      const item = annots.get(i);
      // 只接受 indirect reference 形式的 annotation（绝大多数情况）
      if (!(item instanceof PDFRef)) {
        if (item instanceof PDFRef) remaining.push(item);
        continue;
      }
      const annotRef: PDFRef = item;
      const annotObj = doc.context.lookup(annotRef);
      if (!(annotObj instanceof PDFDict)) {
        remaining.push(annotRef);
        continue;
      }
      const subtype = annotObj.get(SUBTYPE);
      if (subtype !== STAMP) {
        remaining.push(annotRef);
        continue;
      }

      const apDict = annotObj.lookupMaybe(AP, PDFDict);
      if (!apDict) {
        remaining.push(annotRef);
        continue;
      }
      const nVal = apDict.get(N);
      if (!(nVal instanceof PDFRef)) {
        // /N 也可能是 state dict，发票场景几乎不会出现，跳过
        remaining.push(annotRef);
        continue;
      }
      const apnObj = doc.context.lookup(nVal);
      if (!(apnObj instanceof PDFStream)) {
        remaining.push(annotRef);
        continue;
      }

      const rectArr = annotObj.lookupMaybe(RECT, PDFArray);
      if (!rectArr) {
        remaining.push(annotRef);
        continue;
      }
      const rect = readNumberArray(rectArr, 4);
      if (!rect) {
        remaining.push(annotRef);
        continue;
      }

      const apnDict = apnObj.dict;
      const bboxArr = apnDict.lookupMaybe(BBOX, PDFArray);
      if (!bboxArr) {
        remaining.push(annotRef);
        continue;
      }
      const bbox = readNumberArray(bboxArr, 4);
      if (!bbox) {
        remaining.push(annotRef);
        continue;
      }
      const matrixArr = apnDict.lookupMaybe(MATRIX, PDFArray);
      let matrix: Mat = IDENTITY;
      if (matrixArr) {
        const m = readNumberArray(matrixArr, 6);
        if (m) matrix = m as Mat;
      }

      const cm = computeStampCm(rect, bbox, matrix);
      if (!cm) {
        remaining.push(annotRef);
        continue;
      }

      flattened.push({ cm, xObjectRef: nVal });
    }

    // 把所有 stamp 的 appearance 注册为页面 XObject 并 push 操作符
    for (const { cm, xObjectRef } of flattened) {
      const xName = page.node.newXObject('Stamp', xObjectRef);
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(cm[0], cm[1], cm[2], cm[3], cm[4], cm[5]),
        drawObject(xName),
        popGraphicsState(),
      );
    }

    // 替换 /Annots：去掉已经 flatten 的 stamp，保留其他类型 annotation
    if (flattened.length > 0) {
      if (remaining.length === 0) {
        page.node.delete(ANNOTS);
      } else {
        page.node.set(ANNOTS, doc.context.obj(remaining));
      }
    }
  }

  return doc.save();
}
