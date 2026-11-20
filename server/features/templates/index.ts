/** The templates feature's public API (docs/server/architecture.md → Features). */
export { archiveTemplate, createTemplate, getTemplate, listTemplates, previewHtmlTemplate, previewTemplate, publishTemplate, restoreTemplate, updateTemplate } from './templates.service'
export { attachTemplate, detachTemplate, shopTemplates, templateShops } from './attachments.service'
export { getImage, imageBytes, listImages, renderFilledSlip, renderFilledSlipSvg, uploadImage } from './images.service'
export { orderableVersion, orderableVersionGuards, orderTemplateImage, orderTemplates, setDefaultTemplate, templateSampleSvg, versionImage, versionsById } from './shop-templates.service'
export type { OrderableVersion } from './shop-templates.service'
export { templateChangedForOrder } from './templates.errors'
