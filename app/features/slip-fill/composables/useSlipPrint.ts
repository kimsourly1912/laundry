import type { Paper } from '#shared/contracts/slip-design'

/** Apply the slip's physical paper size and return the action that opens the browser print dialog. */
export function useSlipPrint(paperSize: () => Paper | undefined) {
  useHead(() => {
    const paper = paperSize()
    if (!paper) return {}
    return { style: [{ key: 'print-paper', innerHTML: `@media print { @page { size: ${paper.widthMm}mm ${paper.heightMm}mm; margin: 0 } .print-slip { width: ${paper.widthMm}mm !important; height: ${paper.heightMm}mm !important } }` }] }
  })

  return printSlip
}

/**
 * Opens the browser's print dialog for the slip on screen (`.print-slip`, tailwind.css → print),
 * once its artwork has loaded, so the paper never comes out blank. The browser only says the dialog
 * opened, never whether paper came out: the order page always offers Print again
 * (implementation guide → sheet 10).
 */
async function printSlip(root: Document | HTMLElement = document): Promise<void> {
  // Chrome and Safari have `decode()` on an SVG image too; TypeScript's DOM types don't list it.
  const images = [...root.querySelectorAll('.print-slip image, .print-slip img')] as ((SVGImageElement | HTMLImageElement) & { decode?: () => Promise<void> })[]
  await Promise.race([
    Promise.all(images.map(image => image.decode?.().catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ])
  if (root.isConnected) window.print()
}
