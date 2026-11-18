/**
 * Opens the browser's print dialog for the slip on screen (`.print-slip`, tailwind.css → print),
 * once its artwork has loaded, so the paper never comes out blank. The browser only says the dialog
 * opened, never whether paper came out: the order page always offers Print again
 * (implementation guide → sheet 10).
 */
export async function printSlip(root: ParentNode = document): Promise<void> {
  // Chrome and Safari have `decode()` on an SVG image too; TypeScript's DOM types don't list it.
  const images = [...root.querySelectorAll('.print-slip image, .print-slip img')] as ((SVGImageElement | HTMLImageElement) & { decode?: () => Promise<void> })[]
  await Promise.race([
    Promise.all(images.map(image => image.decode?.().catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ])
  window.print()
}
