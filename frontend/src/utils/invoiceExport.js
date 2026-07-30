import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Capture invoice DOM → multi-page PDF blob (more reliable than html2pdf.js alone).
 */
export async function elementToPdfBlob(element, { filename = 'Invoice.pdf' } = {}) {
  if (!element) throw new Error('Invoice preview not ready');

  // Ensure layout is painted before capture
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = await html2canvas(element, {
    scale: Math.min(2, window.devicePixelRatio || 2),
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 8000,
    onclone: (_doc, cloned) => {
      cloned.style.boxShadow = 'none';
      cloned.style.borderRadius = '0';
      cloned.style.maxWidth = 'none';
      cloned.style.width = `${element.scrollWidth || 800}px`;
      cloned.style.background = '#ffffff';
      cloned.style.color = '#0f172a';
      // Hide remote QR if it would block/taint capture
      cloned.querySelectorAll('img').forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) {
          img.style.display = 'none';
        }
      });
    },
  });

  if (!canvas.width || !canvas.height) {
    throw new Error('Could not render invoice (empty canvas)');
  }

  const pdf = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
  heightLeft -= usableHeight;

  while (heightLeft > 2) {
    position = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= usableHeight;
  }

  // filename is unused by blob output but kept for callers
  void filename;
  return pdf.output('blob');
}

export async function elementToJpegBlob(element) {
  if (!element) throw new Error('Invoice preview not ready');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = await html2canvas(element, {
    scale: Math.min(2, window.devicePixelRatio || 2),
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 8000,
    onclone: (_doc, cloned) => {
      cloned.style.boxShadow = 'none';
      cloned.style.background = '#ffffff';
      cloned.style.color = '#0f172a';
      cloned.querySelectorAll('img').forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) img.style.display = 'none';
      });
    },
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not create image'))),
      'image/jpeg',
      0.92
    );
  });
}
