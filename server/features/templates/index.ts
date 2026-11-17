/** The templates feature's public API (docs/server/architecture.md → Features). */
export { archiveTemplate, createTemplate, getTemplate, listTemplates, previewTemplate, publishTemplate, restoreTemplate, updateTemplate } from './templates.service'
export { attachTemplate, detachTemplate, shopTemplates, templateShops } from './attachments.service'
export { getImage, imageBytes, listImages, uploadImage } from './images.service'
